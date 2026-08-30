# 驱动器

适配器要连平台、要发请求，总得有个网络出口。这个出口就是**驱动器（Driver）**——框架提供的 HTTP 与 WebSocket 客户端抽象。

## 是什么

适配器通过 `context.getDriver()` 拿到驱动器，用它的 `http` 和 `websocket` 两个客户端做事：

```typescript
const driver = context.getDriver();

// HTTP 请求
const res = await driver.http.request({
  method: "GET",
  url: "https://api.example.com/status",
});
const data = res.json();

// WebSocket 连接
const ws = await driver.websocket.connect("ws://localhost:3001", {
  headers: { Authorization: "Bearer token" },
  connectTimeout: 10_000,
});
```

[Driver 接口](/reference/api/interfaces/Driver) 定义在 `packages/mioku/src/driver/`，具体实现叫 `createDefaultDriver`——内部是 fetch + WebSocket（Node 22 原生能力），带超时与关闭保护。

## 为什么要有这一层

直接把 fetch / WebSocket 写进适配器不是更简单？有几个原因：

1. **可替换**：驱动器的实现可以整体替换（比如换自定义的代理、TLS 配置、网络策略），适配器代码一行不用改
2. **统一超时与错误**：`WebSocketConnectTimeoutError`、`HttpRequestError` 这类错误类型统一，适配器处理网络问题有章可循
3. **生命周期一致**：框架关闭时会调用 `driver.shutdown()`，所有连接统一清理，适配器不用自己管

## 适配器怎么用

适配器里拿驱动器的标准姿势：

```typescript
const build = (config, logger): Adapter => ({
  name: "my-adapter",
  version: "1.0.0",
  async start(context) {
    const driver = context.getDriver();
    const ws = await driver.websocket.connect(config.url, {
      connectTimeout: 15_000,
    });

    // 收消息
    ws.onMessage((data) => {
      const event = parseEvent(data);
      if (event) context.dispatch(event);
    });

    // 断线重连
    ws.onClose(() => {
      if (!stopped) connect();
    });

    ws.onError((err) => logger.error("ws 错误", err));
  },
  async stop() {
    await ws?.close(1000, "adapter stop");
  },
});
```

## 驱动器 vs 适配器网关

适配器内部还可以注册多个**网关（Gateway）**——每个网关是一条独立的连接单元，和驱动器的区别是：网关是适配器自己的概念（业务连接，比如每个 bot 一条连接），驱动器是框架的（底层网络客户端）。多账号适配器常用网关管理多条连接，见 [AdapterGateway](/reference/api/interfaces/AdapterGateway)。

## 插件能拿到驱动器吗

能。`ctx.getDriver()` 返回同一个驱动器实例。但插件一般用不到——需要网络请求时直接用 fetch 就行，驱动器是给适配器用的抽象。想给平台写适配器，看[开发适配器](/developer/adapter-dev)。
