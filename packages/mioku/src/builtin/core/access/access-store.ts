import * as fs from "fs";
import * as path from "path";
import { rootLogger as logger } from "../../../logger";
import type { AccessControlConfig } from "../../../types";
import {
  ACCESS_DEFAULT_CONFIG,
  normalizeAccessConfig,
} from "./access-config";

const ACCESS_CONFIG_PATH = path.resolve(
  process.cwd(),
  "config/core/access-control.json",
);

const BOOT_ACCESS_CONFIG_PATH = path.resolve(
  process.cwd(),
  "config/boot/access-control.json",
);

const LEGACY_ACCESS_CONFIG_PATH = path.resolve(
  process.cwd(),
  "config/access-control/base.json",
);

interface LegacyMessageFilter {
  user?: { whitelist?: Array<string | number>; blacklist?: Array<string | number> };
  group?: { whitelist?: Array<string | number>; blacklist?: Array<string | number> };
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function copyFromLegacyLocation(): boolean {
  if (fs.existsSync(ACCESS_CONFIG_PATH)) return false;
  const legacy = readJsonSafe<AccessControlConfig>(BOOT_ACCESS_CONFIG_PATH)
    ?? readJsonSafe<AccessControlConfig>(LEGACY_ACCESS_CONFIG_PATH);
  if (!legacy) return false;
  writeJsonSafe(ACCESS_CONFIG_PATH, normalizeAccessConfig(legacy));
  logger.info(
    `已从旧位置迁移 access-control 配置到 ${path.relative(process.cwd(), ACCESS_CONFIG_PATH)}`,
  );
  return true;
}

function migrateFromBootMessageFilter(): AccessControlConfig | null {
  if (fs.existsSync(ACCESS_CONFIG_PATH)) return null;

  const bootConfigPath = path.resolve(process.cwd(), "config/boot/base.json");
  const bootConfig = readJsonSafe<{ messageFilter?: LegacyMessageFilter }>(
    bootConfigPath,
  );
  if (!bootConfig?.messageFilter) return null;

  writeJsonSafe(ACCESS_CONFIG_PATH, ACCESS_DEFAULT_CONFIG);
  logger.info("已从旧 boot.messageFilter 迁移到 config/core/access-control.json");

  const stripped = { ...bootConfig };
  delete (stripped as any).messageFilter;
  writeJsonSafe(bootConfigPath, stripped);
  logger.info("已从 config/boot/base.json 中移除 messageFilter 字段");

  return ACCESS_DEFAULT_CONFIG;
}

export function ensureAccessControlConfig(): AccessControlConfig {
  copyFromLegacyLocation();

  const existing = readJsonSafe<AccessControlConfig>(ACCESS_CONFIG_PATH);
  if (existing) return normalizeAccessConfig(existing);

  const migrated = migrateFromBootMessageFilter();
  if (migrated) return migrated;

  writeJsonSafe(ACCESS_CONFIG_PATH, ACCESS_DEFAULT_CONFIG);
  return ACCESS_DEFAULT_CONFIG;
}
