import type { AskAIOptions } from './ai-agent.ts';
import { askAI as defaultAskAI } from './ai-agent.ts';
import { buildMeetingRoutingInstructions } from '../../core/meeting-routing-instructions.ts';
import { MEETING_EVENT_MODE_LABELS, MEETING_EVENT_WAY_LABELS, MEETING_PERMISSION_OPTIONS } from '../../core/meeting.ts';
import type { CloudPlayerCommandOptions, CloudPlayerMediaStreamType, CloudPlayerPlayType, CloudPlayerRepeatMode, CloudPlayerType, MeetingEventMode, MeetingEventWay } from '../../core/meeting.ts';
import type { MeetingIntentParser, ParseMeetingParametersInput, ParsedMeetingIntent, ParsedMeetingIntentParameters, ParsedMeetingParameters } from '../../ports/meeting.ts';

type AskAI = (options: AskAIOptions) => Promise<string>;

export type AIMeetingIntentParserOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
    askAI?: AskAI;
};

type RawMeetingParameters = {
    title?: unknown;
    startTime?: unknown;
    eventWays?: unknown;
    length?: unknown;
    eventMode?: unknown;
    permission?: unknown;
};

type RawMeetingIntent = RawMeetingParameters & {
    action?: unknown;
    cloudPlayer?: unknown;
};

type MeetingPermissionOption = keyof typeof MEETING_PERMISSION_OPTIONS;

const DEFAULT_CLOUD_PLAYER_PLAY_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_REPEAT_MODE = -1;
const DEFAULT_CLOUD_PLAYER_REPEAT_TIME = 1;
const DEFAULT_CLOUD_PLAYER_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_VIDEO_URL = 'https://media.comein.cn/video/344317-1740031837920.mp4';

const CLOUD_PLAYER_MEDIA_STREAM_TYPE_ALIASES = new Map<string, CloudPlayerMediaStreamType>([
    ['1', 1],
    ['audio', 1],
    ['音频', 1],
    ['音频云播', 1],
    ['2', 2],
    ['video', 2],
    ['视频', 2],
    ['视频云播', 2],
    ['云播', 2]
]);

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

export function createAIMeetingIntentParser(options: AIMeetingIntentParserOptions): MeetingIntentParser {
    const askAI = options.askAI ?? defaultAskAI;

    return {
        async parse(input) {
            const responseText = await askAI({
                apiKey: options.apiKey,
                baseURL: options.baseURL,
                model: options.model,
                prompt: buildMeetingIntentPrompt(input)
            });
            return parseMeetingIntentResponse(responseText);
        }
    };
}

export function parseMeetingIntentResponse(responseText: string): ParsedMeetingIntent {
    const rawIntent = parseJSON<RawMeetingIntent>(responseText);
    return normalizeMeetingIntent(rawIntent);
}

function buildMeetingIntentPrompt(input: ParseMeetingParametersInput): string {
    const now = input.now ?? new Date();
    return [
        '你是一个飞书机器人消息路由器。只输出 JSON，不要输出 Markdown、解释或代码块。',
        ...buildMeetingRoutingInstructions(now),
        'JSON schema: {"action":"create_meeting"|"assistant","title":string|null,"startTime":string|null,"eventWays":-1|0|1|null,"length":number|null,"eventMode":number|null,"permission":string|number|null,"cloudPlayer":{"mediaStreamType":1|2|string|null,"streamUrl":string|null}|null}',
        `用户消息：${input.text}`
    ].join('\n');
}

function normalizeMeetingIntent(rawIntent: RawMeetingIntent): ParsedMeetingIntent {
    if (normalizeAction(rawIntent.action) !== 'create_meeting') {
        return { action: 'assistant' };
    }

    const parameters: ParsedMeetingIntentParameters = normalizeMeetingParameters(rawIntent);
    const cloudPlayer = normalizeCloudPlayer(rawIntent.cloudPlayer);
    if (cloudPlayer) {
        parameters.cloudPlayer = cloudPlayer;
    }

    return {
        action: 'create_meeting',
        parameters
    };
}

function normalizeAction(value: unknown): 'create_meeting' | 'assistant' {
    return typeof value === 'string' && value.trim() === 'create_meeting' ? 'create_meeting' : 'assistant';
}

function normalizeCloudPlayer(value: unknown): CloudPlayerCommandOptions | undefined {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new Error('云播参数格式无效。');
    }

    const mediaStreamType = normalizeCloudPlayerMediaStreamType(value.mediaStreamType);
    const streamUrl = normalizeCloudPlayerStreamUrl(value.streamUrl, mediaStreamType);

    return {
        mediaStreamType,
        streamUrl,
        playType: DEFAULT_CLOUD_PLAYER_PLAY_TYPE as CloudPlayerPlayType,
        repeatMode: DEFAULT_CLOUD_PLAYER_REPEAT_MODE as CloudPlayerRepeatMode,
        repeatTime: DEFAULT_CLOUD_PLAYER_REPEAT_TIME,
        type: DEFAULT_CLOUD_PLAYER_TYPE as CloudPlayerType
    };
}

function normalizeCloudPlayerMediaStreamType(value: unknown): CloudPlayerMediaStreamType {
    if (value === null || value === undefined || value === '') {
        return 2;
    }

    const key = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
    const mediaStreamType = CLOUD_PLAYER_MEDIA_STREAM_TYPE_ALIASES.get(key);
    if (mediaStreamType === undefined) {
        throw new Error(`不支持的云播类型：${String(value)}`);
    }

    return mediaStreamType;
}

function normalizeCloudPlayerStreamUrl(value: unknown, mediaStreamType: CloudPlayerMediaStreamType): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
        if (mediaStreamType === 2) {
            return DEFAULT_CLOUD_PLAYER_VIDEO_URL;
        }

        throw new Error('音频云播必须提供公网音频地址。');
    }

    try {
        const url = new URL(text);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('unsupported protocol');
        }
    } catch {
        throw new Error(`云播地址格式无效：${text}`);
    }

    return text;
}

function normalizeMeetingParameters(rawParameters: RawMeetingParameters): ParsedMeetingParameters {
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

function parseJSON<T extends Record<string, unknown> = RawMeetingParameters>(responseText: string): T {
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
