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

### 创建管理后台会议

机器人收到以下文本时会跳过 Cursor，改为调用运营后台 `POST /managecenter/roadshow/create` 创建路演/直播会议：

```text
创建会议
创建会议 跨项目接入测试会议
```

成功后会在同一飞书会话返回会议 ID、事件 ID 和观看链接。创建会议需要配置运营后台鉴权：

```bash
ENV=test
MANAGER_TOKEN=manager_token_xxx
```

如果没有 `MANAGER_TOKEN`，也可以配置验证码登录变量：

```bash
MANAGER_LOGIN_NAME=admin
MANAGER_PASSWORD=password
MANAGER_LOGIN_ID=login_id
MANAGER_CODE=1234
```

`ENV=prod` 时默认使用生产运营后台域名；如需覆盖域名，设置 `MANAGER_BASE_URL`。

### 常用命令

```bash
pnpm test
pnpm typecheck
pnpm dev
```
