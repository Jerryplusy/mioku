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

> AI 对话基础配置

```typescript
interface ChatBaseConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  workingModel?: string;
  multimodalWorkingModel?: string;
  isMultimodal?: boolean;
  maxContextTokens?: number;
  temperature?: number;
  historyCount?: number;
  maxIterations?: number;
}
```

> - `apiUrl`: AI API 地址
> - `apiKey`: AI API 密钥
> - `model`: 主模型名称
> - `workingModel?`: 工作模型名称
> - `multimodalWorkingModel?`: 多模态工作模型
> - `isMultimodal?`: 是否启用多模态
> - `maxContextTokens?`: 最大上下文 Token 数
> - `temperature?`: 温度参数
> - `historyCount?`: 历史消息数量
> - `maxIterations?`: 最大迭代次数

`config/chat/settings.json`

### ChatSettingsConfig

> 对话设置

```typescript
interface ChatSettingsConfig {
  autoReply?: boolean;
  replyProbability?: number;
  replyDelay?: number;
  groupReply?: boolean;
  privateReply?: boolean;
  replyPermission?: "all" | "admin" | "owner";
  mentionsOnlyReply?: boolean;
  quotesOnlyReply?: boolean;
  keywordReply?: boolean;
  keywordReplyMode?: "any" | "all";
}
```

> - `autoReply?`: 是否自动回复
> - `replyProbability?`: 回复概率 0-1
> - `replyDelay?`: 回复延迟(毫秒)
> - `groupReply?`: 群聊是否回复
> - `privateReply?`: 私聊是否回复
> - `replyPermission?`: 回复权限
> - `mentionsOnlyReply?`: 仅回复 @ 消息
> - `quotesOnlyReply?`: 仅回复引用消息
> - `keywordReply?`: 是否启用关键词回复
> - `keywordReplyMode?`: 关键词匹配模式

`config/chat/personalization.json`

### ChatPersonalizationConfig

> 个性化配置

```typescript
interface ChatPersonalizationConfig {
  name?: string;
  persona?: string;
  greeting?: string;
  farewell?: string;
  birthdayGreeting?: boolean;
  recallReply?: boolean;
}
```

> - `name?`: 机器人昵称
> - `persona?`: 人设描述
> - `greeting?`: 入群欢迎语
> - `farewell?`: 退群告别语
> - `birthdayGreeting?`: 是否发送生日祝福
> - `recallReply?`: 是否回复撤回消息

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
  apiUrl: string;
  apiKey: string;
  model: string;
  workingModel?: string;
  multimodalWorkingModel?: string;
  isMultimodal?: boolean;
  maxContextTokens?: number;
  temperature?: number;
  historyCount?: number;
  maxIterations?: number;
}

interface ChatSettingsConfig {
  autoReply?: boolean;
  replyProbability?: number;
  replyDelay?: number;
  groupReply?: boolean;
  privateReply?: boolean;
  replyPermission?: "all" | "admin" | "owner";
  mentionsOnlyReply?: boolean;
  quotesOnlyReply?: boolean;
  keywordReply?: boolean;
  keywordReplyMode?: "any" | "all";
}

interface ChatPersonalizationConfig {
  name?: string;
  persona?: string;
  greeting?: string;
  farewell?: string;
  birthdayGreeting?: boolean;
  recallReply?: boolean;
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
