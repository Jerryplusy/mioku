import type { AccessHook, PluginMetadata } from "../../../types";

export interface MessageCommandMatch {
  plugin: string;
  command: string;
}

function matchTextHook(text: string, hook: AccessHook): boolean {
  const m = String(hook.match || "").trim();
  if (!m) return false;
  if (m.startsWith("/") && m.endsWith("/") && m.length >= 3) {
    try {
      const re = new RegExp(m.slice(1, -1));
      return re.test(text);
    } catch {
      return false;
    }
  }
  return text === m || text.startsWith(m);
}

export function matchMessageCommands(
  plugins: PluginMetadata[],
  text: string,
): MessageCommandMatch[] {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const out: MessageCommandMatch[] = [];
  for (const p of plugins) {
    const hooks = p.config?.accessHooks;
    if (!hooks || hooks.length === 0) continue;
    for (const hook of hooks) {
      if (!hook.match) continue;
      if (matchTextHook(trimmed, hook)) {
        out.push({ plugin: p.name, command: hook.id });
      }
    }
  }
  return out;
}
