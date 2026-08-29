# AGENTS.md

## 项目概览

单包 Node.js 应用（`lark-cli`）：通过 Lark WebSocket 接收文本消息，经命令注册表路由到内置命令或经 LLM 意图路由兜底，再把回复发回同一会话。无独立 HTTP 服务、无 Docker/数据库。

当前内部架构是「模块化单体 + 端口适配器」的单进程可扩展机器人框架：

- `src/bootstrap/`：唯一装配点（`composition-root.ts`）、配置加载与进程入口。
- `src/app/`：应用编排、串行队列、消息去重、reaction/trace/回复编排。
- `src/core/`：领域核心（命令模型、`CommandRegistry`、会议路由命令、用量命令、trace 类型），不依赖任何 adapter。
- `src/ports/`：核心 / 应用依赖的抽象接口。
- `src/adapters/lark/`：Lark 事件映射、协议序列化、底层网关、回复网关、卡片渲染。
- `src/adapters/cursor/` 与 `src/adapters/manager/`：Cursor 与运营后台的端口实现。
- `src/shared/`：无业务依赖的通用工具。

依赖方向单向收敛：`adapters -> ports -> core`、`app -> core/ports`、`bootstrap -> 全部`。完整结构图、数据流与扩展指南见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

新增命令时优先新增 `CommandHandler`，在 `src/bootstrap/composition-root.ts` 注册，并按需在 `src/adapters/` 实现对应端口；不要把业务分支写回组合根。

## 分支开发流程

`main` 为稳定分支，**禁止**在 `main` 上直接开发新需求或提交功能变更。

开始新需求前，先从最新的 `main` 切出功能分支：

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/short-description
```

分支命名建议：`feat/`、`fix/`、`refactor/`、`docs/` 等前缀 + 简短英文描述（例如 `feat/meeting-card-streaming`）。

开发、提交、推送均在功能分支上进行；合并前在本地运行 `pnpm test`、`pnpm typecheck`、`pnpm format`，再通过 Pull Request 合并回 `main`。PR 合并后可删除远程与本地功能分支（`git fetch --prune` 后清理上游已删除的本地分支）。

Cursor Agent 接到实现类任务时，若当前分支为 `main`，应先创建功能分支再改代码，不要直接在 `main` 上编辑。

## 常用命令

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

## 环境变量

复制 `.env.example` 为 `.env`，或导出以下变量（`src/bootstrap/config.ts` 在启动时校验）：

- **必填**：`ANTHROPIC_API_KEY`、`LARK_APP_ID`、`LARK_APP_SECRET`
- **可选**：`LARK_ENCRYPT_KEY`（仅当 Lark 事件订阅开启加密时）；`MANAGER_LOGIN_NAME`、`MANAGER_PASSWORD`（仅「创建会议」命令需要，见 `readme.md`）；`WEEKLY_REPORT_CHAT_ID`（周五周报私聊目标，未配置则跳过调度）；`WEEKLY_REPORT_HOUR`、`WEEKLY_REPORT_MINUTE`（周报触发本地时刻，默认 18:00）

非敏感默认值（如 Cursor 模型和测试运营后台域名）在 `src/bootstrap/default-config.ts` 中维护。

## 原生依赖

项目最低支持 Node.js 24，开发与 CI 应使用 Node.js 24 或更高版本。

`pnpm-workspace.yaml` 已允许 `esbuild`、`protobufjs`、`sqlite3` 的 postinstall（一般测试/开发无需交互式 `pnpm approve-builds`）。

## 端到端手动验证

1. 在 Lark 开放平台配置自建应用（WebSocket、`im.message.receive_v1`、消息权限，机器人入群或私聊）。
2. 配置上述环境变量后执行 `pnpm dev`，或在 Cursor Agent/生产环境执行 `pnpm start` 运行构建产物。
3. 在 Lark 向机器人发送文本，确认收到 Cursor 中文回复。

仅跑单元测试时**不需要**真实 Lark 或 Cursor 凭证（测试内 mock）。

## 开发运行注意

- `pnpm dev` 与 `pnpm start` 都会先打印 `lark-cli is running...`，随后由 `@larksuiteoapi/node-sdk` 建立 WebSocket；凭证无效时会出现 `[ws] invalid appId` 等错误并退出，属预期行为。
- 使用 tmux 托管长驻 `pnpm dev` 或 `pnpm start` 进程，便于后续查看日志。
- 临时脚本请用 `pnpm exec tsx`（`tsx` 不在全局 PATH）；`-e` 内联脚本需包在 async IIFE 中，避免 top-level await 报错。
- 格式化检查：`pnpm format:check`（不写回文件）。

## 用户文档同步流程

- 当新增、删除或调整飞书机器人的用户可见能力、命令格式、回复内容时，同步更新 `usage.md`。
- `usage.md` 面向人类用户分享，只写机器人使用方式、示例和常见提示，不写项目配置、环境变量、部署或开发信息。
- 运维、排障或内部统计类命令不写入 `usage.md`；例如 `cursor` 只保留在开发文档或内部说明中。
- 在开发分支或 PR 阶段只更新 `usage.md`，不要同步飞书文档。
- 同步前确认 `usage.md` 已来自 `main` 分支，且不包含内部命令、凭证、环境变量或排障流程。
- 相关变更确认已合并到 `main` 分支后，立即将 `main` 上的 `usage.md` 同步到飞书文档：https://t2e5k2oi5r.feishu.cn/docx/I12JdS3RdomvZ1xsatccYUganYe
