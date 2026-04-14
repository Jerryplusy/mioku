# Mioki API

Mioki 框架提供的 API 和工具函数。

## 插件运行时状态

### getPluginRuntimeState

获取指定插件的运行时状态对象。如果该插件尚未写入状态，会返回一个空对象。

> - `pluginName`: 插件名
    >   返回: `T` - 插件运行时状态对象

### setPluginRuntimeState

向指定插件的运行时状态对象写入字段，适合在 `setup()` 中把队列、缓存、长连接客户端等对象挂进去。

> - `pluginName`: 插件名
> - `nextState`: 需要合并写入的状态
    >   返回: `T` - 合并后的运行时状态对象

### resetPluginRuntimeState

清空指定插件的运行时状态，适合在插件卸载时调用。

> - `pluginName`: 插件名
    >   返回: `void`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getPluginRuntimeState<T extends Record<string, any>>(
  pluginName: string,
): T;

function setPluginRuntimeState<T extends Record<string, any>>(
  pluginName: string,
  nextState: Partial<T>,
): T;

function resetPluginRuntimeState(pluginName: string): void;
```

</details>

## 工具函数 (Utils)

### 日志

#### getMiokiLogger

获取 Mioki 日志记录器。

> - `level`: 日志级别
>   返回: `Logger` - 日志记录器

#### getLogFilePath

获取日志文件路径。

> - `type?`: 日志类型
>   返回: `string` - 日志文件路径

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getMiokiLogger(level?: LogLevel): Logger;
function getLogFilePath(type?: "app" | "error" | "mioki"): string;
```

</details>

### 文件系统

#### fs

Node.js 文件系统模块。

> 返回: `FileSystemAdapter` - fs 适配器

#### path

Node.js 路径模块。

> 返回: `PathUtil` - 路径工具

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const fs: FileSystemAdapter;
const path: PathUtil;
```

</details>

### 字符串处理

#### md5

计算 MD5 哈希值。

> - `text`: 待加密文本
> - `encoding?`: 编码方式
>   返回: `Buffer | string` - 加密结果

#### base64Encode

进行 Base64 编码。

> - `str`: 待编码字符串
>   返回: `string` - Base64 编码结果

#### base64Decode

进行 Base64 解码。

> - `str`: 待解码字符串
> - `type?`: 解码类型
>   返回: `string | Buffer` - 解码结果

#### qs

将对象序列化为 URL 参数字符串。

> - `obj`: 待序列化对象
>   返回: `string` - URL 参数字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function md5(text: string, encoding?: BufferEncoding): Buffer | string;
function base64Encode(str: string): string;
function base64Decode(str: string, type?: "string" | "buffer"): string | Buffer;
function qs(obj: Record<string, any>): string;
```

</details>

### 时间处理

#### localeDate

获取本地日期字符串。

> - `ts?`: 时间戳
> - `options?`: 选项
>   返回: `string` - 固定日期字符串

#### localeTime

获取本地时间字符串。

> - `ts?`: 时间戳
> - `options?`: 选项
>   返回: `string` - 固定时间字符串

#### formatDuration

格式化时间间隔。

> - `ms`: 毫秒数
>   返回: `string` - 格式化的时间间隔

#### formatQQLevel

格式化 QQ 等级。

> - `level`: QQ 等级
>   返回: `number` - 格式化后的等级

#### prettyMs

格式化毫秒数。

> - `ms`: 毫秒数
> - `options?`: 选项
>   返回: `string` - 格式化的毫秒

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function localeDate(
  ts?: number,
  options?: { locale?: string; timeZone?: string },
): string;
function localeTime(
  ts?: number,
  options?: { locale?: string; timeZone?: string },
): string;
function formatDuration(ms: number): string;
function formatQQLevel(level: number): number;
function prettyMs(ms: number, options?: prettyMs.Options): string;
```

</details>

### 随机

#### randomInt

生成指定范围内的随机整数。

> - `min`: 最小值
> - `max`: 最大值
> - `hashArgs?`: 稳定随机参数
>   返回: `number` - 随机整数

#### randomItem

从数组中随机取出一项。

> - `array`: 数组
> - `hashArgs?`: 稳定随机参数
>   返回: `T` - 随机取出的项

#### randomItems

从数组中随机取出多项。

> - `array`: 数组
> - `count`: 取出数量
> - `hashArgs?`: 稳定随机参数
>   返回: `T[]` - 随机取出的多项

#### randomId

生成随机 ID。

> 返回: `string` - 随机 ID

#### uuid

生成 UUID 字符串。

> 返回: `string` - UUID 字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function randomInt(min: number, max: number, ...hashArgs: any[]): number;
function randomItem<T>(array: T[], ...hashArgs: any[]): T;
function randomItems<T>(array: T[], count: number, ...hashArgs: any[]): T[];
function randomId(): string;
function uuid(): string;
```

</details>

### 数组/对象

#### unique

去除数组重复项。

> - `array`: 数组
>   返回: `T[]` - 去重后的数组

#### toArray

确保值为数组。

> - `value`: 值或数组
>   返回: `T[]` - 确保为数组

#### clamp

限制数值在指定范围内。

> - `n`: 数值
> - `min`: 最小值
> - `max`: 最大值
>   返回: `number` - 限制范围内的数值

#### toMsgId

生成消息 ID。

