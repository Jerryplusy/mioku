import { getOrCreate } from "../internal/registry";

const store = getOrCreate<Record<string, unknown>>(
  "plugin-runtime-state",
  () => ({}),
);

export interface PluginStateRef<T> {
  readonly name: string;
  get(): T;
  set(next: T): void;
  reset(): void;
}

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

export function getPluginRuntimeState<T = Record<string, any>>(
  name: string,
): T {
  if (!store[name]) store[name] = {};
  return store[name] as T;
}

export function setPluginRuntimeState<T>(name: string, state: T): void {
  store[name] = state;
}

export function resetPluginRuntimeState(name: string): void {
  delete store[name];
}

export function getAllPluginRuntimeStates(): Record<string, unknown> {
  return { ...store };
}