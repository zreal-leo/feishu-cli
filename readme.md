## lark-cli

这个项目使用 `pnpm + TypeScript` 运行一个本地 Lark 机器人进程：通过 Lark WebSocket 接收文本消息，经命令注册表路由到内置命令或 Cursor fallback，再把回复发回同一个 Lark 会话。

参考：Lark 官方 CLI 文档介绍了安装、认证、消息、事件等能力，[README.zh.md](https://github.com/larksuite/cli/blob/main/README.zh.md)。

### 文档分工

- 面向飞书普通用户的命令格式、示例和常见提示见 [`usage.md`](./usage.md)。
- 面向 Cursor Agent 和开发者的分支开发流程、环境变量、常用命令、运行注意事项见 [`AGENTS.md`](./AGENTS.md)。
- 代码分层、目录结构、数据流与扩展指南见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

### 代码结构

采用「模块化单体 + 端口适配器」：`src/core` 领域核心只依赖 `src/ports` 抽象接口，外部系统（Lark / Cursor / 运营后台 / 文件系统）在 `src/adapters` 实现，`src/app` 负责去重、串行队列与回复编排，`src/bootstrap` 是唯一装配点（`composition-root.ts`）与进程入口。详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

### 运行时日志

每条已接收文本消息的系统 Trace 会按 NDJSON 写入 `logs/system-trace.ndjson`，包含完整输入、完整输出、处理状态和各步骤耗时。日志内容可能包含敏感对话原文，不要提交到仓库。

### 创建管理后台会议

用户侧命令格式见 [`usage.md`](./usage.md)。机器人识别到创建会议命令后会跳过 Cursor fallback，调用运营后台创建路演/直播会议；如果请求包含云播，还会在会议创建成功后继续调用云播创建接口。

当前仅支持创建测试环境会议。创建会议会先调用运营后台登录接口，再用登录返回的信息换取并缓存 token；需要在 `.env` 中配置：

```bash
MANAGER_LOGIN_NAME=admin
MANAGER_PASSWORD=password
```

非敏感默认值（如默认视频 URL、Cursor 模型和测试运营后台域名）在 `src/bootstrap/default-config.ts` 中维护。