> - `event`: 包含 seq 和 rand 的对象
>   返回: `string` - 消息 ID

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function unique<T>(array: T[]): T[];
function toArray<T>(value: T | T[]): T[];
function clamp(n: number, min: number, max: number): number;
function toMsgId(event: { seq: number; rand: number }): string;
```

</details>

### 类型判断

#### isDefined

判断值是否已定义。

> - `val`: 值
>   返回: `val is T` - 是否已定义

#### isFunction

判断值是否为函数。

> - `val`: 值
>   返回: `val is T` - 是否为函数

#### isNumber

判断值是否为数字。

> - `val`: 值
>   返回: `val is number` - 是否为数字

#### isBoolean

判断值是否为布尔值。

> - `val`: 值
>   返回: `val is boolean` - 是否为布尔值

#### isString

判断值是否为字符串。

> - `val`: 值
>   返回: `val is string` - 是否为字符串

#### isObject

判断值是否为对象。

> - `val`: 值
>   返回: `val is object` - 是否为对象

#### isGroupMsg

判断事件是否为群消息。

> - `event`: 事件对象
>   返回: `event is GroupMessageEvent` - 是否为群消息

#### isPrivateMsg

判断事件是否为私聊消息。

> - `event`: 事件对象
>   返回: `event is PrivateMessageEvent` - 是否为私聊消息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isDefined<T>(val: T | undefined | null): val is T;
function isFunction<T>(val: any): val is T;
function isNumber(val: any): val is number;
function isBoolean(val: any): val is boolean;
function isString(val: any): val is string;
function isObject(val: any): val is object;
function isGroupMsg(event: Event): event is GroupMessageEvent;
function isPrivateMsg(event: Event): event is PrivateMessageEvent;
```

</details>

### 等待/延时

#### wait

延时等待。

> - `ms`: 毫秒数
>   返回: `Promise<void>` - Promise

#### getTerminalInput

获取终端用户输入。

> - `inputTip?`: 提示文字
>   返回: `Promise<string>` - 用户输入

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function wait(ms: number): Promise<void>;
function getTerminalInput(inputTip?: string): Promise<string>;
```

</details>

### 命令解析

#### createCmd

解析命令字符串。

> - `cmdStr`: 命令字符串
> - `options?`: 解析选项
>   返回: `{ cmd: string | undefined, params: string[], options: Record<string, any> }` - 解析结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createCmd(
  cmdStr: string,
  options?: { prefix?: string },
): {
  cmd: string | undefined;
  params: string[];
  options: Record<string, any>;
};
```

</details>

### 数据库

#### createDB

创建数据库实例。

> - `filename`: 文件名
> - `options?`: 选项
>   返回: `Promise<Low<T>>` - 数据库实例

#### createStore

创建存储实例。

> - `defaultData`: 默认数据
> - `options?`: 选项
>   返回: `Promise<Low<T>>` - 存储实例

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createDB<T>(
  filename: string,
  options?: Low.Options<T>,
): Promise<Low<T>>;
function createStore<T>(
  defaultData: T,
  options?: Low.Options<T>,
): Promise<Low<T>>;
```

</details>

### 消息处理

#### text

提取消息文本。

> - `event`: 消息事件
> - `options?`: 选项
>   返回: `string` - 消息文本

#### find

查找指定类型的消息元素。

> - `event`: 消息事件
> - `type`: 元素类型
>   返回: `Element | undefined` - 找到的元素

#### filter

过滤指定类型的消息元素。

> - `event`: 消息事件
> - `type`: 元素类型
>   返回: `Element[]` - 所有匹配的元素

#### match

匹配并发送消息。

> - `event`: 消息事件
> - `pattern`: 匹配模式
> - `quote?`: 是否引用
>   返回: `Promise<{ message_id: number } | null>` - 匹配结果

#### runWithReaction

使用表态执行函数。

> - `e`: 事件对象
> - `fn`: 执行函数
> - `id?`: 表态 ID
>   返回: `Promise<Return>` - 执行结果

#### ensureBuffer

确保缓冲区为图片元素。

> - `buffer`: 缓冲区
> - `text?`: 文本
>   返回: `Sendable | null` - 图片元素

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function text(
  event: Event,
  options?: { clean?: boolean; trim?: boolean },
): string;
function find<T extends Element>(event: Event, type: string): T | undefined;
function filter<T extends Element>(event: Event, type: string): T[];
function match(
  event: Event,
  pattern: string,
  quote?: boolean,
): Promise<{ message_id: number } | null>;
async function runWithReaction<T>(
  e: Event,
  fn: () => Promise<T>,
  id?: number,
): Promise<T>;
function ensureBuffer(buffer: Buffer, text?: string): Sendable | null;
```

</details>

### 图片/头像

#### getQQAvatarLink

获取 QQ 头像链接。

> - `qq`: QQ 号
> - `size?`: 头像大小
>   返回: `string` - 头像链接

#### getGroupAvatarLink

获取群头像链接。

> - `group`: 群号
> - `size?`: 头像大小
>   返回: `string` - 群头像链接

#### getImage

获取消息中的图片元素。

> - `event`: 消息事件
>   返回: `RecvImageElement | null` - 图片元素

#### getImageUrl

获取消息中的图片 URL。

> - `event`: 消息事件
>   返回: `Promise<string>` - 图片链接

#### getQuoteMsg

获取引用的消息。

> - `event`: 消息事件
> - `timeout?`: 超时时间
>   返回: `Promise<Event | null>` - 引用的消息事件

#### getMentionedImage

获取 @ 提及中的图片。

> - `event`: 消息事件
>   返回: `Promise<RecvImageElement | null>` - 提及的图片

#### getBfaceUrl

获取表情包链接。

> - `file`: 文件名
>   返回: `Promise<string | null>` - 表情包链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getQQAvatarLink(qq: number | string, size?: number): string;
function getGroupAvatarLink(group: number | string, size?: number): string;
function getImage(event: Event): RecvImageElement | null;
function getImageUrl(event: Event): Promise<string>;
function getQuoteMsg(event: Event, timeout?: number): Promise<Event | null>;
function getMentionedImage(event: Event): Promise<RecvImageElement | null>;
function getBfaceUrl(file: string): Promise<string | null>;
```

</details>

### 用户信息

#### getMentionedUserId

获取 @ 提及的用户 QQ 号。

> - `event`: 消息事件
>   返回: `Promise<number | 0>` - 提及的用户 QQ 号

#### getQuoteText

获取引用消息的文本。

> - `event`: 消息事件
>   返回: `Promise<string>` - 引用消息文本

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getMentionedUserId(event: Event): Promise<number | 0>;
function getQuoteText(event: Event): Promise<string>;
```

