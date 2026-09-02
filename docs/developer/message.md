# 消息与消息段

一条消息不是一个字符串，而是一串**消息段（MessageSegment）**：文本、@、图片、引用……各有各的类型和参数。

## 消息的结构

收到的事件里，`event.message` 是一个消息段数组。比如一条「@机器人 早啊」在 onebotv11 下长这样：

```text
[
  { type: "at",      data: { qq: "12345" } },
  { type: "text",    data: { text: " 早啊" } }
]
```

每个消息段有 `type` 和 `data`。文本段最常见，`event.raw_message` 就是所有文本段的拼接结果。

## 读消息

**取纯文本** —— 最常用，用 `ctx.text()`：

```typescript
const text = ctx.text(event);   // " 早啊"，默认去空白
```

**按类型找段**：

```typescript
const ats = event.message.filterByType("at");   // 所有 @ 段
const firstImage = event.message.find((s) => s.type === "image");
```

**取第一个 @ 的目标**：

```typescript
import { atOf } from "mioku";

const target = atOf(event.message);  // "12345" 或 undefined
```

## 构造消息段

`ctx.segment`（或从 `mioku` 导入的 `segment`）是消息段构造器，常用方法：

```typescript
segment.text("hello")                    // 文本
segment.at("12345")                      // @某人
segment.image("https://.../a.png")       // 图片（URL）
segment.image("/tmp/a.png", { local: true })  // 图片（本地路径）
segment.image(buffer)                    // 图片（Buffer，自动转 base64）
segment.reply("message_id")              // 引用某条消息
segment.video(url)                       // 视频
segment.record(url)                      // 语音
segment.file(path)                       // 文件
segment.face("1")                        // 表情
segment.forward("forward_id")            // 合并转发
segment.node({ user_id, nickname, content })  // 转发节点
segment.json({...})                      // JSON 卡片
segment.markdown("# 标题\n**markdown** 内容")   // markdown 消息
segment.button({ label, action, data })  // 交互按钮
segment.raw(type, data)                  // 任意原始段
```

::: tip 发本地文件
本地路径要加 `{ local: true }`，否则框架会把它当 URL 发给平台。`image` 传 Buffer 则不用，自动走 base64。
:::

## 拼消息

发送接口（`event.reply`、`bot.sendMessage`、`bot.sendGroupMsg` 等）的入参 `MessageInput` 很宽容：字符串、单个段、段数组都行。

**字符串** —— 最简单：

```typescript
await event.reply("早上好");
```

**多个段** —— 文本和 @ 混着来：

```typescript
await event.reply([
  segment.at(event.user_id),
  segment.text(" 早上好"),
]);
```

**文本里带表情**：

```typescript
await event.reply([
  segment.text("抽到啦！"),
  segment.face("170"),
]);
```

**图片带文字**：

```typescript
await event.reply([
  segment.image("https://example.com/miku.png"),
  segment.text("\n这是我们的初音"),
]);
```

## 回复与引用

`event.reply()` 默认就是回复原消息（带引用），第二个参数控制是否引用：

```typescript
await event.reply("收到");        // 带引用回复
await event.reply("收到", false); // 不带引用，纯发送
```

想引用任意一条历史消息，先用 `segment.reply(messageId)`：

```typescript
const quote = segment.reply("some_message_id");
await event.bot.sendGroupMsg(event.group_id, [quote, segment.text("你说得对")]);
```

## 常用模式：判断并回复

配合 `ctx.text()` 和 `ctx.match()`，消息处理的常见写法：

```typescript
ctx.handle("message", async (event) => {
  const text = ctx.text(event);

  // 判断文本
  if (text === "帮助") {
    await event.reply("输入 /天气 <城市> 查天气");
    return;
  }

  // 正则
  const m = text.match(/^\/天气\s+(.+)$/);
  if (m) {
    await event.reply(`${m[1]}：晴，26°C`);
  }
});
```

`ctx.match()` 是更省事的键值路由，适合关键词场景：

```typescript
ctx.handle("message", async (event) => {
  await ctx.match(event, {
    "ping": "pong",
    "/天气/*": async (matches, e) => `天气信息：${matches[0]}`,
    "/^roll$/": () => String(Math.floor(Math.random() * 100) + 1),
  });
});
```

`match` 的键支持三种形式：纯文本精确匹配、`*` 通配符、`/正则/`。命中后如果是字符串就直接回复，是函数就执行（函数第一个参数是匹配结果）。`match` 默认带引用回复，第二个参数传 `false` 关掉。

## 下一步

- [操作 Bot](/developer/bot) —— bot 的方法：主动发消息、合并转发、查历史
