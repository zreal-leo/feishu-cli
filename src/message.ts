export type FeishuMessageMention = {
    key?: string;
    name?: string;
};

export type FeishuIncomingMessageEvent = {
    message?: {
        message_id?: string;
        message_type?: string;
        content?: string;
        chat_id?: string;
        mentions?: FeishuMessageMention[];
    };
    sender?: {
        sender_type?: string;
    };
};

export const DEFAULT_REACTION_EMOJI_TYPE = 'Typing';
export const CURSOR_REPLY_CARD_ELEMENT_ID = 'cursor_reply_content';
const CURSOR_REPLY_INITIAL_TEXT = '正在生成回复...';
const CURSOR_REPLY_INITIAL_SUMMARY = '生成中...';
const CURSOR_REPLY_EMPTY_TEXT = '（无内容）';
const CARD_SUMMARY_MAX_LENGTH = 50;
const DEFAULT_MEETING_TOPIC = '会议';
const DEFAULT_CLOUD_PLAYER_PLAY_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_REPEAT_MODE = -1;
const DEFAULT_CLOUD_PLAYER_REPEAT_TIME = 1;
const DEFAULT_CLOUD_PLAYER_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_VIDEO_URL = 'https://media.comein.cn/video/344317-1740031837920.mp4';
const DEFAULT_FEISHU_DOC_INSTRUCTION = '请总结这份文档的核心内容。';
const FEISHU_DOC_CONTENT_MAX_LENGTH = 60000;

export type CloudPlayerMediaStreamType = 1 | 2;
export type CloudPlayerPlayType = 1;
export type CloudPlayerRepeatMode = -1 | 1 | 2;
export type CloudPlayerType = 0 | 1 | 2;

export type FeishuCardText = {
    tag: 'plain_text' | 'lark_md';
    content: string;
};

export type FeishuCard = {
    schema: '2.0';
    config: {
        streaming_mode?: boolean;
        wide_screen_mode?: boolean;
        summary?: {
            content: string;
        };
        streaming_config?: {
            print_frequency_ms: {
                default: number;
            };
            print_step: {
                default: number;
            };
            print_strategy: 'fast';
        };
    };
    card_link?: {
        url: string;
        pc_url: string;
        ios_url: string;
        android_url: string;
    };
    header?: {
        title: FeishuCardText;
        template?: string;
    };
    body: {
        elements: FeishuCardElement[];
    };
};

export type FeishuCardElement = {
    tag: string;
    element_id?: string;
    content?: string;
    text?: FeishuCardText;
    type?: string;
    url?: string;
    pc_url?: string;
    ios_url?: string;
    android_url?: string;
    elements?: FeishuCardElement[];
};

