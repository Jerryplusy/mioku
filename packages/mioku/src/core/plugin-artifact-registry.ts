import type { MiokiContext } from "mioki";
import { botConfig } from "mioki";
import type { HelpService } from "../types";
import pluginManager from "./plugin-manager";
import { logger } from "./logger";

function hasPublicKeyword(keywords: unknown): boolean {
  return Array.isArray(keywords) && keywords.includes("mioku");
}

export async function registerPluginArtifacts(ctx: MiokiContext): Promise<void> {
  const enabledPlugins = new Set<string>(botConfig.plugins ?? []);
  const pluginMetadata = pluginManager.getAllMetadata().filter((metadata) =>
    enabledPlugins.size > 0 ? enabledPlugins.has(metadata.name) : true,
  );

  const helpService = ctx.services.help as HelpService | undefined;
  if (!helpService) return;

  let helpCount = 0;
  for (const metadata of pluginMetadata) {
    if (!metadata.config.help) continue;
    if (!hasPublicKeyword(metadata.packageJson?.keywords)) continue;
    helpService.registerHelp(metadata.name, metadata.config.help);
    helpCount += 1;
  }
  logger.info(`[plugin-artifacts] Registered ${helpCount} help manifest(s)`);
}
