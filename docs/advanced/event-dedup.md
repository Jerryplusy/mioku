# 消息与事件去重

Mioku 可能同时连接多个适配器，也可能在同一适配器中连接多个 Bot。相同的 QQ 消息因此可能被底层连接投递多次。为了避免插件重复执行，框架提供了两层相关机制：

- 适配器事件标识：适配器为原始事件构造统一的 `identity`，供核心判重使用。
- 插件 handler 去重：过滤多个 Bot 或适配器映射到的重复事件。

## 处理流程

```text
平台事件
  ↓
适配器原始事件去重
  ↓
构造统一 Event / MessageEvent
  ↓
AdapterContext.dispatch()
  ├─ 运行时 Bot 循环保护
  └─ EventBus.dispatch()
       └─ ctx.handle() 包装器中的事件去重
            └─ 插件 handler
```

- 循环保护根据 `event.user_id` 判断发送者是否是运行时内的另一台 Bot。
- 去重根据事件内容和来源字段判断它是否是同一条事件的重复投递。

## 适配器层去重

OneBot v11 和 icqq 会在适配器内部维护原始事件缓存。带有 `message_id`、`flag` 等强标识的事件优先使用强标识；没有强标识时，适配器会使用事件类型、来源和时间等字段组成指纹。

QQ 官方适配器会先根据网关 dispatch 的事件 ID 去重，避免重连或网关重复投递同一个 dispatch。

所有适配器实例构造出的 `message`、`notice` 和 `request` 都会交给核心，由每个插件 handler 自己决定是否启用指纹去重。

因此 `!message`、`!notice` 和 `!request` 可以覆盖同一适配器的多个实例。

## handler 层去重

普通的 `ctx.handle()` 会为这个 handler 建立一个去重器：

```ts
ctx.handle("message", async (event) => {
  // 同一 handler 在去重窗口内只执行一次
});
```

### 绕过去重

在路由前加 `!` 即可绕过该 handler 的去重：

```ts
ctx.handle("!message", async (event) => {
  // 每个收到的事件都会执行
});

ctx.handle("!notice.group", async (event) => {
  // 每个群通知都会执行
});

ctx.handle("!request.friend", async (event) => {
  // 每个好友申请都会执行
});
```

如果传入路由数组，只要数组中有一个路由带 `!`，这次注册会整体绕过去重。建议不要在同一个数组中混合普通路由和绕过去重路由，直接拆成两次 `ctx.handle` 更清晰。

## 消息指纹

消息 handler 的指纹由以下部分组成：

```text
消息类型 | 发送者标识 | 消息内容
```

发送者优先使用 `event.sender.nickname`，没有昵称时回退到 `event.user_id`。这样做是为了让 OneBot/icqq 的 QQ 号和 QQ 官方的 openid 在昵称一致时仍有机会关联。

消息内容按段规范化：

- 文本段取前 256 个字符；
- `at` 段保留目标 ID；
- `face` 段只保留段类型；
- 其他段只保留段类型；
- `reply` 段不参与指纹。

消息去重窗口为 15 秒。窗口内相同指纹的后续消息会被丢弃；窗口过期后，同样内容可以再次处理。

由于不同适配器的群 ID、用户 ID 可能不在同一命名空间，指纹没有把 Bot ID、适配器名和群 ID 作为必要条件。这个策略能合并跨协议重复消息，但也意味着以下情况可能被误判为重复：

- 同一用户在不同群发送完全相同的内容；
- 两个用户昵称相同且同时发送完全相同的内容；
- 适配器没有提供稳定昵称，只能回退到各自不同的用户 ID。

如果插件不能接受这种行为，应使用 `!message`，在 handler 内自行使用平台 ID、群 ID 或消息 ID 做更严格的判断。

带 `@` 的消息仍然会按普通消息指纹处理。是否“@ 到当前 Bot”属于插件业务判断，应由插件检查 `event.is_to_me` 或 `at` 段目标，不应依赖去重器选择 Bot。

## notice 与 request 指纹

通知和请求事件同样经过普通 `ctx.handle` 的去重器。

### notice

通知指纹包含：

- `notice_type`
- `sub_type`
- `group_id`
- `user_id`
- `operator_id`
- 适配器提供的 `identity.fingerprint`
- 事件时间（按秒归一化）

通知去重窗口为 60 秒。例如同一成员变更通知被两个 Bot 同时收到时，同一个普通 handler 只会执行一次。

### request

请求指纹包含：

- `request_type`
- `sub_type`
- `group_id`
- `user_id`
- `comment`
- `identity.fingerprint`
- 事件时间（按秒归一化）

请求去重窗口同样为 60 秒。需要确保每一次申请都触发动作的插件，应使用：

```ts
ctx.handle("!request.group.invite", async (event) => {
  await event.approve();
});
```

## 与 WeakSet 去重的区别

`ctx.handle` 还有一层针对同一个 JavaScript 事件对象的 `WeakSet` 保护：

```text
同一个 Event 对象通过多个匹配路由到达同一个 handler
  → handler 只执行一次
```

它只识别“同一个对象实例”。不同适配器各自构造出的两个对象，即使内容完全相同，也必须依赖上面的指纹去重。

`!message` 只绕过指纹去重，仍然保留 WeakSet 保护。因此同一个 Event 对象重复 dispatch 时，单个 handler 仍不会执行两次。

## 建议

| 需求                           | 写法                                         |
|------------------------------|--------------------------------------------|
| 普通消息、通知、请求只处理一次              | `ctx.handle("message", ...)`               |
| 赞我、统计每个 Bot 的收到次数、逐 Bot 执行动作 | `ctx.handle("!message", ...)`              |
| 每个请求都必须触发审批逻辑                | `ctx.handle("!request.group.invite", ...)` |
| 需要严格按群号、用户号、消息 ID 控制         | 使用 `!` 绕过默认指纹，在 handler 内判断                |
| 判断是否 @ 当前 Bot                | 检查 `event.is_to_me` 或 `at` 段目标             |

`!` 不是权限控制，也不是循环保护开关。绕过去重后，插件必须自行保证幂等性，否则多个 Bot 的重复事件会真实执行多次。
