# Mioku 架构总览

Mioku 是 [mioki](https://github.com/vikiboss/mioki) 的**超集**，mioki 负责事件、Bot 连接和插件运行，Mioku 在上层补充了插件/服务管理、帮助系统、配置系统和 AI 技能系统。

可以先把 Mioku 理解成下面这层结构：

```text
NapCat / OneBot
        ↓
      mioki
        ↓
      Mioku
      ├─ 服务系统
      ├─ 插件系统
      ├─ 帮助系统
      ├─ 配置系统
      └─ AI 技能系统
```

大致启动流程如下：

1. Mioku 启动时先扫描插件和服务
2. `boot` 系统引导插件加载所有服务
3. Mioku 自动注册插件帮助和 `skills.ts`- 给AI使用的技能
4. 其他插件开始由`mioki`引导并正常运行

## 插件/服务开发

如果你只是想给 Mioku 写插件/服务，只需要有一定的 TypeScript 基础，仔细阅读本文档提供的插件/服务开发文档即可。

## Mioku 框架开发

如果你希望参与 Mioku 框架的开发，请确保你熟悉git工作流、熟练 TypeScript 开发语言和Node.js运行时。

我们接受AI生成的代码，但在提交前务必经过人工审查确保代码逻辑和执行效果无误。

分支出现冲突请与仓库维护者联系。

## 插件与服务的关系

插件负责**做事**，服务负责**提供能力**

- 插件面向功能和交互
- 服务面向复用和接口

## 下一步

- [开发插件入门](/developer/plugin-start)
- [mioki文档](https://mioki.viki.moe/plugin.html)
- [开发服务入门](/developer/service-start)
- [开放接口参考](/reference/ctx)
