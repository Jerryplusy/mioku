# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

Read [AGENTS.md](./AGENTS.md) — it is the concise, authoritative guide for AI agents: project tiers, framework layout, architecture rules, and verification commands.

Key points in short:

- Plugin-based QQ bot framework, **self-contained core since v1.0.0** (no external `mioki` dependency).
- Package tiers: `mioku` (framework) / `mioku-adapter-*` (platform) / `mioku-plugin-*` (features) / `mioku-service-*` (capabilities).
- Bot methods come from the capability system; plugins call, adapters implement.
- Verify with `bunx tsc --noEmit` and `bun run docs:build`.
- `docs/` is current, `docs-v0/` is archived — never edit docs-v0.
