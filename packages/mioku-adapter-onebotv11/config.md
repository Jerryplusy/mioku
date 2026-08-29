---
title: onebotv11 适配器配置
description: 配置 OneBot v11 (NapCat) 适配器的连接实例
fields:
  - key: onebotv11.instances
    label: 连接实例
    type: array
    description: 每个实例对应一个 NapCat 连接。可添加多个实例，机器人会同时连接。
    itemFields:
      - key: protocol
        label: 连接协议
        type: select
        description: ws 未加密，wss 加密（需 NapCat 开启 SSL）。
        options:
          - value: ws
            label: ws (未加密)
          - value: wss
            label: wss (加密)

      - key: host
        label: 主机地址
        type: text
        description: NapCat 所在主机地址。
        placeholder: localhost

      - key: port
        label: 端口
        type: number
        description: NapCat WebSocket 服务端口。
        placeholder: 3001

      - key: token
        label: 访问令牌
        type: secret
        description: NapCat 设置的 access_token，留空表示无令牌。
        placeholder: 可空

      - key: reconnect
        label: 断线自动重连
        type: switch
        description: 连接断开后是否自动重连。
        defaultValue: true
---

# onebotv11 适配器配置

通过 [NapCat](https://napcat.napneko.icu/) 连接 OneBot v11 协议。每个连接实例对应一个
NapCat 的 WebSocket 客户端（正向WS）配置

```mioku-field
key: onebotv11.instances
```