</details>

### 登录相关

#### requestLoginViaDevTools

请求开发者工具登录。

> 返回: `{ code: string, url: string }` - 登录码和 URL

#### queryDevToolsLoginStatus

查询开发者工具登录状态。

> - `code`: 登录码
>   返回: `{ status, ticket? }` - 登录状态

#### getAuthCodeViaTicket

通过票据获取 AuthCode。

> - `ticket`: 票据
> - `appid`: 应用 ID
>   返回: `Promise<string>` - AuthCode

#### getMinicoTokenViaAuthCode

通过 AuthCode 获取 minico Token。

> - `authCode`: AuthCode
> - `appid`: 应用 ID
>   返回: `Promise<any>` - minico Token

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function requestLoginViaDevTools(): Promise<{ code: string; url: string }>;
function queryDevToolsLoginStatus(
  code: string,
): Promise<{ status: string; ticket?: string }>;
function getAuthCodeViaTicket(ticket: string, appid: string): Promise<string>;
function getMinicoTokenViaAuthCode(
  authCode: string,
  appid: string,
): Promise<any>;
```

</details>

### GTK

#### getGTk

计算 GTK 值。

> - `pskey`: PSKEY
>   返回: `number` - GTK 值

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getGTk(pskey: string): number;
```

</details>

### 常量

#### START_TIME

启动时间。

> 返回: `Date` - 启动时间

#### ChromeUA

Chrome User-Agent 字符串。

> 返回: `string` - Chrome User-Agent

#### CORE_PLUGINS

核心插件列表。

> 返回: `string[]` - 核心插件列表

#### BUILTIN_PLUGINS

内置插件列表。

> 返回: `MiokiPlugin[]` - 内置插件列表

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const START_TIME: Date;
const ChromeUA: string;
const CORE_PLUGINS: string[];
const BUILTIN_PLUGINS: MiokiPlugin[];
```

</details>

---

## Actions

### 消息操作

#### runWithErrorHandler

带错误处理执行函数。

> - `bot`: NapCat 实例
> - `fn`: 执行函数
> - `event?`: 事件对象
> - `message?`: 错误消息
>   返回: `Promise<any>` - 执行结果

#### createForwardMsg

创建转发消息。

> - `bot`: NapCat 实例
> - `message?`: 消息数组
> - `options?`: 选项
>   返回: `Sendable` - 转发消息

#### signArk

签名 Ark 消息。

> - `bot`: NapCat 实例
> - `json`: JSON 字符串
>   返回: `Promise<string>` - 签名后的 JSON

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function runWithErrorHandler(
  bot: NapCat,
  fn: () => Promise<any>,
  event?: Event,
  message?: string,
): Promise<any>;
function createForwardMsg(
  bot: NapCat,
  message?: any[],
  options?: { hint?: string; trace?: boolean },
): Sendable;
function signArk(bot: NapCat, json: string): Promise<string>;
```

</details>

### 图片上传

#### uploadImageToCollection

上传图片到收藏。

> - `bot`: NapCat 实例
> - `buffer`: 图片缓冲区
>   返回: `Promise<string>` - 图片链接

#### uploadImageToGroupHomework

上传图片到群作业。

> - `bot`: NapCat 实例
> - `imgBase64`: Base64 图片
>   返回: `Promise<string>` - 图片链接

#### uploadImageToGroupNotice

上传图片到群公告。

> - `bot`: NapCat 实例
> - `urlOrBlob`: URL 或 Blob
>   返回: `{ h, w, id, url... }` - 公告图片信息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function uploadImageToCollection(bot: NapCat, buffer: Buffer): Promise<string>;
function uploadImageToGroupHomework(
  bot: NapCat,
  imgBase64: string,
): Promise<string>;
function uploadImageToGroupNotice(
  bot: NapCat,
  urlOrBlob: string | Blob,
): Promise<{ h: number; w: number; id: string; url: string }>;
```

</details>

### 群发消息

#### noticeGroups

通知多个群。

> - `bot`: NapCat 实例
> - `groupIdList`: 群号列表
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

#### noticeFriends

通知多个好友。

> - `bot`: NapCat 实例
> - `friendIdList`: 好友列表
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

#### noticeAdmins

通知所有管理员。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

#### noticeOwners

通知所有群主。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

#### noticeMainOwner

通知主群主。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeGroups(
  bot: NapCat,
  groupIdList: number[],
  message?: Sendable,
  delay?: number,
): Promise<void>;
function noticeFriends(
  bot: NapCat,
  friendIdList: number[],
  message?: Sendable,
  delay?: number,
): Promise<void>;
function noticeAdmins(
  bot: NapCat,
  message?: Sendable,
  delay?: number,
): Promise<void>;
function noticeOwners(
  bot: NapCat,
  message?: Sendable,
  delay?: number,
): Promise<void>;
function noticeMainOwner(bot: NapCat, message?: Sendable): Promise<void>;
```

</details>

### 违规记录

#### getViolationRecords

获取违规记录列表。

> - `bot`: NapCat 实例
> - `authCode`: AuthCode
> - `appid`: 应用 ID
> - `size?`: 记录数量
>   返回: `{ type, time, duration, reason }[]` - 违规记录列表

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getViolationRecords(
  bot: NapCat,
  authCode: string,
  appid: string,
  size?: number,
): Promise<{ type: number; time: number; duration: number; reason: string }[]>;
```

</details>

#### getLogFilePath

获取日志文件路径。

> - `type?`: 日志类型
>   返回: `string` - 日志文件路径

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getLogFilePath(type?: "app" | "error" | "mioki"): string;
```

