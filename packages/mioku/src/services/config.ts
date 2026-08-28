import * as fs from "fs/promises";
import * as path from "path";
import { existsSync, mkdirSync } from "fs";
import { rootLogger as logger } from "../logger";

const SERVICE_CONFIG_ROOT = "service";

function resolveConfigDir(serviceName: string): string {
  return path.join(process.cwd(), "config", SERVICE_CONFIG_ROOT, serviceName);
}

function resolveConfigPath(serviceName: string, configName: string): string {
  return path.join(resolveConfigDir(serviceName), `${configName}.json`);
}

function ensureDir(serviceName: string): void {
  const dir = resolveConfigDir(serviceName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export async function registerServiceConfig(
  serviceName: string,
  configName: string,
  defaults: Record<string, unknown>,
): Promise<void> {
  ensureDir(serviceName);
  const configPath = resolveConfigPath(serviceName, configName);
  if (!existsSync(configPath)) {
    await fs.writeFile(configPath, JSON.stringify(defaults, null, 2), "utf-8");
  }
}

export async function getServiceConfig(
  serviceName: string,
  configName: string,
): Promise<Record<string, unknown>> {
  const configPath = resolveConfigPath(serviceName, configName);
  try {
    return JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch (error) {
    if (!existsSync(configPath)) return {};
    logger.warn(`[service-config] 读取 ${serviceName}/${configName} 失败: ${error}`);
    return {};
  }
}

export async function updateServiceConfig(
  serviceName: string,
  configName: string,
  value: Record<string, unknown>,
): Promise<void> {
  ensureDir(serviceName);
  await fs.writeFile(
    resolveConfigPath(serviceName, configName),
    JSON.stringify(value, null, 2),
    "utf-8",
  );
}

export async function getServiceConfigs(
  serviceName: string,
): Promise<Record<string, Record<string, unknown>>> {
  const dir = resolveConfigDir(serviceName);
  if (!existsSync(dir)) return {};

  const result: Record<string, Record<string, unknown>> = {};
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
  for (const file of files) {
    try {
      result[path.basename(file, ".json")] = JSON.parse(
        await fs.readFile(path.join(dir, file), "utf-8"),
      );
    } catch (error) {
      logger.warn(`[service-config] 读取 ${serviceName}/${file} 失败: ${error}`);
    }
  }
  return result;
}

export async function deleteServiceConfig(
  serviceName: string,
  configName: string,
): Promise<boolean> {
  const configPath = resolveConfigPath(serviceName, configName);
  if (!existsSync(configPath)) return false;
  await fs.unlink(configPath);
  return true;
}
