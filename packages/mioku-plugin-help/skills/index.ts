import type { AISkill } from "mioku";
import { createHelpSkill } from "./help";
import { createStatusSkill } from "./status";

export function createHelpSkills(): AISkill[] {
  return [createHelpSkill(), createStatusSkill()];
}
