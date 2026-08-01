# 配置文件 (Config Files)

Mioku 运行时配置文件定义。

## 配置文件结构

```
config/
├── mioku.json           # Mioki 核心配置
├── chat/
│   ├── base.json        # AI 对话基础配置
│   ├── settings.json   # 对话设置
│   └── personalization.json # 个性化配置
├── help/
│   └── *.json          # 帮助插件配置
├── webui/
│   └── *.json         # WebUI 配置
└── minecraft/
    └── *.json         # Minecraft 服务配置
```

## Mioki 配置

`config/mioku.json`

### MiokiConfig

> Mioki 核心配置

```typescript
interface MiokiConfig {
  owners: number[];
  admins: number[];
  napcat: NapCatInstanceConfig[];
  plugins?: string[];
  prefix?: string;
  error_push?: boolean;
  online_push?: boolean;
  log_level?: LogLevel;
  plugins_dir?: string;
  status_permission?: "all" | "admin-only";
}
```

> - `owners`: 主人 QQ 号列表
> - `admins`: 管理员 QQ 号列表
> - `napcat`: NapCat 连接配置数组
> - `plugins?`: 启用的插件列表
> - `prefix?`: 命令前缀
> - `error_push?`: 是否推送错误
> - `online_push?`: 是否推送上线消息
> - `log_level?`: 日志级别
> - `plugins_dir?`: 插件目录
> - `status_permission?`: 状态查看权限

### NapCatInstanceConfig

> NapCat 实例配置

```typescript
interface NapCatInstanceConfig {
  name?: string;
  protocol?: "ws" | "wss";
  port?: number;
  host?: string;
  token?: string;
}
```

> - `name?`: 实例名称
> - `protocol?`: 连接协议
> - `port?`: 端口号
> - `host?`: 主机地址
> - `token?`: 认证令牌

---

## Chat 插件配置

`config/chat/base.json`

### ChatBaseConfig

> AI 对话基础配置。
>
> 注意:AI 提供商、模型与角色绑定(main / working / vision)已由 **AI 服务**统一管理(通过 WebUI 配置,持久化在 AI 服务侧),不再写在 `chat/base.json`。因此这里不再有 `apiUrl` / `apiKey` / `model` 等字段。

```typescript
interface ChatBaseConfig {
  maxContextTokens?: number;
  temperature?: number;
  historyCount?: number;
  maxIterations?: number;
  enableMediaRecognition?: boolean;
}
```

> - `maxContextTokens?`: 最大上下文 Token 数
> - `temperature?`: 采样温度
> - `historyCount?`: 注入的历史消息条数
> - `maxIterations?`: 工具调用最大迭代次数
> - `enableMediaRecognition?`: 是否启用图片 / 视频识别

`config/chat/settings.json`

### ChatSettingsConfig

> 对话设置

```typescript
interface ChatSettingsConfig {
  searxng?: SearxngConfig;
  webReader?: WebReaderConfig;
  audio?: AudioConfig;
  blacklistGroups?: number[];
  whitelistGroups?: number[];
  mediaAnalysisBlacklistUsers?: number[];
  maxSessions?: number;
  enableExternalSkills?: boolean;
  allowedExternalSkills?: string[];
  stream?: boolean;
  enableTypingDelay?: boolean;
  typingDelayMaxTotalMs?: number;
  enableMarkdownScreenshot?: boolean;
  debug?: boolean;
  outputLengthConstraintStrength?: "low" | "medium" | "high";
  toolCallConstraintStrength?: "low" | "medium" | "high";
  emojiUsageConstraintStrength?: "low" | "medium" | "high";
  audioUsageConstraintStrength?: "low" | "medium" | "high";
  markdownUsageConstraintStrength?: "low" | "medium" | "high";
  groupStructuredHistoryTtlMs?: number;
  nicknames?: string[];
  cooldownAfterReplyMs?: number;
  aiRequestLimits?: AIRequestLimitConfig;
  dynamicDelay?: DynamicDelayConfig;
}
```

> - `searxng?`: SearXNG 联网搜索配置
> - `webReader?`: 网页阅读工具配置
> - `audio?`: 语音消息(合成)配置
> - `blacklistGroups?`: 禁用对话的群号列表
> - `whitelistGroups?`: 仅允许对话的群号列表(留空表示全部允许)
> - `mediaAnalysisBlacklistUsers?`: 禁用媒体识别的用户列表
> - `maxSessions?`: 最大并发会话数
> - `enableExternalSkills?`: 是否允许调用外部插件注册的 Skills
> - `allowedExternalSkills?`: 允许的外部 Skill 白名单(留空表示全部)
> - `stream?`: 是否流式输出
> - `enableTypingDelay?`: 是否模拟打字延迟
> - `typingDelayMaxTotalMs?`: 打字延迟总时长上限(毫秒)
> - `enableMarkdownScreenshot?`: 长文本是否转 Markdown 截图发送
> - `debug?`: 调试模式
> - `outputLengthConstraintStrength?`: 输出长度约束强度
> - `toolCallConstraintStrength?`: 工具调用约束强度
> - `emojiUsageConstraintStrength?`: 表情使用约束强度
> - `audioUsageConstraintStrength?`: 语音使用约束强度
> - `markdownUsageConstraintStrength?`: Markdown 使用约束强度
> - `groupStructuredHistoryTtlMs?`: 群结构化历史缓存有效期(毫秒)
> - `nicknames?`: 触发对话的昵称列表
> - `cooldownAfterReplyMs?`: 单次回复后的冷却时间(毫秒)
> - `aiRequestLimits?`: AI 请求频率限制(每分钟)
> - `dynamicDelay?`: 根据互动活跃度动态调整回复延迟

