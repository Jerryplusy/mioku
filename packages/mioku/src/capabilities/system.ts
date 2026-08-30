import { defineCapability } from '../adapter/capability'

/** bot 登录状态信息 */
export interface BotStatusResult {
  readonly online: boolean
  readonly app_name?: string
  readonly app_version?: string
  readonly protocol_version?: string
  readonly [key: string]: unknown
}

/** 查询 bot 登录状态 */
export const botStatus = defineCapability<Record<string, never>, BotStatusResult>('bot.status', 1)