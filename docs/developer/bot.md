# 操作 Bot

插件处理消息之外的另一半工作，是让机器人主动做事：发消息、管理群、查资料。这些操作都挂在 bot 对象上——它把平台能力收敛成了一组统一方法。

## 拿到 bot

三种途径：

```typescript
// 事件自带的 bot
ctx.handle("message", async (event) => {
  await event.bot.sendGroupMsg(event.group_id, "收到");
});

// 第一个连接的 bot
ctx.bot;

// 按 bot_id 取指定 bot
ctx.pickBot("10001");

// 全部已连接的 bot
ctx.bots;
```

多适配器同时在线时，`ctx.bots` 里混着各个平台的 bot，用 `bot.adapter` 区分。想知道装了哪些适配器（包括当前一个 bot 都没连上的），用 `ctx.adapters` 取已加载的适配器实例，`ctx.getAdapter(name)` 按名字取单个。

## 消息相关

```typescript
// 发到群 / 私聊
await bot.sendGroupMsg("group_id", "大家好");
await bot.sendPrivateMsg("user_id", "私聊内容");

// 发到任意目标
await bot.sendMessage({ type: "group", group_id: "123" }, "内容");

// 合并转发
await bot.sendForward(
  { type: "group", group_id: "123" },
  [
    { user_id: "10001", nickname: "初音", content: "第一句" },
    { user_id: "10002", nickname: "镜音", content: "第二句" },
  ],
);

// 撤回 / 查询
await bot.recallMessage("message_id");
const msg = await bot.getMessage("message_id");

// 拉历史
const history = await bot.getHistory({ type: "group", group_id: "123" }, undefined, 20);
```

## 群管理

```typescript
const group = await bot.getGroupInfo("group_id");
const groups = await bot.getGroupList();

// 成员
const members = await bot.getGroupMembers("group_id");
const member = await bot.getMemberInfo("group_id", "user_id");

// 管理操作
await bot.banMember("group_id", "user_id", 600);        // 禁言 10 分钟（单位：秒）
await bot.banMember("group_id", "user_id", 0);         // 解除禁言
await bot.kickMember("group_id", "user_id");           // 踢出
await bot.setMemberCard("group_id", "user_id", "新名片");
await bot.setMemberAdmin("group_id", "user_id", true); // 设管理
await bot.pokeMember("group_id", "user_id");           // 戳一戳
await bot.setGroupName("group_id", "新群名");
await bot.setGroupWholeBan("group_id", true);          // 全员禁言
await bot.leaveGroup("group_id");                      // 退群
```

::: warning 权限
这些操作需要机器人本身在群里拥有对应权限（管理、群主等），平台会拒绝没权限的操作。调用前可以先 `getMemberInfo` 看看自己的角色。
:::

## 好友与资料

```typescript
const friend = await bot.getFriendInfo("user_id");
const friends = await bot.getFriendList();
await bot.deleteFriend("user_id");

await bot.setProfile({ nickname: "Miku" });  // 改资料
await bot.setAvatar("/tmp/avatar.png");       // 换头像
```

## 状态

```typescript
const status = await bot.getStatus();
// 含在线状态、收发消息数等，具体字段看适配器实现
```

## 平台特有类型

统一接口覆盖 90% 的场景，剩下的 10%（`sendLike`、`getCookie`、`pickGroup` 这种某平台独有的功能）需要拿到平台特有类型。有三种办法，按推荐顺序来：

**1. 路由推断**

监听事件时把适配器名写进路由，`event.bot` 自动就是那个平台的类型。对应的，也只能监听到对应适配器的信息：

```typescript
ctx.handle("icqq:message", async (event) => {
  await event.bot.sendLike(event.user_id);   // IcqqBot 的方法，直接可用
});
```

**2. 判断 adapter 字段收窄**

`ctx.bot`、`ctx.bots` 是**联合类型**——装了哪些适配器，就联合哪些 bot 类型（`OneBot | IcqqBot | StdinBot`）。因为每个 bot 的 `adapter` 字段是字面量，用 `if` 判断它就能让 TypeScript 自动收窄，不用任何断言：

```typescript
for (const bot of ctx.bots) {
  if (bot.adapter === "icqq") {
    await bot.sendLike(bot.bot_id);   // IcqqBot
  } else if (bot.adapter === "onebotv11") {
    await bot.getCookie("qun.qq.com"); // OneBot
  }
}
```

**3. 显式泛型 / as 断言）**

`ctx.pickBot` 和 `ctx.getAdapter` 不按字符串推断类型，要么传泛型，要么用 `as`：

```typescript
const bot = ctx.pickBot<OneBot>("10001");     // 泛型指定

// 或者拿到之后断言
import type { OneBot } from "mioku-adapter-onebotv11";
const onebot = (ctx.bot as OneBot | undefined)?.getCookie("qun.qq.com");
```

`bot.as<T>()` 也是干这个的：`bot.as<OneBot>()`。什么时候用断言？前面两种办法都够不着的时候——比如 bot 不是从事件或 `ctx.bots` 来的，而是从某个服务里拿出来的。

::: tip 类型名去哪找
适配器 bot 的类型名在它的 `src/bot.ts`（如 `OneBot`、`IcqqBot`、`StdinBot`），都是 `BotBase` 的子类型。装好适配器包后，`import type { OneBot } from "mioku-adapter-onebotv11"` 就能导入。
:::

## 兜底：平台原生 API

统一接口覆盖不了平台特有功能时，有两个出口：

```typescript
// 1. 直接调平台 API
const result = await bot.sendApi<T>("set_group_ban", {
  group_id: 123,
  user_id: 456,
  duration: 60,
});
```

`sendApi` 是最通用的逃生口，任何平台动作都能发。但它的参数类型是宽松的（`Record<string, unknown>` 或展开参数），没有 IDE 提示——能拿到平台特有类型时（见上面一节）优先用类型化方法。

## 多账号

`ctx.bots` 是全部在线 bot。批量操作时遍历即可：

```typescript
for (const bot of ctx.bots) {
  await bot.sendGroupMsg(group_id, "全体注意");
}
```

注意 `ctx.bot` 只取第一个，多账号时优先用 `event.bot` 或 `pickBot` 明确指定。

## 下一步

- [定时任务与生命周期](/developer/cron-lifecycle)
- [配置与数据存储](/developer/config-data)