export type CreateMeetingCommand = {
    type: 'create_meeting';
    title: string;
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type FeishuDocResourceType = 'docx' | 'wiki';

export type FeishuDocCommand = {
    type: 'feishu_doc';
    url: string;
    resourceType: FeishuDocResourceType;
    token: string;
    instruction: string;
};

export type CloudPlayerCommandOptions = {
    mediaStreamType: CloudPlayerMediaStreamType;
    streamUrl: string;
    playType: CloudPlayerPlayType;
    repeatMode: CloudPlayerRepeatMode;
    repeatTime: number;
    type: CloudPlayerType;
};

export type MeetingCreatedReplyData = {
    title: string;
    roadshowId: number;
    eventId: number;
    netLiveUrl: string;
    cloudPlayerCreated?: boolean;
    cloudPlayerError?: string;
};

export function extractIncomingText(event: FeishuIncomingMessageEvent): string | null {
    if (event.sender?.sender_type === 'bot') {
        return null;
    }

    if (event.message?.message_type !== 'text' || !event.message.content) {
        return null;
    }

    try {
        const content = JSON.parse(event.message.content) as { text?: unknown };
        const text = typeof content.text === 'string' ? stripLeadingMentions(content.text, event.message.mentions).trim() : '';
        return text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

function stripLeadingMentions(text: string, mentions: FeishuMessageMention[] = []): string {
    let result = text.trimStart();
    let previous = '';

    while (result !== previous) {
        previous = result;
        result = result.replace(/^<at\b[^>]*>.*?<\/at>\s*/i, '').trimStart();

        for (const mention of mentions) {
            const mentionTexts = [mention.key, mention.name ? `@${mention.name}` : undefined, mention.name].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
            for (const mentionText of mentionTexts) {
                result = result.replace(new RegExp(`^${escapeRegExp(mentionText)}(?:\\s+|$)`), '').trimStart();
            }
        }

        result = result.replace(/^@\S+\s+/, '').trimStart();
    }

    return result;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildCursorPrompt(text: string): string {
    return ['你正在通过飞书机器人回复用户。', '请用中文简洁回复，不要提及内部实现，除非用户明确询问。', '', '用户在飞书发送的消息：', text].join('\n');
}

export function parseCreateMeetingCommand(text: string): CreateMeetingCommand | null {
    const trimmedText = text.trim();
    if (trimmedText === '创建会议并创建云播') {
        return {
            type: 'create_meeting',
            title: DEFAULT_MEETING_TOPIC,
            cloudPlayer: buildCloudPlayerOptions({
                mediaStreamType: 2,
                streamUrl: DEFAULT_CLOUD_PLAYER_VIDEO_URL
            })
        };
    }

    const match = trimmedText.match(/^创建会议(?:\s+(.+))?$/s);
    if (!match) {
        return null;
    }

    const commandBody = match[1]?.trim() || '';
    const cloudPlayer = parseCloudPlayerOptions(commandBody);
    const titleText = cloudPlayer ? commandBody.slice(0, cloudPlayer.titleEndIndex).trim() : commandBody;
    const command: CreateMeetingCommand = {
        type: 'create_meeting',
        title: titleText || DEFAULT_MEETING_TOPIC
    };
    if (cloudPlayer) {
        command.cloudPlayer = cloudPlayer.options;
    }

    return command;
}

export function parseFeishuDocCommand(text: string): FeishuDocCommand | null {
    const docLink = findFeishuDocLink(text);
    if (!docLink) {
        return null;
    }

    const instruction = normalizeInstruction(`${text.slice(0, docLink.startIndex)} ${text.slice(docLink.endIndex)}`);

    return {
        type: 'feishu_doc',
        url: docLink.url,
        resourceType: docLink.resourceType,
        token: docLink.token,
        instruction: instruction || DEFAULT_FEISHU_DOC_INSTRUCTION
    };
}

export function buildFeishuDocCursorPrompt(command: FeishuDocCommand, docContent: string): string {
    const { content, truncated } = truncateDocContent(docContent);
    const lines = [
        '你正在通过飞书机器人帮助用户分析一份飞书文档。',
        '请用中文简洁回复，不要提及内部实现。',
        '只能根据下方“文档内容”回答；如果文档内容不足以完成指令，请明确说明无法从文档判断。',
        '',
        '用户指令：',
        command.instruction,
        '',
        '飞书文档链接：',
        command.url,
        '',
        '文档内容：',
        content || '（文档为空）'
    ];

    if (truncated) {
        lines.push('', `注意：文档内容超过 ${FEISHU_DOC_CONTENT_MAX_LENGTH} 字，已截取前 ${FEISHU_DOC_CONTENT_MAX_LENGTH} 字用于分析。`);
    }

    return lines.join('\n');
}

export function formatFeishuDocReadFailedReply(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `读取飞书文档失败：${message}`;
}

export function formatMeetingCreatedReply(data: MeetingCreatedReplyData): string {
    const lines = [`会议创建成功`, `会议标题：${data.title}`, `会议 ID：${data.roadshowId}`, `事件 ID：${data.eventId}`, `观看链接：${data.netLiveUrl}`];
    if (data.cloudPlayerCreated) {
        lines.push('云播：已创建');
    } else if (data.cloudPlayerError) {
        lines.push(`云播：创建失败（${data.cloudPlayerError}）`);
    }

    return lines.join('\n');
}

export function formatMeetingCreateFailedReply(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `创建会议失败：${message}`;
}

export function buildCursorReplyCard(text = CURSOR_REPLY_INITIAL_TEXT, options: { streaming?: boolean } = {}): FeishuCard {
    const streaming = options.streaming ?? false;
    return {
        schema: '2.0',
        config: {
            wide_screen_mode: true,
            streaming_mode: streaming,
            summary: {
                content: streaming ? CURSOR_REPLY_INITIAL_SUMMARY : summarizeCardText(text)
            },
            ...(streaming
                ? {
                      streaming_config: {
                          print_frequency_ms: {
                              default: 70
                          },
                          print_step: {
                              default: 1
                          },
                          print_strategy: 'fast' as const
                      }
                  }
                : {})
        },
        body: {
            elements: [
                {
                    tag: 'markdown',
                    element_id: CURSOR_REPLY_CARD_ELEMENT_ID,
                    content: text.trim().length > 0 ? text : CURSOR_REPLY_EMPTY_TEXT
                }
            ]
        }
    };
}

export function buildMeetingCreatedCard(data: MeetingCreatedReplyData): FeishuCard {
    const detailLines = [`**会议标题：** ${data.title}`, `**会议 ID：** ${data.roadshowId}`, `**事件 ID：** ${data.eventId}`, `**观看链接：** ${data.netLiveUrl}`];
    if (data.cloudPlayerCreated) {
        detailLines.push('**云播：** 已创建');
    } else if (data.cloudPlayerError) {
        detailLines.push(`**云播：** 创建失败（${data.cloudPlayerError}）`);
    }

    return {
        schema: '2.0',
        config: {
            wide_screen_mode: true,
            summary: {
                content: `会议创建成功：${data.title}`
            }
        },
        card_link: buildCardLink(data.netLiveUrl),
        header: {
            template: 'green',
            title: {
                tag: 'plain_text',
                content: '会议创建成功'
            }
        },
        body: {
            elements: [
                {
                    tag: 'markdown',
                    content: detailLines.join('\n')
                },
                {
                    tag: 'button',
                    text: {
                        tag: 'plain_text',
                        content: '打开会议'
                    },
                    type: 'primary',
                    url: data.netLiveUrl,
                    pc_url: data.netLiveUrl,
                    ios_url: data.netLiveUrl,
                    android_url: data.netLiveUrl
                }
            ]
        }
    };
}

export function buildMeetingCreateFailedCard(error: unknown): FeishuCard {
    const message = error instanceof Error ? error.message : String(error);
    return {
        schema: '2.0',
        config: {
            wide_screen_mode: true,
            summary: {
                content: '创建会议失败'
            }
        },
        header: {
            template: 'red',
            title: {
                tag: 'plain_text',
                content: '创建会议失败'
            }
        },
        body: {
            elements: [
                {
                    tag: 'markdown',
                    content: `创建会议失败：${message}`
                }
            ]
        }
    };
}

export function toFeishuTextContent(text: string): string {
    return JSON.stringify({ text });
}

export function toFeishuCardContent(card: FeishuCard): string {
    return JSON.stringify(card);
}

export function toFeishuCardReferenceContent(cardId: string): string {
    return JSON.stringify({
        type: 'card',
        data: {
            card_id: cardId
        }
    });
}

export function toFeishuReactionPayload(emojiType = DEFAULT_REACTION_EMOJI_TYPE): { reaction_type: { emoji_type: string } } {
    return {
        reaction_type: {
            emoji_type: emojiType
        }
    };
}

function parseCloudPlayerOptions(commandBody: string): { titleEndIndex: number; options: CloudPlayerCommandOptions } | null {
    const match = commandBody.match(/(?:^|\s)(音频)?云播(?:\s+(https?:\/\/\S+))?\s*$/i);
    if (!match || match.index === undefined) {
        return null;
    }

    const isAudio = Boolean(match[1]);
    const streamUrl = match[2] ?? (isAudio ? undefined : DEFAULT_CLOUD_PLAYER_VIDEO_URL);
    if (!streamUrl) {
        return null;
    }

    return {
        titleEndIndex: match.index,
        options: buildCloudPlayerOptions({
            mediaStreamType: isAudio ? 1 : 2,
            streamUrl
        })
    };
}

function buildCloudPlayerOptions(options: { mediaStreamType: CloudPlayerMediaStreamType; streamUrl: string }): CloudPlayerCommandOptions {
    return {
        mediaStreamType: options.mediaStreamType,
        streamUrl: options.streamUrl,
        playType: DEFAULT_CLOUD_PLAYER_PLAY_TYPE,
        repeatMode: DEFAULT_CLOUD_PLAYER_REPEAT_MODE,
        repeatTime: DEFAULT_CLOUD_PLAYER_REPEAT_TIME,
        type: DEFAULT_CLOUD_PLAYER_TYPE
    };
}

type FeishuDocLinkMatch = {
    url: string;
    resourceType: FeishuDocResourceType;
    token: string;
    startIndex: number;
    endIndex: number;
};

function findFeishuDocLink(text: string): FeishuDocLinkMatch | null {
    const urlPattern = /https?:\/\/[^\s<>"'，。；、,;!！？)）]+/gi;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(text)) !== null) {
        const candidate = trimUrlCandidate(match[0]);
        const parsed = parseFeishuDocUrl(candidate);
        if (!parsed) {
            continue;
        }

        return {
            ...parsed,
            url: candidate,
            startIndex: match.index,
            endIndex: match.index + match[0].length
        };
    }

    return null;
}

function trimUrlCandidate(value: string): string {
    return value.replace(/[),，。；;、!?！？]+$/u, '');
}

function parseFeishuDocUrl(value: string): Pick<FeishuDocLinkMatch, 'resourceType' | 'token'> | null {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }

    if (!isFeishuHost(url.hostname)) {
        return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const resourceIndex = segments.findIndex(segment => segment === 'docx' || segment === 'wiki');
    if (resourceIndex < 0) {
        return null;
    }

    const token = segments[resourceIndex + 1]?.trim();
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
        return null;
    }

    return {
        resourceType: segments[resourceIndex] as FeishuDocResourceType,
        token
    };
}

function isFeishuHost(hostname: string): boolean {
    return hostname === 'feishu.cn' || hostname.endsWith('.feishu.cn') || hostname === 'larksuite.com' || hostname.endsWith('.larksuite.com');
}

function normalizeInstruction(value: string): string {
    return value
        .replace(/^[\s，。；、,;!?！？)）]+|[\s，。；、,;!?！？(（]+$/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateDocContent(value: string): { content: string; truncated: boolean } {
    if (value.length <= FEISHU_DOC_CONTENT_MAX_LENGTH) {
        return { content: value, truncated: false };
    }

    return {
        content: value.slice(0, FEISHU_DOC_CONTENT_MAX_LENGTH),
        truncated: true
    };
}

export function summarizeCardText(text: string, maxLength = CARD_SUMMARY_MAX_LENGTH): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    return `${cleaned.slice(0, maxLength - 1)}…`;
}

function buildCardLink(url: string): FeishuCard['card_link'] {
    return {
        url,
        pc_url: url,
        ios_url: url,
        android_url: url
    };
}
