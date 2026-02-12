import * as fs from "fs";
import * as path from "path";
import { logger, MiokiContext } from "mioki";
import type { ServiceMetadata, MiokuService } from "./types";

const SERVICE_MANAGER_SYMBOL = Symbol.for("mioku.service-manager");

/**
 * 服务管理器
 */
export class ServiceManager {
  private services: Map<string, MiokuService> = new Map();
  private serviceMetadata: Map<string, ServiceMetadata> = new Map();
  private readonly servicesDir: string;

  constructor(servicesDir: string = "src/services") {
    this.servicesDir = path.resolve(process.cwd(), servicesDir);
    this.ensureServicesDir();
  }

  public static getInstance(): ServiceManager {
    const g = global as any;
    if (!g[SERVICE_MANAGER_SYMBOL]) {
      g[SERVICE_MANAGER_SYMBOL] = new ServiceManager();
    }
    return g[SERVICE_MANAGER_SYMBOL];
  }

  private ensureServicesDir(): void {
    if (!fs.existsSync(this.servicesDir)) {
      fs.mkdirSync(this.servicesDir, { recursive: true });
    }
  }

  async discoverServices(): Promise<ServiceMetadata[]> {
    const discovered: ServiceMetadata[] = [];
    if (!fs.existsSync(this.servicesDir)) return discovered;

    const entries = await fs.promises.readdir(this.servicesDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const servicePath = path.join(this.servicesDir, entry.name);
      const packageJsonPath = path.join(servicePath, "package.json");

      if (!fs.existsSync(packageJsonPath)) continue;

      try {
        const packageJson = JSON.parse(
          await fs.promises.readFile(packageJsonPath, "utf-8"),
        );
        const metadata: ServiceMetadata = {
          name: entry.name,
          version: packageJson.version || "0.0.0",
          description: packageJson.description,
          path: servicePath,
          packageJson,
        };
        discovered.push(metadata);
        this.serviceMetadata.set(entry.name, metadata);
      } catch (error: any) {
        logger.error(`解析服务 ${entry.name} 失败: ${error.message}`);
      }
    }
    logger.info(`o.O 发现了 ${this.serviceMetadata.size} 个服务`);
    return Array.from(this.serviceMetadata.values());
  }

  async checkMissingServices(requiredServices: Set<string>): Promise<string[]> {
    const missing: string[] = [];
    for (const serviceName of requiredServices) {
      if (!this.serviceMetadata.has(serviceName)) {
        missing.push(serviceName);
      }
    }
    return missing;
  }

  async loadAllServices(ctx: MiokiContext): Promise<void> {
    const allMetadata = Array.from(this.serviceMetadata.values());
    logger.info(`O.o 准备加载 ${allMetadata.length} 个服务...`);

    for (const metadata of allMetadata) {
      await this.loadService(metadata, ctx);
    }
  }

  private async loadService(
    metadata: ServiceMetadata,
    ctx: MiokiContext,
  ): Promise<boolean> {
    try {
      const indexPath = path.join(metadata.path, "index.ts");
      const indexJsPath = path.join(metadata.path, "index.js");
      const entryPoint = fs.existsSync(indexPath) ? indexPath : indexJsPath;

      if (!fs.existsSync(entryPoint)) {
        logger.error(`服务 ${metadata.name} 入口丢失`);
        return false;
      }

      const serviceModule = await import(entryPoint);
      const service: MiokuService = serviceModule.default || serviceModule;

      if (!service || typeof service.init !== "function") return false;

      await service.init(ctx);
      if (service.api) {
        if (!(ctx as any).services) (ctx as any).services = {};
        (ctx as any).services[metadata.name] = service.api;
      }

      this.services.set(metadata.name, service);
      logger.info(`✓ 服务 ${metadata.name} 已就绪`);
      return true;
    } catch (error: any) {
      logger.error(`加载服务 ${metadata.name} 失败: ${error.message}`);
      return false;
    }
  }

  async disposeAll(): Promise<void> {
    for (const [name, service] of this.services) {
      if (service.dispose) await service.dispose();
    }
    this.services.clear();
  }
}

export default ServiceManager.getInstance();
