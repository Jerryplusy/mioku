import * as fs from "fs/promises";
import * as path from "path";
import { mkdirSync } from "fs";
import type {
  MiokuRuntimeConfig,
  PackageJsonLike,
  PluginMetadata,
  PluginPackageConfig,
} from "../types";
import { DEFAULT_RUNTIME_PLUGINS_DIR } from "./plugin-linker";
import { logger } from "./logger";
import {
  scanLocalDir,
  scanNodeModules,
  pathExists,
  resolveRealpath,
} from "./module-scanner";
import { getOrCreate } from "./registry";

const PLUGIN_PREFIX = "mioku-plugin-";

export class PluginManager {
  private plugins = new Map<string, PluginMetadata>();

  static getInstance(): PluginManager {
    return getOrCreate("plugin-manager", () => new PluginManager());
  }

  async discoverPlugins(miokuConfig: MiokuRuntimeConfig = {}): Promise<PluginMetadata[]> {
    const configuredDir = miokuConfig.plugins_dir;
    const pluginsDir =
      configuredDir && configuredDir !== DEFAULT_RUNTIME_PLUGINS_DIR
        ? path.resolve(process.cwd(), configuredDir)
        : path.resolve(process.cwd(), "plugins");

    this.plugins.clear();

    if (!(await pathExists(pluginsDir))) {
      mkdirSync(pluginsDir, { recursive: true });
    }

    const local = await scanLocalDir(pluginsDir);
    for (const { name, path: p } of local) {
      const metadata = await this.loadPluginMetadata(name, p);
      if (metadata) this.plugins.set(metadata.name, metadata);
    }

    const external = await scanNodeModules(PLUGIN_PREFIX);
    for (const { name, path: p } of external) {
      const metadata = await this.loadPluginMetadata(name, p);
      if (metadata) this.plugins.set(metadata.name, metadata);
    }

    logger.info(`O.o 发现了 ${this.plugins.size} 个插件`);
    return [...this.plugins.values()];
  }

  private async loadPluginMetadata(
    name: string,
    pluginPath: string,
  ): Promise<PluginMetadata | null> {
    const resolvedPath = await resolveRealpath(pluginPath);
    let packageJson: PackageJsonLike | null = null;
    try {
      packageJson = JSON.parse(
        await fs.readFile(path.join(resolvedPath, "package.json"), "utf-8"),
      );
    } catch (error) {
      logger.warn(`[plugin-manager] 读取 ${name} 的 package.json 失败: ${error}`);
    }

    const config: PluginPackageConfig = packageJson?.mioku ?? {};
    return {
      name,
      version: packageJson?.version ?? "0.0.0",
      description: packageJson?.description,
      path: resolvedPath,
      packageJson: packageJson ?? {},
      config,
    };
  }

  collectRequiredServices(): Set<string> {
    const services = new Set<string>();
    for (const metadata of this.plugins.values()) {
      for (const service of metadata.config.services ?? []) services.add(service);
    }
    return services;
  }

  getPluginMetadata(name: string): PluginMetadata | undefined {
    return this.plugins.get(name);
  }

  getAllMetadata(): PluginMetadata[] {
    return [...this.plugins.values()];
  }

  reset(): void {
    this.plugins.clear();
  }
}

export default PluginManager.getInstance();
