export type FeishuIncomingMessageEvent = {
    message?: {
        message_id?: string;
        message_type?: string;
        content?: string;
        chat_id?: string;
    };
    sender?: {
        sender_type?: string;
    };
};

export const DEFAULT_REACTION_EMOJI_TYPE = 'Typing';
const DEFAULT_MEETING_TITLE = '飞书创建会议';

export type CreateMeetingCommand = {
    type: 'create_meeting';
    title: string;
};

export type MeetingCreatedReplyData = {
    roadshowId: number;
    eventId: number;
    netLiveUrl: string;
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
        const text = typeof content.text === 'string' ? content.text.trim() : '';
        return text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

export function buildCursorPrompt(text: string): string {
    return ['你正在通过飞书机器人回复用户。', '请用中文简洁回复，不要提及内部实现，除非用户明确询问。', '', '用户在飞书发送的消息：', text].join('\n');
}

export function parseCreateMeetingCommand(text: string): CreateMeetingCommand | null {
    const match = text.trim().match(/^创建会议(?:\s+(.+))?$/s);
    if (!match) {
        return null;
    }

    const title = match[1]?.trim() || DEFAULT_MEETING_TITLE;
    return {
        type: 'create_meeting',
        title
    };
}

export function formatMeetingCreatedReply(data: MeetingCreatedReplyData): string {
    return [`会议创建成功`, `会议 ID：${data.roadshowId}`, `事件 ID：${data.eventId}`, `观看链接：${data.netLiveUrl}`].join('\n');
}

export function formatMeetingCreateFailedReply(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `创建会议失败：${message}`;
}

export function toFeishuTextContent(text: string): string {
    return JSON.stringify({ text });
}

export function toFeishuReactionPayload(emojiType = DEFAULT_REACTION_EMOJI_TYPE): { reaction_type: { emoji_type: string } } {
    return {
        reaction_type: {
            emoji_type: emojiType
        }
    };
}
