# CLAUDE.md

This file provides guidance to coding agents working in this repository.

## Project Overview

Mioku is a service-oriented bot framework built on top of [mioki](https://mioki.viki.moe/). `mioki` is responsible for plugin loading, bot lifecycle, and event dispatch. Mioku adds:

- service discovery and lifecycle management
- plugin metadata discovery from `plugins/*/package.json`
- automatic help registration from plugin manifests
- automatic AI skill loading from plugin `skills.ts`

The current architecture is intentionally split so that plugin runtime code, plugin help metadata, and plugin AI tools are not all mixed into one `index.ts`.

## Commands

```bash
# Development
bun run start
bun run dev

# Validation
bun run build
```

## Architecture

### Layered Model

```text
Plugins -> Services -> Core -> mioki
```

### Core Layer

`src/core/` contains the framework-level infrastructure:

- `types.ts`
  core interfaces such as `MiokuPlugin`, `MiokuService`, `AISkill`, `AITool`, and `PluginHelp`
- `plugin-manager.ts`
  discovers plugin metadata from `plugins/*/package.json`
- `service-manager.ts`
  loads services from `src/services/*`
- `plugin-artifact-registry.ts`
  registers plugin help and loads plugin skills after services are ready

### Service Layer

Services live in `src/services/*`.

Each service:
- has its own `package.json`
- exports a `MiokuService`
- exposes runtime APIs through `service.api`
- becomes available to plugins as `ctx.services.<name>`

Service shape:

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

Example pattern:

```ts
const myService: MiokuService = {
  name: "my-service",
  version: "1.0.0",
  api: {} as MyServiceAPI,

  async init() {
    this.api = new MyServiceImpl();
  },
};
```

### Plugin Layer

Plugins live in `plugins/*`.

A plugin now has up to four distinct responsibilities:

1. `package.json`
   declares metadata and help
2. `index.ts`
   handles runtime setup
3. `skills.ts`
   exports AI skills/tools
4. optional `runtime.ts` / `shared.ts`
   splits runtime state from reusable logic

This separation is intentional. Do not collapse everything back into one large `index.ts`.

## Startup Flow

1. `app.ts` starts Mioku
2. `src/index.ts` discovers plugin metadata and service metadata
3. mioki starts loading enabled plugins
4. `plugins/boot` runs first
5. `service-manager.loadAllServices(ctx)` initializes all services
6. `registerPluginArtifacts(ctx)` runs
7. Mioku:
   - reads `package.json -> mioku.help`
   - registers help into the help service
   - loads `plugins/*/skills.ts`
   - registers exported `AISkill[]` into the AI service
8. other plugins run their normal `setup()`

Important consequence:
- plugin help is no longer manually registered in normal plugins
- plugin AI skills are no longer manually registered in normal plugins

## Current Plugin Definition

`index.ts` should define only runtime behavior:

```ts
const myPlugin: MiokuPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  services: ["config", "ai"],

  async setup(ctx) {
    const configService = ctx.services?.config as ConfigService | undefined;

    if (configService) {
      await configService.registerConfig("my-plugin", "base", BASE_CONFIG);
    }

    ctx.handle("message", async (event) => {
      // runtime behavior
    });

    return () => {
      // cleanup
    };
  },
};
```

Do not add these old fields to the plugin object:

- `help`
- `skill`

They are not part of the active plugin architecture anymore.

## How Help Is Added

Plugin help must be declared in `plugins/<name>/package.json`:

```json
{
  "mioku": {
    "services": ["ai", "config", "help"],
    "help": {
      "title": "AI 聊天",
      "description": "智能 AI 聊天插件",
      "commands": [
        {
          "cmd": "/重置会话",
          "desc": "重置自己的AI聊天记录",
          "role": "member"
        },
        {
          "cmd": "/重置群会话",
          "desc": "重置当前群的AI聊天记录",
          "role": "admin"
        }
      ]
    }
  }
}
```

Help command item schema:

```ts
type CommandRole = "master" | "admin" | "owner" | "member";

interface PluginHelp {
  title: string;
  description: string;
  commands: Array<{
    cmd: string;
    desc: string;
    usage?: string;
    role?: CommandRole;
  }>;
}
```

Notes:
- `role` is optional
- help is auto-registered by the framework
- normal plugins should not call `helpService.registerHelp(...)`

## How Skills and Tools Are Added

Global AI tools must be declared in `plugins/<name>/skills.ts`.

The file must default-export `AISkill[]`.

Example:

```ts
import type { AISkill } from "../../src";

const mySkills: AISkill[] = [
  {
    name: "weather",
    description: "Weather-related operations",
    tools: [
      {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string" }
          },
          required: ["city"]
        },
        handler: async (args, event) => {
          return { city: args.city, forecast: "sunny" };
        },
        returnToAI: true
      }
    ]
  }
];

export default mySkills;
```

Tool conventions:
- `name`
  tool name within the skill namespace
- `description`
  clear natural-language description for the model
- `parameters`
  JSON-schema-like input definition
- `handler(args, event?)`
  actual implementation
- `returnToAI`
  whether the tool result should be sent back into the model loop

Use `returnToAI: false` if the tool itself sends the message or performs the visible action directly.

## Why `runtime.ts` Exists

`runtime.ts` exists because `skills.ts` is loaded by the framework outside plugin `setup()`.

That means:
- `skills.ts` cannot rely on local variables created inside `setup()`
- `skills.ts` cannot safely close over `ctx`, service instances, loop managers, or runtime caches from `index.ts`

So when tools need access to runtime-created objects, the plugin should create a `runtime.ts`.

Typical `runtime.ts` responsibilities:
- store `ctx`
- store service instances
- store loop managers or controllers
- store mutable runtime state shared between `index.ts` and `skills.ts`

Pattern:

```ts
const runtimeState: RuntimeState = {};

export function setRuntimeState(next: RuntimeState) {
  Object.assign(runtimeState, next);
}

export function getRuntimeState() {
  return runtimeState;
}

export function resetRuntimeState() {
  // clear fields
}
```

Then:
- `index.ts` sets runtime state during `setup()`
- `skills.ts` reads runtime state inside tool handlers

## Why `shared.ts` Exists

`shared.ts` is different from `runtime.ts`.

Use `shared.ts` for pure reusable logic:
- HTML rendering
- formatting helpers
- request builders
- common serialization
- image generation helpers

Use `runtime.ts` for mutable process state.

Short version:
- `runtime.ts` = runtime objects and mutable state
- `shared.ts` = reusable pure logic

Do not mix them unless the plugin is tiny and the distinction truly adds no value.

## Current Architectural Rules

### Plugin `package.json`

`plugins/<name>/package.json` is responsible for:
- workspace metadata
- dependency declaration
- `mioku.services`
- `mioku.help`

Do not use `mioku.skill` anymore.

### Plugin `index.ts`

`plugins/<name>/index.ts` is responsible for:
- runtime setup
- accessing `ctx.services`
- registering config
- event handlers
- creating managers/controllers
- writing runtime state into `runtime.ts`
- cleanup

Do not define help or skill metadata here.

### Plugin `skills.ts`

`plugins/<name>/skills.ts` is responsible for:
- exporting `AISkill[]`
- defining tool descriptions and parameter schemas
- implementing tool handlers
- reading runtime state through `runtime.ts` when needed

### Services

`src/services/<name>/index.ts` is responsible for:
- exposing stable APIs to plugins
- owning service lifecycle
- not depending on plugin-local runtime state

## Common Mistakes To Avoid

- Do not manually call `aiService.registerSkill(...)` inside normal plugins
- Do not manually call `helpService.registerHelp(...)` inside normal plugins
- Do not put `skill` on the plugin object
- Do not put `help` on the plugin object
- Do not put runtime-only state directly into `skills.ts`
- Do not make `skills.ts` depend on `setup()` local variables
- Do not move pure rendering helpers into `runtime.ts`

## Recommended Plugin Skeleton

### `package.json`

```json
{
  "name": "mioku-plugin-example",
  "main": "index.ts",
  "mioku": {
    "services": ["ai", "config"],
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

### `index.ts`

```ts
const examplePlugin: MiokuPlugin = {
  name: "example",
  services: ["ai", "config"],

  async setup(ctx) {
    const configService = ctx.services?.config as ConfigService | undefined;

    if (configService) {
      await configService.registerConfig("example", "base", BASE_CONFIG);
    }

    setExampleRuntimeState({ ctx, configService });
  },
};
```

### `skills.ts`

```ts
const exampleSkills: AISkill[] = [
  {
    name: "example",
    description: "Example tools",
    tools: [
      {
        name: "do_example",
        description: "Run example action",
        parameters: {
          type: "object",
          properties: {}
        },
        handler: async () => {
          const { ctx } = getExampleRuntimeState();
          return "ok";
        },
        returnToAI: true
      }
    ]
  }
];
```

## Validation

When changing framework, plugin architecture, services, help rendering, or skill loading:
- run `bun run build`
- prefer checking the real startup path as well if behavior changed

If you update plugin conventions, update this file and `AGENTS.md` together so future agents do not regress to the old architecture.
