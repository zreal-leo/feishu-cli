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
export const WEEKLY_REPORT_FAILURE_TEXT = '本周周报生成失败，请查看日志';

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

    const normalized = text.replace(/^\uFEFF/, '');

    for (const line of normalized.split('\n')) {
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
    const grouped = groupWeeklyCommitsByProject(input.entries);
    const projectSections: string[] = [];

    for (const [project, commits] of grouped) {
        const commitLines = commits.map(entry => {
            const line = `${entry.hash} ${entry.subject}`;
            if (entry.body.trim() !== '') {
                return `${line}\n${entry.body}`;
            }
            return line;
        });
        projectSections.push(`${project}\n${commitLines.join('\n')}`);
    }

    const lines = [
        '根据下列 commit 生成复盘周报；按项目分节；每节含简短总结与关键提交摘录；不要编造对话；输出纯文本。',
        '',
        `周报区间：${input.sunday} ～ ${input.saturday}`,
        `原料文件：${input.weekFileName}`,
        '',
        '提交记录：',
        projectSections.join('\n\n')
    ];

    return lines.join('\n');
}
