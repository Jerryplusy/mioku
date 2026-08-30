---
title: stdin 适配器配置
description: 标准输入适配器，免配置，直接从终端驱动机器人
fields:
  - key: stdin.prompt
    label: 输入提示符
    type: text
    description: 终端输入提示符，仅 TTY 下显示。
    placeholder: mioku>

  - key: stdin.nickname
    label: Bot 昵称
    type: text
    description: stdin 会话对应的 bot 昵称。
    placeholder: stdin

  - key: stdin.exit_on_eof
    label: EOF 时退出进程
    type: switch
    description: 输入流关闭（EOF / Ctrl+D）时是否直接退出进程。
    defaultValue: false
---

# stdin 适配器配置

```mioku-field
key: stdin.prompt
```

```mioku-field
key: stdin.nickname
```

```mioku-field
key: stdin.exit_on_eof
```
