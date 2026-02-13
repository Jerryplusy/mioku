import { start as startMioki, logger } from "mioki";
import serviceManager from "./core/service-manager";
import pluginManager from "./core/plugin-manager";

export interface MiokuStartOptions {
  cwd?: string;
}

export async function start(options: MiokuStartOptions = {}): Promise<void> {
  const { cwd = process.cwd() } = options;

  if (cwd) {
    process.chdir(cwd);
  }

  logger.info("こんにちは..");
  logger.info("---------------------------------------");
  logger.info("----------  Mioku 正在启动 ------------");
  logger.info("---------------------------------------");

  logger.info("O.o Miku 正在翻找插件..");
  await pluginManager.discoverPlugins();

  logger.info("o.O Miku 正在翻找服务..");
  await serviceManager.discoverServices();

  const requiredServices = pluginManager.collectRequiredServices();
  const missingServices =
    await serviceManager.checkMissingServices(requiredServices);

  if (missingServices.length > 0) {
    logger.warn(`发现缺失服务: ${missingServices.join(", ")}`);
  }
  await startMioki({ cwd });
}

export * from "./core/types";
