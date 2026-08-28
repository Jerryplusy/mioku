import { defineCapability } from '../adapter'

export interface BotStatusResult {
  readonly online: boolean
  readonly app_name?: string
  readonly app_version?: string
  readonly protocol_version?: string
  readonly [key: string]: unknown
}

export const botStatus = defineCapability<Record<string, never>, BotStatusResult>('bot.status', 1)