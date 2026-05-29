## 飞书 Cursor 机器人最小示例

这个示例使用 `pnpm + TypeScript` 跑一个本地进程：

1. 飞书通过 WebSocket 长连接把 `im.message.receive_v1` 消息事件推给本地进程。
2. 本地进程把文本消息交给 Cursor SDK。
3. Cursor 返回结果后，机器人把文本回复发回同一个飞书会话。

参考：飞书官方 CLI 文档介绍了安装、认证、消息、事件等能力，[README.zh.md](https://github.com/larksuite/cli/blob/main/README.zh.md)。

### 准备飞书应用

在飞书开放平台创建企业自建应用，并完成这些配置：

- 在「凭证与基础信息」里复制 `App ID` 和 `App Secret`。
- 在「事件订阅」里启用 WebSocket 方式。
- 订阅「接收消息」事件，事件类型是 `im.message.receive_v1`。
- 给应用开通发送/接收消息相关权限，并发布或重新发布应用。
- 把机器人添加到会话里，或直接私聊机器人。

### 本地启动

```bash
pnpm install
cp .env.example .env
```

如果 `pnpm install` 提示 `Ignored build scripts`，需要允许当前项目依赖构建原生模块：

```bash
pnpm approve-builds --all
pnpm rebuild sqlite3
```

编辑 `.env`：

```bash
CURSOR_API_KEY=cursor_xxx
CURSOR_MODEL=composer-2.5
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_ENCRYPT_KEY=
```

然后启动：

```bash
pnpm dev
```

启动后，在飞书里给机器人发送文本消息，机器人会把消息交给 Cursor，并把 Cursor 的中文回复发回飞书。

### 常用命令

```bash
pnpm test
pnpm typecheck
pnpm dev
```
