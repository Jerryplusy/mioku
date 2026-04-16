# 快速开始

> 本教程适用全系统，包括但不限于Mac/Win/Linux，只需要打开系统的终端按照教程操作即可 ;]

## 环境要求

- 一台服务器，不需要公网，运行内存大于100M即可
- [Node.js](https://nodejs.org/) 运行环境，推荐使用LTS版本
- 推荐使用 [bun](https://bun.sh/) 作为包管理工具，也可使用npm或pnpm等包管理工具

> 一键安装bun命令: `npm install -g bun`

- [git](https://git-scm.com/) 用于版本管理和 WebUI 安装插件等
- chromium 内核的浏览器，用于系统截图服务，缺失将无法使用大部分插件功能

> 常见支持的浏览器有 Chrome(推荐) / Edge / chromium(Chrome的开源版本)

- [ffmpeg](https://ffmpeg.org/) 用于音频与视频处理，部分插件可能用到
- 一个可连接的 [NapCat](https://doc.napneko.icu/) / [OneBot v11](https://onebot.dev/) 实现端

## 安装

以手动安装为例，也支持使用 [Docker / Docker Compose](/guide/deployment) 进行安装

```bash
git clone https://github.com/mioku-lab/mioku.git
cd mioku
bun install
```

## 启动

```bash
bun run start
```

## 首次启动

首次启动会引导你填写：

- NapCat 地址 (正向WebSocket连接，即Mioku作为客户端)
- NapCat 端口
- NapCat token
- 主人 QQ

如果还没安装 WebUI，也会询问是否安装。

> 示例配置：  
> NapCat 地址: localhost  
> Napcat 端口: 7000  
> NapCat token: 114514  
> ...  

稍后也可以自行修改配置文件或前往 WebUI 修改

## 下一步

- [WebUI的安装与使用](/guide/webui)
- [使用更多部署方式安装(如Docker)](/guide/deployment)
- [了解配置文件规范](/guide/configuration)
- [查看插件市场](/guide/plugin-market)

## 开发命令

```bash
bun run dev # 开发模式
bun run build # 构建包 通常用于检测是否有问题
bun run docs:dev # 文档开发模式
bun run docs:build # 文档构建
```
