import type { MiokuPlugin } from "../../src";
import type { AIService, AIInstance } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { ConfigService } from "../../src/services/config";
import { MiokiContext } from "mioki";
import type { AITool } from "../../src";
import type {
  ChatConfig,
  ToolContext,
  ChatMessage,
  TargetMessage,
  SkillSession,
} from "./types";
import { initDatabase } from "./db";
import { SessionManager } from "./session";
import { RateLimiter } from "./rate-limiter";
import { runChat } from "./chat-engine";
import { HumanizeEngine } from "./humanize";
import type { SkillSessionManager } from "./tools";
import {
  shouldTrigger,
  isQuotingBot,
  isGroupAllowed,
  extractContent,
  getBotRole,
  getQuotedContent,
} from "./utils";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";

// ==================== SkillSessionManager ====================

class SkillSessionManagerImpl implements SkillSessionManager {
  private sessions: Map<string, Map<string, SkillSession>> = new Map();
  private EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  getTools(sessionId: string): Map<string, AITool> {
    const result = new Map<string, AITool>();
    const sessionSkills = this.sessions.get(sessionId);
    if (!sessionSkills) return result;

    const now = Date.now();
    for (const [skillName, session] of sessionSkills) {
      if (now > session.expiresAt) {
        sessionSkills.delete(skillName);
        continue;
      }
      for (const [toolName, tool] of session.tools) {
        result.set(toolName, tool);
      }
    }
    return result;
  }

  loadSkill(
    sessionId: string,
    skillName: string,
    tools: AITool[],
  ): SkillSession {
    let sessionSkills = this.sessions.get(sessionId);
    if (!sessionSkills) {
      sessionSkills = new Map();
      this.sessions.set(sessionId, sessionSkills);
    }

    const now = Date.now();
    const toolMap = new Map<string, AITool>();
    for (const tool of tools) {
      toolMap.set(`${skillName}.${tool.name}`, tool);
    }

    const session: SkillSession = {
      skillName,
      tools: toolMap,
      loadedAt: now,
      expiresAt: now + this.EXPIRY_MS,
    };
    sessionSkills.set(skillName, session);
    return session;
  }

  unloadSkill(sessionId: string, skillName: string): boolean {
    const sessionSkills = this.sessions.get(sessionId);
    if (!sessionSkills) return false;
    return sessionSkills.delete(skillName);
  }

