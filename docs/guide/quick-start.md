# 快速开始

> 本教程适用全系统，包括但不限于 Mac / Win / Linux，只需要打开系统的终端按照教程操作即可 ;]

## 环境要求

- 一台能跑 Node 的设备，内存大于 100M 即可，不需要公网
- [bun](https://bun.sh/) —— JavaScript 运行时兼包管理器

> 一键安装 bun：`npm install -g bun`

- chromium 内核的浏览器（Chrome / Edge / chromium），截图服务要用，缺失会导致大部分插件功能不可用
- [ffmpeg](https://ffmpeg.org/)，音频与视频处理，部分插件可能用到

如果只是先体验框架，上面两项可以先不管，装上 bun 即可

## 创建项目

使用 `npx mioku` 一键创建：

```bash
npx mioku
```

命令会交互式引导你填写：

- **项目名称** —— 比如 `my-bot`
- **主人 QQ** —— 机器人管理员的 QQ 号，必填
- **适配器** —— 选择要接入的平台
- **插件** —— 从 npm 市场挑选要装的插件
- **WebUI** —— 是否安装管理面板（建议安装）

> 如果选择了 `onebotv11` 等适配器，项目创建后会自动运行适配器的连接向导
> （填 NapCat 地址、端口、token 之类），见[适配器](/guide/adapters)。

## 使用标准输入

创建好的项目默认启用了 `mioku-adapter-stdin`，不接任何平台也能跑。进入项目目录启动：

```bash
cd my-bot
bun run start
```

启动完成后，直接就在终端里输入：

```text
mioku> .status        # 查看运行状态
mioku> .adapter       # 查看适配器与连接实例
mioku> hello          # 和插件交互
mioku> .help          # 查看系统指令
```

## 接入平台

终端只能用来调试，真正上聊天平台需要装一个适配器并配置连接。两种方式：

1. **项目创建时**选了适配器（比如 `onebotv11`），向导已经帮你配好了
2. 项目创建后想修改适配器设置，可以更改配置：

```json
{
  "mioku": {
    "adapters": {
      "onebotv11": {
        "instances": [
          { "protocol": "ws", "host": "localhost", "port": 3001, "token": "" }
        ]
      }
    }
  }
}
```

然后 `bun run start`，看到「成功连接 x 个实例」就说明上线了。详细的适配器安装与配置见[适配器](/guide/adapters)。

## 系统指令

以下指令由内置 core 插件提供，默认需要主人权限（前缀 `.` 可在配置里改）：

| 指令                                         | 作用           |
|--------------------------------------------|--------------|
| `.help`                                    | 查看帮助         |
| `.status`                                  | 查看运行状态       |
| `.adapter`                                 | 查看适配器与连接实例   |
| `.log`                                     | 查看最近 100 条日志 |
| `.plugin list / enable / disable / reload` | 插件管理         |
| `.settings detail / add-owner / add-admin` | 框架设置管理       |
| `.install plugin/service <名称>`             | 安装插件 / 服务    |
| `.uninstall plugin/service <名称>`           | 卸载插件 / 服务    |
| `.plugin-market` / `.service-market`       | 查看插件 / 服务市场  |
| `.update [all/self/包名]`                    | 更新           |
| `.restart`                                 | 重启进程         |
| `.exit`                                    | 退出进程         |

> 不想用指令的话，也可以在项目根目录直接用 bun 管理软件包，比如 `bun add mioku-plugin-60s`，
> 装完在 `package.json` 的 `mioku.plugins` 里加上 `60s` 再重启即可。
> 完整市场列表见[插件市场](/guide/market)。

## 下一步

- [认识 Mioku](/guide/introduction) —— 理解插件、服务、适配器各是什么
- [适配器](/guide/adapters) —— 接入 QQ / 多账号
- [配置文件](/guide/configuration) —— `mioku` 字段全解
- [开发你的第一个插件](/developer/first-plugin)
