# 周报：Commit 原料落盘 + 周五飞书汇总

## 背景与目标

在任意项目中通过 commit skill 提交成功后，把本次 commit 信息**集中写入 `feishu-cli` 仓库**的「按周分文件」原料目录；每条记录带上**所属项目**标识。`feishu-cli` 每周五只读本仓库原料，用 AI 生成偏复盘的周报（关键提交摘录 + 简短总结），并推送到配置的飞书私聊。

不采集 Cursor IDE 对话原文；周报原料以 commit 信息为准。不扫描其他项目目录。

## 需求摘要

| 项 | 约定 |
| --- | --- |
| 触发 | 每周五定时（默认 18:00，可配置） |
| 原料位置 | 仅 `feishu-cli` 下 `weekly-commits/` |
| 投递 | 飞书私聊（配置 `chatId`） |
| 内容风格 | 关键提交摘录 + 简短总结（复盘向） |
| 项目区分 | 每条 NDJSON 含 `project`（及路径），周报按该字段分组 |

## 设计 1：Commit Skill 落盘

修改个人 skill：`~/.cursor/skills/commit/SKILL.md`（路径随本机 Cursor skills 目录）。

### 时机

仅在实际执行 `git commit` **成功之后**写入。用户只要文案、不提交时不写。

### 落盘根目录（固定为 feishu-cli）

- 原料**始终**写入 `feishu-cli` 仓库，而不是当前提交所在仓库。
- 目录：`<feishu-cli 根>/weekly-commits/`（不存在则创建）
- `feishu-cli` 根路径解析顺序：
  1. 环境变量 `FEISHU_CLI_ROOT`（若已设置）
  2. 否则使用 skill 内约定的本机默认绝对路径（实现 skill 时写成可改的一处常量；当前开发机为 `e:\opensource\feishu-cli`）
- 若目标根不存在或不可写：提示失败原因，**不回滚**已成功的 git commit

### 目录与文件

- 每周一个文件，扩展名 `.ndjson`（每行一条 JSON）
- 文件名：`YYYY-Month-Wn.ndjson`，例如 `2026-July-W1.ndjson`

### 周与归属规则

- 一周：**周日 00:00 ～ 周六 23:59**（本地时区）
- 归属月：以该周**周日**所在月份为准（跨月周只进一个文件）
- `Month`：英文全称（`January` … `December`）
- `Wn`：该归属月内，按「周日开头的日历周」顺序编号（第 1、2、… 周）

计算步骤（skill / 机器人共用同一规则）：

1. 取本地「现在」的日期时间，找到本周周日（若当天是周日则为当天，否则回退到最近的周日）。
2. 归属年、月取该周日的年、月；`Month` 用英文月名。
3. `Wn`：列出该月内所有周日（1 日及之后落在该月的周日），按日期排序；本周周日是其中第几个，即为 `n`。

示例：若本周周日为 2026-08-02，则文件名为 `2026-August-W1.ndjson`（8 月第一个周日是 8/2）。

### 行格式

每条追加一行 JSON，字段：

```json
{
  "timestamp": "2026-08-07T16:44:00+08:00",
  "project": "other-app",
  "projectPath": "e:\\opensource\\other-app",
  "hash": "abc1234",
  "branch": "feat/example",
  "subject": "feat(scope): 中文摘要",
  "body": "可选正文，可为空字符串"
}
```

- `project`：当前提交仓库根目录名（`basename` of `git rev-parse --show-toplevel`）
- `projectPath`：当前提交仓库根绝对路径
- `hash`：`git rev-parse --short HEAD`
- `branch`：`git branch --show-current`；detached HEAD 时固定写 `"HEAD"`
- `subject` / `body`：与本次 commit message 一致；无正文时 `body` 为 `""`

在 `feishu-cli` 自身仓库提交时，`project` 为 `feishu-cli`，同样写入同一目录。

### Git 约束

