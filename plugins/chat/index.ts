import type { MiokuPlugin } from "../../src";
import type { AIService, AIInstance } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { ConfigService } from "../../src/services/config";
import { MiokiContext } from "mioki";
import type {
  ChatConfig,
  ToolContext,
  ChatMessage,
  TargetMessage,
} from "./types";
import { initDatabase } from "./db";
import { SessionManager } from "./session";
import { RateLimiter } from "./rate-limiter";
import { runChat } from "./chat-engine";
import { HumanizeEngine } from "./humanize";
import { SkillSessionManager } from "./skill-session";
import {
  shouldTrigger,
  isQuotingBot,
  isGroupAllowed,
  extractContent,
  getBotRole,
  getQuotedContent,
  getGroupHistory,
} from "./utils";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";
import { MessageQueueManager, parseLineMarkers } from "./queue";

// ==================== Plugin ====================

const chatPlugin: MiokuPlugin = {
  name: "chat",
  version: "1.0.0",
  description: "AI 智能聊天插件",
  services: ["ai", "config", "help"],

  help: {
    title: "AI 聊天",
    description: "智能 AI 聊天插件",
    commands: [
      { cmd: "/重置会话", desc: "重置自己的AI聊天记录" },
      { cmd: "/重置群会话", desc: "[管理] 重置当前群的AI聊天记录" },
    ],
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

    // 连续对话追踪：记录 bot 最近回复的用户和时间
    const recentReplies = new Map<string, number>();
    const FOLLOW_UP_WINDOW_MS = 3 * 60_000; // 3 分钟内的后续消息走 planner

    // 定期清理过期技能会话
    const cleanupInterval = setInterval(
      () => skillManager.cleanup(),
      10 * 60_000,
    );

    /**
     * 处理队列中的等待消息
     * 将队列中所有消息合并后一次性发送给 AI，只请求一次
     */
    async function processQueuedMessages(
      groupSessionId: string,
      cfg: ChatConfig,
    ): Promise<void> {
      // 获取当前队列中的所有消息
      const queue = queueManager.getQueue(groupSessionId);
      if (!queue || queue.length === 0) {
        queueManager.clearActiveTarget(groupSessionId);
        return;
      }

      ctx.logger.info(
        `[Queue] 群 ${groupSessionId} 批量处理队列，队列长度: ${queue.length}`,
      );

      // 收集所有队列消息的内容（使用纯文本格式，与第一个消息一致）
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

      // 将所有队列消息合并，用换行分隔（不用 --- 分隔）
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
      };

      const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

      // 获取群聊历史
      const rawHistory = await getGroupHistory(groupId, ctx, cfg.historyCount, db);
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
        },
        sessionManager,
        humanize,
        skillManager,
      );

      // 发送消息
      if (result.messages.length > 0) {
        for (let i = 0; i < result.messages.length; i++) {
          let msg = result.messages[i];
          msg = humanize.typoGenerator.apply(msg);

          const lines = msg.split("\n").filter((l) => l.trim());
          for (let j = 0; j < lines.length; j++) {
            const line = lines[j];

            const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(
              line,
              i === 0 && j === 0 ? undefined : "skip",
            );

            if (pokeUsers.length > 0) {
              for (const pokeId of pokeUsers) {
                try {
                  await ctx.bot.api("group_poke", {
                    group_id: groupId,
                    user_id: pokeId,
                  });
                } catch (err) {
                  ctx.logger.warn(`[戳人] 失败: ${err}`);
                }
              }
            }

            const lineSegments: any[] = [];

            if (quoteId !== undefined && i === 0 && j === 0) {
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

        humanize.frequencyController.recordSpeak(groupSessionId);
      }

      // 发送表情包
      if (result.emojiPath) {
        try {
          const emojiSegment = ctx.segment.image(`file://${result.emojiPath}`);
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
        const { text, multimodal } = extractContent(e, cfg, ctx);

        // 检测引用内容
        const quotedInfo = await getQuotedContent(e, ctx);

        let messageContent: string;
        if (multimodal) {
          messageContent = JSON.stringify(multimodal);
        } else {
          messageContent = text;
        }

        // 注入引用信息
        if (quotedInfo) {
          messageContent = `[Quoting ${quotedInfo.senderName}: "${quotedInfo.content}"] ${messageContent}`;
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

        // 频率控制
        /*if (
          isGroup &&
          !humanize.frequencyController.shouldSpeak(groupSessionId)
        ) {
          ctx.logger.info(`[频率控制] 会话 ${groupSessionId} 本次保持沉默`);
          processingSet.delete(groupSessionId);
          return;
        }
        */

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
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            let msg = result.messages[i];

            // 应用错别字生成器
            msg = humanize.typoGenerator.apply(msg);

            // 按换行符分割为多条消息
            const lines = msg.split("\n").filter((l) => l.trim());
            for (let j = 0; j < lines.length; j++) {
              const line = lines[j];

              // 解析消息中的标记并按顺序构建消息段
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line, i === 0 && j === 0 ? undefined : "skip");

              // 戳人
              if (groupId && pokeUsers.length > 0) {
                for (const pokeId of pokeUsers) {
                  try {
                    await ctx.bot.api("group_poke", {
                      group_id: groupId,
                      user_id: pokeId,
                    });
                  } catch (err) {
                    ctx.logger.warn(`[戳人] 失败: ${err}`);
                  }
                }
              }

              // 构建消息段
              const lineSegments: any[] = [];

              // 引用（仅第一条消息的第一行）
              if (quoteId !== undefined && i === 0 && j === 0) {
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

          // 记录发言
          humanize.frequencyController.recordSpeak(groupSessionId);

          // 记录最近回复，用于连续对话追踪
          if (groupId && userId) {
            recentReplies.set(`${groupId}:${userId}`, Date.now());
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
      if (text === "/重置会话") {
        const personalSessionId = `personal:${userId}`;
        sessionManager.reset(personalSessionId);
        await e.reply("已重置你的个人会话记录~");
        return;
      }

      if (text === "/重置群会话") {
        if (!groupId) {
          await e.reply("该命令仅群聊可用");
          return;
        }
        const senderRole = e.sender?.role || "member";
        const isOwner = ctx.isOwner?.(e) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          await e.reply("只有管理员或群主可以重置群会话");
          return;
        }
        const groupSessionId = `group:${groupId}`;
        sessionManager.reset(groupSessionId);
        await e.reply("已重置本群的 AI 会话记录~");
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

      const isFollowUp = (() => {
        if (!isGroup || !groupId) return false;
        const replyKey = `${groupId}:${userId}`;
        const lastReplyTime = recentReplies.get(replyKey) ?? 0;
        return Date.now() - lastReplyTime < FOLLOW_UP_WINDOW_MS;
      })();

      // 检查是否已在处理中
      const groupSessionId =
        isGroup && groupId ? `group:${groupId}` : undefined;

      // 群消息：检查群是否正在处理
      if (isGroup && groupId && groupSessionId) {
        if (processingSet.has(groupSessionId)) {
          // 群正在处理中，将新消息加入队列等待追加
          queueManager.enqueue(groupSessionId, e, cfg);
          ctx.logger.info(
            `[Queue] 群 ${groupId} 正在处理，新消息加入队列，当前队列长度: ${queueManager.getQueueLength(groupSessionId)}`,
          );
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

        if (quotedBot || mentionedNickname || isFollowUp) {
          // 清除 recentReplies 记录，防止重复触发
          recentReplies.delete(`${groupId}:${userId}`);

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
          },
          sessionManager,
          humanize,
          skillManager,
        );

        // 发送消息
        if (result.messages.length > 0) {
          for (let i = 0; i < result.messages.length; i++) {
            let msg = result.messages[i];
            msg = humanize.typoGenerator.apply(msg);

            // 按换行符分割为多条消息
            const lines = msg.split("\n").filter((l) => l.trim());
            for (let j = 0; j < lines.length; j++) {
              const line = lines[j];

              // 解析消息中的标记并按顺序构建消息段
              const { cleanText, atUsers, pokeUsers, quoteId } =
                parseLineMarkers(line, i === 0 && j === 0 ? undefined : "skip");

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

              // 引用
              if (quoteId !== undefined && i === 0 && j === 0) {
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

              if (j < lines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            if (i < result.messages.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          humanize.frequencyController.recordSpeak(groupSessionId);

          // 记录最近回复，用于连续对话追踪
          if (groupId && userId) {
            recentReplies.set(`${groupId}:${userId}`, Date.now());
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
      processingSet.clear();
      pokeCooldowns.clear();
      recentReplies.clear();
      ctx.logger.info("聊天插件已卸载");
    };
  },
};

export default chatPlugin;
