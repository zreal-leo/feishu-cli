# Weekly Commit Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 任意仓库经 commit skill 提交后，将带 `project` 的 commit 原料集中写入 `feishu-cli/docs/weekly-commits/`；进程每周五读取本周文件、用 AI 生成复盘周报并推送到配置的飞书私聊。

**Architecture:** 周界与文件名纯函数放在 `core/`；NDJSON 读取在 `adapters/`；周报生成复用现有 Anthropic `askAI`；`app/weekly-report-job.ts` 编排「读原料 → 生成 → 发送」；`bootstrap` 在配置了 `chatId` 时用无第三方依赖的定时器挂载周五任务。Commit skill（个人 skill）只负责提交成功后向 `feishu-cli` 追加一行。

**Tech Stack:** Node.js 24+、TypeScript、现有 `@anthropic-ai/sdk` / `@larksuiteoapi/node-sdk`、`node:test` + `tsx`、PowerShell（commit skill 落盘步骤）。

## Global Constraints

- 一周：周日 00:00 ～ 周六 23:59（本地时区）；归属月按该周**周日**所在月；文件名 `YYYY-Month-Wn.ndjson`（英文月名）。
- 原料只写/只读 `feishu-cli` 的 `docs/weekly-commits/`，不扫描其他项目路径。
- 每条记录必须含 `project` 与 `projectPath`；周报按 `project` 分组。
- 写入原料时永不 `git add`；落盘失败不回滚已成功的 git commit。
- 未配置周报私聊 `chatId` 时不启动调度；空周仍发送「本周无提交记录」。
- 不改 `usage.md`（无新用户可见命令）；单测不依赖真实飞书/AI。
- 依赖方向：`adapters → ports → core`，`app → core/ports`，`bootstrap → 全部`。
- 本仓库分支：在已有设计分支 `docs/weekly-commit-report-design` 上继续实现，或切到 `feat/weekly-commit-report` 并带上已有 spec；禁止在 `main` 直接改功能。

## File Structure

| 路径 | 职责 |
| --- | --- |
| `C:\Users\Administrator\.cursor\skills\commit\SKILL.md` | 提交成功后向 feishu-cli 追加 NDJSON |
| `src/core/weekly-commit-week.ts` | 周日周界、`Wn`、文件名、本周日期区间 |
| `src/core/weekly-commit.ts` | 条目类型、NDJSON 解析、按 project 分组、空周文案、周报 Prompt |
| `src/ports/weekly-commit-store.ts` | `listCommitsForWeekFile(fileName)` |
| `src/ports/weekly-report.ts` | `generateWeeklyReport(input)` |
| `src/adapters/file-system-weekly-commit-store.ts` | 读本仓库 `docs/weekly-commits` |
| `src/adapters/ai-weekly-report-generator.ts` | 调用 `askAI` 生成周报正文 |
| `src/app/weekly-report-job.ts` | 编排一次周报任务 |
| `src/app/weekly-report-scheduler.ts` | 计算下次周五触发并 `setTimeout` 链式调度 |
| `src/bootstrap/default-config.ts` / `config.ts` | `weeklyReport` 配置 |
| `src/bootstrap/composition-root.ts` | 装配并启动调度 |
| `docs/weekly-commits/.gitkeep` | 保证空目录可入库 |
| `test/weekly-commit-week.test.ts` 等 | 单测 |
| `.env.example` / `AGENTS.md` | 可选环境变量说明（内部） |

---

### Task 1: 周文件名与周区间纯函数

**Files:**
- Create: `src/core/weekly-commit-week.ts`
- Test: `test/weekly-commit-week.test.ts`

**Interfaces:**
- Produces:
  - `ENGLISH_MONTH_NAMES: readonly string[]`（index 0 = January）
  - `getWeekSunday(date: Date): Date` — 本地时区该日所属周的周日 00:00 本地时刻对应的 Date（年月日取本地）
  - `getWeekOfMonthIndex(sunday: Date): number` — 1-based `Wn`
  - `formatWeeklyCommitFileName(date: Date): string` — 如 `2026-August-W1.ndjson`
  - `getWeekRangeLabels(date: Date): { sunday: string; saturday: string }` — `YYYY-MM-DD` 本地

- [ ] **Step 1: Write the failing test**

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWeeklyCommitFileName, getWeekOfMonthIndex, getWeekRangeLabels, getWeekSunday } from '../src/core/weekly-commit-week.ts';

