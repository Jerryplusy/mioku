import * as fs from "fs/promises";
import * as path from "path";
import { existsSync, mkdirSync } from "fs";
import { logger } from "mioki";
import type { PluginMetadata } from "./types";

const PLUGIN_MANAGER_SYMBOL = Symbol.for("mioku.plugin-manager");

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 插件管理器
 */
export class PluginManager {
  private pluginMetadata: Map<string, PluginMetadata> = new Map();
  private readonly pluginsDir: string;

  constructor(pluginsDir: string = "plugins") {
    this.pluginsDir = path.resolve(process.cwd(), pluginsDir);
    this.ensurePluginsDir().then();
  }

  public static getInstance(): PluginManager {
    const g = global as any;
    if (!g[PLUGIN_MANAGER_SYMBOL]) {
      g[PLUGIN_MANAGER_SYMBOL] = new PluginManager();
    }
    return g[PLUGIN_MANAGER_SYMBOL];
  }

  private async ensurePluginsDir(): Promise<void> {
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true });
    }
  }

  async discoverPlugins(): Promise<PluginMetadata[]> {
    const discovered: PluginMetadata[] = [];
    if (!existsSync(this.pluginsDir)) return discovered;

    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(this.pluginsDir, entry.name);
      const packageJsonPath = path.join(pluginPath, "package.json");

      if (!(await pathExists(packageJsonPath))) continue;

      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8"),
        );
        const metadata: PluginMetadata = {
          name: entry.name,
          version: packageJson.version || "0.0.0",
          description: packageJson.description,
          path: pluginPath,
          packageJson,
          config: packageJson.mioku || {},
        };
        discovered.push(metadata);
        this.pluginMetadata.set(entry.name, metadata);
      } catch (error: any) {
        logger.error(`解析插件 ${entry.name} 失败: ${error.message}`);
      }
    }
    logger.info(`O.o 发现了 ${this.pluginMetadata.size} 个插件`);
    return Array.from(this.pluginMetadata.values());
  }

  collectRequiredServices(): Set<string> {
    const services = new Set<string>();
    for (const metadata of this.pluginMetadata.values()) {
      if (metadata.config.services) {
        metadata.config.services.forEach((s) => services.add(s));
      }
    }
    return services;
  }

  getPluginMetadata(name: string): PluginMetadata | undefined {
    return this.pluginMetadata.get(name);
  }

  getAllMetadata(): PluginMetadata[] {
    return Array.from(this.pluginMetadata.values());
  }
}

export default PluginManager.getInstance();
