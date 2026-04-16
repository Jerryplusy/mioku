# Repository Guidelines

## Project Structure & Module Organization
`app.ts` is the local entrypoint. Mioku startup lives in `src/index.ts`, `src/config-loader.ts`, and `src/first-run-setup.ts`. Framework infrastructure lives in `src/core/`. Built-in services live in `src/services/*`. User-facing plugins live in `plugins/*`. Runtime config belongs in `config/`, persistent data in `data/`, temporary screenshots in `temp/`, and compiled output in `dist/`.

## Build, Test, and Development Commands
Install dependencies with `bun install`. Use `bun run start` to start Mioku once, `bun run dev` for watch mode, and `bun run build` to validate TypeScript changes. For edits in `src/`, `plugins/`, or `src/services/`, the default validation target is `bun run build`.

## Architecture Rules
Mioku is a layer on top of `mioki`. `mioki` handles plugin execution, bot lifecycle, and event dispatch. Mioku adds plugin metadata discovery, service discovery/loading, automatic help registration, and automatic plugin AI skill loading.

Startup flow:
- `src/index.ts` discovers plugin metadata from `plugins/*/package.json`
- `src/index.ts` discovers service metadata from `src/services/*/package.json`
- `plugins/boot` loads all discovered services
- `src/core/plugin-artifact-registry.ts` auto-registers plugin help from `package.json -> mioku.help`
- `src/core/plugin-artifact-registry.ts` auto-loads plugin skills from `skills.ts` or `skills.js`
- normal plugins then run through `mioki`

Current plugin contract:
- `index.ts` contains runtime behavior only: handlers, config wiring, service usage, startup, cleanup
- `package.json -> mioku.services` declares required services
- `package.json -> mioku.help` is the only place to add help content
- `skills.ts` is the only place to add plugin AI skills/tools
- do not define `help` or `skill` on the plugin object
- do not call `helpService.registerHelp(...)` or `aiService.registerSkill(...)` from normal plugins unless changing framework internals
- simple plugins/services can stay in one focused file
- as complexity grows, split by responsibility into small files instead of growing one large `index.ts` or one large shared helper file

`runtime.ts` convention:
- use `runtime.ts` when `skills.ts` needs mutable state created during `setup()`
- `skills.ts` is imported outside plugin `setup()`, so it cannot depend on setup-local closures
- `shared.ts` / `utils.ts` are optional names for pure reusable logic, not mandatory files
- keep mutable process state in `runtime.ts`

Service contract:
- services live in `src/services/<name>/index.ts`
- services export a `MiokuService` with `name`, `version`, `api`, `init()`, and optional `dispose()`
- service APIs are exposed to plugins through `ctx.services.<name>`

Built-in non-legacy services:
- `ai`
- `config`
- `help`
- `screenshot`
- `webui`

Ignore legacy Minecraft plugin/service code unless the task explicitly targets it.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation, double quotes, and semicolons. Keep modules focused. Keep plugin and service names aligned with directory names. Use `skills.ts`, `runtime.ts`, `shared.ts`, and `utils.ts` only when they match those responsibilities.

## Testing Guidelines
Run `bun run build` after meaningful code changes. If behavior changes, also verify the affected startup path, command flow, or service integration locally when practical.

## Commit & Pull Request Guidelines
Follow lowercase Conventional Commit prefixes such as `feat:`, `fix:`, and `refactor:`. Keep commits focused. PRs should summarize behavior changes, call out config changes, and include screenshots for UI, config-page, or help-image changes.

## Security & Configuration Tips
Do not commit secrets or machine-local state from `config/`, `data/`, generated auth files, or local runtime caches. Be careful when testing first-run flows because they may rewrite local config. Note the current repository typo `src/services/config/tpyes.ts` when updating imports.
