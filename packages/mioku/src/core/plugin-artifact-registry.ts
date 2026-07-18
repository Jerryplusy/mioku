import * as path from "path";
import type { MiokiContext } from "mioki";
import { botConfig } from "mioki";
import type { AIService, AISkill, HelpService } from "../types";
import pluginManager from "./plugin-manager";
import { logger } from "./logger";
import { pathExists, toImportPath } from "./module-scanner";

function isAISkill(value: unknown): value is AISkill {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as AISkill).name === "string" &&
    Array.isArray((value as AISkill).tools)
  );
}

function extractSkills(moduleExports: Record<string, unknown>): AISkill[] {
  const candidates = [moduleExports?.default, moduleExports?.skills, moduleExports];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isAISkill);
    if (isAISkill(candidate)) return [candidate];
  }
  return [];
}

async function resolveSkillsEntry(pluginPath: string): Promise<string | null> {
  const tsPath = path.join(pluginPath, "skills.ts");
  if (await pathExists(tsPath)) return tsPath;
  const jsPath = path.join(pluginPath, "skills.js");
  if (await pathExists(jsPath)) return jsPath;
  return null;
}

function hasPublicKeyword(keywords: unknown): boolean {
  return Array.isArray(keywords) && keywords.includes("mioku");
}

export async function registerPluginArtifacts(ctx: MiokiContext): Promise<void> {
  const enabledPlugins = new Set<string>(botConfig.plugins ?? []);
  const pluginMetadata = pluginManager.getAllMetadata().filter((metadata) =>
    enabledPlugins.size > 0 ? enabledPlugins.has(metadata.name) : true,
  );

  const helpService = ctx.services.help as HelpService | undefined;
  const aiService = ctx.services.ai as AIService | undefined;

  if (helpService) {
    let helpCount = 0;
    for (const metadata of pluginMetadata) {
      if (!metadata.config.help) continue;
      if (!hasPublicKeyword(metadata.packageJson?.keywords)) continue;
      helpService.registerHelp(metadata.name, metadata.config.help);
      helpCount += 1;
    }
    logger.info(`[plugin-artifacts] Registered ${helpCount} help manifest(s)`);
  }

  if (!aiService) return;

  let skillCount = 0;
  for (const metadata of pluginMetadata) {
    const skillsEntry = await resolveSkillsEntry(metadata.path);
    if (!skillsEntry) continue;

    try {
      const moduleExports = (await import(toImportPath(skillsEntry))) as Record<
        string,
        unknown
      >;
      const skills = extractSkills(moduleExports);
      if (skills.length === 0) {
        logger.warn(
          `[plugin-artifacts] Plugin ${metadata.name} has ${path.basename(skillsEntry)} but exported no valid skill`,
        );
        continue;
      }
      for (const skill of skills) {
        aiService.registerSkill(skill);
        skillCount += 1;
      }
    } catch (error) {
      logger.error(
        `[plugin-artifacts] Failed to load skills for plugin ${metadata.name}: ${error}`,
      );
    }
  }
  logger.info(`[plugin-artifacts] Registered ${skillCount} skill(s)`);
}
