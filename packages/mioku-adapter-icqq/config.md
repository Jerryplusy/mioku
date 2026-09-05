---
title: icqq 适配器配置
description: 配置 icqq 适配器的登录实例
fields:
  - key: icqq.instances
    label: 登录实例
    type: array
    description: 每个实例对应一个 QQ 账号登录。可添加多个实例实现多账号接入。
    itemFields:
      - key: uin
        label: QQ 号 (uin)
        type: number
        description: 要登录的 QQ 账号。
        required: true

      - key: password
        label: QQ 密码
        type: secret
        description: 账号密码，留空将使用扫码/滑块登录。
        placeholder: 可空

      - key: platform
        label: 登录设备类型
        type: select
        description: 登录设备类型。不同平台支持的协议版本数量不同，详见下方「协议版本」字段说明。
        defaultValue: aphone
        options:
          - value: aphone
            label: aphone (安卓手机)
          - value: apad
            label: apad (安卓平板)
          - value: awatch
            label: awatch (安卓手表)
          - value: ipad
            label: ipad (iPad)
          - value: imac
            label: imac (Mac)

      - key: ver
        label: 协议版本
        type: text
        description: icqq 协议版本号，例如 9.2.90。仅在所选平台包含多个协议版本时生效；ipad 当前只有一个内置版本，配置后会被忽略并回退到该版本。留空则使用对应平台最新的内置版本。
        placeholder: 留空使用最新版本

      - key: sign_api_addr
        label: qsign /sign 地址
        type: text
        description: qsign 服务的 /sign 地址，通常需要带 ?key=...
        placeholder: 可空

      - key: ignore_self
        label: 忽略自己账号的消息
        type: switch
        description: 是否忽略自己账号发送的消息（默认忽略）。
        defaultValue: true
---

# icqq 适配器配置

使用 [icqq](https://github.com/icqqjs/icqq) 登录 QQ
每个登录实例对应一个 QQ 账号，可添加多个实例实现多账号接入

```mioku-field
key: icqq.instances
```
