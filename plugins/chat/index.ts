import type { MiokuPlugin } from "../../src";
import type { AIService } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { ConfigService } from "../../src/services/config";
import type { MiokiContext } from "mioki";
import type { ChatConfig, MessageContext } from "./types";
import type { AITool } from "../../src";

import { SessionStore } from "./session-store";
import {
  parseMessageContext,
  shouldTriggerAI,
  segmentsToMultimodal,
  getRecentGroupHistory,
} from "./message-handler";
import {
  createCommunicationTools,
  createInfoTools,
  createSkillLoaderTool,
} from "./skills-communication";
import {
  createAdminTools,
  handleKickConfirmation,
  cleanupExpiredKickConfirmations,
} from "./skills-admin";
import {
  RateLimiter,
  MessageDeduplicator,
  PokeLimiter,
  handleAbuse,
  detectInjection,
} from "./anti-abuse";
import {
  createListenerTools,
  checkOneTimeListener,
  registerContinuousListener,
  getContinuousListener,
  removeContinuousListener,
  createRelevanceCheckTool,
} from "./listeners";
import {
  generateSystemPrompt,
  formatHistoryForContext,
  estimateTokens,
  needsCompression,
  generateRelevanceCheckPrompt,
} from "./prompts";

const DEFAULT_CONFIG: ChatConfig = {
  apiUrl: "https://api.siliconflow.cn/v1  ",
  apiKey: "",
  model: "deepseek-ai/DeepSeek-V3.2",
  isMultimodal: true,
  nicknames: ["miku"],
  persona: "你是一个活泼可爱的群聊成员，喜欢和大家聊天。",
  maxContextTokens: 128,
  temperature: 0.8,
  blacklistGroups: [],
  whitelistGroups: [],
  maxSessions: 100,
  enableGroupAdmin: true,
  enableExternalSkills: true,
};

