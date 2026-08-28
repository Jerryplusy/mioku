import type { MiokuContext } from "./mioku-context";
import { getService } from "../services/define";
import { Services } from "../services/builtin";
import { rootLogger as logger } from "../logger";
import { getPluginMetadataList } from "./plugin-metadata";

export async function registerPluginArtifacts(ctx: MiokuContext): Promise<void> {
  const helpService = getService(ctx, Services.Help);
  const plugins = getPluginMetadataList();

  let helpCount = 0;
  for (const meta of plugins) {
    if (meta.config?.help) {
      if (helpService) {
        helpService.registerHelp(meta.name, meta.config.help);
        helpCount++;
      } else {
        logger.warn(`[plugin-artifacts] 帮助服务未加载，跳过插件 "${meta.name}" 的帮助注册`);
      }
    }
    const required = meta.config?.services;
    if (required && required.length > 0) {
      const missing = required.filter((name) => !ctx.services[name]);
      if (missing.length > 0) {
        ctx.logger.warn(`插件 "${meta.name}" 声明依赖服务 [${missing.join(', ')}]，但它们未加载`);
      }
    }
  }

  logger.info(`[plugin-artifacts] 已处理 ${plugins.length} 个插件的元数据，注册帮助 ${helpCount} 个`);
}