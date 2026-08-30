import type {
  AIService,
  ConfigService,
  ScreenshotService,
  HelpService,
} from "../types";
import { defineService } from "./define";

/** 框架内置服务的引用集合 */
export const Services = {
  AI: defineService<AIService>("ai"),
  Config: defineService<ConfigService>("config"),
  Screenshot: defineService<ScreenshotService>("screenshot"),
  Help: defineService<HelpService>("help"),
} as const;

/** 全部内置服务引用的联合类型 */
export type BuiltinServiceRef =
  | typeof Services.AI
  | typeof Services.Config
  | typeof Services.Screenshot
  | typeof Services.Help;