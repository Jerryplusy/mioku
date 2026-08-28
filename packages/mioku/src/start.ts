import path from "node:path";
import { createRuntime, setBuiltinPlugins } from "./runtime/runtime";
import { createMiokuLogger, rootLogger } from "./logger";
import { setWritableConfig, botConfig, setBotCwd } from "./config";
import { version } from "../package.json";
import { getBuiltinPlugins } from "./runtime/runtime";
import { unique } from "./utils";
import { BUILTIN_PLUGINS } from "./builtin";
import serviceManager from "./services/manager";
import { registerPluginArtifacts } from "./runtime/plugin-artifacts";
import { colors } from "consola/utils";

import type { MiokuPlugin } from "./plugin";
import type { Logger } from "./logger";

export interface StartOptions {
  cwd?: string;
  logger?: Logger;
  builtinPlugins?: readonly MiokuPlugin[];
}

export const startRuntime = async (
  options: StartOptions = {},
): Promise<{ stop: (reason?: string) => Promise<void> }> => {
  const cwd = options.cwd ?? process.cwd();
  setBotCwd(cwd);
  setWritableConfig(true);

  const builtinPlugins = options.builtinPlugins ?? BUILTIN_PLUGINS;
  setBuiltinPlugins(builtinPlugins);
  const logger = options.logger ?? rootLogger;

  process.title = `mioku v${version}`;

  const runtime = createRuntime({
    cwd,
    logger,
    builtinPlugins: getBuiltinPlugins(),
  });

  const pluginDir = path.resolve(cwd, botConfig.plugins_dir ?? "plugins");
  logger.info(colors.dim("=".repeat(40)));
  logger.info(
    `欢迎使用 ${colors.bold(colors.redBright("mioku"))} 💓 ${colors.bold(colors.cyan(`v${version}`))}`,
  );
  logger.info(colors.yellow(colors.underline("一个跨平台的插件式机器人框架")));
  logger.info(colors.cyan("轻量 * 跨平台 * 插件式 * 热重载 * 注重开发体验"));
  logger.info(colors.dim("=".repeat(40)));
  logger.info(colors.dim(colors.italic("作者: Viki & Jerryplusy")));
  logger.info(
    colors.dim(colors.italic("仓库: https://github.com/mioku-lab/mioku")),
  );
  logger.info(colors.dim("=".repeat(40)));
  logger.info(`${colors.dim("工作目录: ")}${colors.blue(cwd)}`);
  logger.info(`${colors.dim("插件目录: ")}${colors.blue(pluginDir)}`);
  logger.info(
    `${colors.dim("配置文件: ")}${colors.blue(path.resolve(cwd, "package.json"))}`,
  );
  logger.info(
    `${colors.dim("启用插件: ")}${colors.blue(unique(botConfig.plugins).join(", ") || "(空)")}`,
  );
  logger.info(
    `${colors.dim("适配器: ")}${colors.blue(Object.keys(botConfig.adapters ?? {}).join(", ") || "(无, zero-adapter 模式)")}`,
  );
  logger.info(colors.dim("=".repeat(40)));

  await serviceManager.loadAllServices();
  await runtime.start();
  await registerPluginArtifacts();

  const bots = runtime.bots;
  if (bots.length > 0) {
    logger.info(
      `成功连接 ${bots.length} 个实例: ${bots.map((b) => b.bot_id).join(", ")}`,
    );
  }
  logger.info(colors.dim("=".repeat(40)));
  logger.info(
    `mioku v${version} 启动完成，向机器人发送「${colors.magentaBright(`${botConfig.prefix}help`)}」查看消息指令`,
  );

  if (botConfig.online_push && botConfig.owners[0]) {
    const bot = runtime.bots[0];
    if (bot) {
      try {
        await bot.sendMessage(
          { type: "private", user_id: botConfig.owners[0] },
          `✅ mioku v${version} 已就绪`,
        );
      } catch (err) {
        logger.warn("发送就绪通知失败", err);
      }
    }
  }
  return {
    stop: async (reason?: string) => {
      await runtime.shutdown(reason);
      await serviceManager.disposeAll();
    },
  };
};