上述 `SearxngConfig` / `WebReaderConfig` / `AudioConfig` / `AIRequestLimitConfig` / `DynamicDelayConfig` 均为嵌套对象,字段见插件 `types.ts`。

`config/chat/personalization.json`

### ChatPersonalizationConfig

> 个性化配置

```typescript
interface ChatPersonalizationConfig {
  persona: string;
  emotion: EmotionConfig;
  replyStyle: ReplyStyleConfig;
  memory: MemoryConfig;
  topic: TopicConfig;
  planner: PlannerConfig;
  emoji: EmojiConfig;
  expression: ExpressionConfig;
  retention: RetentionConfig;
}
```

> - `persona`: 人设描述(会作为全局提示词注册到 AI 实例)
> - `emotion`: 情绪配置(默认情绪、刷新间隔、各情绪示例)
> - `replyStyle`: 回复风格配置
> - `memory`: 记忆检索配置
> - `topic`: 话题跟踪配置
> - `planner`: 空闲动作规划器配置
> - `emoji`: 表情包系统配置
> - `expression`: 表达学习配置
> - `retention`: 数据库定期清理配置

其中 `EmotionConfig` / `ReplyStyleConfig` / `MemoryConfig` / `TopicConfig` / `PlannerConfig` / `EmojiConfig` / `ExpressionConfig` / `RetentionConfig` 均为嵌套对象,字段见插件 `types.ts`。

---

## Help 插件配置

`config/help/*.json`

### HelpConfig

> 帮助插件配置

```typescript
interface HelpConfig {
  enableSearch?: boolean;
  showPermission?: "all" | "admin" | "owner";
}
```

> - `enableSearch?`: 是否启用搜索
> - `showPermission?`: 显示权限

---

## WebUI 插件配置

`config/webui/*.json`

### WebUIConfig

> WebUI 配置

```typescript
interface WebUIConfig {
  port?: number;
  host?: string;
  enableAuth?: boolean;
  enablePluginInstall?: boolean;
  enablePluginUpdate?: boolean;
  packageManager?: "npm" | "pnpm" | "bun";
}
```

> - `port?`: 端口号
> - `host?`: 主机地址
> - `enableAuth?`: 是否启用认证
> - `enablePluginInstall?`: 是否允许安装插件
> - `enablePluginUpdate?`: 是否允许更新插件
> - `packageManager?`: 包管理器

---

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface MiokiConfigRoot {
  mioki: MiokiConfig;
}

interface MiokiConfig {
  owners: number[];
  admins: number[];
  napcat: NapCatInstanceConfig[];
  plugins?: string[];
  prefix?: string;
  error_push?: boolean;
  online_push?: boolean;
  log_level?: LogLevel;
  plugins_dir?: string;
  status_permission?: "all" | "admin-only";
}

interface NapCatInstanceConfig {
  name?: string;
  protocol?: "ws" | "wss";
  port?: number;
  host?: string;
  token?: string;
}

interface ChatBaseConfig {
  maxContextTokens?: number;
  temperature?: number;
  historyCount?: number;
  maxIterations?: number;
  enableMediaRecognition?: boolean;
}

interface ChatSettingsConfig {
  searxng?: SearxngConfig;
  webReader?: WebReaderConfig;
  audio?: AudioConfig;
  blacklistGroups?: number[];
  whitelistGroups?: number[];
  mediaAnalysisBlacklistUsers?: number[];
  maxSessions?: number;
  enableExternalSkills?: boolean;
  allowedExternalSkills?: string[];
  stream?: boolean;
  enableTypingDelay?: boolean;
  typingDelayMaxTotalMs?: number;
  enableMarkdownScreenshot?: boolean;
  debug?: boolean;
  outputLengthConstraintStrength?: "low" | "medium" | "high";
  toolCallConstraintStrength?: "low" | "medium" | "high";
  emojiUsageConstraintStrength?: "low" | "medium" | "high";
  audioUsageConstraintStrength?: "low" | "medium" | "high";
  markdownUsageConstraintStrength?: "low" | "medium" | "high";
  groupStructuredHistoryTtlMs?: number;
  nicknames?: string[];
  cooldownAfterReplyMs?: number;
  aiRequestLimits?: AIRequestLimitConfig;
  dynamicDelay?: DynamicDelayConfig;
}

interface ChatPersonalizationConfig {
  persona: string;
  emotion: EmotionConfig;
  replyStyle: ReplyStyleConfig;
  memory: MemoryConfig;
  topic: TopicConfig;
  planner: PlannerConfig;
  emoji: EmojiConfig;
  expression: ExpressionConfig;
  retention: RetentionConfig;
}

interface HelpConfig {
  enableSearch?: boolean;
  showPermission?: "all" | "admin" | "owner";
}

interface WebUIConfig {
  port?: number;
  host?: string;
  enableAuth?: boolean;
  enablePluginInstall?: boolean;
  enablePluginUpdate?: boolean;
  packageManager?: "npm" | "pnpm" | "bun";
}

```

</details>
