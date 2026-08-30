# 运行时生命周期

框架从启动到退出，经历了一系列阶段，每个阶段派发对应的事件。这一章把整个生命周期铺开，方便你判断"我这个逻辑应该挂在哪个时机"。

## 启动顺序

```text
start()
 ├─ 读取 package.json 的 mioku 配置
 ├─ serviceManager.discoverServices()   发现服务（services/ 目录 + mioku-service-*）
 ├─ startRuntime()
 │   ├─ 创建 Driver / EventBus / BotRegistry / CapabilityRegistry
 │   ├─ discoverAdapters()              发现适配器候选
 │   ├─ setupPlugins()
 │   │   ├─ 加载内置 core 插件
 │   │   └─ 按 priority 加载用户插件
 │   └─ 逐个 startAdapter()
 │       ├─ create(definition) → Adapter 实例
 │       └─ adapter.start(context)
 │           ├─ registerBot / registerCapability
 │           ├─ 派发 adapter:started
 │           └─ 派发 runtime:ready
 └─ 上线通知（online_push）
```

两个要点：

1. **插件先于适配器**：插件 `setup` 时还没有任何 bot 连接。想给 bot 发消息，要么等 `bot:connected` 事件，要么等 `runtime:ready`。
2. **服务先于插件**：服务在 `startRuntime` 之前就加载完了，所以插件 `setup` 里 `getService` 一定拿得到（除非服务自己加载失败）。

## 生命周期事件

以下事件都可以用 `ctx.handle()` 监听（路由直接用），框架内部也靠它们协作：

| 事件                 | 时机          | 载荷                 |
|--------------------|-------------|--------------------|
| `adapter:started`  | 每个适配器启动成功   | `{ name }`         |
| `bot:connected`    | 每个 bot 连接建立 | `{ bot }`          |
| `bot:disconnected` | bot 断开      | `{ bot, reason? }` |
| `runtime:ready`    | 所有适配器启动完毕   | 无                  |
| `runtime:shutdown` | 开始关闭        | `{ reason? }`      |

对应关系：

```typescript
ctx.handle("bot:connected", (event) => { ... });        // 等价 ctx.onBot("connected", ...)
ctx.handle("runtime:ready", () => { ... });
```

## 关闭顺序

关闭（收到 SIGINT/SIGTERM 或调用 `stop()`）是启动的逆序：

1. 派发 `runtime:shutdown`
2. 停适配器（每个 adapter 的 `stop(reason)`）
3. 释放适配器资源（resources）与网关（gateways）
4. 卸载插件（执行每个插件的清理函数 + 取消事件监听）
5. 清空能力注册表、bot 注册表
6. `driver.shutdown()`，停服务（dispose）

清理函数里别做耗时的事——框架给了 15 秒的关闭超时，超时强制退出。

## 运行时对象

整个运行时的核心是 [MiokuRuntime](/reference/api/classes/MiokuRuntime) 类，`start()` 入口创建它并持有 driver、bus、bots、capabilities 等全部状态。插件拿到的 `ctx` 只是它的一个投影——按插件视角裁剪过的只读窗口。
