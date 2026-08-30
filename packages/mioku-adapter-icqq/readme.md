# mioki-adapter-icqq

基于 icqq 的 Mioki QQ 适配器。

## 安装

```sh
pnpm add mioki-adapter-icqq
```

## 配置

在项目 `package.json` 的 `mioki.adapters` 中配置：

```json
{
  "mioki": {
    "adapters": {
      "icqq": {
        "instances": [
          {
            "uin": 10086,
            "password": "password",
            "ver": "9.2.90",
            "sign_api_addr": "http://127.0.0.1:8080/sign?key=114514",
            "config": {
              "data_dir": "./data/icqq"
            }
          }
        ]
      }
    }
  }
}
```

- `password` 可以省略，省略时由 icqq 走扫码登录流程（二维码会保存到系统临时目录并打印路径）。
- `ver` 和 `sign_api_addr` 是适配器提供的快捷配置，也可以放在 `config` 中。
- `ignore_self`：是否忽略自己账号发送的消息，默认 `true`（不会收到自己发的消息事件，避免插件重复处理）；如需要监听自己发出的消息可设为 `false`。
- qsign 地址必须指向 `/sign`，并带上与 qsign 配置一致的 `key`。

## 登录验证


通用指令：

```
.icqq help        显示帮助
.icqq status      查看待处理的验证请求
```

验证请求指令（`目标` 为实例序号 `1`、`2`…或 QQ 号，多个实例同时等待时必填）：

- **滑块验证**：打开日志中的链接完成滑块，将跳转 URL 中的 `ticket` 参数提交
  （若同时含 `randstr`，用英文逗号拼接为 `ticket,randstr`）：

  ```
  .icqq [目标] slider <ticket[,randstr]>
  ```

- **设备锁**：适配器自动发送短信验证码，提交收到的验证码：

  ```
  .icqq [目标] sms <验证码>
  ```

  短信未收到可重发：`.icqq [目标] sms`；也可以打开日志中的链接在浏览器验证后，
  输入 `.icqq [目标] login` 重试登录。

- **身份验证**：打开日志中的链接在浏览器完成验证后，重试登录：

  ```
  .icqq [目标] login
  ```

- **扫码登录**：二维码图片保存在系统临时目录（`/tmp/mioku-icqq-qrcode-*.png`），
  终端也会打印 ASCII 二维码，用 QQ 扫描即可，无需指令。

### 指令通道

- **终端直连**：未启用 `mioku-adapter-stdin` 时，icqq 适配器直接监听终端输入，
  输入 `.icqq ...` 即可。
- **stdin 适配器**：启用 `mioku-adapter-stdin` 时，直接在终端输入 `.icqq ...` 即可
  （需要把 `"stdin"` 加入 `mioku.owners`）。
- **已连接的 Bot**：把 `.icqq ...` 发给任意已登录的 Bot，由该 Bot 代提交。

## 许可证

MPL-2.0 许可证
