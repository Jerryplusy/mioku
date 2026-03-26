# Mioku

> AI-powered bot application based on mioki

基于 [mioki](https://mioki.viki.moe/) 的出音味来框架。

## 特性

- 🔌 **插件系统** - 支持独立 Git 仓库管理，支持热插拔
- 🛠️ **服务架构** - 可复用的服务层，插件声明式依赖
- 🤖 **AI Skill 系统** - 插件可注册 Skill，包含多个 AI 工具
- 📚 **帮助系统** - 插件帮助信息自动注册和生成
- ⚙️ **配置管理** - 插件独立配置，支持热更新
- 📦 **Workspace 管理** - 插件和服务独立依赖管理

## 快速开始(推荐)

> 推荐使用bun管理依赖，也可使用npm/pnpm :)

```bash
git clone https://github.com/Jerryplusy/mioku.git

cd mioku

# 安装依赖
bun install
```

## 本地启动

```bash
bun run start
```

第一次启动时会自动创建 `config/mioku.json`，并引导你填写 NapCat 正向 WS 配置。

如果当前目录还没有安装 WebUI，首次启动还会额外询问是否现在安装 WebUI。

> 除了 NapCat，还可以使用其他任何符合 OneBot v11 协议的实现端如 LLTwoBot/Lagrange 等。可能会出现少许兼容性问题。

## 安装 WebUI（手动）

```bash
# 使用脚本安装webui
./install-mioku.sh webui

# 更多脚本功能请运行./install-mioku.sh查看
```

安装完成后，再次执行 `bun run app`，首次会提示设置 WebUI 登录密钥。

## 插件/服务安装和管理

推荐使用webui进行管理   
也可手动安装插件，进入config目录配置插件

```bash
# 使用脚本安装插件
./install-mioku.sh plugin <repo-url>

```

### Docker Compose(推荐)

```bash
docker compose up --build
```

第一次初始化完成后，后续可以使用后台启动。

```bash
docker compose up -d
```

仓库已经提供 [`docker-compose.yml`](./docker-compose.yml)，默认会挂载：

- `./config -> /app/config`
- `./data -> /app/data`
- `./logs -> /app/logs`

这意味着你可以直接修改宿主机上的配置文件，重启容器后立即生效。

## Docker

```bash
docker build -t mioku .

docker run --rm -it \
  --name mioku-init \
  --add-host=host.docker.internal:host-gateway \
  -p 3339:3339 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  mioku
```

第一次运行会在终端里询问初始配置

配置会写入挂载出来的 `./config`。初始化完成后，可以选用后台模式启动：

```bash
docker run -d \
  --name mioku \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 3339:3339 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  mioku
```

### Docker 更新

> 使用Docker安装更新比手动安装复杂得多，需先拉取最新代码后重新构建容器

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

如果你用的是 `docker run`，流程对应为：

```bash
git pull
docker build -t mioku .
docker rm -f mioku
docker run -d \
  --name mioku \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 3339:3339 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  mioku
```

## 核心概念

### 服务 (Service)

服务是可复用的功能模块，提供 API 供插件使用。

**内置服务：**

- **ai** - AI 服务，管理 AI 实例和 Skill
- **config** - 配置管理服务
- **help** - 帮助系统服务

### 插件 (Plugin)

插件是独立的功能单元，可以依赖服务，提供 AI Skill。

### AI Skill 系统

每个插件可以注册一个 Skill，Skill 包含多个工具（Tool）。

**命名规则：**
- Skill 名称：通常与插件名相同（如 `chat`）
- 工具调用：`{skill_name}.{tool_name}`（如 `chat.send_group_message`）

**优势：**
- 清晰的命名空间，避免工具名冲突
- 按插件组织工具，便于管理
- AI 可以理解工具的来源和分组

## 许可

MIT