function localDate(year: number, monthIndex: number, day: number): Date {
    return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

describe('weekly-commit-week', () => {
    it('maps Friday 2026-08-07 to Sunday 2026-08-02 week file 2026-August-W1.ndjson', () => {
        const d = localDate(2026, 7, 7);
        assert.equal(getWeekSunday(d).getFullYear(), 2026);
        assert.equal(getWeekSunday(d).getMonth(), 7);
        assert.equal(getWeekSunday(d).getDate(), 2);
        assert.equal(getWeekOfMonthIndex(getWeekSunday(d)), 1);
        assert.equal(formatWeeklyCommitFileName(d), '2026-August-W1.ndjson');
        assert.deepEqual(getWeekRangeLabels(d), { sunday: '2026-08-02', saturday: '2026-08-08' });
    });

    it('attributes a week to the month of its Sunday', () => {
        // 2026-08-01 is Saturday → week Sunday is 2026-07-26 → July
        const d = localDate(2026, 7, 1);
        assert.equal(formatWeeklyCommitFileName(d), '2026-July-W4.ndjson');
    });
});
```

（若本地日历下 July-W4 编号与实现不一致，先用 `getWeekSunday` / 月内周日列表手算断言，再定死期望文件名；以「归属月 = 周日所在月、Wn = 该月内第几个周日」为准。）

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test test/weekly-commit-week.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

在 `src/core/weekly-commit-week.ts` 实现：

- `getDay()`：0=周日 … 6=周六；回退 `date.getDate() - getDay()` 得到本周周日。
- `getWeekOfMonthIndex`：`y/m` 取自周日；从该月 1 号起找出所有 `getDay()===0` 的日期，找 `sunday` 的序号（1-based）。
- `formatWeeklyCommitFileName`：`${year}-${ENGLISH_MONTH_NAMES[month]}-W${n}.ndjson`
- 本地 `YYYY-MM-DD` 用 `getFullYear/getMonth/getDate` 格式化，勿用 `toISOString()`（避免 UTC 错日）。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test test/weekly-commit-week.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/core/weekly-commit-week.ts test/weekly-commit-week.test.ts
$commitMessage = @'
feat(weekly): 新增周日周界与周报文件名计算

按周日归属月与月内周序号生成 YYYY-Month-Wn.ndjson，供 skill 与周报任务共用。
'@
git commit -m $commitMessage
```

---

### Task 2: NDJSON 解析与按 project 分组

**Files:**
- Create: `src/core/weekly-commit.ts`
- Test: `test/weekly-commit.test.ts`

**Interfaces:**
- Consumes: 无（本任务不依赖 week 文件名）
- Produces:
  - `WeeklyCommitEntry` 类型（`timestamp`, `project`, `projectPath`, `hash`, `branch`, `subject`, `body`）
  - `parseWeeklyCommitNdjson(text: string): { entries: WeeklyCommitEntry[]; skippedLines: number }`
  - `groupWeeklyCommitsByProject(entries: WeeklyCommitEntry[]): Map<string, WeeklyCommitEntry[]>`（key = `project`，插入顺序稳定）
  - `EMPTY_WEEKLY_REPORT_TEXT = '本周无提交记录'`
  - `buildWeeklyReportPrompt(input: { weekFileName: string; sunday: string; saturday: string; entries: WeeklyCommitEntry[] }): string`

- [ ] **Step 1: Write the failing test**

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    EMPTY_WEEKLY_REPORT_TEXT,
    buildWeeklyReportPrompt,
    groupWeeklyCommitsByProject,
    parseWeeklyCommitNdjson
} from '../src/core/weekly-commit.ts';

