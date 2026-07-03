import * as fs from "fs/promises";
import * as path from "path";
import { existsSync, mkdirSync } from "fs";
import type { MiokuRuntimeConfig } from "../types";
import pluginManager from "./plugin-manager";
import serviceManager from "./service-manager";
import {
  prepareRuntimePluginLinks,
  DEFAULT_RUNTIME_PLUGINS_DIR,
} from "./plugin-linker";
import { logger } from "./logger";

interface BotConfigLike {
  plugins: string[];
  plugins_dir?: string;
}

export interface BootstrapDeps {
  cwd: string;
  botConfig: BotConfigLike;
  startMioki: (opts: { cwd: string }) => Promise<void>;
}

export async function readMiokuConfig(): Promise<MiokuRuntimeConfig> {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  try {
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    return (pkg.mioki ?? {}) as MiokuRuntimeConfig;
  } catch {
    return {};
  }
}

function ensureRuntimeDirectories(): void {
  for (const dir of ["data", "config", "temp"]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

async function discoverAndLinkPlugins(
  miokuConfig: MiokuRuntimeConfig,
): Promise<string[]> {
  logger.info("O.o Miku 正在翻找插件..");
  const discovered = await pluginManager.discoverPlugins(miokuConfig);
  logger.info(
    `O.o 共发现 ${discovered.length} 个插件: ${discovered.map((p) => p.name).join(", ")}`,
  );
  const runtimePluginsDir = path.resolve(
    process.cwd(),
    DEFAULT_RUNTIME_PLUGINS_DIR,
  );
  return prepareRuntimePluginLinks(discovered, runtimePluginsDir);
}

async function discoverAndValidateServices(
  miokuConfig: MiokuRuntimeConfig,
): Promise<void> {
  logger.info("o.O Miku 正在翻找服务..");
  await serviceManager.discoverServices(miokuConfig);
  const requiredServices = pluginManager.collectRequiredServices();
  const missing = await serviceManager.checkMissingServices(requiredServices);
  if (missing.length > 0) logger.warn(`发现缺失服务: ${missing.join(", ")}`);
}

function applyPluginAllowlist(
  miokuConfig: MiokuRuntimeConfig,
  botConfig: BotConfigLike,
  linkedPluginNames: string[],
): void {
  botConfig.plugins_dir = DEFAULT_RUNTIME_PLUGINS_DIR;
  // Respect an explicit plugins list; only auto-load when undefined.
  if (miokuConfig.plugins !== undefined) return;
  for (const name of linkedPluginNames) {
    if (!botConfig.plugins.includes(name)) botConfig.plugins.push(name);
  }
}

export async function bootstrapMioku(deps: BootstrapDeps): Promise<void> {
  const { cwd, botConfig, startMioki } = deps;
  const miokuConfig = await readMiokuConfig();
  ensureRuntimeDirectories();
  const linkedPluginNames = await discoverAndLinkPlugins(miokuConfig);
  await discoverAndValidateServices(miokuConfig);
  applyPluginAllowlist(miokuConfig, botConfig, linkedPluginNames);
  await startMioki({ cwd });
}
