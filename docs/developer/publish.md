# 发布插件

插件在本地 `plugins/` 目录里写好了，想分享给别人，就发布成 npm 包。

## 发布前检查清单

```json
{
  "name": "mioku-plugin-weather",
  "version": "1.0.0",
  "description": "查天气插件",
  "main": "index.ts",
  "type": "module",
  "keywords": ["mioku"],
  "peerDependencies": {
    "mioku": "^1.0.0"
  }
}
```

| 字段                 | 要求                                                           |
|--------------------|--------------------------------------------------------------|
| `name`             | 必须是 `mioku-plugin-<短名>` 格式，短名要和你 `definePlugin` 里的 `name` 一致 |
| `main`             | 指向插件入口，一般就是 `index.ts`（框架用 jiti 加载，直接发 TS 没问题）               |
| `type`             | `"module"`                                                   |
| `keywords`         | **必须包含 `"mioku"`**，市场搜索全靠它过滤，漏了就搜不到                          |
| `peerDependencies` | 声明 `mioku: "^1.0.0"`，别把框架写成 `dependencies` 装进自己包里            |

## manifest：mioku 字段

`package.json` 的 `mioku` 字段是插件对框架的声明，框架认三个键：`services`、`help`、`accessHooks`。写别的键没用——会被忽略并打一条「含未知字段」的警告。

一个完整的例子：

```json
{
  "name": "mioku-plugin-weather",
  "version": "1.0.0",
  "description": "查天气插件",
  "main": "index.ts",
  "type": "module",
  "keywords": ["mioku"],
  "mioku": {
    "services": ["ai", "config"],
    "help": {
      "title": "天气",
      "description": "查询城市天气",
      "commands": [
        {
          "cmd": "天气 <城市>",
          "desc": "查询指定城市的当前天气",
          "usage": "天气 上海",
          "role": "member"
        }
      ]
    },
    "accessHooks": [
      {
        "id": "天气指令",
        "match": "/^天气/",
        "description": "匹配「天气」开头的消息"
      }
    ]
  },
  "peerDependencies": {
    "mioku": "^1.0.0"
  }
}
```

三个键各管一摊：

| 键 | 类型 | 作用 |
| --- | --- | --- |
| `services` | 字符串数组 | 声明依赖的服务短名，用户安装时 CLI 会自动补装缺的服务包 |
| `help` | 对象 | 插件的帮助信息，框架启动时自动注册进帮助服务 |
| `accessHooks` | 数组 | 访问钩子，声明插件对哪些消息感兴趣，供访问控制展示与拦截 |

写错了也不会炸，但有代价：`services` 不是数组会被整个丢弃，`help.commands` 的某项缺 `cmd` 或 `desc` 会被跳过，`accessHooks` 的项缺 `id` 会被忽略。启动日志里都会提醒，看到就修。

### 帮助信息怎么写

`mioku.help` 会被框架自动收集，注册进帮助服务，所以 `#help` 图片里能不能正确展示你的插件，全看这段 JSON：

| 字段 | 说明 |
| --- | --- |
| `title` | 插件名，展示在帮助里 |
| `description` | 一句话介绍 |
| `commands[].cmd` | 指令写法，如 `/重置会话` |
| `commands[].desc` | 指令说明 |
| `commands[].usage` | 用法示例（可选） |
| `commands[].role` | 指令权限（可选） |

`role` 对应命令权限，写的是「谁能用」：

| 值 | 谁 |
| --- | --- |
| `member` | 任意成员 |
| `admin` | bot 主人或管理员 |
| `master` | 仅 bot 主人 |
| `owner` | `master` 的旧写法，等价 |

这个字段只是帮助展示用的声明，真正的权限拦截还是要在你自己的 handler 里做（`ctx.isOwner(event)`、`ctx.isOwnerOrAdmin(event)` 这些）。

`accessHooks` 的每一项：`id` 必填，`match` 是匹配文本的正则字符串（如 `/^\.help$/`），`event` 是命中的事件路由（如 `notice.group.poke`），`description` 随便写。它主要服务于访问控制系统，让用户知道你的插件会碰哪些消息。参考 chat 插件的写法——戳一戳对话就是用一条 `event: "notice.group.poke"` 的钩子声明的。

## 发布到 npm

检查完就可以发了：

```bash
npm publish
# 或者
bun publish
```

版本号按语义化版本来：修 bug 升 patch（1.0.1），加功能升 minor（1.1.0），改了用法、别人必须跟着改代码的升 major（2.0.0）。发完不用通知谁，用户那边 `mioku update` 就能更到。

## 下一步

- [第一个插件](/developer/first-plugin) —— 还没写过插件的话，从这里开始
- [插件市场](/guide/market) —— 用户是怎么安装、更新你的插件的
- [PluginPackageConfig 类型参考](/reference/api/interfaces/PluginPackageConfig)
