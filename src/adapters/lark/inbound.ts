import type { MessageInput, MessageSender } from '../../core/types.ts';
import type { LarkIncomingMessageEvent, LarkMessageMention } from './protocol.ts';

export function mapLarkIncomingMessage(event: LarkIncomingMessageEvent): MessageInput | null {
    const text = extractIncomingText(event);
    const chatId = event.message?.chat_id;
    const sender = extractSender(event);

    if (!text || !chatId) {
        return null;
    }

    return {
        chatId,
        messageId: event.message?.message_id?.trim() || undefined,
        ...(sender ? { sender } : {}),
        text
    };
}

function extractSender(event: LarkIncomingMessageEvent): MessageSender | undefined {
    const senderId = normalizeOptionalString(event.sender?.sender_id?.open_id) ?? normalizeOptionalString(event.sender?.sender_id?.user_id) ?? normalizeOptionalString(event.sender?.sender_id?.union_id);
    const senderName = normalizeOptionalString(event.sender?.sender_name) ?? normalizeOptionalString(event.sender?.name);

    if (!senderId && !senderName) {
        return undefined;
    }

    return {
        ...(senderId ? { id: senderId } : {}),
        ...(senderName ? { name: senderName } : {})
    };
}

export function extractIncomingText(event: LarkIncomingMessageEvent): string | null {
    if (event.sender?.sender_type === 'bot') {
        return null;
    }

    if (event.message?.message_type !== 'text' || !event.message.content) {
        return null;
    }

    try {
        const content = JSON.parse(event.message.content) as { text?: unknown };
        if (typeof content.text !== 'string') {
            return null;
        }

        if (mentionsEveryone(content.text)) {
            return null;
        }

        const text = stripLeadingMentions(content.text, event.message.mentions).trim();
        return text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

function mentionsEveryone(text: string): boolean {
    return /(?:^|\s)@_all(?=\s|$)/.test(text);
}

function stripLeadingMentions(text: string, mentions: LarkMessageMention[] = []): string {
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

function normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
