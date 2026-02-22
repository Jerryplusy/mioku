import type { MiokuPlugin } from "../../src";
import type { AIService, AIInstance } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { ConfigService } from "../../src/services/config";
import { MiokiContext } from "mioki";
import type { ChatConfig, ToolContext, ChatMessage } from "./types";
import { initDatabase } from "./db";
import { SessionManager } from "./session";
import { RateLimiter } from "./rate-limiter";
import { buildSystemPrompt } from "./prompt";
import { runChat } from "./chat-engine";
import { HumanizeEngine } from "./humanize";
import { shouldTrigger, isQuotingBot, isGroupAllowed, extractContent, getBotRole } from "./utils";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";

const DEFAULT_CONFIG: ChatConfig = {
  ...BASE_CONFIG,
  ...SETTINGS_CONFIG,
  ...PERSONALIZATION_CONFIG,
};

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
      await configService.registerConfig("chat", "settings", DEFAULT_CONFIG);
    }

    // 获取配置
    const getConfig = async (): Promise<ChatConfig> => {
      if (!configService) return DEFAULT_CONFIG;
      const config = await configService.getConfig("chat", "settings");
      return { ...DEFAULT_CONFIG, ...config };
    };

    const config = await getConfig();

    if (!config.apiKey) {
      ctx.logger.warn(
        "聊天插件未配置 API Key，请在 config/chat/settings.json 中配置",
      );
      return;
    }

    // 初始化组件
    const db = initDatabase();
    const sessionManager = new SessionManager(db, config.maxSessions);
    const rateLimiter = new RateLimiter();

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

    // 戳一戳冷却：groupId -> lastPokeTime
    const pokeCooldowns = new Map<number, number>();
    const POKE_COOLDOWN_MS = 10 * 60_000; // 10 分钟

    // 正在处理的会话，防止并发
    const processingSet = new Set<string>();

    /**
     * 处理 AI 聊天核心流程
     */
    async function processChat(
      e: any,
      cfg: ChatConfig,
      triggerReason?: string,
    ): Promise<void> {
      const isGroup = e.message_type === "group";
      const groupId: number | undefined = isGroup ? e.group_id : undefined;
      const userId: number = e.user_id || e.sender?.user_id;

      // 构建会话 ID
      const groupSessionId = groupId
        ? `group:${groupId}`
        : `personal:${userId}`;
      const personalSessionId = `personal:${userId}`;

      // 防止并发处理
      if (processingSet.has(groupSessionId)) return;
      processingSet.add(groupSessionId);

      try {
        // 获取/创建会话
        const groupSession = sessionManager.getOrCreate(
          groupSessionId,
          groupId ? "group" : "personal",
          groupId ?? userId,
        );

        // 个人会话（跨群记录）
        if (groupId) {
          sessionManager.getOrCreate(personalSessionId, "personal", userId);
        }

        // 提取内容
        const { text, multimodal } = extractContent(e, cfg, ctx);

        // 构建用户消息内容
        let messageContent: string;
        if (multimodal) {
          messageContent = JSON.stringify(multimodal);
        } else {
          messageContent = text;
        }

        // 补充触发原因
        if (triggerReason) {
          messageContent = triggerReason + messageContent;
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
          db.saveMessage({
            ...userMsg,
            sessionId: personalSessionId,
          });
        }

        // 表达学习：记录用户消息
        humanize.expressionLearner.onMessage(groupSessionId, userMsg);

        // 话题跟踪：记录消息
        humanize.topicTracker.onMessage(groupSessionId);

        // 表情包收集：如果消息中有图片，尝试收集
        if (e.message) {
          for (const seg of e.message) {
            if (seg.type === "image" && seg.data?.url && seg.data?.file) {
              humanize.emojiSystem
                .collectFromMessage(seg.data.url, seg.data.file)
                .catch(() => {});
            }
          }
        }

        // 聊天频率控制：判断是否应该发言
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

        // 动作规划器：决定是否回复
        const botNickname = cfg.nicknames[0] || ctx.bot.nickname || "Bot";
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

        if (planResult.action === "wait" && planResult.waitMs) {
          ctx.logger.info(
            `[动作规划] 会话 ${groupSessionId} 等待 ${planResult.waitMs}ms: ${planResult.reason}`,
          );
          // 等待后再处理（不阻塞其他会话）
          processingSet.delete(groupSessionId);
          return;
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

        // 记忆检索：分析是否需要回忆
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

        // 构建系统提示词（含真人化上下文）
        const systemPrompt = buildSystemPrompt({
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
        });

        // 构建工具上下文（含错别字生成器）
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
          typoApply: (text: string) => humanize.typoGenerator.apply(text),
        };

        // 模拟打字延迟
        const typingDelay = humanize.frequencyController.getTypingDelay(
          text.length,
        );
        if (typingDelay > 0) {
          await new Promise((r) => setTimeout(r, typingDelay));
        }

        // 运行 AI
        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          systemPrompt,
          sessionManager,
          humanize,
        );

        // 记录发言
        humanize.frequencyController.recordSpeak(groupSessionId);

        // 发送表情包（如果有）
        if (result.emojiPath) {
          try {
            const emojiSegment = ctx.segment.image(
              `file://${result.emojiPath}`,
            );
            await e.reply([emojiSegment]);
          } catch (err) {
            ctx.logger.warn(`[表情包] 发送失败: ${err}`);
          }
        }

        // 更新会话时间
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
        // 检查权限
        const senderRole = e.sender?.role;
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

      // TODO检查连续对话监听器

      // 检查触发条件
      let triggered = shouldTrigger(e, text, cfg, ctx);

      // 异步检查引用 bot
      if (!triggered && isGroup) {
        triggered = await isQuotingBot(e, ctx);
      }

      if (!triggered) return;

      // 频率检查
      if (!rateLimiter.canProcess(userId, groupId, text)) return;
      rateLimiter.record(userId, groupId, text);

      await processChat(e, cfg);
    });

    // ==================== 戳一戳处理 ====================
    ctx.handle("notice.group.poke" as any, async (e: any) => {
      // 检查是否戳的是 bot
      if (e.target_id !== ctx.bot.uin) return;

      const cfg = await getConfig();
      if (!cfg.apiKey) return;

      const groupId = e.group_id;
      if (!groupId) return;

      // 群组黑白名单
      if (!isGroupAllowed(groupId, cfg)) return;

      // 戳一戳冷却
      const lastPoke = pokeCooldowns.get(groupId);
      if (lastPoke && Date.now() - lastPoke < POKE_COOLDOWN_MS) return;
      pokeCooldowns.set(groupId, Date.now());

      const groupSessionId = `group:${groupId}`;

      // 防止并发
      if (processingSet.has(groupSessionId)) return;
      processingSet.add(groupSessionId);

      try {
        // 获取/创建会话
        sessionManager.getOrCreate(groupSessionId, "group", groupId);

        // 获取群信息
        const botRole = await getBotRole(groupId, ctx);
        let groupName: string | undefined;
        let memberCount: number | undefined;

        try {
          const groupInfo = await ctx.bot.getGroupInfo(groupId);
          groupName = (groupInfo as any)?.group_name;
          memberCount = (groupInfo as any)?.member_count;
        } catch {
          // ignore
        }

        // 构造虚拟消息：告诉 AI 有人戳了它
        let pokerName = "某人";
        try {
          const pokerInfo = await ctx.bot.getGroupMemberInfo(
            groupId,
            e.user_id,
          );
          pokerName = pokerInfo.card || pokerInfo.nickname || String(e.user_id);
        } catch {
          // ignore
        }

        const pokeMsg: ChatMessage = {
          sessionId: groupSessionId,
          role: "user",
          content: `[系统提示] ${pokerName}(${e.user_id}) 戳了你一下`,
          userId: e.user_id,
          userName: pokerName,
          userRole: "member",
          groupId,
          groupName,
          timestamp: Date.now(),
        };
        db.saveMessage(pokeMsg);

        const history = db.getMessages(groupSessionId, 20);

        const systemPrompt = buildSystemPrompt({
          config: cfg,
          groupName,
          memberCount,
          botNickname: cfg.nicknames[0] || ctx.bot.nickname || "Bot",
          botRole,
          aiService: aiService!,
          isGroup: true,
        });

        // 构造一个虚拟 event 用于 reply
        const fakeEvent = {
          ...e,
          message_type: "group",
          reply: async (sendable: any) => {
            return ctx.bot.sendGroupMsg(groupId, sendable);
          },
          sender: { user_id: e.user_id, role: "member" },
        };

        const toolCtx: ToolContext = {
          ctx,
          event: fakeEvent,
          sessionId: groupSessionId,
          groupId,
          userId: e.user_id,
          config: cfg,
          aiService: aiService!,
          db,
          botRole,
          typoApply: (text: string) => humanize.typoGenerator.apply(text),
        };

        const result = await runChat(
          aiInstance,
          toolCtx,
          history,
          systemPrompt,
          sessionManager,
          humanize,
        );

        // 发送表情包（如果有）
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
      processingSet.clear();
      pokeCooldowns.clear();
      ctx.logger.info("聊天插件已卸载");
    };
  },
};

export default chatPlugin;
