import { getOrCreate } from "./registry";

interface PluginStateStore {
  [pluginName: string]: Record<string, any>;
}

// Stashed via the global registry so it survives jiti re-evaluation when a
// plugin re-imports the framework through its loader. Values are `any` because
// the state bag is plugin-defined and consumed via casts.
const store = getOrCreate<PluginStateStore>("plugin-runtime-state", () => ({}));

export function getPluginRuntimeState(pluginName: string): Record<string, any> {
  if (!store[pluginName]) store[pluginName] = {};
  return store[pluginName];
}

export function setPluginRuntimeState(
  pluginName: string,
  state: Record<string, any>,
): Record<string, any> {
  if (!store[pluginName]) store[pluginName] = {};
  Object.assign(store[pluginName], state);
  return store[pluginName];
}

export function resetPluginRuntimeState(pluginName: string): void {
  delete store[pluginName];
}

export function getAllPluginRuntimeStates(): PluginStateStore {
  return { ...store };
}
