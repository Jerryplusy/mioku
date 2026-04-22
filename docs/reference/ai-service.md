# AI Service

AI 服务，提供 AI 实例管理、提示词管理、Skills 管理等。

## AIService

> AI 服务接口，提供 AI 实例、Skill、ChatRuntime 管理

### 实例管理

#### create

创建一个新的 AI 实例。

> - `name`: 实例名称
> - `apiUrl`: API 地址
> - `apiKey`: API 密钥
> - `modelType`: 模型类型
>   返回: `Promise<AIInstance>` - AI 实例

#### get

获取指定名称的 AI 实例。

> - `name`: 实例名称
>   返回: `AIInstance | undefined` - AI 实例

#### list

列出所有 AI 实例名称。

> 返回: `string[]` - 所有实例名称

#### remove

删除指定名称的 AI 实例。

> - `name`: 实例名称
>   返回: `boolean` - 是否删除成功

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function create(options: {
  name: string;
  apiUrl: string;
  apiKey: string;
  modelType: "text" | "multimodal";
}): Promise<AIInstance>;
function get(name: string): AIInstance | undefined;
function list(): string[];
function remove(name: string): boolean;
```

</details>

### 默认实例

#### setDefault

设置默认 AI 实例。

> - `name`: 实例名称
>   返回: `boolean` - 是否设置成功

#### getDefault

获取默认 AI 实例。

> 返回: `AIInstance | undefined` - 默认实例

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function setDefault(name: string): boolean;
function getDefault(): AIInstance | undefined;
```

</details>

### Chat Runtime

#### registerChatRuntime

注册 ChatRuntime 对象。

> - `runtime`: ChatRuntime 对象
>   返回: `boolean` - 是否注册成功

#### getChatRuntime

获取已注册的 ChatRuntime 对象。

> 返回: `ChatRuntime | undefined` - ChatRuntime 对象

#### removeChatRuntime

移除已注册的 ChatRuntime 对象。

> 返回: `boolean` - 是否移除成功

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function registerChatRuntime(runtime: ChatRuntime): boolean;
function getChatRuntime(): ChatRuntime | undefined;
function removeChatRuntime(): boolean;
```

</details>

### Skill 管理

#### registerSkill

注册 AI Skill。

> - `skill`: AISkill 对象
>   返回: `boolean` - 是否注册成功

#### getSkill

获取指定名称的 Skill。

> - `skillName`: Skill 名称
>   返回: `AISkill | undefined` - Skill 对象

#### getAllSkills

获取所有已注册的 Skills。

> 返回: `Map<string, AISkill>` - 所有 Skills

#### removeSkill

移除指定名称的 Skill。

> - `skillName`: Skill 名称
>   返回: `boolean` - 是否移除成功

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function registerSkill(skill: AISkill): boolean;
function getSkill(skillName: string): AISkill | undefined;
function getAllSkills(): Map<string, AISkill>;
function removeSkill(skillName: string): boolean;
```

</details>

### 工具查询

#### getTool

获取指定名称的工具。

> - `toolName`: 工具名称
>   返回: `AITool | undefined` - 工具对象

#### getAllTools

获取所有已注册的工具。

> 返回: `Map<string, AITool>` - 所有工具

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getTool(toolName: string): AITool | undefined;
function getAllTools(): Map<string, AITool>;
```

</details>

---

## AIInstance

> AI 实例接口

### 文本生成

#### generateText

生成文本响应。

> - `prompt?`: 系统提示词
> - `messages`: 消息列表
> - `model?`: 模型名称
> - `temperature?`: 温度参数
> - `max_tokens?`: 最大 Token 数
>   返回: `Promise<string>` - 生成的文本

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function generateText(options: {
  prompt?: string;
  messages: TextMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<string>;
```

</details>

### 多模态生成

#### generateMultimodal

生成多模态响应。

