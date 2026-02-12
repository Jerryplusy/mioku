import { logger, MiokiContext } from "mioki";
import { definePlugin } from "mioki";
import serviceManager from "../../src/core/service-manager";

/**
 * Boot 插件
 */
export default definePlugin({
  name: "boot",
  priority: -Infinity,
  async setup(ctx: MiokiContext) {
    logger.info("========================================");
    logger.info("          Mioku 正在引导服务...");
    logger.info("========================================");

    // 加载所有服务
    await serviceManager.loadAllServices(ctx);

    logger.info("========================================");
    logger.info("          Mioku 服务初始化完成");
    logger.info("========================================");

    return async () => {
      logger.info("正在关闭 Mioku...");
      await serviceManager.disposeAll();
      logger.info("Mioku 已关闭");
    };
  },
});
