# Repository Guidelines

## Project Structure & Module Organization
`app.ts` is the local entrypoint. Core framework code lives in `src/core/`, startup helpers live in `src/index.ts`, `src/config-loader.ts`, and `src/first-run-setup.ts`, and services live in `src/services/*`. User-facing plugins live in `plugins/*`. Runtime config belongs in `config/`, persistent data belongs in `data/`, and compiled output goes to `dist/`.

## Build, Test, and Development Commands
Install dependencies with `bun install`. Use `bun run start` to start Mioku once, `bun run dev` for watch mode, and `bun run build` before finishing changes. Root validation is currently `bun run build`.

## Architecture Rules
Mioku sits on top of `mioki`. `mioki` loads plugins and handles events; Mioku adds service discovery, plugin metadata discovery, help registration, and AI skill loading.

Startup flow:
- `src/index.ts` discovers plugin metadata from `plugins/*/package.json`
- `plugins/boot` loads all services from `src/services/*`
- `src/core/plugin-artifact-registry.ts` auto-registers plugin help and plugin skills
- normal plugins then run their `setup()`

Current plugin contract:
- `index.ts` defines runtime behavior only: event handlers, config registration, service wiring, cleanup
- `package.json -> mioku.services` declares required services
- `package.json -> mioku.help` is the only place to add help content
- `skills.ts` is the only place to add plugin AI skills/tools
- do not define `help` or `skill` on the plugin object anymore

Help contract:
- Help is loaded automatically from `package.json -> mioku.help`
- Command items support `role?: "member" | "admin" | "owner" | "master"`
- Do not call `helpService.registerHelp(...)` from plugins unless you are changing the framework itself

Skill/tool contract:
- Global AI tools are exported from `plugins/<name>/skills.ts`
- `skills.ts` should default-export `AISkill[]`
- Tools are auto-loaded by `src/core/plugin-artifact-registry.ts`
- Do not call `aiService.registerSkill(...)` from normal plugins anymore

`runtime.ts` convention:
- Use `runtime.ts` when `skills.ts` needs access to objects created during `setup()`, such as `ctx`, service APIs, loop managers, or cached runtime state
- `skills.ts` is imported by the framework outside plugin `setup()`, so it cannot depend on `setup()` local variables or closures
- `runtime.ts` is the bridge between `index.ts` and `skills.ts`
- Keep pure reusable logic in `shared.ts` or `utils.ts`; keep mutable process state in `runtime.ts`

Service contract:
- Services live in `src/services/<name>/index.ts`
- Services implement `MiokuService` with `name`, `version`, `api`, `init()`, and optional `dispose()`
- Service APIs are exposed to plugins through `ctx.services.<name>`

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation, double quotes, and semicolons. Prefer small focused modules. Keep plugin and service names aligned with directory names. Use `skills.ts`, `runtime.ts`, and `shared.ts` only when they actually match those responsibilities.

## Testing Guidelines
For changes in `src/`, `plugins/`, or `src/services/`, run `bun run build`. If behavior changes, also verify the affected startup path or command flow locally.

## Commit & Pull Request Guidelines
Follow lowercase Conventional Commit prefixes such as `feat:`, `fix:`, and `refactor:`. Keep each commit focused. PRs should describe the behavior change, note config changes, and include screenshots for UI or help-page rendering changes.

## Security & Configuration Tips
Do not commit secrets or machine-local state from `config/`, `data/`, or generated auth files. Be careful when testing first-run flows because local config may be created or rewritten.