- **永不**因写入原料文件而自动 `git add`（无论是当前仓库还是 `feishu-cli`）
- 写入成功后用简短提示告知 `feishu-cli` 下的目标文件路径；是否把原料提交进 `feishu-cli` 由用户自行决定

### 目录示例（均在 feishu-cli 内）

```text
feishu-cli/weekly-commits/
  2026-July-W4.ndjson
  2026-August-W1.ndjson
```

## 设计 2：feishu-cli 周五周报

### 架构位置

保持现有「模块化单体 + 端口适配器」：

- `ports/`：周报原料读取、周报生成、定时调度抽象（按实现需要拆分，避免把文件系统细节泄漏进 `core`）
- `adapters/`：只读本仓库 `weekly-commits/<本周文件>`；复用现有 AI 能力生成摘要；Lark 按 `chatId` 发私聊文本（首版文本即可）
- `app/` 或 `bootstrap/`：注册周五定时任务；失败只打日志，不影响 WebSocket 收消息主路径
- `core/`：周文件名计算、原料解析、按 `project` 分组、周报 Prompt 组装（纯逻辑，便于单测）

### 配置（环境变量 / 默认值）

| 配置项 | 含义 |
| --- | --- |
| 私聊 `chatId` | 周报投递目标 |
| 触发时刻 | 默认周五 18:00（本地时区），可配置 |
| 原料目录 | 默认 `weekly-commits`（相对本仓库根；一般无需改） |
| 启用条件 | 未配置 `chatId` 时不启动调度 |

不再配置「多项目根路径列表」。敏感信息与 `chatId` 走环境变量，与现有 `config.ts` 模式一致。

### 数据流

```text
周五定时器
  → 计算本周文件名（与 skill 同一规则）
  → 读取本仓库 weekly-commits/<本周文件>
  → 按 project 字段分组
  → AI 生成复盘周报
  → Lark 发到私聊 chatId
```

### 空周与失败

- 本周文件不存在或无有效行：仍向私聊发送一句「本周无提交记录」，避免误判任务未跑
- 文件部分行损坏：跳过坏行并记 warning，其余行继续
- AI 或发送失败：记 error，不抛垮进程

### 周报内容结构（生成目标）

1. 标题：周报区间（周日～周六日期）与归属文件名
2. 按 `project` 分节
3. 每节：简短总结 + 若干关键提交摘录（来自 subject/body，非伪造对话）
4. 全文控制在飞书单条文本可读范围内；过长时分条或截断策略在实现计划中定，首版优先单条完整摘要

### 测试

- 周文件名 / `Wn` 计算：跨月、月初周日、月末等边界
- NDJSON 解析：空文件、坏行、多 `project` 分组
- 调度：启用条件、空周文案（用假时钟 / 假端口，不依赖真实周五）
- 不要求 CI 访问真实飞书

### 非目标（首版不做）

- 不解析 Cursor `state.vscdb` 或 Agent transcript
- 不扫描其他项目的文件系统
- 不自动 `git add` / 不强制原料文件入库
- 不做群发、不做月报
- 不在 `usage.md` 暴露内部运维命令（若仅有定时推送、无用户指令，则无需改 `usage.md`）

## 实现顺序建议

1. 更新 commit skill（写入 `feishu-cli`、带 `project` / `projectPath`）
2. 在 `feishu-cli` 实现周文件名工具 + 本仓库原料读取 + 周报生成 + 周五调度 + 配置
3. 单测覆盖核心规则与空周路径
4. 本地冒烟（可手动触发入口，若实现计划包含）

## 风险

- commit skill 必须能解析到正确的 `feishu-cli` 根；换机器时优先设 `FEISHU_CLI_ROOT`
- 原料若未提交进 `feishu-cli`，仅本机有副本；机器人须与开发机同机或能访问该目录
- 个人 commit skill 与仓库内周名算法必须保持一致，算法变更需两处同步（实现时可在仓库提供纯函数，skill 文档用同一文字规则描述）
