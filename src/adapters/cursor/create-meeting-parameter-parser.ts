import type { AskCursorOptions } from './cursor-agent.ts';
import { askCursor as defaultAskCursor } from './cursor-agent.ts';
import type { MeetingEventMode, MeetingEventWay } from '../../core/meeting.ts';
import { MEETING_EVENT_MODE_LABELS, MEETING_EVENT_WAY_LABELS, MEETING_PERMISSION_OPTIONS } from '../../core/meeting.ts';
import type { MeetingParameterParser, ParseMeetingParametersInput, ParsedMeetingParameters } from '../../ports/meeting.ts';

type AskCursor = (options: AskCursorOptions) => Promise<string>;

export type CursorMeetingParameterParserOptions = {
    apiKey: string;
    model: string;
    askCursor?: AskCursor;
};

export type RawCursorMeetingParameters = {
    title?: unknown;
    startTime?: unknown;
    eventWays?: unknown;
    length?: unknown;
    eventMode?: unknown;
    permission?: unknown;
};
type MeetingPermissionOption = keyof typeof MEETING_PERMISSION_OPTIONS;

const EVENT_WAY_ALIASES = new Map<string, MeetingEventWay>([
    ['-1', -1],
    ['无直播', -1],
    ['不开直播', -1],
    ['不直播', -1],
    ['0', 0],
    ['音频路演', 0],
    ['音频', 0],
    ['音频直播', 0],
    ['1', 1],
    ['视频路演', 1],
    ['视频', 1],
    ['视频直播', 1]
]);

const EVENT_MODE_ALIASES = new Map<string, MeetingEventMode>(
    Object.entries(MEETING_EVENT_MODE_LABELS).flatMap(([mode, label]) => [
        [mode, Number(mode) as MeetingEventMode],
        [label, Number(mode) as MeetingEventMode]
    ])
);

const PERMISSION_ALIASES = new Map<string, MeetingPermissionOption>(buildPermissionAliases());

export function createCursorMeetingParameterParser(options: CursorMeetingParameterParserOptions): MeetingParameterParser {
    const askCursor = options.askCursor ?? defaultAskCursor;

    return {
        async parse(input) {
            const responseText = await askCursor({
                apiKey: options.apiKey,
                model: options.model,
                prompt: buildCreateMeetingParameterPrompt(input)
            });
            const rawParameters = parseCursorJson(responseText);

            return normalizeMeetingParameters(rawParameters);
        }
    };
}

function buildCreateMeetingParameterPrompt(input: ParseMeetingParametersInput): string {
    const now = input.now ?? new Date();
    return [
        '你是一个飞书机器人命令参数解析器。只输出 JSON，不要输出 Markdown、解释或代码块。',
        `当前时间：${now.toISOString()}。用户可能使用相对时间，例如“3分钟后”“明天10点”，请解析成带时区的 ISO 8601 时间。`,
        '请从创建会议命令中提取字段，无法确定的字段填 null：',
        '- title: 路演主题或会议主题，字符串或 null。',
        '- startTime: 开始时间，ISO 8601 字符串或 null。',
        `- eventWays: 路演方式，只能是 ${formatAllowedEntries(MEETING_EVENT_WAY_LABELS)} 或对应中文标签，无法确定填 null。`,
        '- length: 视频时长，单位分钟，数字或 null。',
        `- eventMode: 直播类型，只能是 ${formatAllowedEntries(MEETING_EVENT_MODE_LABELS)} 或对应中文标签，无法确定填 null。`,
        `- permission: 路演权限，只能是 ${formatAllowedPermissions()} 或对应中文标签，无法确定填 null。`,
        'JSON schema: {"title": string|null, "startTime": string|null, "eventWays": -1|0|1|null, "length": number|null, "eventMode": number|null, "permission": string|number|null}',
        `用户命令：${input.text}`
    ].join('\n');
}

