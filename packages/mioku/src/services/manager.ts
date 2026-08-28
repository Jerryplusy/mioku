import * as fs from "fs/promises";
import * as path from "path";
import { existsSync, mkdirSync } from "fs";
import type { MiokuContext } from "../runtime/mioku-context";
import type {
  MiokuRuntimeConfig,
  PackageJsonLike,
  ServiceMetadata,
  MiokuService,
} from "../types";
import { rootLogger as logger } from "../logger";
import {
  scanLocalDir,
  scanNodeModules,
  pathExists,
  toImportPath,
} from "../internal/module-scanner";
import { getOrCreate } from "../internal/registry";
import { servicesRegistry } from "./registry";

const SERVICE_PREFIX = "mioku-service-";

export class ServiceManager {
  private serviceMetadata = new Map<string, ServiceMetadata>();
  private loaded = new Map<string, MiokuService>();

  static getInstance(): ServiceManager {
    return getOrCreate("service-manager", () => new ServiceManager());
  }

  async discoverServices(miokuConfig: MiokuRuntimeConfig = {}): Promise<ServiceMetadata[]> {
    const servicesDir = miokuConfig.services_dir
      ? path.resolve(process.cwd(), miokuConfig.services_dir)
      : path.resolve(process.cwd(), "services");

    this.serviceMetadata.clear();

    if (existsSync(servicesDir)) {
      const local = await scanLocalDir(servicesDir);
      for (const { name, path: p } of local) {
        const metadata = await this.loadServiceMetadata(name, p);
        if (metadata) this.serviceMetadata.set(name, metadata);
      }
    } else {
      mkdirSync(servicesDir, { recursive: true });
    }

    const external = await scanNodeModules(SERVICE_PREFIX);
    for (const { name, path: p } of external) {
      const metadata = await this.loadServiceMetadata(name, p);
      if (metadata) this.serviceMetadata.set(name, metadata);
    }

    logger.info(`o.O 发现了 ${this.serviceMetadata.size} 个服务`);
    return [...this.serviceMetadata.values()];
  }

  private async loadServiceMetadata(
    name: string,
    servicePath: string,
  ): Promise<ServiceMetadata | null> {
    const packageJsonPath = path.join(servicePath, "package.json");
    if (!(await pathExists(packageJsonPath))) return null;

    try {
      const packageJson: PackageJsonLike = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );
      return {
        name,
        version: packageJson.version ?? "0.0.0",
        description: packageJson.description,
        path: servicePath,
        packageJson,
      };
    } catch (error) {
      logger.warn(`[service-manager] 解析服务 ${name} 失败: ${error}`);
      return null;
    }
  }

  getMetadata(name: string): ServiceMetadata | undefined {
    return this.serviceMetadata.get(name);
  }

  getAllMetadata(): ServiceMetadata[] {
    return [...this.serviceMetadata.values()];
  }

  async loadAllServices(ctx: MiokuContext): Promise<void> {
    const all = [...this.serviceMetadata.values()];
    logger.info(`O.o 准备加载 ${all.length} 个服务...`);
    let loadedCount = 0;
    for (const metadata of all) {
      if (await this.loadService(metadata, ctx)) loadedCount++;
    }
    logger.info(`O.o 服务加载完成: ${loadedCount}/${all.length} 个就绪`);
  }

  private async loadService(metadata: ServiceMetadata, ctx: MiokuContext): Promise<boolean> {
    try {
      const tsEntry = path.join(metadata.path, "index.ts");
      const jsEntry = path.join(metadata.path, "index.js");
      const entry = (await pathExists(tsEntry))
        ? tsEntry
        : (await pathExists(jsEntry))
          ? jsEntry
          : null;
      if (!entry) {
        logger.error(`[service-manager] 服务 ${metadata.name} 入口丢失`);
        return false;
      }

      const serviceModule = await import(toImportPath(entry));
      const service: MiokuService = serviceModule.default ?? serviceModule;
      if (!service || typeof service.init !== "function") {
        logger.warn(`[service-manager] 服务 ${metadata.name} 无效：缺少 init()`);
        return false;
      }

      await service.init();
      servicesRegistry[metadata.name] = service.api;
      this.loaded.set(metadata.name, service);
      return true;
    } catch (error) {
      logger.error(`[service-manager] 加载服务 ${metadata.name} 失败: ${error}`);
      return false;
    }
  }

  async disposeAll(): Promise<void> {
    const entries = Array.from(this.loaded.entries()).reverse();
    this.loaded.clear();
    for (const [name, service] of entries) {
      try {
        await service.dispose?.();
      } catch (error) {
        logger.warn(`[service-manager] 服务 ${name} 卸载失败: ${error}`);
      }
      delete servicesRegistry[name];
    }
  }

  async reset(): Promise<void> {
    await this.disposeAll();
    this.serviceMetadata.clear();
  }
}

export default ServiceManager.getInstance();