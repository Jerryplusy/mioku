import { getOrCreate } from "../internal/registry";

const store = getOrCreate<Record<string, unknown>>(
  "plugin-runtime-state",
  () => ({}),
);

/** 插件运行时状态引用：跨重载安全的读写句柄 */
export interface PluginStateRef<T> {
  readonly name: string;
  get(): T;
  set(next: T): void;
  reset(): void;
}

/** 定义一个具名状态引用，插件重载后仍能读回旧值 */
export function defineState<T>(name: string, initial: T): PluginStateRef<T> {
  return {
    name,
    get(): T {
      const current = store[name];
      return (current === undefined ? initial : current) as T;
    },
    set(next: T): void {
      store[name] = next;
    },
    reset(): void {
      delete store[name];
    },
  };
}

export function hasPluginState(name: string): boolean {
  return store[name] !== undefined;
}

/** 取插件的运行时状态对象，不存在时自动创建空对象 */
export function getPluginRuntimeState<T = Record<string, any>>(
  name: string,
): T {
  if (!store[name]) store[name] = {};
  return store[name] as T;
}

/** 合并写入插件运行时状态 */
export function setPluginRuntimeState<T>(name: string, state: T): void {
  store[name] = state;
}

export function resetPluginRuntimeState(name: string): void {
  delete store[name];
}

export function getAllPluginRuntimeStates(): Record<string, unknown> {
  return { ...store };
}