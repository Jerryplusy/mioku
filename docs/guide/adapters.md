---
title: 适配器
description: Mioku 适配器（Adapter）负责对接具体平台
---

# 适配器

适配器（Adapter）是机器人与平台之间的桥梁。它负责两件事：

- **收**：把平台的原始消息转换成 Mioku 的统一事件，交给插件处理
- **发**：把插件的操作翻译回平台能懂的指令

对插件来说，适配器是透明的——它只调用能力方法（`sendGroupMsg`、`banMember`……），不关心背后是哪个平台。这也意味着同一个插件可以不加修改地跑在 QQ、终端、甚至未来的任何平台上。

## 安装与启用

适配器就是普通的 npm 包，装进项目的 `dependencies` 后在 `mioku.adapters` 里启用。创建项目时用 `npx mioku` 选择即可，也可以事后手动装：

```bash
bun add mioku-adapter-onebotv11
```

```json
{
  "mioku": {
    "adapters": {
      "onebotv11": {
        "instances": []
      }
    }
  }
}
```

框架启动时会在项目直接依赖里按 `mioku-adapter-` 前缀找适配器包，然后读取 `mioku.adapters` 中对应的配置启动。**适配器必须装进 `dependencies`（不能只放 `devDependencies`）**，否则发现不到。

## 配置向导

每个适配器可以带一个 CLI 配置向导，在项目目录下运行 `mioku-adapter-<名称>`（或 `bunx mioku-adapter-<名称>`）就会启动交互式向导，帮你生成 `mioku.adapters` 里的配置。创建项目时选择了适配器，向导会自动运行。

## 多账号

所有适配器都支持多实例。启动后每个实例是一个 bot，插件里用 `ctx.bots` 拿到全部、`ctx.pickBot(id)` 按 bot_id 取单个，或者用 `ctx.bot` 直接取第一个。详见[操作 Bot](/developer/bot)。

## 开发自己的适配器

适配器接口是开放的，`defineAdapter` 定义一个适配器只要实现创建函数和启动/停止逻辑，再注册一批能力。想给某个平台写适配器，看[开发适配器](/developer/adapter-dev)。
