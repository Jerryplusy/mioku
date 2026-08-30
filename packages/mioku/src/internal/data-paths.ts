import * as path from "path";
import { existsSync, mkdirSync } from "fs";

/** 插件数据目录：`data/<pluginName>/` */
export function getPluginDataDir(pluginName: string): string {
  return path.join(process.cwd(), "data", pluginName);
}

/** 服务数据目录：`data/<serviceName>/` */
export function getServiceDataDir(serviceName: string): string {
  return path.join(process.cwd(), "data", serviceName);
}

/** 全局数据目录：`data/` */
export function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

/** 插件配置目录：`config/<pluginName>/` */
export function getPluginConfigDir(pluginName: string): string {
  return path.join(process.cwd(), "config", pluginName);
}

/** 服务配置目录：`config/service/<serviceName>/` */
export function getServiceConfigDir(serviceName: string): string {
  return path.join(process.cwd(), "config", "service", serviceName);
}

/** 全局配置目录：`config/` */
export function getConfigDir(): string {
  return path.join(process.cwd(), "config");
}

/** 确保插件数据目录存在，返回目录路径 */
export function ensureDataDir(pluginName: string): string {
  const dir = getPluginDataDir(pluginName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
