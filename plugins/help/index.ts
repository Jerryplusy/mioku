import type { MiokuPlugin } from "../../src";
import type { AIService } from "../../src/services/ai/types";
import type { ConfigService } from "../../src/services/config/tpyes";
import type { HelpService } from "../../src/services/help/types";
import type { ScreenshotService } from "../../src/services/screenshot/types";
import type { MiokiContext } from "mioki";
import * as path from "path";
import { HELP_DEMO_CONFIG } from "./demo-config";
import {
  generateHelpImage,
  getPackageVersion,
  replyWithImage,
  resolveHelpBotProfile,
} from "./shared";
import { resetHelpRuntimeState, setHelpRuntimeState } from "./runtime";

const helpPlugin: MiokuPlugin = {
  name: "help",
  version: "1.0.0",
  description: "帮助插件，生成帮助图片",
  services: ["help", "screenshot", "config"],

  async setup(ctx: MiokiContext) {
    const configService = ctx.services?.config as ConfigService | undefined;
    const helpService = ctx.services?.help as HelpService | undefined;
    const screenshotService = ctx.services?.screenshot as
      | ScreenshotService
      | undefined;

    if (!helpService) {
      ctx.logger.warn("help-service 未加载，帮助插件无法运行");
      return;
    }

    if (!screenshotService) {
      ctx.logger.warn("screenshot 服务未加载，帮助插件功能受限");
    }

    if (configService) {
      await configService.registerConfig("help", "demo", HELP_DEMO_CONFIG.demo);
    }

    const miokiVersion = await getPackageVersion(
      path.join(process.cwd(), "node_modules/mioki/package.json"),
    );
    const miokuVersion = await getPackageVersion(
      path.join(process.cwd(), "package.json"),
    );

    setHelpRuntimeState({
      miokiVersion,
      miokuVersion,
    });

    ctx.handle("message", async (event: any) => {
      const text = ctx.text(event);
      if (!text) {
        return;
      }

      const trimmed = text.trim().toLowerCase();
      const isHelpCommand = /^[#/]?(help|帮助)$/.test(trimmed);
      if (!isHelpCommand) {
        return;
      }

      if (!screenshotService) {
        await event.reply("screenshot 服务未加载，无法生成帮助图片");
        return;
      }

      try {
        const { botNickname, botAvatarUrl } = resolveHelpBotProfile(ctx, event);
        const imagePath = await generateHelpImage({
          helpService,
          screenshotService,
          miokiVersion,
          miokuVersion,
          botNickname,
          botAvatarUrl,
        });

        if (!imagePath) {
          await event.reply("生成帮助图片失败");
          return;
        }

        await replyWithImage(event, ctx.segment, imagePath);
      } catch (error) {
        ctx.logger.error(`生成帮助图片失败: ${error}`);
        await event.reply(`生成帮助图片失败: ${error}`);
      }
    });

    return () => {
      resetHelpRuntimeState();
      ctx.logger.info("帮助插件已卸载");
    };
  },
};

export default helpPlugin;
