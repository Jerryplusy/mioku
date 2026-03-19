# Repository Guidelines

## Project Structure & Module Organization
`app.ts` is the entrypoint for local runs. Core framework logic lives in `src/core/`, bootstrap helpers in `src/config-loader.ts` and `src/first-run-setup.ts`, and shared declarations in `src/types/`. Built output goes to `dist/`. Feature plugins are kept in `plugins/` (for example `plugins/boot`, `plugins/chat`, `plugins/help`), while reusable services live in `src/services/` such as `ai`, `config`, `help`, `screenshot`, and `webui`. Runtime configuration belongs under `config/`, and persistent runtime data belongs under `data/`.

## Build, Test, and Development Commands
Install dependencies with `bun install`. Use `bun run start` to start Mioku once, including first-run setup prompts when required. Use `bun run dev` for watch mode during local development. Run `bun run build` before opening a PR; this compiles the TypeScript project and is the current minimum validation for root changes. If you are working on WebUI setup or plugin installation flows, `./install-mioku.sh` is the relevant helper script.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation, double quotes, and semicolons, matching the existing root codebase. Prefer small modules with descriptive lowercase filenames such as `service-manager.ts` and `config-loader.ts`. Export named types and functions where practical, and keep plugin or service names aligned with their directory names. Format code with Prettier before submitting changes.

## Testing Guidelines
This repository does not currently expose a dedicated root automated test suite. For changes in `src/`, `plugins/`, or service packages, run `bun run build` and verify the affected startup or command path locally. When fixing regressions, add narrow validation where the package already supports it, and document any manual verification steps in the PR.

## Commit & Pull Request Guidelines
Follow the commit style already present in history: lowercase Conventional Commit prefixes such as `feat:`, `fix:`, and `refactor:` with concise summaries. Keep each commit focused on one change. PRs should describe the behavior change, note any config updates under `config/`, link related issues when applicable, and include screenshots for WebUI changes.

## Security & Configuration Tips
Do not commit secrets or machine-local state from `config/`, `data/`, or generated auth files. Be careful when testing first-run setup because local config may be created or rewritten during startup.
