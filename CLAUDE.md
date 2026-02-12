# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mioku is a convenience framework built on top of [mioki](https://mioki.viki.moe/) (v0.15.0), providing a service-oriented architecture and AI Skill system for building QQ bot applications. It acts as a layer between plugins and the underlying mioki framework.

**Key distinction**: Mioku provides services and infrastructure; mioki handles plugin loading and event management.

## Commands

```bash
# Development
npm start              # Run the bot
npm run dev           # Run with hot reload
npm run build         # Compile TypeScript

# Type checking
npx tsc --noEmit      # Check types without emitting files
```

## Architecture

### Three-Layer Design

```
Plugins (功能层) → Services (服务层) → Core (核心层) → Mioki Framework
```

**Core Layer** (`src/core/`):
- `types.ts` - Type definitions for the entire framework
- `plugin-manager.ts` - Discovers plugin metadata from `plugins/*/package.json`
- `service-manager.ts` - Loads and manages service lifecycle

**Service Layer** (`src/services/`):
- Each service is an independent workspace with its own `package.json`
- Services implement `MiokuService` interface with `init()`, `api`, and optional `dispose()`
- Services are loaded by the boot plugin and accessed via `ctx.services.{name}`
- Built-in services: `ai`, `config`, `help`

**Plugin Layer** (`plugins/`):
- Each plugin is an independent workspace
- Plugins extend mioki's `MiokiPlugin` with Mioku-specific fields (`services`, `skill`, `help`)
- The `boot` plugin (priority: -Infinity) must run first to load all services
- Other plugins register their Skills and help info in their `setup()` function

### Critical: Plugin Context and `this`

**IMPORTANT**: In plugin `setup()` functions, DO NOT use `this` to reference the plugin object. The `this` context is unreliable in mioki's plugin loading system.

```typescript
// ❌ WRONG - this may not work
async setup(ctx: MiokiContext) {
  if (aiService && this.skill) {  // this is unreliable
    aiService.registerSkill(this.skill);
  }
}

// ✅ CORRECT - reference the plugin object directly
const myPlugin: MiokuPlugin = {
  name: "my-plugin",
  skill: { ... },
  async setup(ctx: MiokiContext) {
    if (aiService && myPlugin.skill) {  // reference by name
      aiService.registerSkill(myPlugin.skill);
    }
  }
};
```

### AI Skill System

The Skill system solves tool naming conflicts by providing namespaces:

**Structure**:
- Each plugin registers ONE Skill
- Each Skill contains multiple Tools
- Tool invocation format: `{skill_name}.{tool_name}`

**Example**:
```typescript
skill: {
  name: "chat",  // Skill name (usually matches plugin name)
  description: "Chat-related functionality",
  tools: [
    {
      name: "send_message",           // Tool name
      description: "Send a message",  // Called as: chat.send_message
      parameters: { ... },
      handler: async (args) => { ... },
      returnToAI: false  // Whether to return result to AI for further processing
    }
  ]
}
```

**Why this matters**: Two plugins can have tools with the same name without conflict:
- `chat.send_message` vs `notification.send_message`

### Startup Flow

