# 在插件中使用 AI

## 声明服务

先在插件的 `package.json` 里声明依赖

```json
{
  "mioku": {
    "services": ["ai"]
  }
}
```

然后在 `index.ts` 里读取服务

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "release-note",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
  },
});
```

> [!TIP]
> 大部分插件不需要自己创建 AI 实例
>
> 正常情况下，直接拿默认实例即可。默认实例由 AI 服务根据 WebUI 中的提供商配置自动创建，
> `chat` 插件在启动时会确保 `main` 实例被设为默认

## 获取默认 AI 实例

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "release-note",
  async setup(ctx) {  //[!code focus:4]
    const aiService = ctx.services?.ai as AIService | undefined;
    const ai = aiService?.getDefault();
  },
});
```

## 使用默认实例生成文本

最常见的用法就是：给一段明确提示词，让 AI 直接返回可发送的文本

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "release-note",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const ai = aiService?.getDefault();
    if (!ai) return;

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      if (!text.startsWith("/润色公告 ")) {
        return;
      }

      const draft = text.slice("/润色公告 ".length).trim();
      if (!draft) {
        await event.reply("请先给我一段公告草稿");
        return;
      }

      const polished = await ai.generateText({
        prompt: [
          "你是群公告编辑助手。",
          "保留原意，不要编造新事实",
          "输出 2 到 4 行，语气明确",
        ].join("\n"),
        messages: [{ role: "user", content: draft }],
        temperature: 0.4,
        max_tokens: 180,
      });

      await event.reply(polished.trim());
    });
  },
});
```

当你省略 `model` 时，会使用该实例本身绑定的模型；默认实例通常对应 AI 服务的 `main` 角色绑定（在 WebUI 中配置）

## 使用多模态生成内容

如果你的插件要同时给模型传文字和图片，使用 `generateMultimodal()`

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "poster-review",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const ai = aiService?.getDefault();
    if (!ai) return;

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      const match = text.match(/^\/检查海报\s+(https?:\/\/\S+)$/);
      if (!match) {
        return;
      }

      const imageUrl = match[1];
      const result = await ai.generateMultimodal({
        prompt: [
          "你是活动运营助手。",
          "请从海报中提取活动名称、时间、地点。",
          "如果文案存在明显问题，也顺手指出来。",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "请检查这张活动海报" },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.2,
      });

      await event.reply(result.trim() || "没有识别到有效内容");
    });
  },
});
```

## 带工具调用的内容生成

如果你希望模型不只是**写字**，而是**决定什么时候调用插件能力**，用 `complete()`，并传入 `executableTools`

```typescript
import { definePlugin } from "mioki";
import type { AIService, AITool } from "mioku";

export default definePlugin({
  name: "web-ask",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const ai = aiService?.getDefault();
    if (!ai) return;

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      const [, url, question] = match;

      const response = await ai.complete({
        temperature: 0.2,
        maxIterations: 4,
        messages: [
          {
            role: "system",
            content: [
              "你是网页信息整理助手。",
              "先调用工具读取网页，再根据网页内容回答。",
              "如果网页信息不足，就明确说明。",
            ].join("\n"),
          },
          {
            role: "user",
            content: `${text}`,
          },
        ],
        executableTools: [
          {
            name: "read_webpage",
            tool: {
              name: "read_webpage",
              description: "下载网页并提取标题和正文文本",
              parameters: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    description: "要读取的网页地址",
                  },
                },
                required: ["url"],
              },
              handler: async (args) => {
                const targetUrl = String(args?.url || "").trim();
                if (!targetUrl) {
                  return { success: false, error: "missing url" };
                }

                const resp = await fetch(targetUrl);
                const html = await resp.text();
                const title =
                  html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ||
                  "";
                const plainText = html
                  .replace(/<script[\s\S]*?<\/script>/gi, " ")
                  .replace(/<style[\s\S]*?<\/style>/gi, " ")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 6000);

                return {
                  success: true,
                  url: targetUrl,
                  title,
                  content: plainText,
                };
              },
            },
          },
        ],
      });

      await event.reply(response.content || "没有拿到可用结果");
    });
  },
});
```

