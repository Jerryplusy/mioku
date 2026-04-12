# CLAUDE.md

This file provides repository-specific instructions for coding agents working on Mioku.

## What Mioku Is

Mioku extends `mioki`.

- `mioki` handles bot connections, plugin execution, and event dispatch.
- Mioku adds plugin metadata discovery, service discovery/loading, help auto-registration, and AI skill auto-loading.

Treat the checked-out source as the source of truth when docs and code differ.

## Key Commands

```bash
bun install
bun run start
bun run dev
bun run build
```

Use `bun run build` as the default validation step after edits in `src/`, `plugins/`, or `src/services/`.

## Repository Layout

- `app.ts`: local entrypoint
- `src/index.ts`: Mioku startup orchestration
- `src/core/`: framework infrastructure
- `src/services/*`: built-in services
- `plugins/*`: user-facing plugins
- `config/`: runtime config
- `data/`: persistent runtime data
- `temp/`: temporary artifacts such as screenshots
- `dist/`: TypeScript build output

## Startup Flow

The real startup flow is:

1. `app.ts` starts Mioku.
2. `src/index.ts` discovers plugins from `plugins/*/package.json`.
3. `src/index.ts` discovers services from `src/services/*/package.json`.
4. Mioku checks for missing services declared by plugins.
5. `mioki` starts.
6. `plugins/boot` runs first because it has `priority: -Infinity`.
7. `serviceManager.loadAllServices(ctx)` initializes all discovered services.
8. `registerPluginArtifacts(ctx)` auto-registers:
   - help manifests from `package.json -> mioku.help`
   - plugin AI skills from `skills.ts` or `skills.js`
9. Normal plugins continue running under `mioki`.

Important consequence:

- normal plugins should not manually self-register help
- normal plugins should not manually self-register AI skills

## Current Plugin Contract

For normal plugins, responsibilities are split across files.

### `package.json`

Use it for declarative metadata:

- npm package name
- version
- description
- `main`
- `mioku.services`
- `mioku.help`

Example:

```json
{
  "name": "mioku-plugin-example",
  "version": "1.0.0",
  "description": "Example plugin",
  "main": "index.ts",
  "mioku": {
    "services": ["config", "ai"],
    "help": {
      "title": "示例插件",
      "description": "示例说明",
      "commands": [
        {
          "cmd": "/example",
          "desc": "执行示例命令",
          "role": "member"
        }
      ]
    }
  }
}
```

Rules:

- `mioku.services` declares required services
- `mioku.help` is the only supported place for plugin help metadata
- do not invent `mioku.skill`

### `index.ts`

Use it for runtime behavior only:

- service lookup via `ctx.services`
- config registration
- event handlers
- scheduled jobs
- runtime initialization
- cleanup

Use the real repository pattern:

```ts
import { definePlugin } from "mioki";
import type { ConfigService } from "../../src/services/config/tpyes";

export default definePlugin({
  name: "example",
  version: "1.0.0",
  description: "Example plugin",

  async setup(ctx) {
    const configService = ctx.services?.config as ConfigService | undefined;

    if (configService) {
      await configService.registerConfig("example", "base", {
        enabled: true,
      });
    }

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      if (text !== "/example") {
        return;
      }
      await event.reply("ok");
    });

    return () => {
      ctx.logger.info("example unloaded");
    };
  },
});
```

Do not put these on the plugin object:

- `help`
- `skill`

### `skills.ts`

Use it for global plugin AI tools.

- default-export `AISkill[]`
- keep handlers deterministic and small
- use repository types from `src/core/types.ts` or `src/index.ts`
- do not close over setup-local state

Example:

```ts
import type { AISkill } from "../../src";

const skills: AISkill[] = [
  {
    name: "example",
    description: "Example plugin tools",
    tools: [
      {
        name: "ping",
        description: "Return a simple status message",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        handler: async () => {
          return { ok: true };
        },
      },
    ],
  },
];

export default skills;
```

Do not call `aiService.registerSkill(...)` from normal plugins. Mioku loads plugin skills automatically through `src/core/plugin-artifact-registry.ts`.

### `runtime.ts`

Use `runtime.ts` only when `skills.ts` needs access to state created during `setup()`.

Why:

- `skills.ts` is imported by the framework outside plugin `setup()`
- it cannot safely depend on setup-local closures

Pattern:

```ts
export interface ExampleRuntimeState {
  ctx?: any;
  cache?: Map<string, string>;
}

const runtimeState: ExampleRuntimeState = {};

export function setExampleRuntimeState(next: ExampleRuntimeState) {
  Object.assign(runtimeState, next);
  return runtimeState;
}

export function getExampleRuntimeState() {
  return runtimeState;
}

export function resetExampleRuntimeState() {
  for (const key of Object.keys(runtimeState) as Array<
    keyof ExampleRuntimeState
  >) {
    delete runtimeState[key];
  }
}
```

