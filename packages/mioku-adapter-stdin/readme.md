# mioku-adapter-stdin

[mioku](https://github.com/mioku-lab/mioku) 的标准输入适配器：让机器人直接从终端接收指令并在终端回复。

## 特性

- 启动 mioku 后，直接在终端输入命令，等价于向机器人发送一条**私聊消息**（`message_type: private`）
- 发送者固定为 `stdin`，默认拥有**主人权限**（`mioku.owners` 中包含 `"stdin"`），可以执行任意主人级指令
- 免配置：零配置即可运行

## 安装与启用

```bash
bun add mioku-adapter-stdin
```

在 `package.json` 中启用：

```json
{
  "mioku": {
    "adapters": {
      "stdin": {}
    }
  }
}
```

## 配置

```json
{
  "mioku": {
    "adapters": {
      "stdin": {
        "prompt": "mioku> ",
        "nickname": "stdin",
        "exit_on_eof": false
      }
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `prompt` | string | `"mioku> "` | 终端输入提示符，仅 TTY 下显示 |
| `nickname` | string | `"stdin"` | stdin 会话对应的 bot 昵称 |
| `exit_on_eof` | boolean | `false` | 输入流关闭（EOF / Ctrl+D）时是否直接退出进程 |
