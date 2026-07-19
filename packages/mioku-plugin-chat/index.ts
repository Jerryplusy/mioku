import { definePlugin } from "mioki";
import type { MiokiContext } from "mioki";
import type { AIInstance, AIService, ConfigService, ScreenshotService } from "mioku";
import { getPluginRuntimeState } from "mioku";
import type { ChatConfig, ChatMessage, ChatGroupsFile, TargetMessage } from "./types";
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
import { SessionTurnScheduler } from "./manage/session-turn-scheduler";
import { ChatDatabaseCleanup, DEFAULT_CLEANUP_CONFIG } from "./manage/cleanup";
import {
  GroupStructuredHistoryManager,
  buildStructuredUserMessages,
  buildStructuredUserInputFromTarget,
} from "./manage/group-structured-history";
import { BASE_CONFIG } from "./configs/base";
import { SETTINGS_CONFIG } from "./configs/settings";
import { PERSONALIZATION_CONFIG } from "./configs/personalization";
import { DEFAULT_GROUPS_CONFIG } from "./configs/groups";
import { RateLimitGuard } from "./manage/rate-limit-guard";
import { createChatRuntime } from "./runtime/chat-runtime";
import { createMessageHandler } from "./handlers/message";
import { createPokeHandler } from "./handlers/poke";
import { buildHistoryMediaOptions } from "./core/media/segment";
import type { ChatConfigProvider } from "./humanize";
import type { ChatPluginContext, ChatHandlerState } from "./context";
import { mergeGroupOverrides } from "./utils/group-config";
import {
  mergeChatConfig,
  normalizeIdList,
  normalizeMediaAnalysisBlacklist,
} from "./utils/config";

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
      await configService.registerConfig("chat", "groups", DEFAULT_GROUPS_CONFIG);
    }

    let cachedBaseConfig: ChatConfig | null = null;
    let cachedGroupsConfig: ChatGroupsFile | null = null;

    const buildGlobalConfig = async (): Promise<ChatConfig> => {
      if (!configService) {
        return mergeChatConfig(
          mergeChatConfig(
            mergeChatConfig({} as ChatConfig, BASE_CONFIG),
            SETTINGS_CONFIG,
          ),
          PERSONALIZATION_CONFIG,
        );
      }
      const base = (await configService.getConfig("chat", "base")) ?? {};
      const settings = (await configService.getConfig("chat", "settings")) ?? {};
      const personalization =
        (await configService.getConfig("chat", "personalization")) ?? {};
      const mergedDefaults = mergeChatConfig(
        mergeChatConfig(
          mergeChatConfig({} as ChatConfig, BASE_CONFIG),
          SETTINGS_CONFIG,
        ),
        PERSONALIZATION_CONFIG,
      );
      const merged = mergeChatConfig(
        mergeChatConfig(
          mergeChatConfig(mergedDefaults, settings),
          personalization,
        ),
        base,
      ) as ChatConfig;

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
      merged.mediaAnalysisBlacklistUsers =
        normalizeMediaAnalysisBlacklist(merged as Record<string, any>);
      delete (merged as any).imageAnalysisBlacklistUsers;
      return merged;
    };

    const refreshGroupsCache = async (): Promise<void> => {
      if (!configService) {
        cachedGroupsConfig = DEFAULT_GROUPS_CONFIG;
        return;
      }
      const raw = await configService.getConfig("chat", "groups");
      cachedGroupsConfig =
        raw && typeof raw === "object" && raw.groups && typeof raw.groups === "object"
          ? (raw as ChatGroupsFile)
          : DEFAULT_GROUPS_CONFIG;
    };

    const refreshBaseCache = async (): Promise<void> => {
      cachedBaseConfig = await buildGlobalConfig();
    };

    await refreshBaseCache();
    await refreshGroupsCache();

    if (configService) {
      configService.onConfigChange("chat", "base", () => {
        refreshBaseCache().catch((err) =>
          ctx.logger.error(`刷新 chat/base 缓存失败: ${err}`),
        );
      });
      configService.onConfigChange("chat", "settings", () => {
        refreshBaseCache().catch((err) =>
          ctx.logger.error(`刷新 chat/settings 缓存失败: ${err}`),
        );
      });
      configService.onConfigChange("chat", "personalization", () => {
        refreshBaseCache().catch((err) =>
          ctx.logger.error(`刷新 chat/personalization 缓存失败: ${err}`),
        );
      });
      configService.onConfigChange("chat", "groups", () => {
        refreshGroupsCache().catch((err) =>
          ctx.logger.error(`刷新 chat/groups 缓存失败: ${err}`),
        );
      });
    }

    const configProvider: ChatConfigProvider = (groupId?: number) => {
      const base = cachedBaseConfig;
      if (!base) return PERSONALIZATION_CONFIG as unknown as ChatConfig;
      if (groupId === undefined) return base;
      const overrides = cachedGroupsConfig?.groups?.[String(groupId)];
      return mergeGroupOverrides(base, overrides);
    };

    const getConfig = async (groupId?: number): Promise<ChatConfig> => {
      if (!cachedBaseConfig) await refreshBaseCache();
      return configProvider(groupId);
    };

    const defaultConfig = configProvider();
    const config = defaultConfig;

    if (!config.apiKey) {
      ctx.logger.warn("聊天插件未配置 API Key，请在 config/chat/base.json 中配置");
      return;
    }

    const db = await initDatabase();
    const sessionManager = new SessionManager(db, config.maxSessions);
    const queueManager = new MessageQueueManager();
    const rateLimiter = new RateLimiter({
      maxTriggersPerWindow: 5,
      windowMs: 60_000,
      dedupWindowMs: 30_000,
      groupCooldownMs: 1_000,
    });
    rateLimiter.setConfigProvider(configProvider);
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

    const registerPersona = (persona: string) => {
      mainAIInstance.registerPrompt("persona", persona);
      workAIInstance.registerPrompt("persona", persona);
    };
    registerPersona(String(config.persona ?? ""));
    if (configService) {
      configService.onConfigChange("chat", "personalization", async () => {
        try {
          const p = await configService.getConfig("chat", "personalization");
          registerPersona(String(p?.persona ?? ""));
        } catch (err) {
          ctx.logger.error(`更新 persona 提示词失败: ${err}`);
        }
      });
    }

    const humanize = new HumanizeEngine(mainAIInstance, workAIInstance, db, configProvider);
    await humanize.init();

    const pokeCooldowns = new Map<number, number>();
    const processingSet = new Set<string>();
    const sessionTurnScheduler = new SessionTurnScheduler();
    const groupStructuredHistory = new GroupStructuredHistoryManager();
    const rateLimitGuard = new RateLimitGuard(rateLimiter, ctx.logger);
    const runWithRateLimitGuard = rateLimitGuard.run.bind(rateLimitGuard);

    const pluginCtx = {
      ctx, defaultConfig, configProvider, getConfig,
      db,
      aiInstance: mainAIInstance, workAIInstance, visionAIInstance,
      aiService, humanize,
      sessionManager, skillManager, rateLimiter, queueManager,
      groupStructuredHistory,
      cooldownManager: undefined as unknown as CooldownManager,
      idleCheckManager: undefined as unknown as IdleCheckManager,
      queueProcessor: undefined as unknown as QueueProcessor,
      sessionTurnScheduler,
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
          const ttlMs = configProvider(userMsg.groupId).groupStructuredHistoryTtlMs;
          groupStructuredHistory.append(
            groupSessionId,
            buildStructuredUserMessages([
              buildStructuredUserInputFromTarget(userMsg as unknown as TargetMessage),
            ]),
            ttlMs,
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
      idleCheckManager.dispose();
      cooldownManager.dispose();
      queueProcessor.dispose();
      sessionTurnScheduler.dispose();
      queueManager.dispose();
      clearInterval(cleanupInterval);
      dbCleanup.stop();
      rateLimiter.dispose();
      processingSet.clear();
      pokeCooldowns.clear();
      db.close();
      ctx.logger.info("聊天插件已卸载");
    };
  },
});