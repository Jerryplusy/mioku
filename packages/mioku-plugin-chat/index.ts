import { definePlugin } from "mioki";
import type { MiokiContext } from "mioki";
import type { AIInstance, AIService, ConfigService, ScreenshotService } from "mioku";
import { getPluginRuntimeState } from "mioku";
import type { ChatConfig, ChatMessage, TargetMessage } from "./types";
import { initDatabase } from "./db";
import { SessionManager } from "./manage/session";
import { RateLimiter } from "./manage/rate-limiter";
import { runChat } from "./core/chat-engine";
import { HumanizeEngine } from "./humanize";
import { SkillSessionManager } from "./manage/skill-session";
import { MessageQueueManager } from "./utils/queue";
import {
  buildToolContext,
  getGroupHistoryMessages,
  getGroupInfoData,
  getHumanizeContexts,
  sendAIResponse,
  sendMessage,
  saveBotMessages,
  sendEmoji,
} from "./core/base";
import { CooldownManager } from "./manage/cooldown";
import { IdleCheckManager } from "./manage/idle-check";
import { QueueProcessor } from "./manage/queue-processor";
import { ChatDatabaseCleanup, DEFAULT_CLEANUP_CONFIG } from "./manage/cleanup";
import {
  GroupStructuredHistoryManager,
  buildStructuredUserMessages,
  buildStructuredUserInputFromTarget,
} from "./manage/group-structured-history";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";
import { RateLimitGuard } from "./manage/rate-limit-guard";
import { createChatRuntime } from "./runtime/chat-runtime";
import { createMessageHandler } from "./handlers/message";
import { createPokeHandler } from "./handlers/poke";
import { buildHistoryMediaOptions } from "./core/media/segment";
import type { ChatPluginContext, ChatHandlerState } from "./context";

function normalizeIdList(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => Math.floor(Number(item)))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
}

