# AGENTS.md

## Cursor Cloud specific instructions

### 项目概览

单包 Node.js 应用（`lark-cli`）：通过 Lark WebSocket 接收文本消息，经命令注册表路由到内置命令或 `@cursor/sdk` fallback，再把回复发回同一会话。无独立 HTTP 服务、无 Docker/数据库。

当前内部架构是单进程可扩展机器人框架：

- `src/app/`：应用编排、串行队列、消息去重。
- `src/core/`：命令模型、`CommandRegistry`、创建会议命令、Cursor fallback 命令。
- `src/ports/`：核心层依赖的接口。
- `src/adapters/lark/`：Lark 事件映射、回复网关、卡片渲染。
- `src/adapters/cursor/` 与 `src/adapters/manager/`：外部系统适配入口。

新增命令时优先新增 `CommandHandler` 并在组合入口注册，避免把业务分支写回 `src/lark-message-processor.ts`。

### 常用命令

| 任务     | 命令                                                     |
| -------- | -------------------------------------------------------- |
| 安装依赖 | `pnpm install`（见根目录 `.npmrc`，使用 npmmirror 镜像） |
| 开发运行 | `pnpm dev`（`tsx src/index.ts`，长驻进程）               |
| 构建     | `pnpm build`（输出到 `dist/`）                           |
| 构建启动 | `pnpm start`（先构建，再执行 `node dist/index.js`）      |
| 测试     | `pnpm test`                                              |
| 类型检查 | `pnpm typecheck`                                         |
| 格式化   | `pnpm format`（提交前运行一次）                          |

无 ESLint。格式化工具为 `oxfmt`，只要求在提交前运行一次 `pnpm format`。

### 环境变量

复制 `.env.example` 为 `.env`，或导出以下变量（`src/config.ts` 在启动时校验）：

- **必填**：`CURSOR_API_KEY`、`LARK_APP_ID`、`LARK_APP_SECRET`
- **可选**：`LARK_ENCRYPT_KEY`（仅当 Lark 事件订阅开启加密时）；`MANAGER_LOGIN_NAME`、`MANAGER_PASSWORD`（仅「创建会议」命令需要，见 `readme.md`）

非敏感默认值（如 Cursor 模型和测试运营后台域名）在 `src/default-config.ts` 中维护。

### 原生依赖

项目最低支持 Node.js 24，开发与 CI 应使用 Node.js 24 或更高版本。

`pnpm-workspace.yaml` 已允许 `esbuild`、`protobufjs`、`sqlite3` 的 postinstall（一般测试/开发无需交互式 `pnpm approve-builds`）。

### 端到端手动验证

1. 在 Lark 开放平台配置自建应用（WebSocket、`im.message.receive_v1`、消息权限，机器人入群或私聊）。
2. 配置上述环境变量后执行 `pnpm dev`，或在 Cursor Agent/生产环境执行 `pnpm start` 运行构建产物。
3. 在 Lark 向机器人发送文本，确认收到 Cursor 中文回复。

仅跑单元测试时**不需要**真实 Lark 或 Cursor 凭证（测试内 mock）。

### 开发运行注意

- `pnpm dev` 与 `pnpm start` 都会先打印 `lark-cli is running...`，随后由 `@larksuiteoapi/node-sdk` 建立 WebSocket；凭证无效时会出现 `[ws] invalid appId` 等错误并退出，属预期行为。
- 使用 tmux 托管长驻 `pnpm dev` 或 `pnpm start` 进程，便于后续查看日志。
- 临时脚本请用 `pnpm exec tsx`（`tsx` 不在全局 PATH）；`-e` 内联脚本需包在 async IIFE 中，避免 top-level await 报错。
- 格式化检查：`pnpm format:check`（不写回文件）。

### 用户文档同步流程

- 当新增、删除或调整飞书机器人的用户可见能力、命令格式、回复内容时，同步更新 `usage.md`。
- `usage.md` 面向人类用户分享，只写机器人使用方式、示例和常见提示，不写项目配置、环境变量、部署或开发信息。
- 更新 `usage.md` 后，将同一份内容同步到飞书文档：https://t2e5k2oi5r.feishu.cn/docx/I12JdS3RdomvZ1xsatccYUganYe
