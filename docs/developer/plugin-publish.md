# 发布 Mioku 插件与服务

## 命名规范

- 插件包名：`mioku-plugin-<name>`
- 服务包名：`mioku-service-<name>`

## package.json 要求

### 插件

```json
{
  "name": "mioku-plugin-example",
  "version": "1.0.0",
  "description": "示例插件",
  "main": "index.ts",
  "keywords": ["mioku"],
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/mioku-plugin-example.git"
  },
  "mioku": {
    "services": ["config", "ai"],
    "help": {
      "title": "示例插件",
      "description": "示例说明",
      "commands": [
        {
          "cmd": "/example",
          "desc": "执行示例命令",
          "role": "member"
        }
      ]
    }
  }
}
```

### 服务

```json
{
  "name": "mioku-service-example",
  "version": "1.0.0",
  "description": "示例服务",
  "main": "index.ts",
  "keywords": ["mioku"],
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/mioku-service-example.git"
  },
  "mioku": {
    "serviceName": "example"
  }
}
```

## 字段说明

- `name`：必须符合 Mioku 命名规范，插件/服务类型由包名前缀判断
- `description`：会显示在插件市场列表的描述中
- `keywords`：至少包含一个 `mioku`字段
- `repository`：必须指向可公开 clone 的 Git 仓库，市场安装依赖这个地址

...

## 将你的包发布至 npm

发布前请确保已登录 npm 账号，并验证包名未被占用：

```bash
npm login

npm publish

# 首次发布后，后续更新
npm version patch   # 或 minor / major
npm publish
```