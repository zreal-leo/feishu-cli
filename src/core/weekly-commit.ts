export type WeeklyCommitEntry = {
    timestamp: string;
    project: string;
    projectPath: string;
    hash: string;
    branch: string;
    subject: string;
    body: string;
};

export const EMPTY_WEEKLY_REPORT_TEXT = '本周无提交记录';

const REQUIRED_STRING_FIELDS: (keyof WeeklyCommitEntry)[] = ['timestamp', 'project', 'projectPath', 'hash', 'branch', 'subject', 'body'];

function isWeeklyCommitEntry(value: unknown): value is WeeklyCommitEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return REQUIRED_STRING_FIELDS.every(field => typeof record[field] === 'string');
}

export function parseWeeklyCommitNdjson(text: string): {
    entries: WeeklyCommitEntry[];
    skippedLines: number;
} {
    const entries: WeeklyCommitEntry[] = [];
    let skippedLines = 0;

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '') {
            continue;
        }

        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (!isWeeklyCommitEntry(parsed)) {
                skippedLines++;
                continue;
            }
            entries.push(parsed);
        } catch {
            skippedLines++;
        }
    }

    return { entries, skippedLines };
}

export function groupWeeklyCommitsByProject(entries: WeeklyCommitEntry[]): Map<string, WeeklyCommitEntry[]> {
    const grouped = new Map<string, WeeklyCommitEntry[]>();

    for (const entry of entries) {
        const existing = grouped.get(entry.project);
        if (existing) {
            existing.push(entry);
        } else {
            grouped.set(entry.project, [entry]);
        }
    }

    return grouped;
}

export function buildWeeklyReportPrompt(input: { weekFileName: string; sunday: string; saturday: string; entries: WeeklyCommitEntry[] }): string {
    const lines = [
        '根据下列 commit 生成复盘周报；按项目分节；每节含简短总结与关键提交摘录；不要编造对话；输出纯文本。',
        '',
        `周报区间：${input.sunday} ～ ${input.saturday}`,
        `原料文件：${input.weekFileName}`,
        '',
        '提交记录：',
        JSON.stringify(input.entries, null, 2)
    ];

    return lines.join('\n');
}
