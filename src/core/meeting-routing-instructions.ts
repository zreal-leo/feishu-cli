import { MEETING_EVENT_MODE_LABELS, MEETING_EVENT_WAY_LABELS, MEETING_PERMISSION_OPTIONS } from './meeting.ts';

export function buildMeetingRoutingInstructions(now: Date): string[] {
    return [
        `当前时间：${now.toISOString()}。用户可能使用相对时间，例如“3分钟后”“明天10点”，请解析成带时区的 ISO 8601 时间。`,
        '只有用户明确要求创建、安排、发起路演/直播/会议/云播时，才走创建会议分支。',
        '如果只是普通聊天、查询、总结、讨论是否要开会，一律按普通助手消息直接回复。用户明确要求创建会议时，即使所有参数未知也直接输出 JSON（字段填 null），不要询问或澄清。',
        '创建会议时只输出 JSON，不要输出 Markdown、解释或代码块。JSON 字段无法确定时填 null：',
        '- title: 路演主题或会议主题，字符串或 null。',
        '- startTime: 开始时间，ISO 8601 字符串或 null。',
        `- eventWays: 路演方式，只能是 ${formatAllowedEntries(MEETING_EVENT_WAY_LABELS)} 或对应中文标签，无法确定填 null。`,
        '- length: 视频时长，单位分钟，数字或 null。',
        `- eventMode: 直播类型，只能是 ${formatAllowedEntries(MEETING_EVENT_MODE_LABELS)} 或对应中文标签，无法确定填 null。`,
        `- permission: 路演权限，只能是 ${formatAllowedPermissions()} 或对应中文标签，无法确定填 null。`,
        '- cloudPlayer: 需要同时创建云播时填写对象，否则填 null。对象字段为 mediaStreamType 和 streamUrl；mediaStreamType 只能是 1、2、音频、视频；视频云播没有 URL 时可以填 null，音频云播必须提取 URL。',
        '创建会议 JSON schema: {"action":"create_meeting","title":string|null,"startTime":string|null,"eventWays":-1|0|1|null,"length":number|null,"eventMode":number|null,"permission":string|number|null,"cloudPlayer":{"mediaStreamType":1|2|string|null,"streamUrl":string|null}|null}'
    ];
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
