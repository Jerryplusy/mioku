import { start as startMioki, logger } from "mioki";
import serviceManager from "./core/service-manager";
import pluginManager from "./core/plugin-manager";

/**
 * Mioku 启动选项
 */
export interface MiokuStartOptions {
  cwd?: string;
}

/**
 * 启动 Mioku 框架
 * 流程：
 * 1. 发现插件和服务
 * 2. 检查并安装缺失的服务/插件依赖（Git 库模式下在各自目录安装）
 * 3. 启动 Mioki (Mioki 会加载 boot 插件来真正执行初始化)
 */
export async function start(options: MiokuStartOptions = {}): Promise<void> {
  const { cwd = process.cwd() } = options;

  if (cwd) {
    process.chdir(cwd);
  }

  logger.info("こんにちは..");
  logger.info("---------------------------------------");
  logger.info("----------  Mioku 正在启动 ------------");
  logger.info("---------------------------------------");

  // 1. 发现元数据 (单例会保存状态)
  logger.info("O.o Miku 正在翻找插件..");
  await pluginManager.discoverPlugins();

  logger.info("o.O Miku 正在翻找服务..");
  await serviceManager.discoverServices();

  // 2. 预检服务依赖
  const requiredServices = pluginManager.collectRequiredServices();
  const missingServices =
    await serviceManager.checkMissingServices(requiredServices);

  if (missingServices.length > 0) {
    logger.warn(`发现缺失服务: ${missingServices.join(", ")}`);
    logger.info("请通过 gitInstaller 或手动下载到 src/services 目录");
  }
  await startMioki({ cwd });
}

export * from "./core/types";