> - `prompt?`: 系统提示词
> - `messages`: 多模态消息列表
> - `model?`: 模型名称
> - `temperature?`: 温度参数
> - `max_tokens?`: 最大 Token 数
>   返回: `Promise<string>` - 生成的文本

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function generateMultimodal(options: {
  prompt?: string;
  messages: MultimodalMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<string>;
```

</details>

### 工具生成

#### generateWithTools

使用工具生成响应。

> - `prompt?`: 系统提示词
> - `messages`: 消息列表
> - `model?`: 模型名称
> - `temperature?`: 温度参数
> - `maxIterations?`: 最大迭代次数
>   返回: `Promise<{ content: string, iterations: number, allToolCalls: ToolCallRecord[] }>` - 生成内容和工具调用记录

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function generateWithTools(options: {
  prompt?: string;
  messages: TextMessage[] | MultimodalMessage[];
  model?: string;
  temperature?: number;
  maxIterations?: number;
}): Promise<{
  content: string;
  iterations: number;
  allToolCalls: ToolCallRecord[];
}>;
```

</details>

### 完整调用

#### complete

执行完整补全请求。

> - `options`: CompleteOptions 对象
>   返回: `Promise<CompleteResponse>` - 完整响应

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function complete(options: CompleteOptions): Promise<CompleteResponse>;
```

</details>

### 提示词管理

#### registerPrompt

注册提示词。

> - `name`: 提示词名称
> - `prompt`: 提示词内容
>   返回: `boolean` - 是否注册成功

#### getPrompt

获取指定名称的提示词。

> - `name`: 提示词名称
>   返回: `string | undefined` - 提示词内容

#### getAllPrompts

获取所有已注册的提示词。

> 返回: `Record<string, string>` - 所有提示词

#### removePrompt

移除指定名称的提示词。

> - `name`: 提示词名称
>   返回: `boolean` - 是否移除成功

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function registerPrompt(name: string, prompt: string): boolean;
function getPrompt(name: string): string | undefined;
function getAllPrompts(): Record<string, string>;
function removePrompt(name: string): boolean;
```

</details>

---

## 类型定义

### TextMessage

> 文本消息

```typescript
interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

> - `role`: 消息角色
> - `content`: 消息内容

### MultimodalMessage

> 多模态消息

```typescript
interface MultimodalMessage {
  role: "system" | "user" | "assistant";
  content: string | MultimodalContentItem[];
}
```

> - `role`: 消息角色
> - `content`: 消息内容或内容项数组

### MultimodalContentItem

> 多模态消息内容项

```typescript
interface MultimodalContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}
```

> - `type`: 内容类型
> - `text?`: 文本内容
> - `image_url?`: 图片URL对象

### CompleteOptions

> 原始补全请求参数

```typescript
interface CompleteOptions {
  model?: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  executableTools?: SessionToolDefinition[];
  executableToolsProvider?: () => SessionToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  maxIterations?: number;
  stream?: boolean;
  onTextDelta?: (delta: string) => void | Promise<void>;
}
```

> - `model?`: 模型名称
> - `messages`: 消息列表
> - `tools?`: 工具定义
> - `executableTools?`: 可执行工具
> - `executableToolsProvider?`: 动态获取工具函数
> - `temperature?`: 温度参数
> - `max_tokens?`: 最大 Token 数
> - `maxIterations?`: 最大迭代次数
> - `stream?`: 是否流式输出
> - `onTextDelta?`: 流式文本回调

### CompleteResponse

> 原始补全响应

```typescript
interface CompleteResponse {
  content: string | null;
  reasoning: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  raw: ChatCompletionMessageParam;
  iterations?: number;
  allToolCalls?: ToolCallRecord[];
  turnMessages?: ChatCompletionMessageParam[];
}
```

> - `content`: 文本响应内容
> - `reasoning`: 推理内容
> - `toolCalls`: 工具调用列表
> - `raw`: 原始响应消息
> - `iterations?`: 迭代次数
> - `allToolCalls?`: 所有工具调用记录
> - `turnMessages?`: 本轮消息列表

### ToolCallRecord

> 工具调用记录

```typescript
interface ToolCallRecord {
  name: string;
  arguments: any;
  result: any;
}
```

> - `name`: 工具名称
> - `arguments`: 调用参数
> - `result`: 调用结果

### ChatRuntime

> 对话运行时

```typescript
interface ChatRuntime {
  requestInformation(
    options: ChatRuntimeInformationRequestOptions,
  ): Promise<ChatRuntimeResult>;
  generateNotice(options: ChatRuntimeNoticeOptions): Promise<ChatRuntimeResult>;
}
```

> - `requestInformation`: 请求用户信息
> - `generateNotice`: 生成通知

### AITool

> AI 工具定义

```typescript
interface AITool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, event?: any) => Promise<any> | any;
}
```

> - `name`: 工具名称
> - `description`: 工具描述
> - `parameters`: 参数定义
> - `handler`: 处理函数

### AISkill

> AI Skill 定义

```typescript
interface AISkill {
  name: string;
  description: string;
  permission?: SkillPermissionRole;
  tools: AITool[];
}
```

> - `name`: Skill 名称
> - `description`: Skill 描述
> - `permission?`: Skill 权限，默认 `member`
> - `tools`: 工具列表

```typescript
type SkillPermissionRole = "owner" | "admin" | "member";
```

> - `owner`: mioki 主人
> - `admin`: mioki 管理 + 群管 + 群主
> - `member`: 普通成员
