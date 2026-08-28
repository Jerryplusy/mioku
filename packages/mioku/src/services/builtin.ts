import type {
  AIService,
  ConfigService,
  ScreenshotService,
  HelpService,
} from "../types";
import { defineService } from "./define";

export const Services = {
  AI: defineService<AIService>("ai"),
  Config: defineService<ConfigService>("config"),
  Screenshot: defineService<ScreenshotService>("screenshot"),
  Help: defineService<HelpService>("help"),
} as const;

export type BuiltinServiceRef =
  | typeof Services.AI
  | typeof Services.Config
  | typeof Services.Screenshot
  | typeof Services.Help;