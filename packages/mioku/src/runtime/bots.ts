import { AdapterRegistrationConflictError } from './context'
import { connectedBotKey, connectedBots } from '../compat/connected-bots'

import type { Bot, BotContext } from '../adapter'

export class BotRegistry {
  #bots = new Map<string, { adapter: string; bot_id: string; bot: Bot }>()
  #disposers = new Map<string, () => void>()

  register(bot: Bot): BotContext {
    const key = connectedBotKey(bot.adapter, bot.bot_id)
    if (this.#bots.has(key)) {
      throw new AdapterRegistrationConflictError(key)
    }
    this.#bots.set(key, { adapter: bot.adapter, bot_id: bot.bot_id, bot })
    connectedBots.set(key, bot)
    const dispose = (): void => {
      this.unregister(bot.bot_id, bot.adapter)
    }
    this.#disposers.set(key, dispose)
    return {
      bot,
      unregister: dispose,
    }
  }

  has(key: string): boolean {
    return this.#bots.has(key)
  }

  unregister(bot_id: string, adapter: string): boolean {
    const key = connectedBotKey(adapter, bot_id)
    const removed = this.#bots.delete(key)
    this.#disposers.delete(key)
    connectedBots.delete(key)
    return removed
  }

  pick<T extends Bot = Bot>(bot_id: string | number): T | undefined {
    const key = String(bot_id)
    for (const entry of this.#bots.values()) {
      if (entry.bot_id === key) return entry.bot as T
    }
    return undefined
  }

  all<T extends Bot = Bot>(): readonly T[] {
    return Array.from(this.#bots.values()).map((entry) => entry.bot as T)
  }

  size(): number {
    return this.#bots.size
  }

  clear(): void {
    this.#bots.clear()
    this.#disposers.clear()
    connectedBots.clear()
  }
}