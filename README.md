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

## 快速开始

> 推荐使用bun管理依赖，也可使用npm/pnpm :)

```bash
git clone https://github.com/Jerryplusy/mioku.git

cd mioku

# 安装依赖
bun install
```

## 安装webui(推荐)

```bash
# 使用脚本安装webui
./install-mioku.sh webui

# 更多脚本功能请运行./install-mioku.sh查看
```

## 插件/服务安装和管理

推荐使用webui进行管理   
也可手动安装插件，进入config目录配置插件

```bash
# 使用脚本安装插件
./install-mioku.sh plugin <repo-url>

```

## 启动及配置

```bash
bun run start
```

初次启动时将自动运行引导程序，填入NapCat**正向**WS地址、端口、密钥和自定义webui密钥（若安装）即可。

> 除了NapCat，还可以使用其他任何符合OneBotv11协议的实现端如LLTwoBot/Lgr等。可能会出现少许问题。

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
