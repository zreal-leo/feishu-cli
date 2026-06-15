import type { AskCursorOptions } from './cursor-agent.ts';
import { askCursor as defaultAskCursor } from './cursor-agent.ts';
import { MEETING_EVENT_MODE_LABELS, MEETING_EVENT_WAY_LABELS, MEETING_PERMISSION_OPTIONS } from '../../core/meeting.ts';
import type { CloudPlayerCommandOptions, CloudPlayerMediaStreamType, CloudPlayerPlayType, CloudPlayerRepeatMode, CloudPlayerType } from '../../core/meeting.ts';
import type { MeetingIntentParser, ParseMeetingParametersInput, ParsedMeetingIntent, ParsedMeetingIntentParameters } from '../../ports/meeting.ts';
import { normalizeMeetingParameters, parseCursorJson } from './create-meeting-parameter-parser.ts';
import type { RawCursorMeetingParameters } from './create-meeting-parameter-parser.ts';

type AskCursor = (options: AskCursorOptions) => Promise<string>;

export type CursorMeetingIntentParserOptions = {
    apiKey: string;
    model: string;
    askCursor?: AskCursor;
};

type RawCursorMeetingIntent = RawCursorMeetingParameters & {
    action?: unknown;
    cloudPlayer?: unknown;
};

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

export function createCursorMeetingIntentParser(options: CursorMeetingIntentParserOptions): MeetingIntentParser {
    const askCursor = options.askCursor ?? defaultAskCursor;

    return {
        async parse(input) {
            const responseText = await askCursor({
                apiKey: options.apiKey,
                model: options.model,
                prompt: buildMeetingIntentPrompt(input)
            });
            const rawIntent = parseCursorJson<RawCursorMeetingIntent>(responseText);

            return normalizeMeetingIntent(rawIntent);
        }
    };
}

function buildMeetingIntentPrompt(input: ParseMeetingParametersInput): string {
    const now = input.now ?? new Date();
    return [
        '你是一个飞书机器人消息路由器。只输出 JSON，不要输出 Markdown、解释或代码块。',
        `当前时间：${now.toISOString()}。用户可能使用相对时间，例如“3分钟后”“明天10点”，请解析成带时区的 ISO 8601 时间。`,
        '判断用户是否明确要求创建路演、直播、会议或云播。只有明确要求创建/安排/发起/开一个会议时，action 才能是 create_meeting。',
        '如果只是普通聊天、查询、总结、讨论是否要开会、信息不明确或需要先澄清，action 必须是 assistant。',
        '当 action 是 create_meeting 时，请提取字段，无法确定的字段填 null：',
        '- title: 路演主题或会议主题，字符串或 null。',
        '- startTime: 开始时间，ISO 8601 字符串或 null。',
        `- eventWays: 路演方式，只能是 ${formatAllowedEntries(MEETING_EVENT_WAY_LABELS)} 或对应中文标签，无法确定填 null。`,
        '- length: 视频时长，单位分钟，数字或 null。',
        `- eventMode: 直播类型，只能是 ${formatAllowedEntries(MEETING_EVENT_MODE_LABELS)} 或对应中文标签，无法确定填 null。`,
        `- permission: 路演权限，只能是 ${formatAllowedPermissions()} 或对应中文标签，无法确定填 null。`,
        '- cloudPlayer: 需要同时创建云播时填写对象，否则填 null。对象字段为 mediaStreamType 和 streamUrl；mediaStreamType 只能是 1、2、音频、视频；视频云播没有 URL 时可以填 null，音频云播必须提取 URL。',
        'JSON schema: {"action":"create_meeting"|"assistant","title":string|null,"startTime":string|null,"eventWays":-1|0|1|null,"length":number|null,"eventMode":number|null,"permission":string|number|null,"cloudPlayer":{"mediaStreamType":1|2|string|null,"streamUrl":string|null}|null}',
        `用户消息：${input.text}`
    ].join('\n');
}

function normalizeMeetingIntent(rawIntent: RawCursorMeetingIntent): ParsedMeetingIntent {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
