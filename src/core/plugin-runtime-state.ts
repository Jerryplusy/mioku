const PLUGIN_RUNTIME_STATE_SYMBOL = Symbol.for("mioku.plugin.runtime-state");

type RuntimeStateRegistry = Map<string, Record<string, any>>;

function getRuntimeRegistry(): RuntimeStateRegistry {
  const globalState = globalThis as typeof globalThis & {
    [PLUGIN_RUNTIME_STATE_SYMBOL]?: RuntimeStateRegistry;
  };

  if (!globalState[PLUGIN_RUNTIME_STATE_SYMBOL]) {
    globalState[PLUGIN_RUNTIME_STATE_SYMBOL] = new Map();
  }

  return globalState[PLUGIN_RUNTIME_STATE_SYMBOL]!;
}

export function getPluginRuntimeState<T extends Record<string, any>>(
  pluginName: string,
): T {
  const registry = getRuntimeRegistry();
  const normalizedName = String(pluginName || "").trim();
  if (!registry.has(normalizedName)) {
    registry.set(normalizedName, {});
  }
  return registry.get(normalizedName)! as T;
}

export function setPluginRuntimeState<T extends Record<string, any>>(
  pluginName: string,
  nextState: Partial<T>,
): T {
  const state = getPluginRuntimeState<T>(pluginName);
  Object.assign(state, nextState);
  return state;
}

export function resetPluginRuntimeState(pluginName: string): void {
  const state = getPluginRuntimeState<Record<string, any>>(pluginName);
  for (const key of Object.keys(state)) {
    delete state[key];
  }
}
