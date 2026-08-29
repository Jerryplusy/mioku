# 配置文件

Mioku 的配置分两部分：**框架配置**写在项目根目录的 `package.json` 的 `mioku` 字段里，**插件/服务配置**放在 `config/` 目录下。备份机器人时注意 `config/` 和 `data/` 两个目录即可。

## 框架配置（package.json）

项目创建时生成的 `package.json` 大概长这样：

```json
{
  "name": "my-bot",
  "type": "module",
  "dependencies": {
    "mioku": "latest",
    "mioku-adapter-stdin": "latest"
  },
  "mioku": {
    "prefix": ".",
    "owners": ["123456789", "stdin"],
    "admins": [],
    "plugins": ["demo", "help", "chat"],
    "plugins_dir": "plugins",
    "log_level": "info",
    "online_push": false,
    "error_push": false,
    "status_permission": "all",
    "adapters": {
      "stdin": {}
    }
  }
}
```

各字段说明：

| 字段                  | 类型       | 默认值         | 说明                                                           |
|---------------------|----------|-------------|--------------------------------------------------------------|
| `prefix`            | string   | `"."`       | 系统指令前缀，比如 `.status`                                          |
| `owners`            | string[] | `[]`        | 主人 QQ 列表，最高权限，必填                                             |
| `admins`            | string[] | `[]`        | 管理员 QQ 列表                                                    |
| `plugins`           | string[] | `[]`        | 启用的插件名列表                                                     |
| `plugins_dir`       | string   | `"plugins"` | 本地插件目录（插件会先在这里找）                                             |
| `log_level`         | string   | `"info"`    | 日志级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `online_push`       | boolean  | `false`     | 启动完成后是否给第一个主人推送上线通知                                          |
| `error_push`        | boolean  | `false`     | 发生错误时是否推送                                                    |
| `status_permission` | string   | `"all"`     | 谁可以看 `.status` / `.adapter`：`all` 或 `admin-only`             |
| `adapters`          | object   | `{}`        | 适配器配置，见[适配器](/guide/adapters)                                |

> 修改 `package.json` 后需要重启才生效；`.settings` 系列指令（如 `.settings add-owner`）会直接改写这里的字段。

## 插件配置（config/）

插件的配置统一放在 `config/<插件名>/` 下，每个配置文件是一个 JSON：

```text
config/
├── core/
│   ├── base.json            # core 插件基础配置
│   └── access-control.json  # 访问控制
├── chat/
│   ├── base.json
│   ├── settings.json
│   └── personalization.json
└── help/
    ├── demo.json
    └── status.json
```

配置文件由插件自己通过配置服务注册和读取（`registerConfig` / `getConfig`），修改文件保存后插件会收到热重载通知。给某个插件改配置，直接编辑对应 JSON 文件即可，不需要碰代码。

## 服务配置（config/service/）

服务的配置单独放在 `config/service/<服务名>/` 下：

```text
config/service/
└── ai/
    ├── providers.json
    └── models.json
```

服务配置的读写由框架提供（`registerServiceConfig` / `getServiceConfig`），WebUI 的配置页面也基于这套接口。

## 数据目录（data/）

插件产生的数据（数据库、缓存、下载的文件）放在 `data/<插件名>/` 下。插件里用 `createStore` 创建的 JSON 存储默认就在这个位置：

```text
data/
├── chat/
│   └── sessions.json
└── 60s/
    └── data.json
```

> 升级框架或换机器时，`config/` 和 `data/` 直接拷贝就能带走，插件本身靠 npm 重新安装。