</details>

### 文件系统

#### fs

Node.js 文件系统模块。

> 返回: `FileSystemAdapter` - fs 适配器

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const fs: FileSystemAdapter;
```

</details>

#### path

Node.js 路径模块。

> 返回: `PathUtil` - 路径工具

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const path: PathUtil;
```

</details>

### 字符串处理

#### md5

计算 MD5 哈希值。

> - `text`: 待加密文本
> - `encoding?`: 编码方式
>   返回: `Buffer | string` - 加密结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function md5(text: string, encoding?: BufferEncoding): Buffer | string;
```

</details>

#### base64Encode

进行 Base64 编码。

> - `str`: 待编码字符串
>   返回: `string` - Base64 编码结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function base64Encode(str: string): string;
```

</details>

#### base64Decode

进行 Base64 解码。

> - `str`: 待解码字符串
> - `type?`: 解码类型
>   返回: `string | Buffer` - 解码结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function base64Decode(str: string, type?: "string" | "buffer"): string | Buffer;
```

</details>

#### qs

将对象序列化为 URL 参数字符串。

> - `obj`: 待序列化对象
>   返回: `string` - URL 参数字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function qs(obj: Record<string, any>): string;
```

</details>

### 时间处理

#### localeDate

获取本地日期字符串。

> - `ts?`: 时间戳
> - `options?`: 选项
>   返回: `string` - 固定日期字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function localeDate(
  ts?: number,
  options?: { locale?: string; timeZone?: string },
): string;
```

</details>

#### localeTime

获取本地时间字符串。

> - `ts?`: 时间戳
> - `options?`: 选项
>   返回: `string` - 固定时间字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function localeTime(
  ts?: number,
  options?: { locale?: string; timeZone?: string },
): string;
```

</details>

#### formatDuration

格式化时间间隔。

> - `ms`: 毫秒数
>   返回: `string` - 格式化的时间间隔

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function formatDuration(ms: number): string;
```

</details>

#### formatQQLevel

格式化 QQ 等级。

> - `level`: QQ 等级
>   返回: `number` - 格式化后的等级

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function formatQQLevel(level: number): number;
```

</details>

#### prettyMs

格式化毫秒数。

> - `ms`: 毫秒数
> - `options?`: 选项
>   返回: `string` - 格式化的毫秒

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function prettyMs(ms: number, options?: prettyMs.Options): string;
```

</details>

### 随机

#### randomInt

生成指定范围内的随机整数。

> - `min`: 最小值
> - `max`: 最大值
> - `hashArgs?`: 稳定随机参数
>   返回: `number` - 随机整数

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function randomInt(min: number, max: number, ...hashArgs: any[]): number;
```

</details>

#### randomItem

从数组中随机取出一项。

> - `array`: 数组
> - `hashArgs?`: 稳定随机参数
>   返回: `T` - 随机取出的项

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function randomItem<T>(array: T[], ...hashArgs: any[]): T;
```

</details>

#### randomItems

从数组中随机取出多项。

> - `array`: 数组
> - `count`: 取出数量
> - `hashArgs?`: 稳定随机参数
>   返回: `T[]` - 随机取出的多项

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function randomItems<T>(array: T[], count: number, ...hashArgs: any[]): T[];
```

</details>

#### randomId

生成随机 ID。

> 返回: `string` - 随机 ID

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function randomId(): string;
```

</details>

#### uuid

生成 UUID 字符串。

> 返回: `string` - UUID 字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function uuid(): string;
```

</details>

### 数组/对象

#### unique

去除数组重复项。

> - `array`: 数组
>   返回: `T[]` - 去重后的数组

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function unique<T>(array: T[]): T[];
```

</details>

#### toArray

确保值为数组。

> - `value`: 值或数组
>   返回: `T[]` - 确保为数组

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function toArray<T>(value: T | T[]): T[];
```

</details>

#### clamp

限制数值在指定范围内。

> - `n`: 数值
> - `min`: 最小值
> - `max`: 最大值
>   返回: `number` - 限制范围内的数值

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function clamp(n: number, min: number, max: number): number;
```

</details>

#### toMsgId

生成消息 ID。

> - `event`: 包含 seq 和 rand 的对象
>   返回: `string` - 消息 ID

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function toMsgId(event: { seq: number; rand: number }): string;
```

</details>

### 类型判断

#### isDefined

判断值是否已定义。

> - `val`: 值
>   返回: `val is T` - 是否已定义

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isDefined<T>(val: T | undefined | null): val is T;
```

</details>

#### isFunction

判断值是否为函数。

> - `val`: 值
>   返回: `val is T` - 是否为函数

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isFunction<T>(val: any): val is T;
```

</details>

#### isNumber

判断值是否为数字。

> - `val`: 值
>   返回: `val is number` - 是否为数字

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isNumber(val: any): val is number;
```

</details>

#### isBoolean

判断值是否为布尔值。

> - `val`: 值
>   返回: `val is boolean` - 是否为布尔值

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isBoolean(val: any): val is boolean;
```

</details>

#### isString

判断值是否为字符串。

> - `val`: 值
>   返回: `val is string` - 是否为字符串

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isString(val: any): val is string;
```

</details>

#### isObject

判断值是否为对象。

> - `val`: 值
>   返回: `val is object` - 是否为对象

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isObject(val: any): val is object;
```

</details>

#### isGroupMsg

判断事件是否为群消息。

> - `event`: 事件对象
>   返回: `event is GroupMessageEvent` - 是否为群消息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isGroupMsg(event: Event): event is GroupMessageEvent;
```

</details>

#### isPrivateMsg

判断事件是否为私聊消息。

> - `event`: 事件对象
>   返回: `event is PrivateMessageEvent` - 是否为私聊消息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function isPrivateMsg(event: Event): event is PrivateMessageEvent;
```

