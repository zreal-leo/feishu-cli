## lark-cli

这个项目使用 `pnpm + TypeScript` 跑一个本地进程：

1. Lark 通过 WebSocket 长连接把 `im.message.receive_v1` 消息事件推给本地进程。
2. 本地进程把文本消息交给 Cursor SDK。
3. Cursor 返回结果后，机器人把文本回复发回同一个 Lark 会话。

参考：Lark 官方 CLI 文档介绍了安装、认证、消息、事件等能力，[README.zh.md](https://github.com/larksuite/cli/blob/main/README.zh.md)。

### 架构概览

项目仍是单进程机器人，不依赖数据库、消息队列或独立 HTTP 服务；内部按可扩展机器人框架拆分：

- `src/app/`：应用编排层，包含 `BotApplication`、串行任务队列和消息去重。
- `src/core/`：核心命令与模型，命令通过 `CommandHandler` 注册；普通消息由 Cursor fallback 命令处理，「创建会议」由独立命令处理器处理。
- `src/ports/`：核心层依赖的接口，例如回复、reaction、会议和助手能力。
- `src/adapters/lark/`：Lark 入站事件映射、出站文本/卡片/流式回复和卡片渲染。
- `src/adapters/cursor/`：Cursor SDK 适配入口。
- `src/adapters/manager/`：运营后台会议创建适配入口。

新增机器人能力时，优先新增一个 `CommandHandler` 并注册到命令注册表；不要把命令分支继续堆到 Lark 消息处理器里。`src/lark-message-processor.ts` 只保留对外兼容的组合入口。

### 准备 Lark 应用

在 Lark 开放平台创建企业自建应用，并完成这些配置：

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

启动后，在 Lark 里给机器人发送文本消息，机器人会把消息交给 Cursor，并把 Cursor 的中文回复发回 Lark。

### 创建管理后台会议

机器人收到以下文本时会跳过 Cursor，改为调用运营后台 `POST /managecenter/roadshow/create` 创建路演/直播会议：

```text
创建会议
创建会议 跨项目接入测试会议
创建会议 云播
创建会议并创建云播
创建会议 跨项目接入测试会议 云播 https://media.comein.cn/video/344317-1740031837920.mp4
创建会议 跨项目接入测试会议 音频云播 https://media.comein.cn/audio/demo.mp3
```

成功后会在同一 Lark 会话返回会议标题、会议 ID、事件 ID 和观看链接。默认 3 分钟后开始，标题格式为 `BOT: 主题 HH:mm`。如果命令包含 `云播`，会议创建成功后会继续调用 `POST /managecenter/cloud-player/create`，用会议 ID 创建视频云播；未填写主题时使用默认主题 `会议`，未填写 URL 时使用默认视频 `https://media.comein.cn/video/344317-1740031837920.mp4`。使用 `音频云播 <公网音频 URL>` 可创建音频云播。云播默认按会议开始时间播放、循环播放；云播失败时会议仍会返回成功，并单独提示云播失败原因。`src/default-config.ts` 保存默认 Cursor 模型和测试运营后台域名；当前仅支持创建测试环境会议。创建会议会先调用运营后台登录接口，再用登录返回的信息换取并缓存 token：

```bash
MANAGER_LOGIN_NAME=admin
MANAGER_PASSWORD=password
```

### 查询 Cursor Token 用量

机器人收到以下文本时会跳过 Cursor fallback，调用 Cursor Dashboard usage API 查询 token 用量：

```text
查询token
查询token 2026-05-06 2026-06-04
查询 token 2026-05-06 2026-06-04
```

`查询token` 默认查询最近 30 天；带两个日期时按 `YYYY-MM-DD` 闭区间查询。回复会汇总 `inputTokens`、`outputTokens`、`cacheReadTokens`，并给出总 token 数；`totalCents` 不参与汇总。

这个功能需要 Cursor 网页端 Dashboard 的登录 Cookie 和账号参数，但这些变量只在执行 `查询token` 时才需要；不配置也可以正常 `pnpm dev` 启动机器人。需要使用时，在 `.env` 中填写：

```bash
CURSOR_USAGE_COOKIE='WorkosCursorSessionToken=...; team_id=...'
CURSOR_USAGE_TEAM_ID=11326557
CURSOR_USAGE_USER_ID=208513979
```

`CURSOR_USAGE_COOKIE` 可从浏览器访问 Cursor Dashboard usage 页面时的请求 Cookie 中复制；Cookie 属于敏感凭证，不要提交到仓库。分页大小固定在 `src/default-config.ts` 的 `cursorUsage.pageSize` 中，当前默认每页 100 条。

### 构建后启动

Cursor Agent 或生产环境可先构建 TypeScript，再执行构建产物：

```bash
pnpm build
node dist/index.js
```

也可以直接运行：

```bash
pnpm start
```

`pnpm start` 会先执行构建，再运行 `dist/index.js`。

### 常用命令

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
pnpm start
```
