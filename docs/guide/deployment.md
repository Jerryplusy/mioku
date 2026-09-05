---
title: 部署方式
description: Mioku 机器人部署指南
---

# 部署方式

机器人本质是一个 Node 进程（`bun run start`），部署的核心问题只有一个：**怎么让它一直活着**。

## 最简单的方式：pm2

[pm2](https://pm2.io/) 是 Node 生态最常用的进程守护工具，进程挂了自动拉起，还能看日志。

```bash
npm install -g pm2
```

在项目目录启动：

```bash
pm2 start "bun run start" --name mioku
pm2 save                 # 保存进程列表
pm2 logs mioku           # 看日志
pm2 restart mioku        # 重启
```

## 开机自启

pm2 自带开机自启：

```bash
pm2 startup
```

执行后会输出一条命令，复制到终端跑一遍即可。

## 服务器部署

服务器上部署的流程和本机完全一样：装 Node / bun → `npx mioku` 创建项目 → 配置适配器 → `pm2 start`。

几个注意点：

- **不需要公网**：机器人是主动连接 NapCat 的（正向 WebSocket），NapCat 在哪都行
- **截图服务需要 chromium**：服务器上记得装 Chrome / Edge，否则截图类功能不可用
- **WebUI 端口**：如果服务器有防火墙，记得放行 3339（或改成别的端口）

## 常见问题

### 端口被占用

WebUI 默认 3339 被占用时，改 `config/webui/settings.json`：

```json
{
  "port": 3338
}
```

### 用 systemd 而不是 pm2

习惯 systemd 的话，写个 service 文件也行：

```ini
[Unit]
Description=Mioku Bot
After=network.target

[Service]
WorkingDirectory=/path/to/my-bot
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
