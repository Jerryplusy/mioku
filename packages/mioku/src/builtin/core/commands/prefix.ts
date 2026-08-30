import { botConfig } from "../../../config";

export function getCommandPrefix(): string {
  return botConfig.prefix ?? ".";
}
