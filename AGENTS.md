# AGENTS.md

Concise guide for coding agents working in this repo. Read `CLAUDE.md` for the full picture.

## What this is

`mioku` is a service-oriented layer over [mioki](https://mioki.viki.moe/) (a QQ bot framework for OneBot v11 / NapCat). It adds plugin/service discovery, an AI Skill system, declarative config, and a CLI/webUI. Distributed as a bun workspace monorepo.

## Layout (3 tiers)

- `packages/mioku/` — the framework. `src/index.ts` (public API + thin `start()`), `src/cli/` (scaffold/install/update), `src/core/` (`bootstrap.ts` orchestrates startup; `registry.ts` jiti-safe singletons; `module-scanner.ts` shared discovery; `plugin-manager`/`service-manager`/`plugin-linker`/`plugin-artifact-registry`). `src/types.ts` is the **single source of truth** for all types (the old `service-types.ts`/`core/types.ts` duplicates were merged here).
- `packages/mioku-service-ai/` — AI service. `index.ts` (AIInstanceImpl + AIServiceImpl), `core/tool-loop.ts` (extracted tool-execution loop), `usage/tracker.ts` (`UsageTracker` class + token estimation), `usage/store.ts` (SQLite usage store). Types reused from `mioku`.
- `packages/mioku-plugin-chat/` — chat plugin. `index.ts` is the wiring (config registration, manager construction, handler registration — the full startup logic lives here, not in a separate bootstrap). Extracted modules: `core/chat-turn.ts` (processChat + executeChatRuntimeRequest + shared `finalizeTurn`), `runtime/chat-runtime.ts` (ChatRuntime impl), `handlers/{message,poke,idle-debug}.ts`, `manage/rate-limit-guard.ts` (RateLimitGuard class), `core/media/segment.ts` (media segment/options helpers), `utils/json.ts` (`extractJsonObject`). The 3 managers (`CooldownManager`/`IdleCheckManager`/`QueueProcessor`) take a single `ChatPluginContext` (see `context.ts`).

## Working in this repo

- **Verify with**: `bunx tsc --noEmit` (whole monorepo) + `cd packages/mioku && bun run build` + `bun run start` (example bot smoke). There's no test suite — type-check + boot smoke are the guardrails.
- **Match the house style**: TypeScript ESM, `bun` runtime, **default to no comments** (one-line `//` only where the *why* is non-obvious), split logic across focused files (folder per concern), keep `index.ts` as wiring.
- **Plugin state** goes through `getPluginRuntimeState`/`setPluginRuntimeState` from `mioku` (not module-level singletons — jiti `moduleCache` is off).
- **Use `ctx.pickBot(e.self_id)`**, not `ctx.bot`. **Storage paths** via `getPluginDataDir`/`getPluginConfigDir`/`ensureDataDir` from `mioku`, never hard-coded `process.cwd() + ...`.
- **Errors users can act on**: send a QQ message (prefer `chatRuntime.generateNotice` to stay in-voice, fall back to `event.reply`).
- **Don't** import service types from `mioku-service-*/types.ts` — import them from `"mioku"`.
- `example/` is the author's running bot, not a clean reference project.
