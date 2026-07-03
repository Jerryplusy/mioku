import * as path from "path";
import { existsSync, mkdirSync } from "fs";

export function getPluginDataDir(pluginName: string): string {
  return path.join(process.cwd(), "data", pluginName);
}

export function getServiceDataDir(serviceName: string): string {
  return path.join(process.cwd(), "data", serviceName);
}

export function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

export function getPluginConfigDir(pluginName: string): string {
  return path.join(process.cwd(), "config", pluginName);
}

export function getServiceConfigDir(serviceName: string): string {
  return path.join(process.cwd(), "config", "service", serviceName);
}

export function getConfigDir(): string {
  return path.join(process.cwd(), "config");
}

export function ensureDataDir(pluginName: string): string {
  const dir = getPluginDataDir(pluginName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
