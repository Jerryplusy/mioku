# WebUI

## 安装

首次启动时可以直接选择安装 WebUI。也可以在根目录运行脚本：

```bash
bun run mioku-install webui
```

或手动安装

```bash
# 安装 WebUI 服务
git clone https://github.com/mioku-lab/mioku-service-webui.git src/services/webui
# 安装依赖
bun install
```

从[WebUI Release](https://github.com/mioku-lab/mioku-webui/releases)下载最新的dist预构建文件

并解压到`src/services/webui/`目录

安装完成后重新启动 Mioku

## 首次登录

如果还没有登录密钥，启动时会生成：

```text
config/webui/auth.json
```

示例：

```json
{
  "token": "your-webui-token",
  "createdAt": 1740000000000,
  "expiresAt": 2050000000000
}
```

## 默认地址

默认监听：

- `http://0.0.0.0:3339`

如果你是本机访问，通常直接打开：

```text
http://127.0.0.1:3339
```

## 可以做什么

WebUI 主要用于：

- 管理插件和服务，包括插件的更新和从插件市场下载插件/服务等
- 编辑插件配置，WebUI 可以加载插件自定义的`config.md`规范文件，渲染插件自定义配置界面

> 插件自定义配置界面详细信息见[文档开发者部分](/developer/plugin-advanced)

- 查看和修改 AI 配置
- 查看数据库和日志
- 检查与更新 Mioku

## 修改 WebUI 设置

WebUI 设置文件位于：

```text
config/webui/settings.json
```

示例：

```json
{
  "host": "0.0.0.0",
  "port": 3339,
  "packageManager": "bun"
}
```

## 关于 WebUI

[WebUI仓库地址](https://github.com/mioku-lab/mioku-webui.git)

[WebUI服务地址](https://github.com/mioku-lab/mioku-service-webui.git)

使用 MIT 协议开源

技术栈：

- Vite
- React
- TailwindCSS

开发：

```bash
git clone https://github.com/mioku-lab/mioku-webui.git
cd mioku-webui
bun install
bun run dev # 开发模式
bun run build # 运行构建
```
