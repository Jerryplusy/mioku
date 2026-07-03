// Framework singletons are stashed on globalThis so they survive jiti's
// moduleCache-off re-evaluation (mioki loads plugins via jiti). Callers that
// live in the normally-cached `mioku` dist could use a plain module-level
// const, but the global indirection keeps things stable if a plugin ever
// re-imports the framework through jiti.

const STORE_SYMBOL = Symbol.for("mioku.globalStore");
type GlobalStore = Record<string, unknown>;

function store(): GlobalStore {
  const g = globalThis as unknown as Record<symbol, GlobalStore>;
  if (!g[STORE_SYMBOL]) g[STORE_SYMBOL] = {};
  return g[STORE_SYMBOL]!;
}

export function getOrCreate<T>(key: string, factory: () => T): T {
  const s = store();
  if (s[key] === undefined) s[key] = factory();
  return s[key] as T;
}
