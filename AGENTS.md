# AGENTS.md

## Cursor Cloud specific instructions

### 项目概览

单包 Node.js 应用（`feishu-cursor-bot-example`）：通过飞书 WebSocket 接收文本消息，经 `@cursor/sdk` 生成回复后发回同一会话。无独立 HTTP 服务、无 Docker/数据库。

### 常用命令

| 任务     | 命令                                                     |
| -------- | -------------------------------------------------------- |
| 安装依赖 | `pnpm install`（见根目录 `.npmrc`，使用 npmmirror 镜像） |
| 开发运行 | `pnpm dev`（`tsx src/index.ts`，长驻进程）               |
| 构建     | `pnpm build`（输出到 `dist/`）                           |
| 构建启动 | `pnpm start`（先构建，再执行 `node dist/index.js`）      |
| 测试     | `pnpm test`                                              |
| 类型检查 | `pnpm typecheck`                                         |
| 格式化   | `pnpm prettier`                                          |

无 ESLint。

### 环境变量

复制 `.env.example` 为 `.env`，或导出以下变量（`src/config.ts` 在启动时校验）：

- **必填**：`CURSOR_API_KEY`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`
- **可选**：`FEISHU_ENCRYPT_KEY`（仅当飞书事件订阅开启加密时）；`MANAGER_LOGIN_NAME`、`MANAGER_PASSWORD`（仅「创建会议」命令需要，见 `readme.md`）

非敏感默认值（如 Cursor 模型和测试运营后台域名）在 `src/default-config.ts` 中维护。

### 原生依赖

`pnpm-workspace.yaml` 已允许 `esbuild`、`protobufjs`、`sqlite3` 的 postinstall（一般测试/开发无需交互式 `pnpm approve-builds`）。

### 端到端手动验证

1. 在飞书开放平台配置自建应用（WebSocket、`im.message.receive_v1`、消息权限，机器人入群或私聊）。
2. 配置上述环境变量后执行 `pnpm dev`，或在 Cursor Agent/生产环境执行 `pnpm start` 运行构建产物。
3. 在飞书向机器人发送文本，确认收到 Cursor 中文回复。

仅跑单元测试时**不需要**真实飞书或 Cursor 凭证（测试内 mock）。

### 开发运行注意

- `pnpm dev` 与 `pnpm start` 都会先打印 `Feishu Cursor bot is running...`，随后由 `@larksuiteoapi/node-sdk` 建立 WebSocket；凭证无效时会出现 `[ws] invalid appId` 等错误并退出，属预期行为。
- 使用 tmux 托管长驻 `pnpm dev` 或 `pnpm start` 进程，便于后续查看日志。
- 临时脚本请用 `pnpm exec tsx`（`tsx` 不在全局 PATH）；`-e` 内联脚本需包在 async IIFE 中，避免 top-level await 报错。
- 格式化检查：`pnpm prettier --check .`（不写回文件）。