  getActiveSkillsInfo(sessionId: string): string {
    const sessionSkills = this.sessions.get(sessionId);
    if (!sessionSkills || sessionSkills.size === 0) return "";

    const now = Date.now();
    const lines: string[] = [];

    for (const [skillName, session] of sessionSkills) {
      if (now > session.expiresAt) {
        sessionSkills.delete(skillName);
        continue;
      }
      const remainingMin = Math.ceil((session.expiresAt - now) / 60000);
      const toolNames = [...session.tools.keys()].join(", ");
      lines.push(
        `- ${skillName} (expires in ${remainingMin}min): ${toolNames}`,
      );
    }

    if (lines.length === 0) return "";
    return `## Loaded External Skills\n${lines.join("\n")}`;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, sessionSkills] of this.sessions) {
      for (const [skillName, session] of sessionSkills) {
        if (now > session.expiresAt) {
          sessionSkills.delete(skillName);
        }
      }
      if (sessionSkills.size === 0) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

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
    const skillManager = new SkillSessionManagerImpl();

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

    // 正在处理的会话，防止并发
    const processingSet = new Set<string>();

    // 连续对话追踪：记录 bot 最近回复的用户和时间
    // key: "group:{groupId}:{userId}", value: timestamp
    const recentReplies = new Map<string, number>();
    const FOLLOW_UP_WINDOW_MS = 3 * 60_000; // 3 分钟内的后续消息走 planner

    // 定期清理过期技能会话
    const cleanupInterval = setInterval(
      () => skillManager.cleanup(),
      10 * 60_000,
    );

    /**
     * 处理 AI 聊天核心流程
     */
    async function processChat(
      e: any,
      cfg: ChatConfig,
      options?: { skipPlanner?: boolean; triggerReason?: string },
    ): Promise<void> {
      const isGroup = e.message_type === "group";
      const groupId: number | undefined = isGroup ? e.group_id : undefined;
      const userId: number = e.user_id || e.sender?.user_id;

      const groupSessionId = groupId
        ? `group:${groupId}`
        : `personal:${userId}`;
      const personalSessionId = `personal:${userId}`;

      // 防止并发处理
      if (processingSet.has(groupSessionId)) return;
      processingSet.add(groupSessionId);

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

        // 保存用户消息到群会话
        const userMsg: ChatMessage = {
          sessionId: groupSessionId,
          role: "user",
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
        db.saveMessage(userMsg);

        // 保存到个人会话
        if (groupId) {
          db.saveMessage({ ...userMsg, sessionId: personalSessionId });
        }

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
        if (
          isGroup &&
          !humanize.frequencyController.shouldSpeak(groupSessionId)
        ) {
          ctx.logger.info(`[频率控制] 会话 ${groupSessionId} 本次保持沉默`);
          processingSet.delete(groupSessionId);
          return;
        }

        // 加载历史消息
        const history = db.getMessages(groupSessionId, 30);

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
            processingSet.delete(groupSessionId);
            return;
          }

          if (planResult.action === "wait") {
            ctx.logger.info(
              `[动作规划] 会话 ${groupSessionId} 等待: ${planResult.reason}`,
            );
            processingSet.delete(groupSessionId);
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

            // 构建消息段
            const segments: any[] = [];

            // 第一条消息带引用
            if (i === 0 && result.pendingQuote) {
              segments.push(ctx.segment.reply(String(result.pendingQuote)));
            }

            // AT 段（所有 AT 附加到第一条消息）
            if (i === 0 && result.pendingAt.length > 0) {
              for (const atId of result.pendingAt) {
                segments.push(ctx.segment.at(atId));
              }
            }

            // 文本段（按换行符分割为多条消息）
            const lines = msg.split("\n").filter((l) => l.trim());
            for (let j = 0; j < lines.length; j++) {
              const line = lines[j];
              const lineSegments = [...segments];

              // 第一条消息带引用和 AT，后续只带文本
              if (j === 0) {
                // 已有引用和 AT 段
              } else {
                // 后续消息只加文本
                lineSegments.length = 0;
              }
              lineSegments.push(ctx.segment.text(line));

              // 发送
              if (groupId) {
                await ctx.bot.sendGroupMsg(groupId, lineSegments);
              } else {
                await ctx.bot.sendPrivateMsg(userId, lineSegments);
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

        sessionManager.touch(groupSessionId);
      } catch (err) {
        ctx.logger.error(`聊天处理失败: ${err}`);
      } finally {
        processingSet.delete(groupSessionId);
      }
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

      // 检查触发条件
      let triggered = shouldTrigger(e, text, cfg, ctx);

      // 连续对话追踪：检查是否在 bot 最近回复的时间窗口内
      // 策略：planner只响应第一条后续消息，后续消息作为聊天记录
      if (!triggered && isGroup && groupId && text.trim()) {
        const replyKey = `${groupId}:${userId}`;
        const lastReplyTime = recentReplies.get(replyKey) ?? 0;
        
        // 清除记录，防止重复触发planner
        recentReplies.delete(replyKey);
        
        if (Date.now() - lastReplyTime < FOLLOW_UP_WINDOW_MS) {
          // 在时间窗口内，用 planner 判断是否回复
          const groupSessionId = `group:${groupId}`;
          const history = db.getMessages(groupSessionId, 30);
          const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

          const planResult = await humanize.actionPlanner.plan(
            groupSessionId,
            botNickname,
            history,
            text,
          );

          if (planResult.action === "reply") {
            if (!rateLimiter.canProcess(userId, groupId, text)) return;
            rateLimiter.record(userId, groupId, text);
            await processChat(e, cfg, { skipPlanner: true });
          }
          // wait/complete → 不回复，但消息已保存到DB供后续使用
          return;
        }
      }

      // 引用 bot 消息触发检测
      if (!triggered && isGroup) {
        const quotingBot = await isQuotingBot(e, ctx);
        if (quotingBot) {
          // 检查是否也直接提到了 bot（已被 shouldTrigger 覆盖）
          // 如果只是引用但没有 @ 或提到名字，用 planner 判断
          const groupSessionId = `group:${groupId}`;

          // 先保存消息到 DB（processChat 也会保存，这里提前保存给 planner 用）
          const history = db.getMessages(groupSessionId, 30);
          const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";

          const planResult = await humanize.actionPlanner.plan(
            groupSessionId,
            botNickname,
            history,
            text,
          );

          if (planResult.action === "reply") {
            // 频率检查
            if (!rateLimiter.canProcess(userId, groupId, text)) return;
            rateLimiter.record(userId, groupId, text);
            await processChat(e, cfg, { skipPlanner: true });
          }
          // wait/complete → 不回复
          return;
        }
      }

      if (!triggered) return;

      // 频率检查
      if (!rateLimiter.canProcess(userId, groupId, text)) return;
      rateLimiter.record(userId, groupId, text);

      await processChat(e, cfg);
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
      if (processingSet.has(groupSessionId)) return;
      processingSet.add(groupSessionId);

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

        const history = db.getMessages(groupSessionId, 30);

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

            const segments: any[] = [];
            if (i === 0 && result.pendingQuote) {
              segments.push(ctx.segment.reply(String(result.pendingQuote)));
            }
            if (i === 0 && result.pendingAt.length > 0) {
              for (const atId of result.pendingAt) {
                segments.push(ctx.segment.at(atId));
              }
            }

            // 按换行符分割为多条消息
            const lines = msg.split("\n").filter((l) => l.trim());
            for (let j = 0; j < lines.length; j++) {
              const line = lines[j];
              const lineSegments = j === 0 ? [...segments] : [];
              lineSegments.push(ctx.segment.text(line));

              await ctx.bot.sendGroupMsg(groupId, lineSegments);

              if (j < lines.length - 1) {
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            if (i < result.messages.length - 1) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          humanize.frequencyController.recordSpeak(groupSessionId);

          // 记录最近回复
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
      ctx.logger.info("聊天插件已卸载");
    };
  },
};

export default chatPlugin;