</details>

### 等待/延时

#### wait

延时等待。

> - `ms`: 毫秒数
>   返回: `Promise<void>` - Promise

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function wait(ms: number): Promise<void>;
```

</details>

#### getTerminalInput

获取终端用户输入。

> - `inputTip?`: 提示文字
>   返回: `Promise<string>` - 用户输入

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getTerminalInput(inputTip?: string): Promise<string>;
```

</details>

### 命令解析

#### createCmd

解析命令字符串。

> - `cmdStr`: 命令字符串
> - `options?`: 解析选项
>   返回: `{ cmd: string | undefined, params: string[], options: Record<string, any> }` - 解析结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createCmd(
  cmdStr: string,
  options?: { prefix?: string },
): {
  cmd: string | undefined;
  params: string[];
  options: Record<string, any>;
};
```

</details>

### 数据库

#### createDB

创建数据库实例。

> - `filename`: 文件名
> - `options?`: 选项
>   返回: `Promise<Low<T>>` - 数据库实例

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createDB<T>(
  filename: string,
  options?: Low.Options<T>,
): Promise<Low<T>>;
```

</details>

#### createStore

创建存储实例。

> - `defaultData`: 默认数据
> - `options?`: 选项
>   返回: `Promise<Low<T>>` - 存储实例

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createStore<T>(
  defaultData: T,
  options?: Low.Options<T>,
): Promise<Low<T>>;
```

</details>

### 消息处理

#### text

提取消息文本。

> - `event`: 消息事件
> - `options?`: 选项
>   返回: `string` - 消息文本

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function text(
  event: Event,
  options?: { clean?: boolean; trim?: boolean },
): string;
```

</details>

#### find

查找指定类型的消息元素。

> - `event`: 消息事件
> - `type`: 元素类型
>   返回: `Element | undefined` - 找到的元素

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function find<T extends Element>(event: Event, type: string): T | undefined;
```

</details>

#### filter

过滤指定类型的消息元素。

> - `event`: 消息事件
> - `type`: 元素类型
>   返回: `Element[]` - 所有匹配的元素

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function filter<T extends Element>(event: Event, type: string): T[];
```

</details>

#### match

匹配并发送消息。

> - `event`: 消息事件
> - `pattern`: 匹配模式
> - `quote?`: 是否引用
>   返回: `Promise<{ message_id: number } | null>` - 匹配结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function match(
  event: Event,
  pattern: string,
  quote?: boolean,
): Promise<{ message_id: number } | null>;
```

</details>

#### runWithReaction

使用表态执行函数。

> - `e`: 事件对象
> - `fn`: 执行函数
> - `id?`: 表态 ID
>   返回: `Promise<Return>` - 执行结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
async function runWithReaction<T>(
  e: Event,
  fn: () => Promise<T>,
  id?: number,
): Promise<T>;
```

</details>

#### ensureBuffer

确保缓冲区为图片元素。

> - `buffer`: 缓冲区
> - `text?`: 文本
>   返回: `Sendable | null` - 图片元素

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function ensureBuffer(buffer: Buffer, text?: string): Sendable | null;
```

</details>

### 图片/头像

#### getQQAvatarLink

获取 QQ 头像链接。

> - `qq`: QQ 号
> - `size?`: 头像大小
>   返回: `string` - 头像链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getQQAvatarLink(qq: number | string, size?: number): string;
```

</details>

#### getGroupAvatarLink

获取群头像链接。

> - `group`: 群号
> - `size?`: 头像大小
>   返回: `string` - 群头像链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getGroupAvatarLink(group: number | string, size?: number): string;
```

</details>

#### getImage

获取消息中的图片元素。

> - `event`: 消息事件
>   返回: `RecvImageElement | null` - 图片元素

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getImage(event: Event): RecvImageElement | null;
```

</details>

#### getImageUrl

获取消息中的图片 URL。

> - `event`: 消息事件
>   返回: `Promise<string>` - 图片链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getImageUrl(event: Event): Promise<string>;
```

</details>

#### getQuoteMsg

获取引用的消息。

> - `event`: 消息事件
> - `timeout?`: 超时时间
>   返回: `Promise<Event | null>` - 引用的消息事件

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getQuoteMsg(event: Event, timeout?: number): Promise<Event | null>;
```

</details>

#### getMentionedImage

获取 @ 提及中的图片。

> - `event`: 消息事件
>   返回: `Promise<RecvImageElement | null>` - 提及的图片

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getMentionedImage(event: Event): Promise<RecvImageElement | null>;
```

</details>

#### getBfaceUrl

获取表情包链接。

> - `file`: 文件名
>   返回: `Promise<string | null>` - 表情包链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getBfaceUrl(file: string): Promise<string | null>;
```

</details>

### 用户信息

#### getMentionedUserId

获取 @ 提及的用户 QQ 号。

> - `event`: 消息事件
>   返回: `Promise<number | 0>` - 提及的用户 QQ 号

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getMentionedUserId(event: Event): Promise<number | 0>;
```

</details>

#### getQuoteText

获取引用消息的文本。

> - `event`: 消息事件
>   返回: `Promise<string>` - 引用消息文本

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getQuoteText(event: Event): Promise<string>;
```

</details>

### 登录相关

#### requestLoginViaDevTools

请求开发者工具登录。

> 返回: `{ code: string, url: string }` - 登录码和 URL

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function requestLoginViaDevTools(): Promise<{ code: string; url: string }>;
```

</details>

#### queryDevToolsLoginStatus

查询开发者工具登录状态。

> - `code`: 登录码
>   返回: `{ status, ticket? }` - 登录状态

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function queryDevToolsLoginStatus(
  code: string,
): Promise<{ status: string; ticket?: string }>;
```

</details>

#### getAuthCodeViaTicket

通过票据获取 AuthCode。

