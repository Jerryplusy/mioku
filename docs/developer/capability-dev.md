# 能力系统

你写插件时用的 `bot.sendGroupMsg`、`bot.banMember` 这些方法，不是框架写死的——它们是**能力（Capability）**。适配器声明「这个平台能做这件事」，框架把声明绑成 bot 的方法，插件只调用，不关心实现。

## 能力是什么

一个能力是一个带类型的契约，由三部分组成：

- **名字**：如 `message.send`、`member.ban`
- **版本**：数字，默认 1
- **输入输出类型**：请求长什么样、返回什么

定义长这样：

```typescript
import { defineCapability } from "mioku";

// 请求：发消息的目标 + 内容
interface SendRequest {
  target: MessageTarget;
  message: MessageInput;
}

// 返回：消息 id 和发送时间
interface SendResult {
  message_id?: string;
  sent_at?: number;
}

export const messageSend = defineCapability<SendRequest, SendResult>("message.send", 1);
```

`defineCapability<I, O>(name, version)` 返回的能力对象带一个私有 token，同名同版本的能力全局唯一——这是防止两个适配器悄悄覆盖同一个实现。

## 内置能力清单

框架在 `mioku` 顶层导出全部内置能力（`packages/mioku/src/capabilities/`），按域分组：

| 域  | 能力                                                                                                                            | 对应的 bot 方法                                                                                                                    |
|----|-------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| 消息 | `messageSend` / `messageRecall` / `messageGet` / `messageGetForward` / `forwardSend`                                          | `sendMessage` / `recallMessage` / `getMessage` / `getForwardMessage` / `sendForward`                                          |
| 成员 | `memberBan` / `memberKick` / `memberSetCard` / `memberSetAdmin` / `memberSetTitle` / `memberPoke` / `memberGetInfo`           | `banMember` / `kickMember` / `setMemberCard` / `setMemberAdmin` / `setMemberTitle` / `pokeMember` / `getMemberInfo`           |
| 群  | `groupGetInfo` / `groupGetList` / `groupGetMembers` / `groupLeave` / `groupSetName` / `groupSetWholeBan` / `groupSetPortrait` | `getGroupInfo` / `getGroupList` / `getGroupMembers` / `leaveGroup` / `setGroupName` / `setGroupWholeBan` / `setGroupPortrait` |
| 好友 | `friendGetInfo` / `friendGetList` / `friendDelete`                                                                            | `getFriendInfo` / `getFriendList` / `deleteFriend`                                                                            |
| 资料 | `profileSet` / `avatarSet`                                                                                                    | `setProfile` / `setAvatar`                                                                                                    |
| 会话 | `conversationGetHistory`                                                                                                      | `getHistory`                                                                                                                  |
| 系统 | `botStatus`                                                                                                                   | `getStatus`                                                                                                                   |

每个能力的请求/返回类型也在顶层导出（`MessageSendRequest`、`MemberBanRequest` 等），适配器实现时对着类型填就行。

## 适配器侧：注册实现

适配器在 `start` 里通过 `AdapterContext.registerCapability` 注册，**必须指定作用目标**：

```typescript
context.registerCapability(
  messageSend,
  { adapter: "onebotv11", bot_id: "10001" },
  async (req) => platformSend(req.target, req.message),
);
```

目标（`CapabilityTarget`）有三个定位维度：

| 字段            | 作用                   |
|---------------|----------------------|
| `adapter`     | 适配器名，必填              |
| `bot_id`      | 具体 bot，可选；不填表示适配器级实现 |
| `resource_id` | 更细的资源，可选（比如某个网关）     |

所以同一个能力在不同 bot 上可以有不同的实现——多账号时每个 bot 各注册一份。注册返回取消函数，`stop` 时反注册。

实现时注意：`handler` 收到的输入就是插件传来的请求对象，你要负责把它翻译成平台指令，并把结果翻译成契约里的返回类型。**能力只承诺输入输出，不承诺平台实现**——这也是插件能在多平台间无差别运行的原因。

## 插件侧：调用

插件拿到的 bot 已经绑好了所有已注册能力，直接调方法：

```typescript
await event.bot.banMember("group_id", "user_id", 600);
await event.bot.getGroupList();
```

这些方法由 `bindCapabilities` 在 bot 注册时生成——它遍历能力注册表，把每个能力绑成同名方法（`message.send` → `sendMessage`）。插件永远不需要直接接触注册表。

**自定义能力怎么调？** 框架内置的 `bindCapabilities` 只绑定内置方法。自定义能力没有现成方法，插件用 `sendApi` 或直接查注册表调用：

```typescript
// 直接调注册表
await ctx.capabilities.invoke(
  { adapter: "my", bot_id: bot.bot_id },
  myCustomCapability,
  { keyword: "hello" },
);

// 让 bot 自己转发
await bot.sendApi("my.custom_action", { keyword: "hello" });
```

## 自定义一个能力

内置能力不够用时，自己定义。完整的链路：适配器定义能力 → 注册实现 → 插件调用。

**1. 适配器包内定义能力并导出：**

```typescript
// adapter/src/capabilities.ts
import { defineCapability } from "mioku";

export interface SpeakRequest {
  text: string;
  voice?: "xiaoai" | "yunxi";
}

export const ttsSpeak = defineCapability<SpeakRequest, { task_id: string }>("my.tts_speak", 1);
```

**2. 适配器注册实现：**

```typescript
context.registerCapability(
  ttsSpeak,
  { adapter: "my", bot_id: BOT_ID },
  async (req) => submitTtsTask(req.text, req.voice),
);
```

**3. 插件调用（用 `defineService` 那套思路，把能力引用定义到公共位置）：**

```typescript
import { ttsSpeak } from "mioku-adapter-my";

// 插件里找到目标 bot 后调用
const bot = ctx.pickBot("10001");
if (bot && ctx.capabilities.supports({ adapter: "my", bot_id: bot.bot_id }, ttsSpeak)) {
  const result = await ctx.capabilities.invoke(
    { adapter: "my", bot_id: bot.bot_id },
    ttsSpeak,
    { text: "你好" },
  );
}
```

## 出错与预检

- 目标上没有注册某个能力时调用，抛 `UnsupportedCapabilityError`（消息里带能力名）
- 调用前可以用 `registry.supports(target, capability)` 预检，返回布尔——插件想优雅降级（「这个平台不支持语音合成，我发文字吧」）就靠它
- 同名同版本能力对同一目标重复注册会直接抛错，防止两个适配器抢同一个实现

## 版本化

`defineCapability(name, version)` 的 version 默认 1。同名不同版本视为**不同**的能力（token 不同），互不干扰：

- 适配器升级能力实现但保持契约不变 → 版本不变，老插件无缝继续用
- 契约变了（请求/返回结构改了）→ bump 版本，新老实现可以并存，插件显式选择用哪个

## 参考

- [开发适配器](/developer/adapter-dev) —— 能力在哪注册、怎么和 bot 配合
- [defineCapability 类型参考](/reference/api/functions/defineCapability)
- [CapabilityRegistry 类型参考](/reference/api/classes/CapabilityRegistry)
