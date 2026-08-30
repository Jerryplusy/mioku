# AGENTS.md

Concise guide for AI coding agents working in this repo. Read the docs in `docs/` for depth; this file is the fast path.

## What this is

`mioku` — a plugin-based QQ bot framework (TypeScript, bun). Since v1.0.0 the core is **self-contained** (`packages/mioku`); there is no external `mioki` dependency anymore. Bun workspace monorepo.

## Package tiers (the only thing you need to know about packages/)

- `packages/mioku/` — the framework. Public API in `src/index.ts`.
- `packages/mioku-adapter-*/` — platform connectors (stdin / onebotv11 / icqq). New package type introduced in v1.
- `packages/mioku-plugin-*/` — bot features. Most dev happens here.
- `packages/mioku-service-*/` — reusable capabilities (ai / config / screenshot / help / …).

Ignore most packages in `packages/` when reading code; only these four tiers matter.

## Framework core layout (`packages/mioku/src/`)

- `adapter/` — `defineAdapter()` (apiVersion=1), `defineCapability()`, unified `Event`/`Message`/`segment`, `CapabilityRegistry`, `bindCapabilities`.
- `capabilities/` — built-in capability definitions (message.send, member.ban, group.*, …). Exported from `mioku`.
- `runtime/` — `MiokuContext` (the `ctx` plugins receive), `EventBus` (route dispatch), `MiokuRuntime`, lifecycle events.
- `loader/` — package discovery by prefix (`mioku-plugin-`/`mioku-adapter-`), jiti loading, manifest validation.
- `services/` — `MiokuService` (init/api/dispose), `getService`/`requireService`/`hasService`, built-in `Services` refs.
- `builtin/core/` — the built-in core plugin: system commands, access control, status.
- `cli/` — `npx mioku` scaffold + install/update. `src/cli/shared.ts` lists SYSTEM_PLUGINS / SYSTEM_SERVICES / SYSTEM_ADAPTERS.
- `types.ts` — single source of truth for public types.

## Architecture rules that trip agents up

- **Bot methods are capability-bound, not hard-coded.** `bot.sendMessage`/`banMember` come from `bindCapabilities` + the registry. Adapters register implementations; plugins only call.
- **Plugins** = `definePlugin({ name, priority, setup(ctx) })`; `name` MUST equal the package short name (`mioku-plugin-foo` → `foo`), else `canonical ID mismatch`.
- **Event routing**: `ctx.handle("message" | "message.group" | "onebotv11:message", handler)`. Setup runs BEFORE adapters start — `ctx.bot` may be undefined there; wait for `bot:connected`/`runtime:ready`.
- **Services**: import contract types from `"mioku"`, never from `mioku-service-*/types.ts`. Use `getService(ctx, Services.X)` (may be undefined) or `requireService` (throws).
- **Config vs data**: user-editable config → `config/<plugin>/*.json` via `ConfigService` (hot-reload). Program data → `data/<plugin>/` via `createStore`/`createDB`/`ensureDataDir`. Never hard-code `process.cwd() + ...`.
- **Permission checks**: `ctx.isOwner(event)` / `isAdmin` / `isOwnerOrAdmin` — never parse QQ ids manually.
- **Package.json `mioku` field** accepts exactly `services` / `help` / `accessHooks`; unknown keys warn and are dropped.

## Docs

- `docs/` — current v1.0.0 docs (VitePress). `docs-v0/` is archived old docs — do NOT edit or reference it in the site.
- API reference is **generated**: `typedoc` reads `packages/mioku/src/index.ts` → `docs/reference/api/` (gitignored). To improve it, edit JSDoc comments in source, not the generated files. `docs:dev`/`docs:build` regenerate automatically.

## Verification & style

- Verify with `bunx tsc --noEmit` (repo root or `cd packages/mioku`) and `bun run docs:build`. No test suite; type-check + boot smoke are the guardrails.
- TypeScript ESM, bun runtime. **Default to no comments** — one-line JSDoc only where the *why* is non-obvious; keep type-level JSDoc short.
- `index.ts` = wiring only; split logic into focused files.
- `example/` is the author's running bot — not a clean reference project.
