import { DEFAULT_REACTION_EMOJI_TYPE } from '../../core/reactions.ts';

export type LarkMessageMention = {
    key?: string;
    name?: string;
};

export type LarkSenderId = {
    open_id?: string;
    user_id?: string;
    union_id?: string;
};

export type LarkIncomingMessageEvent = {
    message?: {
        message_id?: string;
        message_type?: string;
        content?: string;
        chat_id?: string;
        mentions?: LarkMessageMention[];
    };
    sender?: {
        name?: string;
        sender_id?: LarkSenderId;
        sender_name?: string;
        sender_type?: string;
    };
};

export function toLarkTextContent(text: string): string {
    return JSON.stringify({ text });
}

export function toLarkCardReferenceContent(cardId: string): string {
    return JSON.stringify({
        type: 'card',
        data: {
            card_id: cardId
        }
    });
}

export function toLarkReactionPayload(emojiType = DEFAULT_REACTION_EMOJI_TYPE): { reaction_type: { emoji_type: string } } {
    return {
        reaction_type: {
            emoji_type: emojiType
        }
    };
}

export { DEFAULT_REACTION_EMOJI_TYPE };