const chatPlugin: MiokuPlugin = {
  name: "chat",
  version: "1.0.0",
  description: "AI聊天插件 - 让AI像真人一样融入群聊",
  services: ["ai", "config", "help"],

  help: {
    title: "AI聊天",
    description: "智能AI聊天插件，让AI融入群聊",
    commands: [
      { cmd: "@bot 或 昵称", desc: "触发AI对话" },
      { cmd: "/chat reset", desc: "重置自己的会话" },
      { cmd: "/chat reset-group", desc: "重置群会话(管理)" },
    ],
  },

  async setup(ctx: MiokiContext) {
    ctx.logger.info("chat插件正在初始化...");

    // 获取服务
    const aiService = ctx.services?.ai as AIService | undefined;
    const configService = ctx.services?.config as ConfigService | undefined;
    const helpService = ctx.services?.help as HelpService | undefined;

    if (!aiService) {
      ctx.logger.error("AI服务未加载，chat插件无法运行");
      return;
    }

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
      if (configService) {
        const cfg = await configService.getConfig("chat", "settings");
        return { ...DEFAULT_CONFIG, ...cfg };
      }
      return DEFAULT_CONFIG;
    };

    // 初始化组件
    let config = await getConfig();
    const sessionStore = new SessionStore(config.maxSessions);
    const rateLimiter = new RateLimiter(5, 60000);
    const deduplicator = new MessageDeduplicator(5000);
    const pokeLimiter = new PokeLimiter(600000);

    // 创建AI实例
    let aiInstance = await aiService.create({
      name: "chat-ai",
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelType: config.isMultimodal ? "multimodal" : "text",
    });

    // 监听配置变化
    if (configService) {
      configService.onConfigChange("chat", "settings", async (newConfig) => {
        config = { ...DEFAULT_CONFIG, ...newConfig };
        // 重新创建AI实例
        aiService.remove("chat-ai");
        aiInstance = await aiService.create({
          name: "chat-ai",
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
          modelType: config.isMultimodal ? "multimodal" : "text",
        });
        ctx.logger.info("chat配置已更新");
      });
    }

    // 获取可用的外部Skills
    const getAvailableSkills = (): string[] => {
      if (!config.enableExternalSkills) return [];
      const allSkills = aiService.getAllSkills();
      return Array.from(allSkills.keys()).filter((name) => name !== "chat");
    };

    // 处理AI对话
    const handleAIChat = async (
      msgCtx: MessageContext,
      triggeredByListener = false,
    ) => {
      ctx.logger.info(`[Chat] ========== AI对话开始 ==========`);
      ctx.logger.info(`[Chat] 触发方式: ${triggeredByListener ? "监听器触发" : "直接触发"}`);
      ctx.logger.info(`[Chat] 用户: ${msgCtx.userCard || msgCtx.userNickname}(${msgCtx.userId})`);
      ctx.logger.info(`[Chat] 群: ${msgCtx.groupName}(${msgCtx.groupId})`);
      ctx.logger.info(`[Chat] 原始消息: ${msgCtx.rawMessage}`);
      ctx.logger.info(`[Chat] 触发条件: @=${msgCtx.isAtBot}, 引用=${msgCtx.isQuoteBot}, 昵称=${msgCtx.hasNickname}`);

      const sessionId = SessionStore.generateSessionId(
        "group",
        msgCtx.groupId!,
        msgCtx.userId,
      );
      ctx.logger.info(`[Chat] 会话ID: ${sessionId}`);

      const session = sessionStore.getOrCreateSession(
        "group",
        msgCtx.groupId!,
        msgCtx.userId,
      );
      ctx.logger.info(`[Chat] 会话消息数: ${session.messages.length}, 总token: ${session.totalTokens}`);

      // 获取bot在群里的角色和昵称
      let botRole: "owner" | "admin" | "member" = "member";
      let botNickname = "";
      try {
        const botInfo = await ctx.bot.getGroupMemberInfo(
          msgCtx.groupId!,
          ctx.bot.uin,
        );
        botRole = botInfo.role as "owner" | "admin" | "member";
        botNickname = botInfo.card || botInfo.nickname || "";
      } catch {}

      // 构建工具列表
      const tools: AITool[] = [
        ...createCommunicationTools(ctx, msgCtx.groupId),
        ...createInfoTools(ctx, msgCtx.groupId, msgCtx.userId),
        ...createListenerTools(ctx, sessionStore, sessionId),
      ];

      // 添加群管工具（如果有权限）
      if (config.enableGroupAdmin && msgCtx.groupId) {
        const adminTools = createAdminTools(
          ctx,
          msgCtx.groupId,
          botRole,
          msgCtx.userId,
          msgCtx.userRole,
        );
        tools.push(...adminTools);
      }

      // 添加Skill加载工具
      const loadSkill = (name: string) => aiService.getSkill(name);

      tools.push(createSkillLoaderTool(getAvailableSkills, loadSkill));
      ctx.logger.info(`[Chat] 可用工具: ${tools.map(t => t.name).join(", ")}`);
      ctx.logger.info(`[Chat] 可用外部Skills: ${getAvailableSkills().join(", ") || "无"}`);

      // 准备消息内容
      const userContent = await segmentsToMultimodal(
        msgCtx.segments,
        config.isMultimodal,
      );

      // 添加用户消息到会话
      sessionStore.addMessage(sessionId, {
        role: "user",
        content: userContent,
        senderId: msgCtx.userId,
        senderName: msgCtx.userCard || msgCtx.userNickname,
        senderRole: msgCtx.userRole,
        groupId: msgCtx.groupId,
        groupName: msgCtx.groupName,
        timestamp: msgCtx.timestamp,
        tokenCount: estimateTokens(
          typeof userContent === "string"
            ? userContent
            : JSON.stringify(userContent),
        ),
      });

      // 检查是否需要压缩
      if (needsCompression(session.totalTokens, config.maxContextTokens)) {
        // TODO: 实现上下文压缩
        ctx.logger.info(`会话 ${sessionId} 需要压缩上下文`);
      }

      // 构建消息历史
      const historyMessages = formatHistoryForContext(
        session.messages,
        config.maxContextTokens,
      );

      // 生成系统提示词
      const systemPrompt = generateSystemPrompt(
        config,
        msgCtx,
        getAvailableSkills(),
        tools.some((t) => t.name === "ban_member"),
        ctx.bot.uin,
        botNickname,
      );
      ctx.logger.info(`[Chat] 系统提示词长度: ${systemPrompt.length} 字符`);
      ctx.logger.info(`[Chat] 系统提示词:\n${systemPrompt}`);

      // 获取最近群聊历史作为额外上下文
      const recentHistory = await getRecentGroupHistory(
        ctx,
        msgCtx.groupId!,
        20,
      );
      const historyContext =
        recentHistory.length > 0
          ? `\n\n最近的群聊记录（包含messageId可用于引用）：\n${recentHistory.map((h) => `[${h.time}] [msgId:${h.messageId}] ${h.sender}(${h.senderId}): ${h.content}`).join("\n")}`
          : "";
      ctx.logger.info(`[Chat] 历史消息数: ${historyMessages.length}`);
      ctx.logger.info(`[Chat] 最近群聊记录数: ${recentHistory.length}`);
      if (historyContext) {
        ctx.logger.info(`[Chat] 群聊上下文: ${historyContext}`);
      }
      ctx.logger.info(`[Chat] 历史消息内容:`);
      for (const msg of historyMessages) {
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        ctx.logger.info(`[Chat]   [${msg.role}] ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`);
      }

      try {
        ctx.logger.info(`[Chat] 开始调用AI...`);
        ctx.logger.info(`[Chat] 模型: ${config.model}, 温度: ${config.temperature}`);

        // 调用AI
        const result = await aiInstance.generateWithTools({
          prompt: systemPrompt + historyContext,
          messages: historyMessages as any,
          model: config.model,
          temperature: config.temperature,
          maxIterations: 10,
          tools,
        });

        ctx.logger.info(`[Chat] AI响应完成`);
        ctx.logger.info(`[Chat] 迭代次数: ${result.iterations}`);
        ctx.logger.info(`[Chat] 工具调用数: ${result.allToolCalls.length}`);
        if (result.allToolCalls.length > 0) {
          ctx.logger.info(`[Chat] 工具调用详情:`);
          for (const call of result.allToolCalls) {
            ctx.logger.info(`[Chat]   ${call.name}: args=${JSON.stringify(call.arguments)}, returnToAI=${call.returnedToAI}`);
            ctx.logger.info(`[Chat]   结果: ${JSON.stringify(call.result).slice(0, 200)}`);
          }
        }
        ctx.logger.info(`[Chat] AI回复内容: ${result.content || "(无文本回复)"}`);
        ctx.logger.info(`[Chat] ========== AI对话结束 ==========`);

        // 保存AI回复到会话
        if (result.content) {
          sessionStore.addMessage(sessionId, {
            role: "assistant",
            content: result.content,
            timestamp: Date.now(),
            tokenCount: estimateTokens(result.content),
          });

          // 注册连续会话监听器
          registerContinuousListener(sessionId, result.content, 30000);
        }
      } catch (error) {
        ctx.logger.error(`[Chat] AI对话失败: ${error}`);
        ctx.logger.info(`[Chat] ========== AI对话异常结束 ==========`);
      }
    };

    // 检查连续会话相关性
    const checkContinuousRelevance = async (
      msgCtx: MessageContext,
      listener: { lastAssistantMessage: string },
    ): Promise<boolean> => {
      try {
        const prompt = generateRelevanceCheckPrompt(
          listener.lastAssistantMessage,
          msgCtx.rawMessage,
        );
        const result = await aiInstance.generateWithTools({
          prompt,
          messages: [],
          model: config.model,
          temperature: 0.3,
          maxIterations: 1,
          tools: [createRelevanceCheckTool()],
        });

        // 检查工具调用结果
        const relevanceCall = result.allToolCalls.find(
          (c) => c.name === "check_relevance",
        );
        return relevanceCall?.result?.isRelevant ?? false;
      } catch {
        return false;
      }
    };

    // 消息处理
    ctx.handle("message", async (e: any) => {
      const msgCtx = await parseMessageContext(ctx, e, config);
      if (!msgCtx || !msgCtx.groupId) return;

      // 检查黑白名单
      if (config.whitelistGroups.length > 0) {
        if (!config.whitelistGroups.includes(msgCtx.groupId)) return;
      } else if (config.blacklistGroups.includes(msgCtx.groupId)) {
        return;
      }

      // 检查踢人确认
      if (msgCtx.rawMessage.includes("确认踢出")) {
        const result = handleKickConfirmation(
          ctx,
          msgCtx.groupId,
          msgCtx.userId,
          msgCtx.userRole,
        );
        if (result.found) {
          await e.reply(result.message);
          return;
        }
      }

      // 处理命令
      const text = ctx.text(e);
      if (text === "/chat reset") {
        const sessionId = SessionStore.generateSessionId(
          "group",
          msgCtx.groupId,
          msgCtx.userId,
        );
        sessionStore.resetSession(sessionId);
        await e.reply("已重置你的会话");
        return;
      }
      if (text === "/chat reset-group") {
        if (
          msgCtx.userRole === "owner" ||
          msgCtx.userRole === "admin" ||
          ctx.isOwner(msgCtx.userId)
        ) {
          const sessionId = SessionStore.generateSessionId(
            "group",
            msgCtx.groupId,
          );
          sessionStore.resetSession(sessionId);
          await e.reply("已重置群会话");
        } else {
          await e.reply("只有管理员可以重置群会话");
        }
        return;
      }

      // 检查辱骂
      if (await handleAbuse(ctx, msgCtx)) return;

      // 检查提示词注入
      if (detectInjection(msgCtx.rawMessage)) {
        // 不直接拒绝，让AI自己处理
      }

      // 检查一次性监听器
      const sessionId = SessionStore.generateSessionId(
        "group",
        msgCtx.groupId,
        msgCtx.userId,
      );
      const listenerCheck = checkOneTimeListener(
        sessionStore,
        sessionId,
        msgCtx.userId,
      );
      if (listenerCheck.triggered) {
        await handleAIChat(msgCtx, true);
        return;
      }

      // 检查连续会话监听器
      const continuousListener = getContinuousListener(sessionId);
      if (continuousListener) {
        removeContinuousListener(sessionId);
        const isRelevant = await checkContinuousRelevance(
          msgCtx,
          continuousListener,
        );
        if (isRelevant) {
          await handleAIChat(msgCtx, true);
          return;
        }
      }

      // 检查是否应该触发AI
      if (!shouldTriggerAI(msgCtx)) return;

      // 限流检查
      if (rateLimiter.isRateLimited(msgCtx.userId)) {
        return;
      }

      // 去重检查
      if (deduplicator.isDuplicate(msgCtx.userId, msgCtx.rawMessage)) {
        return;
      }

      rateLimiter.recordRequest(msgCtx.userId);
      await handleAIChat(msgCtx);
    });

    // 戳一戳处理
    ctx.handle("notice.group.poke" as any, async (e: any) => {
      if (e.target_id !== ctx.bot.uin) return;
      const groupId = e.group_id;
      const userId = e.user_id;

      if (!groupId) return;

      // 检查黑白名单
      if (config.whitelistGroups.length > 0) {
        if (!config.whitelistGroups.includes(groupId)) return;
      } else if (config.blacklistGroups.includes(groupId)) {
        return;
      }

      // 戳一戳限流
      if (!pokeLimiter.canTrigger(groupId, userId)) return;
      pokeLimiter.record(groupId, userId);

      // 获取用户信息
      let userNickname = "";
      let userRole: "owner" | "admin" | "member" = "member";
      try {
        const memberInfo = await ctx.bot.getGroupMemberInfo(groupId, userId);
        userNickname = memberInfo.card || memberInfo.nickname || String(userId);
        userRole = memberInfo.role as "owner" | "admin" | "member";
      } catch {}

      // 构造消息上下文
      const msgCtx: MessageContext = {
        messageId: "",
        groupId,
        groupName: "",
        groupMemberCount: 0,
        userId,
        userNickname,
        userRole,
        isAtBot: false,
        isQuoteBot: false,
        hasNickname: false,
        timestamp: Date.now(),
        rawMessage: `[戳一戳] ${userNickname} 戳了你一下`,
        segments: [
          { type: "text", data: { text: `${userNickname} 戳了你一下` } },
        ],
      };

      await handleAIChat(msgCtx);
    });

    // 定时清理
    const cleanupInterval = setInterval(() => {
      sessionStore.cleanupExpiredListeners();
      cleanupExpiredKickConfirmations();
      rateLimiter.cleanup();
      deduplicator.cleanup();
    }, 60000);

    ctx.clears.add(() => clearInterval(cleanupInterval));

    ctx.logger.info("chat插件加载成功");

    return () => {
      sessionStore.close();
      aiService.remove("chat-ai");
      ctx.logger.info("chat插件已卸载");
    };
  },
};

export default chatPlugin;