> - `ticket`: 票据
> - `appid`: 应用 ID
>   返回: `Promise<string>` - AuthCode

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getAuthCodeViaTicket(ticket: string, appid: string): Promise<string>;
```

</details>

#### getMinicoTokenViaAuthCode

通过 AuthCode 获取 minico Token。

> - `authCode`: AuthCode
> - `appid`: 应用 ID
>   返回: `Promise<any>` - minico Token

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getMinicoTokenViaAuthCode(
  authCode: string,
  appid: string,
): Promise<any>;
```

</details>

### GTK

#### getGTk

计算 GTK 值。

> - `pskey`: PSKEY
>   返回: `number` - GTK 值

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getGTk(pskey: string): number;
```

</details>

### 常量

#### START_TIME

启动时间。

> 返回: `Date` - 启动时间

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const START_TIME: Date;
```

</details>

#### ChromeUA

Chrome User-Agent 字符串。

> 返回: `string` - Chrome User-Agent

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const ChromeUA: string;
```

</details>

#### CORE_PLUGINS

核心插件列表。

> 返回: `string[]` - 核心插件列表

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const CORE_PLUGINS: string[];
```

</details>

#### BUILTIN_PLUGINS

内置插件列表。

> 返回: `MiokiPlugin[]` - 内置插件列表

<details>
<summary>点击展开完整类型定义</summary>

```typescript
const BUILTIN_PLUGINS: MiokiPlugin[];
```

</details>

---

## Actions

### 消息操作

#### runWithErrorHandler

带错误处理执行函数。

> - `bot`: NapCat 实例
> - `fn`: 执行函数
> - `event?`: 事件对象
> - `message?`: 错误消息
>   返回: `Promise<any>` - 执行结果

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function runWithErrorHandler(
  bot: NapCat,
  fn: () => Promise<any>,
  event?: Event,
  message?: string,
): Promise<any>;
```

</details>

#### createForwardMsg

创建转发消息。

> - `bot`: NapCat 实例
> - `message?`: 消息数组
> - `options?`: 选项
>   返回: `Sendable` - 转发消息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function createForwardMsg(
  bot: NapCat,
  message?: any[],
  options?: { hint?: string; trace?: boolean },
): Sendable;
```

</details>

#### signArk

签名 Ark 消息。

> - `bot`: NapCat 实例
> - `json`: JSON 字符串
>   返回: `Promise<string>` - 签名后的 JSON

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function signArk(bot: NapCat, json: string): Promise<string>;
```

</details>

### 图片上传

#### uploadImageToCollection

上传图片到收藏。

> - `bot`: NapCat 实例
> - `buffer`: 图片缓冲区
>   返回: `Promise<string>` - 图片链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function uploadImageToCollection(bot: NapCat, buffer: Buffer): Promise<string>;
```

</details>

#### uploadImageToGroupHomework

上传图片到群作业。

> - `bot`: NapCat 实例
> - `imgBase64`: Base64 图片
>   返回: `Promise<string>` - 图片链接

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function uploadImageToGroupHomework(
  bot: NapCat,
  imgBase64: string,
): Promise<string>;
```

</details>

#### uploadImageToGroupNotice

上传图片到群公告。

> - `bot`: NapCat 实例
> - `urlOrBlob`: URL 或 Blob
>   返回: `{ h, w, id, url... }` - 公告图片信息

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function uploadImageToGroupNotice(
  bot: NapCat,
  urlOrBlob: string | Blob,
): Promise<{ h: number; w: number; id: string; url: string }>;
```

</details>

### 群发消息

#### noticeGroups

通知多个群。

> - `bot`: NapCat 实例
> - `groupIdList`: 群号列表
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeGroups(
  bot: NapCat,
  groupIdList: number[],
  message?: Sendable,
  delay?: number,
): Promise<void>;
```

</details>

#### noticeFriends

通知多个好友。

> - `bot`: NapCat 实例
> - `friendIdList`: 好友列表
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeFriends(
  bot: NapCat,
  friendIdList: number[],
  message?: Sendable,
  delay?: number,
): Promise<void>;
```

</details>

#### noticeAdmins

通知所有管理员。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeAdmins(
  bot: NapCat,
  message?: Sendable,
  delay?: number,
): Promise<void>;
```

</details>

#### noticeOwners

通知所有群主。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
> - `delay?`: 发送延迟
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeOwners(
  bot: NapCat,
  message?: Sendable,
  delay?: number,
): Promise<void>;
```

</details>

#### noticeMainOwner

通知主群主。

