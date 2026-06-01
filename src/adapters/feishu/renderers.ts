import type { MeetingCreatedReplyData } from '../../core/meeting.ts';

export const CURSOR_REPLY_CARD_ELEMENT_ID = 'cursor_reply_content';
const CURSOR_REPLY_INITIAL_TEXT = '正在生成回复...';
const CURSOR_REPLY_INITIAL_SUMMARY = '生成中...';
const CURSOR_REPLY_EMPTY_TEXT = '（无内容）';
const CARD_SUMMARY_MAX_LENGTH = 50;

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