export default definePlugin({
  name: "chat",
  version: "1.0.0",
  description: "AI 智能聊天插件",
  async setup(ctx: MiokiContext) {
    ctx.logger.info("聊天插件正在初始化...");

    const aiService = ctx.services?.ai as AIService | undefined;
    const configService = ctx.services?.config as ConfigService | undefined;
    const screenshotService = ctx.services?.screenshot as ScreenshotService | undefined;
    let warnedMarkdownScreenshotUnavailable = false;

    if (configService) {
      await configService.registerConfig("chat", "base", BASE_CONFIG);
      await configService.registerConfig("chat", "settings", SETTINGS_CONFIG);
      await configService.registerConfig("chat", "personalization", PERSONALIZATION_CONFIG);
    }

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
      const personalization = await configService.getConfig("chat", "personalization");
      const merged = {
        ...BASE_CONFIG,
        ...SETTINGS_CONFIG,
        ...PERSONALIZATION_CONFIG,
        ...base,
        ...settings,
        ...personalization,
      } as any;

      if (typeof merged.stream !== "boolean") merged.stream = true;
      if (typeof merged.enableMarkdownScreenshot !== "boolean") {
        merged.enableMarkdownScreenshot = true;
      }
      if (!screenshotService && merged.enableMarkdownScreenshot) {
        merged.enableMarkdownScreenshot = false;
        if (!warnedMarkdownScreenshotUnavailable) {
          ctx.logger.warn("聊天插件未加载 screenshot 服务，Markdown 截图渲染已自动关闭");
          warnedMarkdownScreenshotUnavailable = true;
        }
      }
      merged.whitelistGroups = normalizeIdList(merged.whitelistGroups);
      merged.blacklistGroups = normalizeIdList(merged.blacklistGroups);
      merged.mediaAnalysisBlacklistUsers = normalizeIdList(
        merged.mediaAnalysisBlacklistUsers ?? merged.imageAnalysisBlacklistUsers,
      );
      delete merged.imageAnalysisBlacklistUsers;
      return merged as ChatConfig;
    };

    const config = await getConfig();

    if (!config.apiKey) {
      ctx.logger.warn("聊天插件未配置 API Key，请在 config/chat/base.json 中配置");
      return;
    }

    const db = await initDatabase();
    const sessionManager = new SessionManager(db, config.maxSessions);
    const queueManager = new MessageQueueManager();
    const rateLimiter = new RateLimiter({
      dynamicDelay: config.dynamicDelay,
      aiRequestLimits: config.aiRequestLimits,
    });
    const skillManager = new SkillSessionManager();

    rateLimiter.setQueueLengthGetter((groupId: number) =>
      queueManager.getQueueLength(`group:${groupId}`),
    );

    if (!aiService) {
      ctx.logger.error("聊天插件需要 AI 服务，但 AI 服务不可用");
      return;
    }

    const mainAIInstance = await aiService.create({
      name: "main",
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelType: config.isMultimodal ? "multimodal" : "text",
      model: config.model,
    });
    const workAIInstance = await aiService.create({
      name: "work",
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelType: "text",
      model: config.workingModel,
    });
    const visionAIInstance = await aiService.create({
      name: "vision",
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelType: "multimodal",
      model: config.multimodalWorkingModel,
    });
    aiService.setDefault("main");

    const humanize = new HumanizeEngine(mainAIInstance, workAIInstance, config, db);
    await humanize.init();

    const pokeCooldowns = new Map<number, number>();
    const processingSet = new Set<string>();
    const groupStructuredHistory = new GroupStructuredHistoryManager();
    const rateLimitGuard = new RateLimitGuard(rateLimiter, ctx.logger);
    const runWithRateLimitGuard = rateLimitGuard.run.bind(rateLimitGuard);

    const pluginCtx = {
      ctx, config, db,
      aiInstance: mainAIInstance, workAIInstance, visionAIInstance,
      aiService, humanize,
      sessionManager, skillManager, rateLimiter, queueManager,
      groupStructuredHistory,
      cooldownManager: undefined as unknown as CooldownManager,
      idleCheckManager: undefined as unknown as IdleCheckManager,
      queueProcessor: undefined as unknown as QueueProcessor,
      runWithRateLimitGuard,
      buildHistoryMediaOptions,
      getGroupHistoryMessages, getGroupInfoData, getHumanizeContexts,
      sendAIResponse, sendMessage, saveBotMessages, sendEmoji,
      buildToolContext,
      buildStructuredUserInputFromTarget,
      runChat,
      startCooldownTimer: (
        groupSessionId: string,
        groupId: number,
        selfId: number,
      ) => cooldownManager.startCooldownTimer(groupSessionId, groupId, selfId),
      async recordGroupMessageForLearning(userMsg: ChatMessage, groupSessionId: string) {
        db.saveMessage(userMsg);
        await Promise.all([
          humanize.expressionLearner.onMessage(userMsg),
          humanize.topicTracker.onMessage(groupSessionId),
        ]);
        if (userMsg.groupId) {
          groupStructuredHistory.append(
            groupSessionId,
            buildStructuredUserMessages([
              buildStructuredUserInputFromTarget(userMsg as unknown as TargetMessage),
            ]),
            config.groupStructuredHistoryTtlMs,
          );
        }
      },
    } as ChatPluginContext;

    const idleCheckManager = new IdleCheckManager(pluginCtx);
    pluginCtx.idleCheckManager = idleCheckManager;
    const cooldownManager = new CooldownManager(pluginCtx);
    pluginCtx.cooldownManager = cooldownManager;
    const queueProcessor = new QueueProcessor(pluginCtx);
    pluginCtx.queueProcessor = queueProcessor;

    const cleanupInterval = setInterval(() => skillManager.cleanup(), 10 * 60_000);
    const dbCleanup = new ChatDatabaseCleanup(db, config.retention ?? DEFAULT_CLEANUP_CONFIG);
    dbCleanup.start();
    idleCheckManager.start();

    const handlerState: ChatHandlerState = {
      getConfig,
      runtimeState: {
        isRateLimitBlocked: () => rateLimitGuard.isBlocked(),
        processingSet,
      },
      matchMessageCommands: (
        getPluginRuntimeState("boot") as
          | { matchMessageCommands?: (text: string) => Array<{ plugin: string; command: string }> }
          | undefined
      )?.matchMessageCommands,
      pokeCooldowns,
    };

    const runtime = createChatRuntime(pluginCtx, getConfig);
    aiService.registerChatRuntime(runtime);

    ctx.handle("message", createMessageHandler(pluginCtx, handlerState));
    ctx.handle("notice.group.poke" as any, createPokeHandler(pluginCtx, handlerState));

    ctx.logger.info("聊天插件加载成功");

    return () => {
      db.close();
      rateLimiter.dispose();
      clearInterval(cleanupInterval);
      dbCleanup.stop();
      cooldownManager.dispose();
      idleCheckManager.dispose();
      queueProcessor.dispose();
      processingSet.clear();
      pokeCooldowns.clear();
      ctx.logger.info("聊天插件已卸载");
    };
  },
});