Use `shared.ts` or `utils.ts` for pure reusable logic. Keep mutable state in `runtime.ts`.

## Help Contract

Help is auto-loaded from `package.json -> mioku.help`.

Command item role is:

```ts
type CommandRole = "master" | "admin" | "owner" | "member";
```

Do not call `helpService.registerHelp(...)` from normal plugins unless you are explicitly changing Mioku framework behavior.

## Service Contract

Services live under `src/services/<name>/`.

Each service exports a `MiokuService`:

```ts
export interface MiokuService {
  name: string;
  version: string;
  description?: string;
  init(): Promise<void>;
  api: Record<string, any>;
  dispose?(): Promise<void>;
}
```

Typical shape:

```ts
const demoService: MiokuService = {
  name: "demo",
  version: "1.0.0",
  description: "Demo service",
  api: {} as DemoServiceAPI,

  async init() {
    this.api = {
      ping() {
        return "pong";
      },
    };
  },
};

export default demoService;
```

How services are consumed:

1. Plugin declares dependency in `package.json -> mioku.services`
2. Plugin reads API from `ctx.services?.<name>`

Example:

```ts
import type { ScreenshotService } from "../../src/services/screenshot/types";

const screenshotService = ctx.services?.screenshot as
  | ScreenshotService
  | undefined;
```

## Built-in Non-Legacy Services

Current non-Minecraft services in this repository:

- `ai`
- `config`
- `help`
- `screenshot`
- `webui`

Ignore `plugins/minecraft` and `src/services/minecraft` unless the task explicitly targets them.

### `ai`

Primary capabilities:

- create named AI instances
- set/get default AI instance
- register/query skills
- register/get chat runtime
- run `generateText(...)`, `generateMultimodal(...)`, `generateWithTools(...)`, and `complete(...)`

Notes:

- plugin skills are auto-loaded from `skills.ts`
- `chat-runtime` is registered by the `chat` plugin
- executable tool loops go through `complete({ executableTools })`

### `config`

Primary capabilities:

- `registerConfig(...)`
- `updateConfig(...)`
- `getConfig(...)`
- `getPluginConfigs(...)`
- `onConfigChange(...)`

Notes:

- config files live under `config/<plugin>/<name>.json`
- existing config is merged with defaults on registration
- the current type file is actually named `src/services/config/tpyes.ts`

### `help`

Primary capabilities:

- `registerHelp(...)`
- `getHelp(...)`
- `getAllHelp()`
- `unregisterHelp(...)`

Framework code uses it for automatic help registration. Normal plugins usually should not.

### `screenshot`

Primary capabilities:

- `screenshot(html, options?)`
- `screenshotFromUrl(url, options?)`
- `cleanupTemp(olderThanMs?)`

Notes:

- temp screenshots live under `temp/screenshots`
- HTML screenshots inject Tailwind via CDN
- browser discovery differs by platform

### `webui`

Primary plugin-facing integration is usually `config.md`, not direct API calls.

Public API exposed today:

- `getSettings()`

The WebUI service also parses plugin `config.md` files. Field keys must use:

```text
<configName>.<jsonPath>
```

Supported config-page field types currently include:

- `text`
- `textarea`
- `number`
- `switch`
- `select`
- `multi-select`
- `secret`
- `json`

## Multi-Bot and Context Notes

When a plugin may run with multiple bot connections:

- avoid assuming `ctx.bot` is always the correct sender bot
- prefer `ctx.pickBot(ctx.self_id)` for outbound actions tied to the current event

Useful context members:

- `ctx.handle(...)`
- `ctx.text(event)`
- `ctx.match(...)`
- `ctx.segment`
- `ctx.logger`
- `ctx.cron(...)`
- `ctx.pickBot(...)`
- `ctx.isOwner(event)`
- `ctx.isAdmin(event)`

## Common Mistakes To Avoid

- do not manually call `aiService.registerSkill(...)` inside normal plugins
- do not manually call `helpService.registerHelp(...)` inside normal plugins
- do not add `help` or `skill` to the plugin object
- do not make `skills.ts` depend on setup-local variables
- do not put mutable runtime state into `shared.ts`
- do not treat legacy Minecraft code as the default service/plugin pattern
- do not “fix” `src/services/config/tpyes.ts` imports accidentally unless the task includes that rename

## Validation

After meaningful changes:

1. run `bun run build`
2. if behavior changed, test the affected startup path, command flow, or service interaction locally when practical

If you change repository conventions, update both `AGENTS.md` and `CLAUDE.md` in the same change.
