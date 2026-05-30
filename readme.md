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
```

如果 `pnpm install` 提示 `Ignored build scripts`，需要允许当前项目依赖构建原生模块：

```bash
pnpm approve-builds --all
pnpm rebuild sqlite3
```

然后启动：

```bash
pnpm dev
```

启动后，在飞书里给机器人发送文本消息，机器人会把消息交给 Cursor，并把 Cursor 的中文回复发回飞书。

发送 `创建会议`、`创建会议 跨项目接入测试` 或 `/meeting 跨项目接入测试` 时，机器人会按管理后台接口 `POST /managecenter/roadshow/create` 创建路演/直播会议，并回复会议 ID、事件 ID 和观看链接。非隐私默认 payload 写在代码里；只需要配置 `MANAGER_TOKEN`，或在 token 为空时配置 `MANAGER_LOGIN_NAME`、`MANAGER_PASSWORD`、`MANAGER_LOGIN_ID`、`MANAGER_CODE` 走验证码登录。`ENV=prod` 时使用生产后台，其他情况默认测试后台。

### 常用命令

```bash
pnpm test
pnpm typecheck
pnpm dev
```