export function normalizeMeetingParameters(rawParameters: RawCursorMeetingParameters): ParsedMeetingParameters {
    const normalized: ParsedMeetingParameters = {};
    const title = normalizeOptionalString(rawParameters.title);
    if (title) {
        normalized.title = title;
    }

    const stimeMs = normalizeStartTime(rawParameters.startTime);
    if (stimeMs !== undefined) {
        normalized.stimeMs = stimeMs;
    }

    const eventWays = normalizeEventWay(rawParameters.eventWays);
    if (eventWays !== undefined) {
        normalized.eventWays = eventWays;
    }

    const length = normalizeLength(rawParameters.length);
    if (length !== undefined) {
        normalized.length = length;
    }

    const eventMode = normalizeEventMode(rawParameters.eventMode);
    if (eventMode !== undefined) {
        normalized.eventMode = eventMode;
    }

    const permission = normalizePermission(rawParameters.permission);
    if (permission) {
        Object.assign(normalized, permission);
    }

    return normalized;
}

export function parseCursorJson<T extends Record<string, unknown> = RawCursorMeetingParameters>(responseText: string): T {
    const jsonText = extractFirstJsonObject(responseText.trim());
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error(`Cursor 参数解析失败：返回内容不是合法 JSON。`);
    }

    if (!isRecord(parsed)) {
        throw new Error('Cursor 参数解析失败：返回内容不是 JSON 对象。');
    }

    return parsed as T;
}

function extractFirstJsonObject(text: string): string {
    if (text.startsWith('{') && text.endsWith('}')) {
        return text;
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return text.slice(start, end + 1);
    }

    return text;
}

function normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStartTime(value: unknown): number | undefined {
    const text = normalizeOptionalString(value);
    if (!text) {
        return undefined;
    }

    const time = new Date(text).getTime();
    if (!Number.isFinite(time)) {
        throw new Error(`开始时间格式无效：${text}`);
    }

    return time;
}

function normalizeEventWay(value: unknown): MeetingEventWay | undefined {
    const key = normalizeScalarKey(value);
    if (!key) {
        return undefined;
    }

    const eventWay = EVENT_WAY_ALIASES.get(key);
    if (eventWay === undefined) {
        throw new Error(`不支持的路演方式：${key}`);
    }

    return eventWay;
}

function normalizeLength(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    const raw = typeof value === 'number' ? value : Number(String(value).trim().match(/^\d+/)?.[0]);
    if (!Number.isInteger(raw) || raw <= 0) {
        throw new Error(`视频时长必须是正整数分钟：${String(value)}`);
    }

    return raw;
}

function normalizeEventMode(value: unknown): MeetingEventMode | undefined {
    const key = normalizeScalarKey(value);
    if (!key) {
        return undefined;
    }

    const eventMode = EVENT_MODE_ALIASES.get(key);
    if (eventMode === undefined) {
        throw new Error(`不支持的直播类型：${key}`);
    }

    return eventMode;
}

function normalizePermission(value: unknown): ParsedMeetingParameters | undefined {
    const key = normalizeScalarKey(value);
    if (!key) {
        return undefined;
    }

    const option = PERMISSION_ALIASES.get(key);
    if (!option) {
        throw new Error(`不支持的路演权限：${key}`);
    }

    return { ...MEETING_PERMISSION_OPTIONS[option] };
}

function normalizeScalarKey(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return normalizeOptionalString(value);
}

function formatAllowedEntries(entries: Record<string, string>): string {
    return Object.entries(entries)
        .map(([value, label]) => `${value}:${label}`)
        .join('、');
}

function formatAllowedPermissions(): string {
    return Object.entries(MEETING_PERMISSION_OPTIONS)
        .map(([value, fields]) => `${value}:${fields.tagName}`)
        .join('、');
}

function buildPermissionAliases(): Array<[string, MeetingPermissionOption]> {
    return Object.entries(MEETING_PERMISSION_OPTIONS).flatMap(([option, backendFields]) => {
        const permissionOption = option as MeetingPermissionOption;
        return [
            [option, permissionOption],
            [backendFields.tagName, permissionOption]
        ];
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
