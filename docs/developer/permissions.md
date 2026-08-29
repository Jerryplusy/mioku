# 权限与访问控制

「这条指令谁能用」在 Mioku 里有两层答案：代码里用角色判断，配置里用访问控制。

## 角色：owner / admin / member

框架配置里有两份名单，写在项目 package.json 的 `mioku` 字段（见[配置文件](/guide/configuration)）：

| 名单 | 角色 |
| --- | --- |
| `owners` | 主人（owner），最高权限 |
| `admins` | 管理员（admin） |
| （其他人） | 普通成员（member） |

对应的判断方法都挂在 ctx 上，把事件传进去就行：

| 方法 | 返回 true 的条件 |
| --- | --- |
| `ctx.isOwner(event)` | 发送者是主人 |
| `ctx.isAdmin(event)` | 发送者是管理员（不含主人） |
| `ctx.isOwnerOrAdmin(event)` | 主人或管理员 |
| `ctx.hasRight(event)` | 同上，别名 |

框架会从事件里提取发送者 id（裸 id、`user_id`、`sender.user_id` 几种形态都认），再和名单比对，不同适配器的事件结构差异被它挡掉了。

一个只有主人能用的指令：

```typescript
ctx.handle("message", async (event) => {
  const text = ctx.text(event).trim();
  if (!text.startsWith(".eval")) return;

  if (!ctx.isOwner(event)) {
    await event.reply("这个指令只有主人能用哦");
    return;
  }

  // ... 只有主人能到的逻辑
});
```

::: warning 别自己解析 QQ 号
判断权限用 `ctx.isOwner(event)` 这套，别写 `event.user_id === "123456"`。事件结构因适配器而异，而且主人名单是用户在配置里改的，把 QQ 硬编码进代码等于把配置功能废了。
:::

## 访问控制：access-control.json

角色之外还有一层更细的控制：某个群就是不想让 music 插件响应，或者某条指令只想在特定人群开放。这类规则放在 `config/core/access-control.json`，core 插件第一次启动时会自动创建这个文件：

```json
{
  "version": 1,
  "global": {
    "plugins": {
      "music": { "action": "block" }
    },
    "commands": {}
  },
  "groups": {
    "123456789": {
      "plugins": {
        "impact": { "action": "block" }
      },
      "commands": {
        "chat": {
          "戳一戳触发对话": { "action": "allow" }
        }
      }
    }
  },
  "users": {
    "10001": {
      "commands": {
        "media": {
          "下载视频": { "action": "block" }
        }
      }
    }
  }
}
```

结构解读：

| 字段 | 说明 |
| --- | --- |
| `version` | 固定为 1 |
| `global` | 全局生效的规则 |
| `groups` | 按群配置，键是群号字符串 |
| `users` | 按用户配置，键是 QQ 号字符串 |

每个作用域里都是两级：`plugins` 按「插件名 → 规则」管整个插件，`commands` 按「插件名 → 指令 id → 规则」管具体指令。规则只有一个字段 `action`，取 `allow`（放行）或 `block`（拦截）。没配规则的指令一律放行——这份文件初始就是空的，默认行为是全部可用。

指令 id 是哪来的？就是你自己在 package.json 里声明的 accessHooks，下一节讲。这份文件可以手工编辑，也可以在 WebUI 的访问控制页面里改，效果一样。

## 声明 accessHooks

插件在 package.json 的 `mioku` 字段里声明哪些指令/事件可以被管控。help 插件的真实声明：

