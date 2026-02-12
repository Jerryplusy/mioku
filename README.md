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

```bash
# 安装依赖
npm install

# 启动
npm start

# 开发模式
npm run dev
```

## 配置

初次启动后，在 `config/mioku.json` 中配置相关内容。

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
