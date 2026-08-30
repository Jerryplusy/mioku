# 插件市场

<StoreRegistry />

## 安装插件

```bash
mioku install plugin <名称>
```

命令会自动补全 `mioku-plugin-` 前缀，所以写短名也行：

```bash
mioku install plugin 60s     # 等价于 mioku install plugin mioku-plugin-60s
```

安装服务同理：

```bash
mioku install service webui
```

> 安装插件时，CLI 会读取插件 `package.json` 里 `mioku.services` 声明的服务依赖，把缺的服务一并装上。

也可以直接用 bun 管理：

```bash
bun add mioku-plugin-60s
```

用 bun 装的话记得在 `package.json` 的 `mioku.plugins` 里加上对应的短名（`60s`），否则框架不会加载它。

## 更新

```bash
mioku update          # 检查所有 mioku-* 包是否有可用更新
mioku update all      # 更新全部
mioku update self     # 更新 mioku 框架本身
mioku update 60s      # 更新指定包
```

## 在聊天里安装

安装了 `admin` 插件后，可以直接在聊天里操作：

- `.plugin-market` —— 查看可安装的插件列表
- `.install plugin <名称>` / `.install service <名称>` —— 安装
- `.uninstall plugin/service <名称>` —— 卸载
- `.update` —— 查看并选择更新

## 发布自己的插件

写了插件想分享出去，流程见[发布插件](/developer/publish)：注意 `package.json` 的 `keywords` 里带上 `mioku`，这是市场能搜到你的关键。
