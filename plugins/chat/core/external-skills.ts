import type { AISkill } from "../../../src";
import type { ChatConfig } from "../types";

function normalizeSkillName(name: unknown): string {
  return String(name || "").trim();
}

export function getAllowedExternalSkillNameSet(
  config: ChatConfig,
): Set<string> | null {
  const entries = Array.isArray(config.allowedExternalSkills)
    ? config.allowedExternalSkills
        .map((item) => normalizeSkillName(item))
        .filter(Boolean)
    : [];

  return entries.length > 0 ? new Set(entries) : null;
}

export function isExternalSkillAllowed(
  config: ChatConfig,
  skillName: string,
): boolean {
  const allowedSkillNames = getAllowedExternalSkillNameSet(config);
  if (!allowedSkillNames) {
    return true;
  }

  return allowedSkillNames.has(normalizeSkillName(skillName));
}

export function filterAllowedExternalSkills(
  config: ChatConfig,
  skills: AISkill[],
): AISkill[] {
  const allowedSkillNames = getAllowedExternalSkillNameSet(config);
  if (!allowedSkillNames) {
    return skills;
  }

  return skills.filter((skill) =>
    allowedSkillNames.has(normalizeSkillName(skill.name)),
  );
}