> - `bot`: NapCat 实例
> - `message?`: 消息内容
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function noticeMainOwner(bot: NapCat, message?: Sendable): Promise<void>;
```

</details>

### 违规记录

#### getViolationRecords

获取违规记录列表。

> - `bot`: NapCat 实例
> - `authCode`: AuthCode
> - `appid`: 应用 ID
> - `size?`: 记录数量
>   返回: `{ type, time, duration, reason }[]` - 违规记录列表

<details>
<summary>点击展开完整类型定义</summary>

```typescript
function getViolationRecords(
  bot: NapCat,
  authCode: string,
  appid: string,
  size?: number,
): Promise<{ type: number; time: number; duration: number; reason: string }[]>;
```

</details>

---

## Configs

### 配置读取

`botConfig: MiokiConfig`

> 当前配置

`BOT_CWD: { value: string }`

> 工作目录

`isInPm2: boolean`

> 是否在 PM2 中运行

`readMiokiConfig(): MiokiConfig`

> 返回: `MiokiConfig` - Mioki 配置

`readPackageJson(): Record`

> 返回: `Record` - package.json 内容

`writePackageJson(pkg): void`

> - `pkg`: package.json 对象
>   返回: void

`updateBotConfig(draftFn): Promise<void>`

> - `draftFn`: 配置更新函数
>   返回: `Promise<void>`

`updateBotCWD(root): void`

> - `root`: 工作目录
>   返回: void

`normalizeNapCatConfig(config): NapCatConfig`

> - `config`: NapCat 配置
>   返回: `NapCatConfig` - 规范化后的配置

### 权限判断

`isOwner(id): boolean`

> - `id`: 用户 ID 或事件对象
>   返回: `boolean` - 是否主人

`isAdmin(id): boolean`

> - `id`: 用户 ID 或事件对象
>   返回: `boolean` - 是否管理员（非主人）

`isOwnerOrAdmin(id): boolean`

> - `id`: 用户 ID 或事件对象
>   返回: `boolean` - 是否主人或管理员

`hasRight(id): boolean`

> - `id`: 用户 ID 或事件对象
>   返回: `boolean` - 是否有权限

---

## Services

### 服务管理

`services: MiokiServices`

> 全局服务集合

`addService(name, service, cover?): () => void`

> - `name`: 服务名称
> - `service`: 服务对象
> - `cover?`: 是否覆盖
>   返回: `() => void` - 移除服务函数

`getMiokiStatus(): Promise<MiokiStatus>`

> 返回: `Promise<MiokiStatus>` - 系统状态

`formatMiokiStatus(status): Promise<string>`

> - `status`: MiokiStatus 对象
>   返回: `Promise<string>` - 格式化的状态字符串

---

## 插件系统

### 插件定义

`definePlugin(plugin): MiokiPlugin`

> - `plugin`: 插件对象
>   返回: `MiokiPlugin` - 插件对象

`enablePlugin(bots, plugin, type?): Promise<MiokiPlugin>`

> - `bots`: NapCat 实例数组
> - `plugin`: 插件对象
> - `type?`: 插件类型
>   返回: `Promise<MiokiPlugin>` - 启用的插件

`findLocalPlugins(): Promise<{ name, absPath }[]>`

> 返回: `{ name, absPath }[]` - 本地插件列表

`ensurePluginDir(): void`

> 返回: void

`getAbsPluginDir(defaultDir?): string`

> - `defaultDir?`: 默认目录
>   返回: `string` - 插件目录绝对路径

### 去重器

`deduplicator: Deduplicator`

> 事件去重器

`isProcessed(event, scope?): boolean`

> - `event`: 事件对象
> - `scope?`: 作用域
>   返回: `boolean` - 是否已处理

`markProcessed(event, scope?): void`

> - `event`: 事件对象
> - `scope?`: 作用域
>   返回: void

---

## 启动

`start(options?): Promise<void>`

> - `options?`: 启动选项
>   返回: `Promise<void>`

`connectedBots: Map<number, ExtendedNapCat>`

> 已连接的机器人

<details>
<summary>点击展开完整类型定义</summary>

```typescript
// Logger
const logger: Logger;
function getMiokiLogger(level: LogLevel): Logger;
function getLogFilePath(type?: string): string;

// Utils
const fs: typeof import("fs");
const path: typeof import("path");
function md5(text: BinaryLike, encoding: "buffer"): Buffer;
function md5(text: BinaryLike, encoding?: BinaryToTextEncoding): string;
function base64Encode(str: string | number | Buffer): string;
function base64Decode(
  str: string,
  type?: "buffer" | BufferEncoding,
): string | Buffer;
function qs(obj: Record<number | string, any>): string;
const dayjs: typeof import("dayjs");
function localeDate(
  ts?: number | string | Date,
  options?: FormatOptions,
): string;
function localeTime(
  ts?: number | string,
  options?: FormatOptions & { seconds?: boolean },
): string;
function formatDuration(ms: number): string;
function formatQQLevel(level: number): string;
function prettyMs(ms: number, options?: object): string;
function randomInt(min: number, max: number, ...hashArgs: any[]): number;
function randomItem<T = any>(array: readonly T[], ...hashArgs: any[]): T;
function randomItems<T = any>(
  array: readonly T[],
  count: number,
  ...hashArgs: any[]
): T[];
function randomId(): string;
function uuid(): string;
function unique<T>(array: T[]): T[];
function toArray<T>(value: T | T[]): T[];
function clamp(n: number, min: number, max: number): number;
function toMsgId(event: { seq: number; rand: number }): string;
function isDefined<T = unknown>(val?: T): val is T;
function isFunction<T extends AnyFunc>(val: unknown): val is T;
function isNumber(val: unknown): val is number;
function isBoolean(val: unknown): val is boolean;
function isString(val: unknown): val is string;
function isObject(val: unknown): val is object;
function isGroupMsg(event: MessageEvent): event is GroupMessageEvent;
function isPrivateMsg(event: MessageEvent): event is PrivateMessageEvent;
function wait(ms: number): Promise<void>;
function getTerminalInput(inputTip?: string): Promise<string>;
function createCmd(
  cmdStr: string,
  options?: CreateCmdOptions,
): { cmd: string | undefined; params: string[]; options: Record<string, any> };
function createDB<T extends object = object>(
  filename: string,
  options?: { defaultData?: T; compress?: boolean },
): Promise<Low<T>>;
function createStore<T extends object = object>(
  defaultData: T,
  options?: {
    __dirname?: string;
    importMeta?: ImportMeta;
    compress?: boolean;
    filename?: string;
  },
): Promise<Low<T>>;
function text(
  event: HasMessage,
  options?: { trim?: boolean | "whole" | "each" },
): string;
function find<Type extends Pick<RecvElement, "type">["type"]>(
  event: HasMessage,
  type: Type,
): Extract<RecvElement, { type: Type }> | undefined;
function filter<Type extends Pick<RecvElement, "type">["type"]>(
  event: HasMessage,
  type: Type,
): Extract<RecvElement, { type: Type }>[];
function match<E extends MessageEvent>(
  event: E,
  pattern: Record<string, MatchValue<E>>,
  quote?: boolean,
): Promise<{ message_id: number } | null>;
function runWithReaction<T extends AnyFunc>(
  e: GroupMessageEvent,
  fn: T,
  id?: string,
): Promise<ReturnType<T>>;
function ensureBuffer(buffer?: Buffer | null | undefined, text?: null): null;
function ensureBuffer(
  buffer?: Buffer | null | undefined,
  text?: string,
): Sendable;
function getQQAvatarLink(qq: number, size?: number): string;
function getGroupAvatarLink(group: number, size?: number): string;
function getImage(event: HasMessage): RecvImageElement | null;
function getImageUrl(event: HasMessage): Promise<string>;
function getQuoteMsg(
  event: MessageEvent,
  timeout?: number,
): Promise<GroupMessageEvent | PrivateMessageEvent | null>;
function getQuoteImage(event: MessageEvent): Promise<RecvImageElement | null>;
function getQuoteImageUrl(event: MessageEvent): Promise<string>;
function getMentionedImage(
  event: MessageEvent,
): Promise<RecvImageElement | null>;
function getMentionedImageUrl(event: MessageEvent): Promise<string>;
function getBfaceUrl(file: string): Promise<string | null>;
function getMentionedUserId(event: MessageEvent): Promise<number | 0>;
function getQuoteText(event: MessageEvent): Promise<string>;
function requestLoginViaDevTools(): Promise<{ code: string; url: string }>;
function queryDevToolsLoginStatus(code: string): Promise<{
  status: "OK" | "Wait" | "Expired" | "Used" | "Error";
  ticket?: string;
}>;
function getAuthCodeViaTicket(ticket: string, appid: number): Promise<string>;
function getMinicoTokenViaAuthCode(
  authCode: string,
  appid: number,
): Promise<any>;
function localNum(num: number, locale?: string): string;
function getGTk(pskey: string): number;
const START_TIME: Date;
const ChromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64, x64) Chrome/131.0.0.0";
const CORE_PLUGINS: string[];
const BUILTIN_PLUGINS: MiokiPlugin[];

