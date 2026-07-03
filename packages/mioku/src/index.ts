import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { bootstrapMioku } from "./core/bootstrap";
import { setMiokuLogger } from "./core/logger";

export type { MiokiPlugin, MiokiContext } from "mioki";

export function definePlugin<T extends import("mioki").MiokiPlugin>(plugin: T): T {
  return plugin;
}

export { default as pluginManager } from "./core/plugin-manager";
export { default as serviceManager } from "./core/service-manager";
export { registerPluginArtifacts } from "./core/plugin-artifact-registry";

export {
  registerServiceConfig,
  getServiceConfig,
  updateServiceConfig,
  getServiceConfigs,
  deleteServiceConfig,
} from "./core/service-config";

export type {
  MiokuService,
  MiokuRuntimeConfig,
  PackageJsonLike,
  PluginMetadata,
  ServiceMetadata,
  PluginPackageConfig,
  PluginHelp,
  CommandRole,
  AccessHook,
  AccessAction,
  AccessRuleEntry,
  AccessScopeConfig,
  AccessControlConfig,
  ConfigService,
  ScreenshotService,
  HelpService,
  WebUIService,
  AITool,
  AISkill,
  AIInstance,
  AIService,
  ChatRuntime,
  TextMessage,
  MultimodalMessage,
  ToolCallRecord,
  CompleteOptions,
  CompleteResponse,
  SessionToolDefinition,
  SkillPermissionRole,
  MultimodalContentItem,
  ToolResultFollowup,
  ChatRuntimePromptInjection,
  ChatRuntimeGroupTarget,
  ChatRuntimePrivateTarget,
  ChatRuntimeSource,
  ChatRuntimeBaseOptions,
  ChatRuntimeNoticeOptions,
  ChatRuntimeInformationRequestOptions,
  ChatRuntimeCollectedInfo,
  ChatRuntimeResult,
  AIUsageRange,
  AIUsageScope,
  AIUsageBotOption,
  AIUsageContext,
  AIUsageBreakdown,
  AIUsageFinalization,
  AIUsageSummary,
} from "./types";

export { TOOL_RESULT_FOLLOWUP_KEY } from "./types";

export interface MiokuStartOptions {
  cwd?: string;
}

export async function start(options: MiokuStartOptions = {}): Promise<void> {
  const { cwd = process.cwd() } = options;
  if (cwd) process.chdir(cwd);

  const { start: startMioki, logger, botConfig } = await import("mioki");
  setMiokuLogger(logger);

  logger.info("こんにちは..");
  logger.info("---------------------------------------");
  logger.info("----------  Mioku 正在启动 ------------");
  logger.info("---------------------------------------");

  await bootstrapMioku({ cwd, botConfig, startMioki });
}

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const version: string = readVersion();

export {
  getDataDir,
  getPluginDataDir,
  getServiceDataDir,
  getConfigDir,
  getPluginConfigDir,
  getServiceConfigDir,
  ensureDataDir,
} from "./core/data-paths";

export {
  getPluginRuntimeState,
  setPluginRuntimeState,
  resetPluginRuntimeState,
} from "./core/plugin-runtime-state";
