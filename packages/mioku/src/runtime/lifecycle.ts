import type { Bot } from '../adapter'

/** 框架生命周期事件表：bot 连接、适配器启停、运行时就绪/关闭 */
export interface LifecycleEventMap {
  'bot:connected': { bot: Bot }
  'bot:disconnected': { bot: Bot; reason?: string }
  'adapter:registered': { name: string }
  'adapter:started': { name: string }
  'adapter:stopped': { name: string; reason?: string }
  'runtime:ready': void
  'runtime:shutdown': { reason?: string }
}

export type LifecycleEvent = {
  [K in keyof LifecycleEventMap]: LifecycleEventMap[K] extends void
    ? { type: K }
    : { type: K; payload: LifecycleEventMap[K] }
}[keyof LifecycleEventMap]

export type LifecycleHandler<K extends keyof LifecycleEventMap> = (
  payload: LifecycleEventMap[K],
) => void | Promise<void>

export interface LifecycleListener {
  off(): void
}