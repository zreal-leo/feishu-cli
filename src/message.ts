import { DEFAULT_REACTION_EMOJI_TYPE } from './core/reactions.ts';

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

export function toFeishuTextContent(text: string): string {
    return JSON.stringify({ text });
}

export function toFeishuCardContent(card: unknown): string {
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

export { DEFAULT_REACTION_EMOJI_TYPE };
