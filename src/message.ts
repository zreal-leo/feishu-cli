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

export function toFeishuTextContent(text: string): string {
    return JSON.stringify({ text });
}
