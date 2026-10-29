import type { MeetingCreatedReplyData } from '../../core/meeting.ts';

export type LarkCardText = {
    tag: 'plain_text' | 'lark_md';
    content: string;
};

export type LarkCard = {
    schema: '2.0';
    config: {
        wide_screen_mode?: boolean;
        summary?: {
            content: string;
        };
    };
    card_link?: {
        url: string;
        pc_url: string;
        ios_url: string;
        android_url: string;
    };
    header?: {
        title: LarkCardText;
        template?: string;
    };
    body: {
        elements: LarkCardElement[];
    };
};

export type LarkCardElement = {
    tag: string;
    element_id?: string;
    content?: string;
    text?: LarkCardText;
    type?: string;
    url?: string;
    pc_url?: string;
    ios_url?: string;
    android_url?: string;
    elements?: LarkCardElement[];
};

export function formatMeetingCreatedReply(data: MeetingCreatedReplyData): string {
    const lines = [`会议创建成功`, `会议标题：${data.title}`, `会议 ID：${data.roadshowId}`, `观看链接：${data.netLiveUrl}`];
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

export function buildMeetingCreatedCard(data: MeetingCreatedReplyData): LarkCard {
    const detailLines = [`**会议标题：** ${data.title}`, `**会议 ID：** ${data.roadshowId}`, `**观看链接：** \`${data.netLiveUrl}\``];
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

export function buildMeetingCreateFailedCard(error: unknown): LarkCard {
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