// Actions
function runWithErrorHandler(
  bot: NapCat,
  fn: () => any,
  event?: {
    reply: (
      content: Sendable,
      quote?: boolean,
    ) => Promise<{ message_id: number }>;
  },
  message?: Sendable | ((error: string) => Sendable),
): Promise<any>;
function createForwardMsg(
  bot: NapCat,
  message?: Sendable[],
  options?: { user_id?: number; nickname?: string },
): Sendable;
function signArk(bot: NapCat, json: string): Promise<string>;
function uploadImageToCollection(
  bot: NapCat,
  buffer: ArrayBuffer,
): Promise<string>;
function uploadImageToGroupHomework(
  bot: NapCat,
  imgBase64: string,
): Promise<string>;
function uploadImageToGroupNotice(
  bot: NapCat,
  urlOrBlob: string | Blob,
): Promise<{
  h: string;
  w: string;
  id: string;
  url: string;
  url2: string;
  url3: string;
  url4: string;
  url5: string;
  url6: string;
}>;
function noticeGroups(
  bot: NapCat,
  groupIdList: number[],
  message?: Sendable | null,
  delay?: number,
): Promise<void>;
function noticeFriends(
  bot: NapCat,
  friendIdList: number[],
  message?: Sendable | null,
  delay?: number,
): Promise<void>;
function noticeAdmins(
  bot: NapCat,
  message?: Sendable | null,
  delay?: number,
): Promise<void>;
function noticeOwners(
  bot: NapCat,
  message?: Sendable | null,
  delay?: number,
): Promise<void>;
function noticeMainOwner(bot: NapCat, message?: Sendable | null): Promise<void>;
function getViolationRecords(
  bot: NapCat,
  authCode: string,
  appid: number,
  size?: number,
): Promise<{ type: string; time: string; duration: string; reason: number }[]>;

// Configs
const botConfig: MiokiConfig;
const BOT_CWD: { value: string };
const isInPm2: boolean;
function readMiokiConfig(): MiokiConfig;
function readPackageJson(): Record<"mioki" | (string & {}), any>;
function writePackageJson(pkg: Record<string, any>): void;
function updateBotConfig(draftFn: (config: MiokiConfig) => any): Promise<void>;
function updateBotCWD(root: string): void;
function normalizeNapCatConfig(
  config: NapCatInstanceConfig | NapCatInstanceConfig[],
): NapCatConfig;
function isOwner(
  id: number | { sender: { user_id: number } } | { user_id: number },
): boolean;
function isAdmin(
  id: number | { sender: { user_id: number } } | { user_id: number },
): boolean;
function isOwnerOrAdmin(
  id: number | { sender: { user_id: number } } | { user_id: number },
): boolean;
function hasRight(
  id: number | { sender: { user_id: number } } | { user_id: number },
): boolean;

// Services
const services: MiokiServices;
function addService(name: string, service: any, cover?: boolean): () => void;
function getMiokiStatus(bots: ExtendedNapCat[]): Promise<MiokiStatus>;
function formatMiokiStatus(status: MiokiStatus): Promise<string>;

// Plugin
const runtimePlugins: Map<
  string,
  {
    name: string;
    type: "builtin" | "external";
    version: string;
    description: string;
    plugin: MiokiPlugin;
    disable: () => any;
  }
>;
const deduplicator: Deduplicator;
const connectedBots: Map<number, ExtendedNapCat>;
function start(options?: StartOptions): Promise<void>;
function definePlugin(plugin: MiokiPlugin): MiokiPlugin;
function enablePlugin(
  bots: ExtendedNapCat[],
  plugin: MiokiPlugin,
  type?: "builtin" | "external",
): Promise<MiokiPlugin>;
function findLocalPlugins(): Promise<{ name: string; absPath: string }[]>;
function ensurePluginDir(): void;
function getAbsPluginDir(defaultDir?: string): string;
```

</details>
