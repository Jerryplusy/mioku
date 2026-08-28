import type { MiokuContext } from '../runtime/mioku-context'
import type { TaskContext } from 'node-cron'

export type { MiokuContext }

export type PluginCleanup = () => void | Promise<void>

export type BotHandler = (event: import('../adapter/types').BotLifecycleEvent) => void | Promise<void>
export type CronHandler = (ctx: MiokuContext, task: TaskContext) => void | Promise<void>
export type ScheduledTask = import('node-cron').ScheduledTask

export interface MiokuPlugin {
  name: string
  version?: string
  priority?: number
  description?: string
  dependencies?: string[]
  setup?(ctx: MiokuContext): void | Promise<void | PluginCleanup> | PluginCleanup
}

export const definePlugin = <T extends MiokuPlugin>(plugin: T): T => plugin