## 使用 `chat` 运行时

`chat-runtime` 不是普通文本生成接口。
它是 `chat` 插件注册到 `ai` 服务上的一层运行时能力，作用是：

- 复用 `chat` 插件当前的人设
- 复用最近对话上下文
- 复用 `chat` 插件自己的发送逻辑

> [!TIP]
> 换句话讲，你的插件可以通过 `chat` 运行时通过 `chat` 插件和用户自然地对话

```typescript
const aiService = ctx.services?.ai as AIService | undefined;
const chatRuntime = aiService?.getChatRuntime();

if (!chatRuntime) {
  ctx.logger.warn("chat-runtime 不可用，请先启用 chat 插件");
  return;
}
```

> [!IMPORTANT]
> `chat-runtime` 由 `chat` 插件注册。
> 如果没启用 `chat` 插件，或者聊天插件初始化失败，`getChatRuntime()` 会返回 `undefined`。

### 用聊天人设发通知

一般用 `generateNotice()`，这个方法的目标很简单，就是让当前人格把这件事自然地说出来

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "video-jobs",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const chatRuntime = aiService?.getChatRuntime();
    if (!chatRuntime) return;

    async function notifyJobFinished(event: any, jobId: string) {
      await chatRuntime.generateNotice({
        event,
        instruction: `告诉用户：视频转码已经完成，现在可以发送 /下载 ${jobId} 获取结果`,
        send: true,
      });
    }
  },
});
```

如果你想先预览文本，不立即发送，可以传 `send: false`，然后读取返回值里的 `messages` 继续处理

### 用聊天人设向用户追问缺失信息

询问场景用 `requestInformation()`。
它内部会额外挂一个**提交答案**的工具，让模型在信息足够时把结构化结果交回来。如果信息不够，它就继续追问

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";

export default definePlugin({
  name: "reminder",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const chatRuntime = aiService?.getChatRuntime();
    if (!chatRuntime) return;

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      if (text !== "/提醒我") {
        return;
      }

      const result = await chatRuntime.requestInformation({
        event,
        task: "帮当前用户补全创建提醒任务所需的信息",
        schema: {
          type: "object",
          properties: {
            time: {
              type: "string",
              description: "提醒时间，例如 今天 23:30、明天早上 8 点",
            },
            content: {
              type: "string",
              description: "提醒内容",
            },
            repeat: {
              type: "string",
              description: "可选，重复规则，例如 每周一到周五",
            },
          },
          required: ["time", "content"],
        },
        send: true,
      });

      const info = result.collectedInfo;
      if (!info?.isComplete || !info.data) {
        return;
      }

      await event.reply(
        `提醒已创建：${info.data.time} - ${info.data.content}`,
      );
    });
  },
});
```

## 默认 AI 实例和 `chat-runtime` 的区别

| 场景                     | 推荐方式                                | 原因                     |
|------------------------|-------------------------------------|------------------------|
| 总结文本、改写公告、解析参数         | 默认 AI 实例                            | 你完全控制提示词、消息和工具         |
| 让模型调用插件里的本地工具          | 默认 AI 实例 + `complete()`             | 你可以传 `executableTools` |
| 想让消息保持 `chat` 插件的人设和语气 | `chat-runtime.generateNotice()`     | 直接复用聊天人格和上下文           |
| 想让聊天人格代你向用户补齐字段        | `chat-runtime.requestInformation()` | 自带提交答案工具和追问流程          |

- 默认 AI 实例更像**你自己在直接调模型**
- `chat-runtime` 更像**请聊天插件代你开口**

## 注册 AI 技能

如果你想把插件能力暴露给 AI，在 `setup()` 中通过工厂函数创建 `AISkill[]`，然后用 `aiService.registerSkill()` 注册。

提供技能可以让 `chat` 插件中的 AI 使用插件中的功能。

### 编写技能工厂