describe('weekly-commit', () => {
    it('parses valid lines, skips bad lines, and groups by project', () => {
        const text = [
            JSON.stringify({
                timestamp: '2026-08-07T10:00:00+08:00',
                project: 'alpha',
                projectPath: 'e:\\\\a',
                hash: 'aaa',
                branch: 'main',
                subject: 'feat: a',
                body: ''
            }),
            '{not-json}',
            JSON.stringify({
                timestamp: '2026-08-07T11:00:00+08:00',
                project: 'beta',
                projectPath: 'e:\\\\b',
                hash: 'bbb',
                branch: 'main',
                subject: 'fix: b',
                body: '详情'
            }),
            ''
        ].join('\n');

        const parsed = parseWeeklyCommitNdjson(text);
        assert.equal(parsed.entries.length, 2);
        assert.equal(parsed.skippedLines, 1);
        const grouped = groupWeeklyCommitsByProject(parsed.entries);
        assert.deepEqual([...grouped.keys()], ['alpha', 'beta']);
    });

    it('builds a prompt that asks for excerpts plus short summary per project', () => {
        const prompt = buildWeeklyReportPrompt({
            weekFileName: '2026-August-W1.ndjson',
            sunday: '2026-08-02',
            saturday: '2026-08-08',
            entries: [
                {
                    timestamp: '2026-08-07T10:00:00+08:00',
                    project: 'alpha',
                    projectPath: 'e:\\a',
                    hash: 'aaa',
                    branch: 'main',
                    subject: 'feat: a',
                    body: ''
                }
            ]
        });
        assert.match(prompt, /2026-08-02/);
        assert.match(prompt, /alpha/);
        assert.match(prompt, /feat: a/);
        assert.match(prompt, /摘录/);
        assert.match(prompt, /总结/);
    });

    it('exports empty-week copy', () => {
        assert.equal(EMPTY_WEEKLY_REPORT_TEXT, '本周无提交记录');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test test/weekly-commit.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

- 解析：按行 trim，空行忽略且不计入 `skippedLines`；`JSON.parse` 失败或缺必填字符串字段则 `skippedLines++`。
- Prompt：中文说明「根据下列 commit 生成复盘周报；按项目分节；每节含简短总结与关键提交摘录；不要编造对话；输出纯文本」。然后列出区间、文件名与 JSON 条目（或紧凑列表）。

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test test/weekly-commit.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/core/weekly-commit.ts test/weekly-commit.test.ts
$commitMessage = @'
feat(weekly): 解析周报 NDJSON 并组装 Prompt

支持坏行跳过、按 project 分组，以及空周固定文案常量。
'@
git commit -m $commitMessage
```

---

### Task 3: 文件系统 WeeklyCommitStore

**Files:**
- Create: `src/ports/weekly-commit-store.ts`
- Create: `src/adapters/file-system-weekly-commit-store.ts`
- Test: `test/file-system-weekly-commit-store.test.ts`

**Interfaces:**
- Consumes: `parseWeeklyCommitNdjson` from `../core/weekly-commit.ts`
- Produces:
  - `WeeklyCommitStore = { listCommitsForWeekFile(fileName: string): Promise<{ entries: WeeklyCommitEntry[]; skippedLines: number; missing: boolean }> }`
  - `createFileSystemWeeklyCommitStore(options: { directory: string; readFile?: typeof readFile; logger?: { warn(message: string): void } })`

- [ ] **Step 1: Write the failing test**

用 `mkdtemp` 写入合法 NDJSON 与缺失文件两种情况：

- 文件存在：返回 `missing: false` 与解析结果
- 文件不存在：返回 `missing: true`、`entries: []`、`skippedLines: 0`（不抛错）

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test test/file-system-weekly-commit-store.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement port + adapter**

```typescript
// ports/weekly-commit-store.ts
import type { WeeklyCommitEntry } from '../core/weekly-commit.ts';

export type WeeklyCommitStore = {
    listCommitsForWeekFile: (fileName: string) => Promise<{
        entries: WeeklyCommitEntry[];
        skippedLines: number;
        missing: boolean;
    }>;
};
```

Adapter：`join(directory, fileName)` → `readFile`；`ENOENT` → missing；若 `skippedLines > 0` 且有 logger，则 `warn` 一行。

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/ports/weekly-commit-store.ts src/adapters/file-system-weekly-commit-store.ts test/file-system-weekly-commit-store.test.ts
$commitMessage = @'
feat(weekly): 新增本仓库周报原料文件读取适配器

只读 docs/weekly-commits 下指定周文件，缺失时返回空结果。
'@
git commit -m $commitMessage
```

---

### Task 4: AI 周报生成端口与适配器

**Files:**
- Create: `src/ports/weekly-report.ts`
- Create: `src/adapters/ai-weekly-report-generator.ts`
- Test: `test/ai-weekly-report-generator.test.ts`

**Interfaces:**
- Consumes: `askAI` from `./ai-agent.ts`（可注入）
- Produces:
  - `WeeklyReportGenerator = { generate(prompt: string): Promise<string> }`
  - `createAIWeeklyReportGenerator(options: { apiKey: string; baseURL?: string; model: string; effort?: AIEffort; askAI?: typeof askAI })`

- [ ] **Step 1: Write failing test** — 注入假 `askAI`，断言传入的 prompt 原样、返回 trim 后文本；空字符串时返回一个非空兜底（如 `本周周报生成结果为空。`）。

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** — 薄封装调用 `askAI({ apiKey, baseURL, model, effort, prompt })`。

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit** with message `feat(weekly): 新增 AI 周报生成适配器`

---

### Task 5: 周报 Job 编排

**Files:**
- Create: `src/app/weekly-report-job.ts`
- Test: `test/weekly-report-job.test.ts`

**Interfaces:**
- Consumes: `WeeklyCommitStore`, `WeeklyReportGenerator`, `formatWeeklyCommitFileName`, `getWeekRangeLabels`, `buildWeeklyReportPrompt`, `EMPTY_WEEKLY_REPORT_TEXT`
- Produces:
  - `createWeeklyReportJob(options: { store: WeeklyCommitStore; generator: WeeklyReportGenerator; sendText: (chatId: string, text: string) => Promise<void>; chatId: string; now?: () => Date; logger?: { info/warn/error } }): { run(): Promise<void> }`

行为：

1. `fileName = formatWeeklyCommitFileName(now())`
2. `store.listCommitsForWeekFile(fileName)`
3. 若 `entries.length === 0` → `sendText(chatId, EMPTY_WEEKLY_REPORT_TEXT)` 并 return
4. 否则 `generator.generate(buildWeeklyReportPrompt(...))` → `sendText(chatId, text)`
5. 任一步抛错：logger.error，**不重新抛出**（或由 scheduler 吞掉；job 内捕获更稳）

- [ ] **Step 1: Write failing tests**
  - 空条目 → 发送「本周无提交记录」，不调用 generator
  - 有条目 → 调用 generator 与 sendText，内容为生成结果
  - generator 抛错 → 不抛出到测试调用方，且可不发送或发送失败仅记日志（断言不 throw）

- [ ] **Step 2–4: TDD 实现至 PASS**

- [ ] **Step 5: Commit** `feat(weekly): 编排周报读取生成与空周推送`

---

### Task 6: 周五调度器

**Files:**
- Create: `src/app/weekly-report-scheduler.ts`
- Test: `test/weekly-report-scheduler.test.ts`

**Interfaces:**
- Produces:
  - `getNextFridayAtLocalTime(from: Date, hour: number, minute: number): Date` — 若 `from` 已是周五且时刻已过，则下周五；若是周五且尚未到点，则本周五该时刻
  - `startWeeklyReportScheduler(options: { hour: number; minute: number; run: () => Promise<void>; now?: () => Date; setTimeoutFn?: typeof setTimeout; clearTimeoutFn?: typeof clearTimeout; logger?: ... }): { stop(): void }`

实现要点：

- 用注入的 `setTimeoutFn` 排到 `getNextFridayAtLocalTime`；触发后 `await run()`（catch 错误），再调度下一次。
- `stop()` 清除 pending timeout。
- 不新增 npm 依赖。

- [ ] **Step 1: Write failing tests** for `getNextFridayAtLocalTime` with fixed local Dates（例如周四 → 次日周五 18:00；周五 19:00 → 下周五 18:00；周五 17:00 → 当日 18:00）。

- [ ] **Step 2–4: Implement + PASS**（scheduler 可用假 `setTimeoutFn` 捕获 delay 与回调，不必真等一周）

- [ ] **Step 5: Commit** `feat(weekly): 新增周五本地时刻周报调度器`

---

### Task 7: 配置与组合根接入

**Files:**
- Modify: `src/bootstrap/default-config.ts`
- Modify: `src/bootstrap/config.ts`
- Modify: `src/bootstrap/composition-root.ts`
- Modify: `test/config.test.ts`（补充：缺 `WEEKLY_REPORT_CHAT_ID` 时 `weeklyReport.enabled` 为 false / chatId 为空）
- Modify: `.env.example`（若存在）与 `AGENTS.md` 环境变量表（可选内部说明：`WEEKLY_REPORT_CHAT_ID`、`WEEKLY_REPORT_HOUR`、`WEEKLY_REPORT_MINUTE`）
- Create: `docs/weekly-commits/.gitkeep`

**Interfaces:**
- `Config.weeklyReport = { chatId?: string; hour: number; minute: number; directory: string }`
- 默认：`directory: 'docs/weekly-commits'`，`hour: 18`，`minute: 0`
- `chatId` 来自 `WEEKLY_REPORT_CHAT_ID`（可选，非必填启动项）
- 仅当 `chatId` 非空时：创建 store（directory 相对 `process.cwd()` 或 `path.resolve`）、generator（复用 config AI）、`sendText` 用现有 `messageSender.sendTextMessage`、`startWeeklyReportScheduler`

- [ ] **Step 1: Extend config tests** for defaults and optional chatId

- [ ] **Step 2: Run config tests — FAIL then implement loadConfig fields**

- [ ] **Step 3: Wire composition-root** — `startBot` 末尾在 `wsClient.start` 前后均可启动 scheduler；logger 打一行 `weekly report scheduler started chatId=...` 或 `skipped`

- [ ] **Step 4: Run** `pnpm test` 与 `pnpm typecheck` — 全绿

- [ ] **Step 5: Commit** `feat(weekly): 配置并启动周五周报调度`

---

### Task 8: 更新 commit skill（集中落盘）

**Files:**
- Modify: `C:\Users\Administrator\.cursor\skills\commit\SKILL.md`

**说明:** 此文件在 Cursor 个人 skills 目录，不在 git 仓库内；改完后在对话中告知用户已更新。若用户希望把 skill 副本放进仓库，首版不做。

- [ ] **Step 1: 在「执行提交」成功校验之后新增章节「写入周报原料」**，要求 agent：

1. 解析 `feishu-cli` 根：`$env:FEISHU_CLI_ROOT`，否则默认 `e:\opensource\feishu-cli`
2. 确认根目录存在；否则打印错误并结束落盘（不回滚 commit）
3. 取当前仓库：`git rev-parse --show-toplevel` → `projectPath`；`Split-Path -Leaf` → `project`
4. `git rev-parse --short HEAD`、`git branch --show-current`（空则 `HEAD`）
5. 用与仓库相同的周规则计算本周文件名（skill 内写明算法 + 示例；可用一小段 PowerShell 计算周日与 Wn，或调用仓库脚本——首版在 skill 内嵌 PowerShell，避免依赖 `pnpm`）
6. `New-Item -Force` 创建 `docs/weekly-commits`
7. 将一条 JSON（含 `timestamp` ISO 本地偏移、`project`、`projectPath`、`hash`、`branch`、`subject`、`body`）`Add-Content` 追加到目标 `.ndjson`
8. 提示用户目标路径；**禁止** `git add` 该文件
9. 强调：仅实际 `git commit` 成功后执行；只生成文案时跳过

- [ ] **Step 2: 自检 skill** — 核对 description 仍覆盖「生成/执行 commit」；落盘步骤不削弱「永不自动 git add」

- [ ] **Step 3: 不提交到 feishu-cli 仓库**（个人 skill）；若本任务无仓库文件变更则跳过 git commit

---

### Task 9: 冒烟与收尾

**Files:**
- 可选手动：在 `docs/weekly-commits/` 放入样例行，临时在 REPL/`tsx` 调用 `createWeeklyReportJob(...).run()`（不提交调试脚本除非有用）
- Modify: `docs/ARCHITECTURE.md` — 在目录结构中增加 weekly 相关文件一行（保持与实现一致）

- [ ] **Step 1: Run full verification**

```powershell
pnpm test
pnpm typecheck
pnpm format
```

Expected: all pass

- [ ] **Step 2: Update ARCHITECTURE.md** briefly for weekly report modules

- [ ] **Step 3: Commit** `docs: 同步架构说明中的周报模块`

- [ ] **Step 4: Stop** — 向用户汇报：skill 已更新、如何设 `WEEKLY_REPORT_CHAT_ID` / `FEISHU_CLI_ROOT`、如何用一次私聊 chatId

---

## Spec coverage checklist

| Spec 项 | Task |
| --- | --- |
| 周日～周六周界、周日归属月、`YYYY-Month-Wn` | Task 1 |
| NDJSON 字段含 project/projectPath、坏行跳过、按项目分组、Prompt/空周文案 | Task 2 |
| 只读本仓库 docs/weekly-commits | Task 3 |
| AI 生成复盘 | Task 4 |
| 空周推送、错误不拖垮 | Task 5 |
| 周五可配置时刻调度 | Task 6 |
| chatId 配置、启用条件、组合根 | Task 7 |
| Commit skill 集中写入 feishu-cli | Task 8 |
| 验证与架构文档 | Task 9 |
| 不扫描其他项目、不改 usage.md | 全局约束 + Task 7/9 |

## Self-review notes

- 无 TBD 占位；调度不引入新依赖。
- `WeeklyCommitEntry` 字段名与 spec JSON 一致。
- Skill 与 core 周算法两处维护：Task 1 为权威实现；Task 8 skill 文档必须复述同一规则。
