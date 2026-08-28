import { getOrCreate } from '../internal/registry'

import type { Bot } from '../adapter'

export const connectedBots: Map<string, Bot> = getOrCreate('connected-bots', () => new Map())

export const connectedBotKey = (adapter: string, bot_id: string): string => `${adapter}:${bot_id}`

export type ExtendedNapCat = Bot