1. `app.ts` loads local config and calls `start()` from `src/index.ts`
2. Mioku discovers plugin/service metadata (doesn't load them yet)
3. Mioku checks for missing service dependencies
4. Mioki framework starts and loads plugins by priority
5. **Boot plugin runs first** (`priority: -Infinity`):
   - Loads all services via `serviceManager.loadAllServices(ctx)`
   - Services initialize and expose their API via `ctx.services.{name}`
6. Other plugins load and:
   - Register their Skill to AI service
   - Register help info to help service
   - Set up message handlers

### Type System

**Key interfaces** (all in `src/core/types.ts`):

- `MiokuPlugin` - Extends mioki's plugin with `services`, `skill`, `help` fields
- `MiokuService` - Service definition with `init()`, `api`, `dispose()`
- `AISkill` - Contains `name`, `description`, and `tools[]`
- `AITool` - Individual tool with `handler` and `returnToAI` flag

**Important**: `MiokuPlugin` extends mioki's `MiokiPlugin` but adds custom fields. Mioki only recognizes `name`, `version`, `priority`, `setup`.

## Workspace Structure

This is a monorepo using npm workspaces:

```json
"workspaces": [
  "plugins/*",
  "src/services/*"
]
```

Each plugin and service has its own `package.json` and can have independent dependencies. When adding dependencies to a plugin/service, run `npm install` from that directory.

## Plugin Development

### Creating a Plugin

1. Create directory in `plugins/`
2. Add `package.json` with `mioku` field:
```json
{
  "name": "mioku-plugin-xxx",
  "mioku": {
    "services": ["ai", "config", "help"],
    "skill": {
      "name": "xxx",
      "description": "..."
    },
    "help": { ... }
  }
}
```
3. Create `index.ts` with plugin definition
4. Add plugin name to root `package.json` → `mioki.plugins` array
5. **Remember**: Reference the plugin object by name, not `this`, in `setup()`

### Plugin Registration Pattern

```typescript
import type { MiokuPlugin } from "../../src/core/types";
import type { AIService } from "../../src/services/ai";
import type { HelpService } from "../../src/services/help";
import type { MiokiContext } from "mioki";

const myPlugin: MiokuPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  services: ["ai", "help"],
  skill: { ... },
  help: { ... },

  async setup(ctx: MiokiContext) {
    // Register Skill
    const aiService = ctx.services?.ai as AIService | undefined;
    if (aiService && myPlugin.skill) {  // Use myPlugin, not this
      aiService.registerSkill(myPlugin.skill);
    }

    // Register help
    const helpService = ctx.services?.help as HelpService | undefined;
    if (helpService && myPlugin.help) {
      helpService.registerHelp(myPlugin.name, myPlugin.help);
    }

    // Set up message handlers
    ctx.handle("message", async (e) => {
      // Handle messages
    });

    // Return cleanup function
    return () => {
      // Cleanup resources
    };
  }
};

export default myPlugin;
```

## Service Development

Services implement `MiokuService` and are loaded by the boot plugin:

```typescript
import type { MiokuService } from "../../core/types";
import type { MiokiContext } from "mioki";

export interface MyServiceAPI {
  doSomething(): void;
}

const myService: MiokuService = {
  name: "my-service",
  version: "1.0.0",
  description: "...",
  api: {} as MyServiceAPI,

  async init(ctx: MiokiContext) {
    // Initialize service
    this.api = new MyServiceImpl();
  },

  async dispose() {
    // Cleanup
  }
};

export default myService;
```

Services are automatically discovered from `src/services/*/index.ts` and loaded by `service-manager.ts`.

## Configuration

Root `package.json` contains mioki configuration:

```json
{
  "mioki": {
    "prefix": "/",
    "log_level": "info",
    "owners": [123456789],
    "plugins": ["boot", "demo", "chat", "sign"],
    "napcat": [{ ... }]
  }
}
```

**Critical**: The `boot` plugin must always be first in the plugins array (or have the highest priority) to ensure services are loaded before other plugins.

## Common Patterns

### Accessing Services in Plugins

```typescript
// Type cast for proper intellisense
const aiService = ctx.services?.ai as AIService | undefined;
const configService = ctx.services?.config as ConfigService | undefined;
const helpService = ctx.services?.help as HelpService | undefined;
```

### Tool Handler Pattern

```typescript
{
  name: "my_tool",
  description: "...",
  parameters: {
    type: "object",
    properties: { ... },
    required: [...]
  },
  handler: async (args) => {
    // Tool logic
    return result;
  },
  returnToAI: true  // Set to true if AI should process the result
}
```

### Message Handling

```typescript
ctx.handle("message", async (e: any) => {
  const text = ctx.text(e);
  if (text === "/command") {
    await e.reply("Response");
  }
});
```

## Troubleshooting

**Plugins fail to load**: Check that:
1. Plugin exports a default object matching `MiokuPlugin` interface
2. Plugin is listed in root `package.json` → `mioki.plugins`
3. Plugin's `setup()` function doesn't use `this` (use plugin object name instead)
4. Required services are available (declared in plugin's `services` array)

**Services not available**: Ensure boot plugin runs first (priority: -Infinity or first in plugins array).

**Type errors**: Run `npx tsc --noEmit` to check. Common issues:
- Importing from wrong path (use `../../src/core/types` for plugins)
- Missing type imports from mioki (`MiokiContext` must come from "mioki")
- Using `this` in setup function (reference plugin object directly instead)

## Reference Documentation

- Mioki framework: https://mioki.viki.moe/
- Architecture details: See `ARCHITECTURE.md`
- Service examples: `src/services/ai/`, `src/services/config/`, `src/services/help/`