```json
{
  "mioku": {
    "accessHooks": [
      {
        "id": "帮助菜单",
        "match": "/(?:[#/]\\s*(?:帮助|菜单|help)|^(?:帮助|菜单|help)(?:\\s|$))/",
        "description": "匹配 #help / 帮助 / 菜单 等帮助指令"
      },
      {
        "id": "状态",
        "match": "/(?:[#/]\\s*(?:状态|zt|status)|^(?:状态|zt|status)(?:\\s|$))/",
        "description": "匹配 #状态 / 状态 / zt / status 等系统状态指令"
      }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 指令标识，access-control.json 的 `commands` 里用这个名字指代它 |
| `match` | 可选，匹配消息文本的正则（字符串形式） |
| `event` | 可选，命中的事件路由 |
| `description` | 可选，说明文字，WebUI 里会展示 |

不是所有指令都靠文本匹配。chat 插件的「戳一戳」是这样声明的，用的是事件路由：

```json
{
  "id": "戳一戳触发对话",
  "event": "notice.group.poke",
  "description": "群内戳一戳 bot"
}
```

### match 的匹配规则

core 插件拿到消息的纯文本（trim 过）后逐条试 hook：`match` 以 `/` 开头、`/` 结尾时按正则处理，去掉两头斜杠后 `new RegExp` 再去 test 文本；否则当普通字符串，消息等于它或以它开头就算命中。

::: warning 字符串里写正则，两头斜杠别漏
`"match": "^\\.help$"` 没有斜杠包裹，不会被当正则——它会去找一条字面上叫 `^.help$` 的消息，永远匹配不上。想写正则就老老实实写 `"/^\\.help$/"`，注意 JSON 里反斜杠要转义：正则里的 `\.` 在 JSON 源码里得写成 `\\.`。
:::

声明好之后，用户就能在 access-control.json 里针对你的指令配 allow/block 了，你一行判断代码都不用写。

### 拦截是怎么发生的

core 插件的优先级是 `-Infinity`，永远最先收到事件。它拿到事件后做三件事：

1. 收集所有插件 manifest 里声明的 accessHooks（manifest 解析时就会校验：必须是数组、每项得有 id，不合格的警告后忽略）
2. 消息进来后用这些 hook 匹配——有 `match` 的对文本，有 `event` 的对事件路由——找出命中的「插件 + 指令」
3. 拿命中结果去 access-control.json 里查规则，全局、群、用户三级里配了这条指令的都能查到，然后按规则放行或拦截

所以声明了 hook 的指令天然多一道闸门，配合 WebUI 用户不用碰代码就能管控它。

## 指令的角色标注：role

package.json 里 `mioku.help.commands` 的 `role` 字段（类型是 `CommandRole`）用来标注指令的使用门槛：

| role | 谁能用 |
| --- | --- |
| `master`（或 `owner`） | 仅主人 |
| `admin` | 主人或管理员 |
| `member` | 所有人 |

chat 插件的真实例子：

```json
{
  "help": {
    "title": "AI 聊天",
    "commands": [
      { "cmd": "/重置会话", "desc": "重置自己的AI聊天记录", "role": "member" },
      { "cmd": "/重置群会话", "desc": "重置当前群的AI聊天记录", "role": "admin" },
      { "cmd": "/tts <文本>", "desc": "TTS 推理", "role": "owner" }
    ]
  }
}
```

role 是给帮助系统看的标注，让用户知道指令的门槛；真正的拦截靠你代码里的 `ctx.isOwner` 判断和 access-control.json。AI 技能的 `permission` 字段（`SkillPermissionRole`）是同一套取值，决定哪些角色能用这个技能，不写默认 `member`。

## 内置 core 指令的权限

core 插件的系统指令默认只有主人能触发：`.plugin`、`.settings`、`.install`、`.restart`、`.log`、`.exit` 这些，消息没过主人检查就直接忽略。例外是 `.status`（`.状态`）和 `.adapter`（`.适配器`），默认所有人可看，把 `status_permission` 配成 `"admin-only"` 后就需要主人或管理员。

`.settings` 值得一提：`.settings add-owner / remove-owner / add-admin / remove-admin` 会直接改写 package.json 里的 owners/admins 名单——它能「授权」别人，所以必须锁在主人手里。顺带一提，`.settings remove-owner` 不允许删第一主人。

core 自己也声明了全套 accessHooks（比如 `settings` 的 match 是 `/^\.(settings|设置)/` 这种形式），所以系统指令同样能被 access-control.json 单独拦截。

## 参考

- [事件处理](/developer/events) —— hook 的 `event` 字段用的就是这套路由
- [类型参考 - AccessControlConfig](/reference/api/interfaces/AccessControlConfig)
- [类型参考 - AccessHook](/reference/api/interfaces/AccessHook)
- [运行时生命周期](/advanced/runtime) —— core 插件为什么总能先看到事件（优先级）
- [配置文件](/guide/configuration) —— owners / admins 在哪配
