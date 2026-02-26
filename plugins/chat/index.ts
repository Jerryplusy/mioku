import type { MiokuPlugin } from "../../src";
import type { AIService } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { ConfigService } from "../../src/services/config";
import { logger, MiokiContext } from "mioki";
import type {
  ChatConfig,
  ChatMessage,
  TargetMessage,
  ToolContext,
} from "./types";
import { initDatabase } from "./db";
import { SessionManager } from "./manage/session";
import { RateLimiter } from "./manage/rate-limiter";
import { runChat } from "./core/chat-engine";
import { HumanizeEngine } from "./humanize";
import { SkillSessionManager } from "./manage/skill-session";
import {
  extractContent,
  getBotRole,
  getGroupHistory,
  getQuotedContent,
  isGroupAllowed,
  isQuotingBot,
  shouldTrigger,
} from "./utils";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";
import {
  MessageQueueManager,
  parseLineMarkers,
  splitByReplyMarkers,
} from "./utils/queue";
import { sendMessage } from "./core/base";

// ==================== Plugin ====================

const chatPlugin: MiokuPlugin = {
  name: "chat",
  version: "1.0.0",
  description: "AI 智能聊天插件",
  services: ["ai", "config", "help"],

  help: {
    title: "AI 聊天",
    description: "智能 AI 聊天插件",
    commands: [{ cmd: "/重置会话", desc: "清除 AI 在当前会话中发送的消息" }],
  },

  async setup(ctx: MiokiContext) {
    ctx.logger.info("聊天插件正在初始化...");

    // 获取服务
    const aiService = ctx.services?.ai as AIService | undefined;
    const configService = ctx.services?.config as ConfigService | undefined;
    const helpService = ctx.services?.help as HelpService | undefined;

    // 注册帮助
    if (helpService && chatPlugin.help) {
      helpService.registerHelp(chatPlugin.name, chatPlugin.help);
    }

    // 注册配置
    if (configService) {
      await configService.registerConfig("chat", "base", BASE_CONFIG);
      await configService.registerConfig("chat", "settings", SETTINGS_CONFIG);
      await configService.registerConfig(
        "chat",
        "personalization",
        PERSONALIZATION_CONFIG,
      );
    }

    // 获取配置
    const getConfig = async (): Promise<ChatConfig> => {
      if (!configService) {
        return {
          ...BASE_CONFIG,
          ...SETTINGS_CONFIG,
          ...PERSONALIZATION_CONFIG,
        } as ChatConfig;
      }
      const base = await configService.getConfig("chat", "base");
      const settings = await configService.getConfig("chat", "settings");
      const personalization = await configService.getConfig(
        "chat",
        "personalization",
      );
      return {
        ...BASE_CONFIG,
        ...SETTINGS_CONFIG,
        ...PERSONALIZATION_CONFIG,
        ...base,
        ...settings,
        ...personalization,
      } as ChatConfig;
    };

    const config = await getConfig();

    if (!config.apiKey) {
      ctx.logger.warn(
        "聊天插件未配置 API Key，请在 config/chat/base.json 中配置",
      );
      return;
    }

    // 初始化组件
    const db = initDatabase();
    const sessionManager = new SessionManager(db, config.maxSessions);
    const rateLimiter = new RateLimiter();
    const skillManager = new SkillSessionManager();

    // 通过 AI 服务创建实例并设为默认
    if (!aiService) {
      ctx.logger.error("聊天插件需要 AI 服务，但 AI 服务不可用");
      return;
    }

    const aiInstance = await aiService.create({
      name: "default",
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelType: config.isMultimodal ? "multimodal" : "text",
    });
    aiService.setDefault("default");

    // 初始化真人化引擎
    const humanize = new HumanizeEngine(aiInstance, config, db);
    await humanize.init();

    // 戳一戳冷却
    const pokeCooldowns = new Map<number, number>();
    const POKE_COOLDOWN_MS = 10 * 60_000;

    // 正在处理的会话（按群 ID），防止并发
    const processingSet = new Set<string>();

    // 消息队列管理器
    const queueManager = new MessageQueueManager();

    // 群最后活动时间追踪（用于空闲检测）
    const groupLastActivityTime = new Map<string, number>();
    // 群消息计数（用于空闲检测的保底数量）
    const groupMessageCount = new Map<string, number>();
    // Bot 最后发言时间（用于空闲检测）
    const groupLastBotMessageTime = new Map<string, number>();
    // Bot 发言后的消息计数（用于空闲检测）
    const groupMessageCountAfterBot = new Map<string, number>();

    // 群冷却计时器：记录每个群的 cooldown 结束时间
    const groupCooldownUntil = new Map<string, number>();
    // 冷却期间收集的消息：群ID -> 消息列表
    const groupCooldownMessages = new Map<
      string,
      Array<{
        event: any;
        content: string;
        userName: string;
        userId: number;
        messageId: number;
        timestamp: number;
        isDirectAt: boolean; // 是否直接 @bot
      }>
    >();
    // 正在等待冷却触发的计时器
    const cooldownTimeoutIds = new Map<string, NodeJS.Timeout>();

    /**
     * 启动冷却计时器
     */
    function startCooldownTimer(groupSessionId: string, groupId: number) {
      // 清除之前的计时器
      const existingTimer = cooldownTimeoutIds.get(groupSessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const cfg = config; // 使用当前配置
      const cooldownMs = cfg.cooldownAfterReplyMs ?? 20_000;

      const timer = setTimeout(async () => {
        // 清除计时器记录
        cooldownTimeoutIds.delete(groupSessionId);

        // 获取收集的消息
        const collected = groupCooldownMessages.get(groupSessionId) || [];

        if (collected.length === 0) {
          ctx.logger.info(
            `[Cooldown] Group ${groupId} has no message during cooldown, ignored`,
          );
          groupCooldownMessages.delete(groupSessionId);
          groupCooldownUntil.delete(groupSessionId);
          return;
        }

        // 检查是否有直接 @bot 的消息
        const directAtMessages = collected.filter((m) => m.isDirectAt);

        try {
          if (directAtMessages.length > 0) {
            // 有直接 @bot 的消息，使用 review 模式处理
            await processReviewMessages(
              groupSessionId,
              groupId,
              collected,
              cfg,
            );
          } else {
            // 没有直接 @bot，使用 planner 决定是否回复
            await processCooldownWithPlanner(
              groupSessionId,
              groupId,
              collected,
              cfg,
            );
          }
        } catch (err) {
          ctx.logger.error(
            `[Cooldown] Group ${groupId} processing failed: ${err}`,
          );
        } finally {
          groupCooldownMessages.delete(groupSessionId);
          groupCooldownUntil.delete(groupSessionId);
        }
      }, cooldownMs);

      cooldownTimeoutIds.set(groupSessionId, timer);
      groupCooldownUntil.set(groupSessionId, Date.now() + cooldownMs);
      groupCooldownMessages.set(groupSessionId, []);
    }

    /**
     * 在冷却期间收集消息
     */
    function collectCooldownMessage(
      groupSessionId: string,
      groupId: number,
      event: any,
      content: string,
      isDirectAt: boolean,
    ) {
      const userName =
        event.sender?.card || event.sender?.nickname || String(event.user_id);

      const messages = groupCooldownMessages.get(groupSessionId) || [];
      messages.push({
        event,
        content,
        userName,
        userId: event.user_id,
        messageId: event.message_id,
        timestamp: Date.now(),
        isDirectAt,
      });
      groupCooldownMessages.set(groupSessionId, messages);
    }

    /**
     * 处理 review 模式的消息
     */
    async function processReviewMessages(
      groupSessionId: string,
      groupId: number,
      collected: Array<{
        event: any;
        content: string;
        userName: string;
        userId: number;
        messageId: number;
        timestamp: number;
        isDirectAt: boolean;
      }>,
      cfg: ChatConfig,
    ) {
      // 如果群正在处理，跳过
      if (processingSet.has(groupSessionId)) {
        ctx.logger.info(
          `[Review] group ${groupId} is being processed, skipping review`,
        );
        return;
      }

      processingSet.add(groupSessionId);

      try {
        // 合并所有 @bot 消息内容
        const mergedContents: string[] = [];
        const userNames: string[] = [];
        const messageIds: number[] = [];

        for (const msg of collected) {
          mergedContents.push(msg.content);
          userNames.push(msg.userName);
          messageIds.push(msg.messageId);
        }

        const mergedContent = mergedContents.join("\n---\n");
        const firstMsg = collected[0];

        // 构建 targetMessage
        const targetMessage: TargetMessage = {
          userName: userNames.join(", "), // 多个用户名用逗号分隔
          userId: firstMsg.userId,
          userRole: firstMsg.event.sender?.role || "member",
          content: mergedContent,
          messageId: firstMsg.messageId,
          timestamp: Date.now(),
        };

        // 获取群聊历史
        const rawHistory = await getGroupHistory(
          groupId,
          ctx,
          cfg.historyCount,
          db,
        );
        const history: ChatMessage[] = rawHistory.map((msg) => ({
          sessionId: groupSessionId,
          role: "user" as const,
          content: msg.content,
          userId: msg.userId,
          userName: msg.userName,
          userRole: msg.userRole,
          groupId,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        }));

        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";
        const botRole = await getBotRole(groupId, ctx);

        let groupName: string | undefined;
        let memberCount: number | undefined;
        try {
          const groupInfo = await ctx.bot.getGroupInfo(groupId);
          groupName = (groupInfo as any)?.group_name;
          memberCount = (groupInfo as any)?.member_count;
        } catch {}

        const toolCtx: ToolContext = {
          ctx,
          event: firstMsg.event,
          sessionId: groupSessionId,
          groupId,
          userId: targetMessage.userId,
          config: cfg,
          aiService: aiService!,
          db,
          botRole,
          onTextContent: async (text, messageIndex, totalMessages) => {
            const messages = text
              .trim()
              .split("\n---\n")
              .map((s) => s.trim())
              .filter(Boolean);

            if (messages[messageIndex]) {
              await sendMessage(
                ctx,
                groupId,
                targetMessage.userId,
                messages[messageIndex],
                messageIndex === 0,
                humanize.typoGenerator,
              );
            }
          },
        };

        // 记忆检索
        const memoryContext = await humanize.memoryRetrieval.retrieve(
          groupSessionId,
          mergedContent,
          targetMessage.userName,
          history,
        );

        // 话题上下文
        const topicContext =
          humanize.topicTracker.getTopicContext(groupSessionId);

        // 表达习惯上下文
        const expressionContext =
          humanize.expressionLearner.getExpressionContext(groupSessionId);

        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          targetMessage,
          {
            config: cfg,
            groupName,
            memberCount,
            botNickname,
            botRole,
            aiService: aiService!,
            isGroup: true,
            memoryContext: memoryContext || undefined,
            topicContext: topicContext || undefined,
            expressionContext: expressionContext || undefined,
            replyContext: {
              type: "review",
              targetUser: targetMessage.userName,
              targetMessage: targetMessage.content,
            },
            reviewMessages: {
              contents: mergedContents,
              userNames,
              messageIds,
            },
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息
        const sentIndices = toolCtx.sentMessageIndices;
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            if (sentIndices?.has(i)) continue;

            let msg = result.messages[i];
            msg = humanize.typoGenerator.apply(msg);

            let lines: string[];
            lines = msg.split("\n").filter((l) => l.trim());

            // 展开包含多个 reply 标记的行
            const expandedLines: string[] = [];
            for (const line of lines) {
              const parts = splitByReplyMarkers(line);
              expandedLines.push(...parts);
            }

            for (let j = 0; j < expandedLines.length; j++) {
              const line = expandedLines[j];

              // 每一行都检查引用标记，不跳过
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line);

              if (pokeUsers.length > 0) {
                for (const pokeId of pokeUsers) {
                  await ctx.bot.api("group_poke", {
                    group_id: groupId,
                    user_id: pokeId,
                  });
                }
              }

              const lineSegments: any[] = [];

              // 如果有引用标记就添加，不限制只能第一条消息
              if (quoteId !== undefined) {
                lineSegments.push({ type: "reply", id: String(quoteId) });
              }

              for (const atId of atUsers) {
                lineSegments.push(ctx.segment.at(atId));
              }

              if (cleanText) {
                lineSegments.push(ctx.segment.text(cleanText));
              }

              if (lineSegments.length > 0) {
                await ctx.bot.sendGroupMsg(groupId, lineSegments);
              }

              if (j < lines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            if (i < result.messages.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
        }

        // 发送表情包
        if (result.emojiPath) {
          try {
            const emojiSegment = ctx.segment.image(
              `file://${result.emojiPath}`,
            );
            await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
          } catch (err) {
            ctx.logger.warn(`[表情包] 发送失败: ${err}`);
          }
        }

        // 保存 bot 消息
        const now = Date.now();
        for (const msg of result.messages) {
          saveBotMessage(groupId, groupSessionId, msg, now, cfg);
        }

        sessionManager.touch(groupSessionId);

        // 重新启动冷却计时器（处理完这批消息后）
        startCooldownTimer(groupSessionId, groupId);
      } finally {
        processingSet.delete(groupSessionId);
      }
    }

    /**
     * 使用 planner 判断是否回复收集的消息
     */
    async function processCooldownWithPlanner(
      groupSessionId: string,
      groupId: number,
      collected: Array<{
        event: any;
        content: string;
        userName: string;
        userId: number;
        messageId: number;
        timestamp: number;
        isDirectAt: boolean;
      }>,
      cfg: ChatConfig,
    ) {
      if (processingSet.has(groupSessionId)) {
        return;
      }

      processingSet.add(groupSessionId);

      try {
        // 合并消息内容
        const mergedContent = collected.map((m) => m.content).join("\n");
        const firstMsg = collected[0];

        // 获取群聊历史
        const rawHistory = await getGroupHistory(
          groupId,
          ctx,
          cfg.historyCount,
          db,
        );
        const history: ChatMessage[] = rawHistory.map((msg) => ({
          sessionId: groupSessionId,
          role: "user" as const,
          content: msg.content,
          userId: msg.userId,
          userName: msg.userName,
          userRole: msg.userRole,
          groupId,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        }));

        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

        // 使用 planner 判断
        const planResult = await humanize.actionPlanner.plan(
          groupSessionId,
          botNickname,
          history,
          mergedContent,
        );

        if (planResult.action === "reply") {
          const targetMessage: TargetMessage = {
            userName: firstMsg.userName,
            userId: firstMsg.userId,
            userRole: firstMsg.event.sender?.role || "member",
            content: mergedContent,
            messageId: firstMsg.messageId,
            timestamp: Date.now(),
          };

          const toolCtx: ToolContext = {
            ctx,
            event: firstMsg.event,
            sessionId: groupSessionId,
            groupId,
            userId: targetMessage.userId,
            config: cfg,
            aiService: aiService!,
            db,
            botRole: await getBotRole(groupId, ctx),
            onTextContent: async (text, messageIndex, totalMessages) => {
              const messages = text
                .trim()
                .split("\n---\n")
                .map((s) => s.trim())
                .filter(Boolean);

              if (messages[messageIndex]) {
                await sendMessage(
                  ctx,
                  groupId,
                  targetMessage.userId,
                  messages[messageIndex],
                  messageIndex === 0,
                  humanize.typoGenerator,
                );
              }
            },
          };

          let groupName: string | undefined;
          let memberCount: number | undefined;
          try {
            const groupInfo = await ctx.bot.getGroupInfo(groupId);
            groupName = (groupInfo as any)?.group_name;
            memberCount = (groupInfo as any)?.member_count;
          } catch {}

          // 记忆检索
          const memoryContext = await humanize.memoryRetrieval.retrieve(
            groupSessionId,
            mergedContent,
            targetMessage.userName,
            history,
          );

          // 话题上下文
          const topicContext =
            humanize.topicTracker.getTopicContext(groupSessionId);

          // 表达习惯上下文
          const expressionContext =
            humanize.expressionLearner.getExpressionContext(groupSessionId);

          // 构建 planner 思考内容
          const plannerThoughts = `After you spoke, the following messages were sent in the group. Use this context to respond naturally.
Planned reason: ${planResult.reason}`;

          const result = await runChat(
            aiInstance,
            toolCtx,
            history,
            targetMessage,
            {
              config: cfg,
              groupName,
              memberCount,
              botNickname,
              botRole: toolCtx.botRole,
              aiService: aiService!,
              isGroup: true,
              memoryContext: memoryContext || undefined,
              topicContext: topicContext || undefined,
              expressionContext: expressionContext || undefined,
              plannerThoughts,
              replyContext: {
                type: "comment",
                targetUser: targetMessage.userName,
                targetMessage: targetMessage.content,
              },
              reviewMessages: {
                contents: collected.map((m) => m.content),
                userNames: collected.map((m) => m.userName),
                messageIds: collected.map((m) => m.messageId),
              },
            },
            sessionManager,
            humanize,
            skillManager,
          );

          // 发送消息
          const sentIndices = toolCtx.sentMessageIndices;
          if (result.messages.length > 0) {
            for (let i = 0; i < result.messages.length; i++) {
              if (sentIndices?.has(i)) continue;

              let msg = result.messages[i];
              msg = humanize.typoGenerator.apply(msg);

              let lines: string[];
              lines = msg.split("\n").filter((l) => l.trim());

              // 展开包含多个 reply 标记的行
              const expandedLines: string[] = [];
              for (const line of lines) {
                const parts = splitByReplyMarkers(line);
                expandedLines.push(...parts);
              }

              for (let j = 0; j < expandedLines.length; j++) {
                const line = expandedLines[j];

                // 每一行都检查引用标记，不跳过
                const { cleanText, atUsers, pokeUsers, quoteId } =
                  parseLineMarkers(line);

                if (pokeUsers.length > 0) {
                  for (const pokeId of pokeUsers) {
                    await ctx.bot.api("group_poke", {
                      group_id: groupId,
                      user_id: pokeId,
                    });
                  }
                }

                const lineSegments: any[] = [];

                // 如果有引用标记就添加，不限制只能第一条消息
                if (quoteId !== undefined) {
                  lineSegments.push({ type: "reply", id: String(quoteId) });
                }

                for (const atId of atUsers) {
                  lineSegments.push(ctx.segment.at(atId));
                }

                if (cleanText) {
                  lineSegments.push(ctx.segment.text(cleanText));
                }

                if (lineSegments.length > 0) {
                  await ctx.bot.sendGroupMsg(groupId, lineSegments);
                }

                if (j < lines.length - 1) {
                  await new Promise((r) => setTimeout(r, 300));
                }
              }

              if (i < result.messages.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }
          }

          // 发送表情包
          if (result.emojiPath) {
            try {
              const emojiSegment = ctx.segment.image(
                `file://${result.emojiPath}`,
              );
              await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
            } catch (err) {
              ctx.logger.warn(`[表情包] 发送失败: ${err}`);
            }
          }

          // 保存 bot 消息
          const now = Date.now();
          for (const msg of result.messages) {
            saveBotMessage(groupId, groupSessionId, msg, now, cfg);
          }

          sessionManager.touch(groupSessionId);

          // 重新启动冷却计时器
          startCooldownTimer(groupSessionId, groupId);
        } else {
          ctx.logger.info(
            `[CooldownPlanner] 群 ${groupId} planner 决定不回复: ${planResult.reason}`,
          );
        }
      } finally {
        processingSet.delete(groupSessionId);
      }
    }

    // 定期清理过期技能会话
    const cleanupInterval = setInterval(
      () => skillManager.cleanup(),
      10 * 60_000,
    );

    // 群是否正在处理（用于空闲检测避免并发）
    const idleCheckProcessing = new Set<string>();
    // 群最后一次空闲检查时间
    const groupLastIdleCheckTime = new Map<string, number>();

    // 空闲检测定时器（每秒检查，但实际触发由配置决定）
    const idleCheckInterval = setInterval(async () => {
      try {
        const cfg = await getConfig();
        if (!cfg.apiKey || !cfg.planner?.enabled) return;

        const now = Date.now();
        const idleThreshold = cfg.planner.idleThresholdMs ?? 30 * 60_000;
        const messageCountThreshold = cfg.planner.idleMessageCount ?? 100;
        // 默认 60 秒检查一次
        const checkInterval = 60_000;

        for (const [groupSessionId, lastTime] of groupLastActivityTime) {
          // 每分钟才真正执行一次检查
          const lastCheckTime = groupLastIdleCheckTime.get(groupSessionId) ?? 0;
          if (now - lastCheckTime < checkInterval) continue;

          // 跳过正在处理的群
          if (
            processingSet.has(groupSessionId) ||
            idleCheckProcessing.has(groupSessionId)
          ) {
            continue;
          }

          const groupId = parseInt(groupSessionId.split(":")[1], 10);
          if (!isGroupAllowed(groupId, cfg)) continue;

          // 获取 Bot 最后发言时间
          let lastBotTime = groupLastBotMessageTime.get(groupSessionId) ?? 0;
          if (lastBotTime === 0) {
            const botMsgs = db.getBotMessages(groupId, 1);
            if (botMsgs.length > 0) {
              lastBotTime = botMsgs[botMsgs.length - 1].timestamp;
              groupLastBotMessageTime.set(groupSessionId, lastBotTime);
            }
          }

          // 群内在配置时间间隔内无任何消息发送
          // 取用户最后发言时间和 Bot 最后发言时间的较大值
          const lastActivityTime = Math.max(lastTime, lastBotTime);
          if (now - lastActivityTime < idleThreshold) continue;

          // 自Bot上次发送消息起，已累积达到配置中设定的指定消息条数
          // 如果 Bot 从未发言，则使用总消息数量
          const messageCountAfterBot =
            groupMessageCountAfterBot.get(groupSessionId) ?? 0;
          const messageCount =
            lastBotTime > 0
              ? messageCountAfterBot
              : (groupMessageCount.get(groupSessionId) ?? 0);
          if (messageCount < messageCountThreshold) continue;

          // 标记正在处理
          idleCheckProcessing.add(groupSessionId);

          try {
            ctx.logger.info(`[IdleCheck] 群 ${groupId} 触发空闲检测`);

            // 获取群聊历史
            const rawHistory = await getGroupHistory(
              groupId,
              ctx,
              cfg.historyCount,
              db,
            );
            const history: ChatMessage[] = rawHistory.map((msg) => ({
              sessionId: groupSessionId,
              role: "user" as const,
              content: msg.content,
              userId: msg.userId,
              userName: msg.userName,
              userRole: msg.userRole,
              groupId,
              timestamp: msg.timestamp,
              messageId: msg.messageId,
            }));

            const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

            // 使用 planner 进行空闲检测
            const planResult = await humanize.actionPlanner.plan(
              groupSessionId,
              botNickname,
              history,
              "[Check if you want to answer the call]",
              true, // isIdleCheck = true
            );

            if (planResult.action === "reply") {
              // 构建 targetMessage
              const targetMessage: TargetMessage = {
                userName: "system",
                userId: 0,
                userRole: "member",
                content: "[No one in the group is talking? I'll answer!]",
                messageId: 0,
                timestamp: now,
              };

              const toolCtx: ToolContext = {
                ctx,
                event: null,
                sessionId: groupSessionId,
                groupId,
                userId: 0,
                config: cfg,
                aiService: aiService!,
                db,
                botRole: await getBotRole(groupId, ctx),
                // AI 返回文本时立即发送
                onTextContent: async (text, messageIndex, totalMessages) => {
                  // 解析消息
                  let messages: string[];

                  messages = text
                    .trim()
                    .split("\n---\n")
                    .map((s) => s.trim())
                    .filter(Boolean);

                  // 发送当前消息
                  if (messages[messageIndex]) {
                    await sendMessage(
                      ctx,
                      groupId,
                      0,
                      messages[messageIndex],
                      messageIndex === 0,
                      humanize.typoGenerator,
                    );
                  }
                },
              };

              // 构建 planner 思考内容，告诉 AI 群里的情况和可以怎么回复
              const plannerThoughts = `No one in the group has spoken for a long time, so come and answer the group
Planned reason: ${planResult.reason}
1. Participate in group chat topics naturally
2. Quote messages from group friends appropriately (using [[[reply:message ID]]] format)
3. Start a new topic or respond to a previous conversation
4. Don't mention your intentions like "I'm here to answer" or something like a normal chat`;

              const result = await runChat(
                aiInstance,
                toolCtx,
                history,
                targetMessage,
                {
                  config: cfg,
                  botNickname,
                  botRole: toolCtx.botRole,
                  aiService: aiService!,
                  isGroup: true,
                  plannerThoughts,
                  replyContext: {
                    type: "idle",
                  },
                },
                sessionManager,
                humanize,
                skillManager,
              );

              // 发送消息（跳过已通过 onTextContent 回调发送的消息）
              const sentIndices0 = toolCtx.sentMessageIndices;
              if (result.messages.length > 0) {
                for (let i = 0; i < result.messages.length; i++) {
                  // 跳过已发送的消息
                  if (sentIndices0?.has(i)) {
                    continue;
                  }

                  let msg = result.messages[i];
                  msg = humanize.typoGenerator.apply(msg);

                  let lines: string[];
                  lines = msg.split("\n").filter((l) => l.trim());

                  // 展开包含多个 reply 标记的行
                  const expandedLines: string[] = [];
                  for (const line of lines) {
                    const parts = splitByReplyMarkers(line);
                    expandedLines.push(...parts);
                  }

                  for (let j = 0; j < expandedLines.length; j++) {
                    const line = expandedLines[j];

                    // 每一行都检查引用标记，不跳过
                    const { cleanText, atUsers, pokeUsers, quoteId } =
                      parseLineMarkers(line);

                    // 戳人
                    if (pokeUsers.length > 0) {
                      for (const pokeId of pokeUsers) {
                        await ctx.bot.api("group_poke", {
                          group_id: groupId,
                          user_id: pokeId,
                        });
                      }
                    }

                    const lineSegments: any[] = [];

                    // 如果有引用标记就添加，不限制只能第一条消息
                    if (quoteId !== undefined) {
                      lineSegments.push({ type: "reply", id: String(quoteId) });
                    }

                    for (const atId of atUsers) {
                      lineSegments.push(ctx.segment.at(atId));
                    }

                    if (cleanText) {
                      lineSegments.push(ctx.segment.text(cleanText));
                    }

                    if (lineSegments.length > 0) {
                      await ctx.bot.sendGroupMsg(groupId, lineSegments);
                    }

                    if (j < expandedLines.length - 1) {
                      await new Promise((r) => setTimeout(r, 300));
                    }
                  }

                  if (i < result.messages.length - 1) {
                    await new Promise((r) => setTimeout(r, 300));
                  }
                }

                // 记录发言
                if (!sentIndices0 || sentIndices0.size === 0) {
                }
              }

              // 保存 bot 消息
              const now2 = Date.now();
              for (const msg of result.messages) {
                saveBotMessage(groupId, groupSessionId, msg, now2, cfg);
              }

              // 回复完成后启动冷却计时器
              startCooldownTimer(groupSessionId, groupId);

              ctx.logger.info(`[IdleCheck] 群 ${groupId} 空闲回复完成`);
            }

            // 重置消息计数
            groupMessageCount.set(groupSessionId, 0);
            groupMessageCountAfterBot.set(groupSessionId, 0);
            groupLastIdleCheckTime.set(groupSessionId, now);
          } catch (err) {
            ctx.logger.error(`[IdleCheck] 群 ${groupId} 空闲检测失败: ${err}`);
          } finally {
            idleCheckProcessing.delete(groupSessionId);
          }
        }
      } catch (err) {
        // 忽略空闲检测错误
      }
    }, 60_000); // 每分钟检查一次是否需要执行空闲检测

    /**
     * 处理队列中的等待消息
     * 将队列中所有消息合并后一次性发送给 AI，只请求一次
     */
    async function processQueuedMessages(
      groupSessionId: string,
      cfg: ChatConfig,
    ): Promise<void> {
      // 获取当前队列中的所有消息
      try {
        const queue = queueManager.getQueue(groupSessionId);
        if (!queue || queue.length === 0) {
          queueManager.clearActiveTarget(groupSessionId);
          return;
        }

        ctx.logger.info(
          `[Queue] 群 ${groupSessionId} 批量处理队列，队列长度: ${queue.length}`,
        );

        // 收集所有队列消息的内容
        const queuedContents: string[] = [];
        for (const item of queue) {
          const { text: extractedText, multimodal } = extractContent(
            item.event,
            cfg,
            ctx,
          );
          let content = multimodal ? JSON.stringify(multimodal) : extractedText;
          if (content) {
            queuedContents.push(content);
          }
        }

        // 清空队列
        queueManager.clearQueue(groupSessionId);

        if (queuedContents.length === 0) {
          queueManager.clearActiveTarget(groupSessionId);
          return;
        }

        // 不管是否有 activeTarget，都直接用队列消息构建新的 targetMessage
        // 已处理的消息不需要保留
        const firstItem = queue[0];
        const userName =
          firstItem.event.sender?.card ||
          firstItem.event.sender?.nickname ||
          String(firstItem.event.user_id);

        // 将所有队列消息合并，用换行分隔
        const mergedContent = queuedContents.join("\n");

        const targetMessage: TargetMessage = {
          userName,
          userId: firstItem.event.user_id || firstItem.event.sender?.user_id,
          userRole: firstItem.event.sender?.role || "member",
          content: mergedContent,
          messageId: firstItem.event.message_id,
          timestamp: Date.now(),
        };

        ctx.logger.info(
          `[Queue] 群 ${groupSessionId} 批量处理 ${queue.length} 条消息`,
        );

        // 清理旧的 activeTarget
        queueManager.clearActiveTarget(groupSessionId);

        const groupId = parseInt(groupSessionId.split(":")[1], 10);
        const toolCtx: ToolContext = {
          ctx,
          event: null, // 复用之前的 context
          sessionId: groupSessionId,
          groupId,
          userId: targetMessage.userId,
          config: cfg,
          aiService: aiService!,
          db,
          botRole: await getBotRole(groupId, ctx),
          // AI 返回文本时立即发送
          onTextContent: async (text, messageIndex, totalMessages) => {
            // 解析消息
            let messages: string[];
            messages = text
              .trim()
              .split("\n---\n")
              .map((s) => s.trim())
              .filter(Boolean);

            // 发送当前消息
            if (messages[messageIndex]) {
              await sendMessage(
                ctx,
                groupId,
                targetMessage.userId,
                messages[messageIndex],
                messageIndex === 0,
                humanize.typoGenerator,
              );
            }

            // 记录发言频率
          },
        };

        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

        // 获取群聊历史
        const rawHistory = await getGroupHistory(
          groupId,
          ctx,
          cfg.historyCount,
          db,
        );
        const history: ChatMessage[] = rawHistory.map((msg) => ({
          sessionId: groupSessionId,
          role: "user" as const,
          content: msg.content,
          userId: msg.userId,
          userName: msg.userName,
          userRole: msg.userRole,
          groupId,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        }));

        // 记忆检索
        const memoryContext = await humanize.memoryRetrieval.retrieve(
          groupSessionId,
          targetMessage.content,
          targetMessage.userName,
          history,
        );

        // 话题上下文
        const topicContext =
          humanize.topicTracker.getTopicContext(groupSessionId);

        // 表达习惯上下文
        const expressionContext =
          humanize.expressionLearner.getExpressionContext(groupSessionId);

        let groupName: string | undefined;
        let memberCount: number | undefined;
        try {
          const groupInfo = await ctx.bot.getGroupInfo(groupId);
          groupName = (groupInfo as any)?.group_name;
          memberCount = (groupInfo as any)?.member_count;
        } catch {}

        // 重新运行 AI
        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          targetMessage,
          {
            config: cfg,
            groupName,
            memberCount,
            botNickname,
            botRole: toolCtx.botRole,
            aiService: aiService!,
            isGroup: true,
            memoryContext: memoryContext || undefined,
            topicContext: topicContext || undefined,
            expressionContext: expressionContext || undefined,
            replyContext: {
              type: "comment",
              targetUser: targetMessage.userName,
              targetMessage: targetMessage.content,
            },
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息
        const sentIndices2 = toolCtx.sentMessageIndices;
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            // 跳过已发送的消息
            if (sentIndices2?.has(i)) {
              continue;
            }

            let msg = result.messages[i];
            msg = humanize.typoGenerator.apply(msg);

            let lines: string[];
            lines = msg.split("\n").filter((l) => l.trim());

            // 展开包含多个 reply 标记的行
            const expandedLines: string[] = [];
            for (const line of lines) {
              const parts = splitByReplyMarkers(line);
              expandedLines.push(...parts);
            }

            for (let j = 0; j < expandedLines.length; j++) {
              const line = expandedLines[j];

              // 每一行都检查引用标记，不跳过
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line);

              if (pokeUsers.length > 0) {
                for (const pokeId of pokeUsers) {
                  await ctx.bot.api("group_poke", {
                    group_id: groupId,
                    user_id: pokeId,
                  });
                }
              }

              const lineSegments: any[] = [];

              // 如果有引用标记就添加，不限制只能第一条消息
              if (quoteId !== undefined) {
                lineSegments.push({ type: "reply", id: String(quoteId) });
              }

              for (const atId of atUsers) {
                lineSegments.push(ctx.segment.at(atId));
              }

              if (cleanText) {
                lineSegments.push(ctx.segment.text(cleanText));
              }

              if (lineSegments.length > 0) {
                await ctx.bot.sendGroupMsg(groupId, lineSegments);
              }

              if (j < lines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            if (i < result.messages.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          // 记录发言（如果回调没有发送消息，则在这里记录）
          if (!sentIndices2 || sentIndices2.size === 0) {
          }
        }

        // 发送表情包
        if (result.emojiPath) {
          try {
            const emojiSegment = ctx.segment.image(
              `file://${result.emojiPath}`,
            );
            await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
          } catch (err) {
            ctx.logger.warn(`[表情包] 发送失败: ${err}`);
          }
        }

        // 保存 bot 发送的消息到数据库
        const now = Date.now();
        for (const msg of result.messages) {
          saveBotMessage(groupId, groupSessionId, msg, now, cfg);
        }

        // 清理
        queueManager.clearActiveTarget(groupSessionId);
        sessionManager.touch(groupSessionId);

        ctx.logger.info(`[Queue] 群 ${groupSessionId} 队列消息处理完成`);
      } catch (err) {
        logger.error(err);
      }
    }

    /**
     * 处理 AI 聊天核心流程
     */
    async function processChat(
      e: any,
      cfg: ChatConfig,
      options?: {
        skipPlanner?: boolean;
        triggerReason?: string;
        appendToActive?: boolean;
      },
    ): Promise<void> {
      const isGroup = e.message_type === "group";
      const groupId: number | undefined = isGroup ? e.group_id : undefined;
      const userId: number = e.user_id || e.sender?.user_id;

      const groupSessionId = groupId
        ? `group:${groupId}`
        : `personal:${userId}`;
      const personalSessionId = `personal:${userId}`;

      // 防止并发处理（已在调用方处理）
      // 如果 appendToActive 为 true，说明是追加模式，不添加 processingSet

      try {
        // 获取/创建会话
        sessionManager.getOrCreate(
          groupSessionId,
          groupId ? "group" : "personal",
          groupId ?? userId,
        );

        if (groupId) {
          sessionManager.getOrCreate(personalSessionId, "personal", userId);
        }

        // 提取内容
        // 检测引用内容
        const quotedInfo = await getQuotedContent(e, ctx);

        // 收集需要附加的图片 URL
        const imageUrlsToAttach: string[] = [];

        // 从当前消息中提取图片 URL
        if (e.message) {
          for (const seg of e.message) {
            if (seg.type === "image" && (seg.url || seg.data?.url)) {
              imageUrlsToAttach.push(seg.url || seg.data.url);
            }
          }
        }

        // 从引用消息中提取图片 URL
        if (quotedInfo?.imageUrl) {
          imageUrlsToAttach.push(quotedInfo.imageUrl);
        }

        // 标记是否有图片附加
        const hasAttachedImages = imageUrlsToAttach.length > 0;

        let messageContent: string;
        let extraContext = "";

        // 注入引用信息（仅文本）
        if (quotedInfo) {
          const parts: string[] = [];
          parts.push(
            `[Quoted message #${quotedInfo.messageId} from ${quotedInfo.senderName}: ${quotedInfo.content}]`,
          );
          if (quotedInfo.imageUrl) {
            parts.push(`[Quoted message contains an image]`);
          }
          extraContext = parts.join(" ");
        }

        // 获取纯文本
        const text = ctx.text(e) || "";
        if (extraContext) {
          messageContent = extraContext + " " + text;
        } else {
          messageContent = text;
        }

        if (options?.triggerReason) {
          messageContent = options.triggerReason + messageContent;
        }

        // 构建用户消息（用于表达学习和话题跟踪，不保存到数据库）
        const userMsg = {
          sessionId: groupSessionId,
          role: "user" as const,
          content: messageContent,
          userId,
          userName: e.sender?.card || e.sender?.nickname || String(userId),
          userRole: e.sender?.role || "member",
          userTitle: (e.sender as any)?.title || undefined,
          groupId,
          groupName: isGroup ? e.group_name : undefined,
          timestamp: Date.now(),
          messageId: e.message_id,
        };

        // 表达学习
        humanize.expressionLearner.onMessage(groupSessionId, userMsg);

        // 话题跟踪
        humanize.topicTracker.onMessage(groupSessionId);

        // 表情包收集 (seg format: {type: "image", url: "...", file: "..."})
        if (e.message) {
          for (const seg of e.message) {
            if (seg.type === "image" && seg.url && seg.file) {
              humanize.emojiSystem
                .collectFromMessage(seg.url, seg.file)
                .catch(() => {});
            }
          }
        }

        // 加载群聊历史消息
        const rawHistory = groupId
          ? await getGroupHistory(groupId, ctx, cfg.historyCount, db)
          : [];

        // 转换为 ChatMessage 格式
        const history: ChatMessage[] = rawHistory.map((msg) => ({
          sessionId: groupSessionId,
          role: "user" as const,
          content: msg.content,
          userId: msg.userId,
          userName: msg.userName,
          userRole: msg.userRole,
          groupId,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        }));

        // 动作规划器
        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

        if (!options?.skipPlanner) {
          const planResult = await humanize.actionPlanner.plan(
            groupSessionId,
            botNickname,
            history,
            text,
          );

          if (planResult.action === "complete") {
            ctx.logger.info(
              `[动作规划] 会话 ${groupSessionId} 结束对话: ${planResult.reason}`,
            );
            // 清理活跃消息
            if (groupId) {
              queueManager.clearActiveTarget(groupSessionId);
            }
            return;
          }

          if (planResult.action === "wait") {
            ctx.logger.info(
              `[动作规划] 会话 ${groupSessionId} 等待: ${planResult.reason}`,
            );
            // 清理活跃消息
            if (groupId) {
              queueManager.clearActiveTarget(groupSessionId);
            }
            return;
          }
        }

        // 获取 bot 角色和群信息
        const botRole = groupId ? await getBotRole(groupId, ctx) : "member";
        let groupName: string | undefined;
        let memberCount: number | undefined;

        if (groupId) {
          try {
            const groupInfo = await ctx.bot.getGroupInfo(groupId);
            groupName = (groupInfo as any)?.group_name || e.group_name;
            memberCount = (groupInfo as any)?.member_count;
          } catch {
            groupName = e.group_name;
          }
        }

        // 记忆检索
        const senderName =
          e.sender?.card || e.sender?.nickname || String(userId);
        const memoryContext = await humanize.memoryRetrieval.retrieve(
          groupSessionId,
          text,
          senderName,
          history,
        );

        // 话题上下文
        const topicContext =
          humanize.topicTracker.getTopicContext(groupSessionId);

        // 表达习惯上下文
        const expressionContext =
          humanize.expressionLearner.getExpressionContext(groupSessionId);

        // 构建 targetMessage
        const targetMessage: TargetMessage = {
          userName: senderName,
          userId,
          userRole: e.sender?.role || "member",
          userTitle: (e.sender as any)?.title || undefined,
          content: messageContent,
          messageId: e.message_id,
          timestamp: Date.now(),
        };

        // 保存到活跃消息映射（用于队列追加）
        if (groupId) {
          queueManager.setActiveTarget(groupSessionId, targetMessage);
        }

        // 构建工具上下文
        const toolCtx: ToolContext = {
          ctx,
          event: e,
          sessionId: groupSessionId,
          groupId,
          userId,
          config: cfg,
          aiService: aiService!,
          db,
          botRole,
          hasAttachedImages,
          pendingImageUrls: imageUrlsToAttach,
          // AI 返回文本时立即发送
          onTextContent: async (text, messageIndex, totalMessages) => {
            // 解析消息
            const messages = text
              .trim()
              .split("\n---\n")
              .map((s) => s.trim())
              .filter(Boolean);

            // 发送当前消息
            if (messages[messageIndex]) {
              await sendMessage(
                ctx,
                groupId,
                userId,
                messages[messageIndex],
                messageIndex === 0,
                humanize.typoGenerator,
              );
            }

            // 记录发言频率
          },
        };

        // 运行 AI
        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          targetMessage,
          {
            config: cfg,
            groupName,
            memberCount,
            botNickname,
            botRole,
            aiService: aiService!,
            isGroup,
            memoryContext: memoryContext || undefined,
            topicContext: topicContext || undefined,
            expressionContext: expressionContext || undefined,
            replyContext: {
              type: "reply",
              targetUser: targetMessage.userName,
              targetMessage: targetMessage.content,
            },
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息（跳过已通过 onTextContent 回调发送的消息）
        const sentIndices = toolCtx.sentMessageIndices;
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            // 跳过已发送的消息
            if (sentIndices?.has(i)) {
              continue;
            }

            let msg = result.messages[i];

            // 应用错别字生成器
            msg = humanize.typoGenerator.apply(msg);

            // 按换行符分割为多条消息
            let lines: string[];
            lines = msg.split("\n").filter((l) => l.trim());

            // 展开包含多个 reply 标记的行
            const expandedLines: string[] = [];
            for (const line of lines) {
              const parts = splitByReplyMarkers(line);
              expandedLines.push(...parts);
            }

            for (let j = 0; j < expandedLines.length; j++) {
              const line = expandedLines[j];

              // 每一行都检查引用标记，不跳过
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line);

              // 戳人
              if (groupId && pokeUsers.length > 0) {
                for (const pokeId of pokeUsers) {
                  await ctx.bot.api("group_poke", {
                    group_id: groupId,
                    user_id: pokeId,
                  });
                }
              }

              // 构建消息段
              const lineSegments: any[] = [];

              // 如果有引用标记就添加，不限制只能第一条消息
              if (quoteId !== undefined) {
                lineSegments.push({ type: "reply", id: String(quoteId) });
              }

              // AT
              for (const atId of atUsers) {
                lineSegments.push(ctx.segment.at(atId));
              }

              // 文本
              if (cleanText) {
                lineSegments.push(ctx.segment.text(cleanText));
              }

              // 发送
              if (lineSegments.length > 0) {
                if (groupId) {
                  await ctx.bot.sendGroupMsg(groupId, lineSegments);
                } else {
                  await ctx.bot.sendPrivateMsg(userId, lineSegments);
                }
              }

              // 多条消息间延迟
              if (j < lines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }
          }

          // 记录发言（如果回调没有发送消息，则在这里记录）
          if (!sentIndices || sentIndices.size === 0) {
          }

          // 回复完成后启动冷却计时器
          if (groupId) {
            startCooldownTimer(groupSessionId, groupId);
          }
        }

        // 发送表情包
        if (result.emojiPath) {
          try {
            const emojiSegment = ctx.segment.image(
              `file://${result.emojiPath}`,
            );
            if (groupId) {
              await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
            } else {
              await e.reply([emojiSegment]);
            }
          } catch (err) {
            ctx.logger.warn(`[表情包] 发送失败: ${err}`);
          }
        }

        // 保存 bot 发送的消息到数据库
        if (groupId) {
          const now = Date.now();
          for (const msg of result.messages) {
            saveBotMessage(groupId, groupSessionId, msg, now, cfg);
          }
        }

        sessionManager.touch(groupSessionId);

        // 不在这里清理 activeTarget，让 processQueuedMessages 处理
      } catch (err) {
        const errStr = String(err);
        // 429 rate limit 错误，等待后重试
        if (errStr.includes("429") || errStr.includes("rate limit")) {
          ctx.logger.warn(`[Chat] Rate limit hit, waiting 5s to retry...`);
          await new Promise((r) => setTimeout(r, 5000));
          try {
            // 重置并重试，跳过 planner（不重新添加 processingSet，由调用方处理）
            await processChat(e, cfg, { ...options, skipPlanner: true });
            return;
          } catch (retryErr) {
            ctx.logger.error(`Chat retry failed: ${retryErr}`);
          }
        } else {
          ctx.logger.error(`Chat processing failed: ${err}`);
        }

        // 清理活跃消息（错误）
        if (groupId) {
          queueManager.clearActiveTarget(groupSessionId);
        }
      }
    }

    /**
     * 保存 bot 发送的消息到数据库
     */
    function saveBotMessage(
      groupId: number,
      groupSessionId: string,
      content: string,
      timestamp: number,
      cfg: ChatConfig,
    ): void {
      const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Miku";
      const botMsg: ChatMessage = {
        sessionId: groupSessionId,
        role: "assistant",
        content,
        userId: ctx.bot.uin,
        userName: botNickname,
        userRole: "member",
        groupId,
        timestamp,
      };
      db.saveMessage(botMsg);
      // 记录 Bot 最后发言时间
      groupLastBotMessageTime.set(groupSessionId, timestamp);
      // 重置 Bot 发言后的消息计数
      groupMessageCountAfterBot.set(groupSessionId, 0);
    }

    // ==================== 消息处理 ====================
    ctx.handle("message", async (e: any) => {
      const cfg = await getConfig();
      if (!cfg.apiKey) return;

      const text = ctx.text(e) || "";
      const isGroup = e.message_type === "group";
      const groupId: number | undefined = isGroup ? e.group_id : undefined;
      const userId: number = e.user_id || e.sender?.user_id;

      // 忽略自身消息
      if (userId === ctx.bot.uin) return;

      // 处理命令
      // /空闲检查 调试指令
      if (text.startsWith("/空闲检查 ")) {
        const isOwner = ctx.isOwner?.(e) ?? false;
        if (!isOwner) {
          await e.reply("只有主人才能使用这个指令~");
          return;
        }
        const groupIdStr = text.replace("/空闲检查", "").trim();
        const targetGroupId = parseInt(groupIdStr, 10);
        if (!targetGroupId) {
          await e.reply("请指定群号，如：/空闲检查 123456");
          return;
        }

        // 手动触发空闲检测（跳过时间限制和消息数量限制）
        const groupSessionId = `group:${targetGroupId}`;
        try {
          // 获取配置
          const cfg = await getConfig();
          if (!cfg.apiKey) {
            await e.reply("未配置 API Key");
            return;
          }
          const now = Date.now();
          const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

          ctx.logger.info(`[Debug] 手动触发空闲检测: 群 ${targetGroupId}`);

          // 获取群聊历史
          const rawHistory = await getGroupHistory(
            targetGroupId,
            ctx,
            cfg.historyCount,
            db,
          );
          const history: ChatMessage[] = rawHistory.map((msg) => ({
            sessionId: groupSessionId,
            role: "user" as const,
            content: msg.content,
            userId: msg.userId,
            userName: msg.userName,
            userRole: msg.userRole,
            groupId: targetGroupId,
            timestamp: msg.timestamp,
            messageId: msg.messageId,
          }));

          // 使用 planner 进行空闲检测
          const planResult = await humanize.actionPlanner.plan(
            groupSessionId,
            botNickname,
            history,
            "[Check if you want to answer the call]",
            true,
          );

          // 如果决定回复，执行真正的聊天
          if (planResult.action === "reply") {
            const targetMessage: TargetMessage = {
              userName: "系统",
              userId: 0,
              userRole: "member",
              content: "[No one in the group is talking? I'll answer!]",
              messageId: 0,
              timestamp: now,
            };

            const toolCtx: ToolContext = {
              ctx,
              event: null,
              sessionId: groupSessionId,
              groupId: targetGroupId,
              userId: 0,
              config: cfg,
              aiService: aiService!,
              db,
              botRole: await getBotRole(targetGroupId, ctx),
              // AI 返回文本时立即发送
              onTextContent: async (text, messageIndex, totalMessages) => {
                // 解析消息
                let messages: string[];
                messages = text
                  .trim()
                  .split("\n---\n")
                  .map((s) => s.trim())
                  .filter(Boolean);

                // 发送当前消息
                if (messages[messageIndex]) {
                  await sendMessage(
                    ctx,
                    targetGroupId,
                    0,
                    messages[messageIndex],
                    messageIndex === 0,
                    humanize.typoGenerator,
                  );
                }

                // 记录发言频率
              },
            };

            // 构建 planner 思考内容，告诉 AI 群里的情况和可以怎么回复
            const plannerThoughts = `No one in the group has spoken for a long time, so come and answer the group
Planned reason: ${planResult.reason}
1. Participate in group chat topics naturally
2. Quote messages from group friends appropriately (using [[[reply:message ID]]] format)
3. Start a new topic or respond to a previous conversation
4. Don't mention your intentions like "I'm here to answer" or something like a normal chat`;

            const result = await runChat(
              aiInstance,
              toolCtx,
              history,
              targetMessage,
              {
                config: cfg,
                botNickname,
                botRole: toolCtx.botRole,
                aiService: aiService!,
                isGroup: true,
                plannerThoughts,
                replyContext: {
                  type: "idle",
                },
              },
              sessionManager,
              humanize,
              skillManager,
            );

            // 发送消息（跳过已通过 onTextContent 回调发送的消息）
            const sentIndices3 = toolCtx.sentMessageIndices;
            if (result.messages.length > 0) {
              for (let i = 0; i < result.messages.length; i++) {
                // 跳过已发送的消息
                if (sentIndices3?.has(i)) {
                  continue;
                }

                let msg = result.messages[i];
                msg = humanize.typoGenerator.apply(msg);

                let lines: string[];
                lines = msg.split("\n").filter((l) => l.trim());

                // 展开包含多个 reply 标记的行
                const expandedLines: string[] = [];
                for (const line of lines) {
                  const parts = splitByReplyMarkers(line);
                  expandedLines.push(...parts);
                }

                for (let j = 0; j < expandedLines.length; j++) {
                  const line = expandedLines[j];

                  // 每一行都检查引用标记，不跳过
                  const { cleanText, atUsers, pokeUsers, quoteId } =
                    parseLineMarkers(line);

                  if (pokeUsers.length > 0) {
                    for (const pokeId of pokeUsers) {
                      await ctx.bot.api("group_poke", {
                        group_id: targetGroupId,
                        user_id: pokeId,
                      });
                    }
                  }

                  const lineSegments: any[] = [];

                  // 如果有引用标记就添加，不限制只能第一条消息
                  if (quoteId !== undefined) {
                    lineSegments.push({ type: "reply", id: String(quoteId) });
                  }

                  for (const atId of atUsers) {
                    lineSegments.push(ctx.segment.at(atId));
                  }

                  if (cleanText) {
                    lineSegments.push(ctx.segment.text(cleanText));
                  }

                  if (lineSegments.length > 0) {
                    await ctx.bot.sendGroupMsg(targetGroupId, lineSegments);
                  }

                  if (j < expandedLines.length - 1) {
                    await new Promise((r) => setTimeout(r, 300));
                  }
                }

                if (i < result.messages.length - 1) {
                  await new Promise((r) => setTimeout(r, 300));
                }
              }

              // 记录发言（如果回调没有发送消息，则在这里记录）
              if (!sentIndices3 || sentIndices3.size === 0) {
              }
            }

            // 保存 bot 消息
            const now2 = Date.now();
            for (const msg of result.messages) {
              saveBotMessage(targetGroupId, groupSessionId, msg, now2, cfg);
            }

            await e.reply(
              `[空闲检测] 群 ${targetGroupId} 已发送回复: ${planResult.reason}`,
            );
          } else {
            await e.reply(
              `[空闲检测] 群 ${targetGroupId}\n决定: ${planResult.action}\n原因: ${planResult.reason}`,
            );
          }
          return;
        } catch (err) {
          ctx.logger.error(`[Debug] 空闲检测失败: ${err}`);
          await e.reply(`[空闲检测] 失败: ${err}`);
          return;
        }
      }

      if (text === "/重置会话") {
        if (groupId) {
          const groupSessionId = `group:${groupId}`;
          sessionManager.resetBotMessages(groupSessionId);
          await e.reply("已清除本群会话中 AI 发送的消息~");
          return;
        }
        const personalSessionId = `personal:${userId}`;
        sessionManager.resetBotMessages(personalSessionId);
        await e.reply("已清除你的个人会话中 AI 发送的消息~");
        return;
      }

      // 群组黑白名单
      if (groupId && !isGroupAllowed(groupId, cfg)) return;

      // 检查是否 @ 了 bot
      const atBot = shouldTrigger(e, text, cfg, ctx);

      // 检查是否引用了 bot 消息
      const quotedBot = isGroup ? await isQuotingBot(e, ctx) : null;

      // 检查是否包含昵称
      const mentionedNickname =
        cfg.nicknames.length > 0 &&
        text.toLowerCase().includes(cfg.nicknames[0].toLowerCase());

      // 更新群的活动时间（仅群消息）
      if (isGroup && groupId) {
        const groupSessionId = `group:${groupId}`;
        groupLastActivityTime.set(groupSessionId, Date.now());
        const currentCount = groupMessageCount.get(groupSessionId) ?? 0;
        groupMessageCount.set(groupSessionId, currentCount + 1);

        // 更新 Bot 发言后的消息计数
        const currentBotCount =
          groupMessageCountAfterBot.get(groupSessionId) ?? 0;
        groupMessageCountAfterBot.set(groupSessionId, currentBotCount + 1);

        // 检查是否在冷却期间，如果在则收集消息
        const cooldownUntil = groupCooldownUntil.get(groupSessionId) ?? 0;
        if (Date.now() < cooldownUntil) {
          // 在冷却期间，收集消息
          collectCooldownMessage(groupSessionId, groupId, e, text, atBot);
          return;
        }
      }

      // 检查是否已在处理中
      const groupSessionId =
        isGroup && groupId ? `group:${groupId}` : undefined;

      // 群消息：检查群是否正在处理
      if (isGroup && groupId && groupSessionId) {
        if (processingSet.has(groupSessionId)) {
          // 群正在处理中，只有 @bot 或提到昵称的消息才加入队列
          if (atBot || mentionedNickname) {
            queueManager.enqueue(groupSessionId, e, cfg);
            ctx.logger.info(
              `[Queue] 群 ${groupId} 正在处理，有效消息加入队列，当前队列长度: ${queueManager.getQueueLength(groupSessionId)}`,
            );
          }
          return;
        }

        // 标记群正在处理
        processingSet.add(groupSessionId);
      } else {
        // 私聊仍然基于用户
        const triggerKey = `personal:${userId}`;
        if (processingSet.has(triggerKey)) {
          return;
        }
        processingSet.add(triggerKey);
      }

      try {
        if (atBot) {
          if (!rateLimiter.canProcess(userId, groupId, text)) {
            return;
          }
          rateLimiter.record(userId, groupId, text);
          await processChat(e, cfg, { skipPlanner: true });
          return;
        }

        if (quotedBot || mentionedNickname) {
          const rawHistory = await getGroupHistory(
            groupId!,
            ctx,
            cfg.historyCount,
            db,
          );
          const history: ChatMessage[] = rawHistory.map((msg) => ({
            sessionId: groupSessionId!,
            role: "user" as const,
            content: msg.content,
            userId: msg.userId,
            userName: msg.userName,
            userRole: msg.userRole,
            groupId,
            timestamp: msg.timestamp,
            messageId: msg.messageId,
          }));
          const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

          const planResult = await humanize.actionPlanner.plan(
            groupSessionId!,
            botNickname,
            history,
            text,
          );

          if (planResult.action === "reply") {
            if (!rateLimiter.canProcess(userId, groupId, text)) {
              return;
            }
            rateLimiter.record(userId, groupId, text);
            await processChat(e, cfg, { skipPlanner: true });
          }
          return;
        }
      } finally {
        if (isGroup && groupId && groupSessionId) {
          processingSet.delete(groupSessionId);
          // 处理队列中的消息
          await processQueuedMessages(groupSessionId, cfg);
        } else {
          processingSet.delete(`personal:${userId}`);
        }
      }
      // 没有触发任何条件，不回复
      return;
    });

    // ==================== 戳一戳处理 ====================
    ctx.handle("notice.group.poke" as any, async (e: any) => {
      if (e.target_id !== ctx.bot.uin) return;

      const cfg = await getConfig();
      if (!cfg.apiKey) return;

      const groupId = e.group_id;
      if (!groupId) return;
      if (!isGroupAllowed(groupId, cfg)) return;

      // 冷却检查
      const lastPoke = pokeCooldowns.get(groupId) ?? 0;
      if (Date.now() - lastPoke < POKE_COOLDOWN_MS) return;
      pokeCooldowns.set(groupId, Date.now());

      const groupSessionId = `group:${groupId}`;

      // 检查群是否正在处理，如果是则加入队列
      if (processingSet.has(groupSessionId)) {
        queueManager.enqueue(groupSessionId, e, cfg);
        ctx.logger.info(
          `[Queue] 群 ${groupId} 戳一戳加入队列，当前队列长度: ${queueManager.getQueueLength(groupSessionId)}`,
        );
        return;
      }

      processingSet.add(groupSessionId);

      // 确保 session 存在
      sessionManager.getOrCreate(groupSessionId, "group", groupId);

      try {
        const userId = e.user_id || e.operator_id;
        const botRole = await getBotRole(groupId, ctx);
        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

        let senderName = String(userId);
        try {
          const memberInfo = await ctx.bot.getGroupMemberInfo(groupId, userId);
          senderName =
            (memberInfo as any).card ||
            (memberInfo as any).nickname ||
            String(userId);
        } catch {}

        // 构建戳一戳的 targetMessage
        const targetMessage: TargetMessage = {
          userName: senderName,
          userId,
          userRole: "member",
          content: `[${senderName} poked you]`,
          timestamp: Date.now(),
        };

        // 获取群聊历史
        const rawHistory = await getGroupHistory(
          groupId,
          ctx,
          cfg.historyCount,
          db,
        );
        const history: ChatMessage[] = rawHistory.map((msg) => ({
          sessionId: groupSessionId,
          role: "user" as const,
          content: msg.content,
          userId: msg.userId,
          userName: msg.userName,
          userRole: msg.userRole,
          groupId,
          timestamp: msg.timestamp,
          messageId: msg.messageId,
        }));

        let groupName: string | undefined;
        let memberCount: number | undefined;
        try {
          const groupInfo = await ctx.bot.getGroupInfo(groupId);
          groupName = (groupInfo as any)?.group_name;
          memberCount = (groupInfo as any)?.member_count;
        } catch {}

        const toolCtx: ToolContext = {
          ctx,
          event: e,
          sessionId: groupSessionId,
          groupId,
          userId,
          config: cfg,
          aiService: aiService!,
          db,
          botRole,
          // AI 返回文本时立即发送
          onTextContent: async (text, messageIndex, totalMessages) => {
            // 解析消息
            const messages = text
              .trim()
              .split("\n---\n")
              .map((s) => s.trim())
              .filter(Boolean);

            // 发送当前消息
            if (messages[messageIndex]) {
              await sendMessage(
                ctx,
                groupId,
                userId,
                messages[messageIndex],
                messageIndex === 0,
                humanize.typoGenerator,
              );
            }

            // 记录发言频率
          },
        };

        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          targetMessage,
          {
            config: cfg,
            groupName,
            memberCount,
            botNickname,
            botRole,
            aiService: aiService!,
            isGroup: true,
            replyContext: {
              type: "reply",
              targetUser: targetMessage.userName,
              targetMessage: targetMessage.content,
            },
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息
        const sentIndices4 = toolCtx.sentMessageIndices;
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            // 跳过已发送的消息
            if (sentIndices4?.has(i)) {
              continue;
            }

            let msg = result.messages[i];
            msg = humanize.typoGenerator.apply(msg);

            // 按换行符分割为多条消息
            let lines: string[];
            try {
              lines = msg.split("\n").filter((l) => l.trim());
            } catch (err) {
              ctx.logger.error("[processAIResponse5] split/filter error:", err);
              lines = [msg];
            }

            // 展开包含多个 reply 标记的行
            const expandedLines: string[] = [];
            for (const line of lines) {
              const parts = splitByReplyMarkers(line);
              expandedLines.push(...parts);
            }

            for (let j = 0; j < expandedLines.length; j++) {
              const line = expandedLines[j];

              // 每一行都检查引用标记，不跳过
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line);

              // 戳人
              if (pokeUsers.length > 0) {
                for (const pokeId of pokeUsers) {
                  try {
                    await ctx.bot.api("group_poke", {
                      group_id: groupId,
                      user_id: pokeId,
                    });
                  } catch (err) {
                    ctx.logger.warn(`poke failed: ${err}`);
                  }
                }
              }

              // 构建消息段
              const lineSegments: any[] = [];

              // 如果有引用标记就添加，不限制只能第一条消息
              if (quoteId !== undefined) {
                lineSegments.push({ type: "reply", id: String(quoteId) });
              }

              // AT
              for (const atId of atUsers) {
                lineSegments.push(ctx.segment.at(atId));
              }

              // 文本
              if (cleanText) {
                lineSegments.push(ctx.segment.text(cleanText));
              }

              if (lineSegments.length > 0) {
                await ctx.bot.sendGroupMsg(groupId, lineSegments);
              }

              if (j < expandedLines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            if (i < result.messages.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          // 记录发言（如果回调没有发送消息，则在这里记录）
          if (!sentIndices4 || sentIndices4.size === 0) {
          }

          // 回复完成后启动冷却计时器
          if (groupId) {
            startCooldownTimer(groupSessionId, groupId);
          }
        }

        // 保存 bot 发送的消息到数据库
        const now = Date.now();
        for (const msg of result.messages) {
          saveBotMessage(groupId, groupSessionId, msg, now, cfg);
        }

        // 发送表情包
        if (result.emojiPath) {
          try {
            const emojiSegment = ctx.segment.image(
              `file://${result.emojiPath}`,
            );
            await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
          } catch (err) {
            ctx.logger.warn(`[表情包] 发送失败: ${err}`);
          }
        }

        sessionManager.touch(groupSessionId);
      } catch (err) {
        ctx.logger.error(`戳一戳处理失败: ${err}`);
      } finally {
        processingSet.delete(groupSessionId);
      }
    });

    ctx.logger.info("聊天插件加载成功");

    // 清理函数
    return () => {
      db.close();
      rateLimiter.dispose();
      clearInterval(cleanupInterval);
      clearInterval(idleCheckInterval);
      processingSet.clear();
      pokeCooldowns.clear();
      groupLastActivityTime.clear();
      groupMessageCount.clear();
      groupLastBotMessageTime.clear();
      groupMessageCountAfterBot.clear();
      groupLastIdleCheckTime.clear();
      idleCheckProcessing.clear();
      // 冷却相关清理
      for (const timer of cooldownTimeoutIds.values()) {
        clearTimeout(timer);
      }
      cooldownTimeoutIds.clear();
      groupCooldownUntil.clear();
      groupCooldownMessages.clear();
      ctx.logger.info("聊天插件已卸载");
    };
  },
};

export default chatPlugin;
