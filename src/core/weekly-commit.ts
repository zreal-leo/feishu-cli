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

export type RequirementCommitGroup = {
    key: string;
    title: string;
    url?: string;
    entries: WeeklyCommitEntry[];
};

const STORY_URL_PATTERN = /https:\/\/project\.feishu\.cn\/[^\s/]+\/story\/detail\/(\d+)/;
const BRANCH_STORY_PATTERN = /^(?:feature|hotfix|fix|feat)[-/](\d{7,})(?:[-/](.*))?$/i;

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

function titleFromBranchSlug(slug: string): string {
    return slug.replace(/[-/]+/g, ' ').trim();
}

function hasChinese(text: string): boolean {
    return /[\u4e00-\u9fff]/.test(text);
}

function preferChineseTitle(...candidates: Array<string | undefined>): string | undefined {
    const titles = candidates.map(candidate => candidate?.trim()).filter((candidate): candidate is string => candidate !== undefined && candidate !== '');
    return titles.find(hasChinese) ?? titles[0];
}

function titleFromBodyPrefix(body: string, urlIndex: number): string | undefined {
    const before = body.slice(0, urlIndex).trim();
    if (before === '') {
        return undefined;
    }

    const lines = before.split('\n').map(line => line.trim()).filter(line => line !== '');
    const lastLine = lines.at(-1);
    if (!lastLine) {
        return undefined;
    }

    const title = lastLine.replace(/[：:]\s*$/, '').trim();
    return title === '' ? undefined : title;
}

function workTitleFromEntry(entry: WeeklyCommitEntry): string {
    const subjectTitle = stripConventionalCommitPrefix(entry.subject);
    const bodyPreview = sanitizeCommitBody(entry.body)
        .replace(STORY_URL_PATTERN, '')
        .replace(/[：:]\s*$/gm, '')
        .split('\n')
        .map(line => line.trim())
        .find(line => line !== '');

    return preferChineseTitle(subjectTitle, bodyPreview) ?? entry.subject;
}

function extractRequirementRef(entry: WeeklyCommitEntry): { key: string; title: string; url?: string } {
    const subjectTitle = stripConventionalCommitPrefix(entry.subject);
    const urlMatch = STORY_URL_PATTERN.exec(entry.body);
    if (urlMatch?.[1]) {
        return {
            key: urlMatch[1],
            title: preferChineseTitle(titleFromBodyPrefix(entry.body, urlMatch.index), subjectTitle) ?? entry.subject,
            url: urlMatch[0]
        };
    }

    const branchMatch = BRANCH_STORY_PATTERN.exec(entry.branch);
    if (branchMatch?.[1]) {
        const slugTitle = titleFromBranchSlug(branchMatch[2] ?? '');
        return {
            key: branchMatch[1],
            title: preferChineseTitle(slugTitle, subjectTitle) ?? entry.subject
        };
    }

    const title = workTitleFromEntry(entry);
    return { key: `unlinked:${title}`, title };
}

export function groupWeeklyCommitsByRequirement(entries: WeeklyCommitEntry[]): RequirementCommitGroup[] {
    const grouped = new Map<string, RequirementCommitGroup>();

    for (const entry of entries) {
        const ref = extractRequirementRef(entry);
        const existing = grouped.get(ref.key);
        if (!existing) {
            grouped.set(ref.key, {
                key: ref.key,
                title: ref.title,
                url: ref.url,
                entries: [entry]
            });
            continue;
        }

        existing.entries.push(entry);
        if (!existing.url && ref.url) {
            existing.url = ref.url;
            existing.title = ref.title;
        } else if (!hasChinese(existing.title) && hasChinese(ref.title)) {
            existing.title = ref.title;
        }
    }

    return [...grouped.values()];
}

function stripConventionalCommitPrefix(subject: string): string {
    return subject.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?(!)?:\s*/i, '').trim();
}

function sanitizeCommitBody(body: string): string {
    return body
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !/^Co-authored-by:/i.test(line))
        .join('\n')
        .trim();
}

function uniquePreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }

    return result;
}

function formatRequirementSource(group: RequirementCommitGroup): string {
    const projects = uniquePreserveOrder(group.entries.map(entry => entry.project));
    const notes: string[] = [];
    const seen = new Set<string>();

    for (const entry of group.entries) {
        const summary = stripConventionalCommitPrefix(entry.subject);
        const details = sanitizeCommitBody(entry.body)
            .replace(STORY_URL_PATTERN, '')
            .replace(/[：:]\s*$/gm, '')
            .replace(/\n{2,}/g, '\n')
            .trim();

        for (const note of [summary, details]) {
            if (note === '' || note === group.title || seen.has(note)) {
                continue;
            }
            seen.add(note);
            notes.push(note);
        }
    }

    return [`涉及项目：${projects.join('、')}`, ...notes].join('\n');
}

export function buildWeeklyReportPrompt(input: { weekFileName: string; sunday: string; saturday: string; entries: WeeklyCommitEntry[] }): string {
    const grouped = groupWeeklyCommitsByRequirement(input.entries);
    const requirementSections: string[] = [];

    for (const group of grouped) {
        const header = /^\d+$/.test(group.key) ? `需求 ${group.key} ${group.title}` : group.title;
        requirementSections.push(`${header}\n${formatRequirementSource(group)}`);
    }

    const lines = [
        '根据下列工作原料生成可供他人审阅的周报。',
        '输出固定两段纯文本：本周工作、本周完成。不要增加风险、下周计划或需要支持等章节，也不要编造下周计划、风险或量化指标。',
        '第一段第一行写：本周工作（区间与下方周报区间一致）；下一行用一句话概括本周最重要的完成事项。',
        '第二段第一行写：本周完成；随后用无序列表，每条以 - 开头，一项对应一个需求（同一需求可跨项目合并）。没有需求编号时，用中文工作标题作为需求名称，不要写「未关联需求」。',
        '每个需求只写一条简短进展，把该需求下的改动整合成一条列表项；不要将全部 commit 简单罗列，也不要按提交或项目逐条展开。',
        '每条以【需求名称】开头，接着写本周完成内容与影响。需求名称须含中文，不要使用纯英文名称；产品专有名词可保留英文。不要输出需求链接、需求地址或任何 URL。',
        '每条列表项全文控制在 50 字以内；细小问题、文案或样式微调无需输出，若某需求只剩细小改动则整条省略。',
        '不要直接输出提交信息：不要出现提交哈希、分支名、Conventional Commits 标题、共同作者署名、仓库路径或逐条提交列表。',
        '不要编造原料中没有的工作。',
        '',
        `周报区间：${input.sunday} ～ ${input.saturday}`,
        `原料文件：${input.weekFileName}`,
        '',
        '工作原料：',
        requirementSections.join('\n\n')
    ];

    return lines.join('\n');
}