在 `skills/<name>.ts` 中编写接受依赖的工厂函数，返回 `AISkill` 或 `AISkill[]`：

```typescript
import type { AISkill } from "mioku";

export function createNoticeSkill(): AISkill {
  return {
    name: "notice_center",
    description: "通知中心工具",
    permission: "member",
    tools: [
      {
        name: "push_notice",
        description: "推送一条站内通知",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
        handler: async (args, runtimeCtx) => {
          const ctx = runtimeCtx?.ctx;
          // 从 ctx.services 拿服务
          return { ok: true };
        },
      },
    ],
  };
}
```

### 在 `setup()` 中注册

```typescript
import { definePlugin } from "mioki";
import type { AIService } from "mioku";
import { createNoticeSkill } from "./skills/notice";

export default definePlugin({
  name: "notice-center",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;

    // ... 初始化其他依赖 ...

    if (aiService) {
      aiService.registerSkill(createNoticeSkill());
    }

    return () => {
      if (aiService) {
        aiService.removeSkill("notice_center");
      }
    };
  },
});
```

### 使用闭包捕获运行时对象

如果技能需要访问 `setup()` 中创建的对象（管理器、客户端、缓存等），直接把依赖传给工厂函数，工厂通过闭包捕获即可。不再需要通过 `runtime.ts` 桥接：

```typescript
// skills/notice.ts
import type { AISkill } from "mioku";
import type { QueueManager } from "../queue-manager";

export function createNoticeSkill(queue: QueueManager, webhookUrl: string): AISkill {
  return {
    name: "notice_center",
    description: "通知中心工具",
    tools: [
      {
        name: "push_notice",
        description: "推送一条站内通知",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
        handler: async (args) => {
          // 闭包中直接使用 queue 和 webhookUrl
          return queue.push({
            title: args.title,
            content: args.content,
            webhookUrl,
          });
        },
      },
    ],
  };
}
```

```typescript
// index.ts
import { definePlugin } from "mioki";
import type { AIService } from "mioku";
import { QueueManager } from "./queue-manager";
import { createNoticeSkill } from "./skills/notice";

export default definePlugin({
  name: "notice-center",
  async setup(ctx) {
    const aiService = ctx.services?.ai as AIService | undefined;
    const queue = new QueueManager(ctx.logger);
    const webhookUrl = process.env.NOTICE_WEBHOOK_URL || "";

    if (aiService) {
      aiService.registerSkill(createNoticeSkill(queue, webhookUrl));
    }

    return () => {
      if (aiService) {
        aiService.removeSkill("notice_center");
      }
    };
  },
});
```

### 注册多个技能

工厂可以返回数组，在 `for...of` 循环中逐个注册：

```typescript
// skills/index.ts
import type { AISkill } from "mioku";
import { createHelpSkill } from "./help";
import { createStatusSkill } from "./status";

export function createAllSkills(): AISkill[] {
  return [createHelpSkill(), createStatusSkill()];
}
```

```typescript
// index.ts
if (aiService) {
  for (const skill of createAllSkills()) aiService.registerSkill(skill);
}

return () => {
  if (aiService) {
    aiService.removeSkill("help");
    aiService.removeSkill("status");
  }
};
```

- `AISkill.permission` 可选，支持 `member` / `admin` / `owner`，未填写默认 `member`
- 权限含义：`owner`=mioki 主人；`admin`=mioki 管理 + 群管 + 群主；`member`=普通成员
- 工具处理函数可以通过 `runtimeCtx?.ctx` 访问当前上下文
- 工具会以 `skillName.toolName` 的形式被识别
- `aiService.registerSkill()` 支持覆写（内部使用 `Map.set`），热重载时直接用新工厂创建即可替换旧的

如果 `chat` 插件启用了外部技能，它会在三处做权限校验：

- 提示词中的"已加载外部技能"列表会按触发用户权限过滤
- `load_skill` 时会检查触发用户是否满足 `AISkill.permission`
- 技能工具实际调用时会再次校验，权限不足会拒绝执行