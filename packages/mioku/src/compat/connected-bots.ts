import { getOrCreate } from '../internal/registry'

import type { Bot } from '../adapter'

/** 当前已连接的全部 bot，按 `adapter:bot_id` 索引 */
export const connectedBots: Map<string, Bot> = getOrCreate('connected-bots', () => new Map())

/** 生成 bot 在连接表中的键：`adapter:bot_id` */
export const connectedBotKey = (adapter: string, bot_id: string): string => `${adapter}:${bot_id}`

/** 兼容旧版 API 的别名：过去的 NapCat 扩展类型现在就是通用 Bot */
export type ExtendedNapCat = Bot