import * as Lark from '@larksuiteoapi/node-sdk';

import type { ReactionGateway } from '../../ports/reaction.ts';
import { toLarkCardReferenceContent, toLarkReactionPayload, toLarkTextContent } from './protocol.ts';
import type { LarkCard } from './renderers.ts';

export type LarkMessageSender = {
    sendTextMessage: (chatId: string, text: string) => Promise<{ messageId?: string }>;
    updateTextMessage: (messageId: string, text: string) => Promise<void>;
    sendCardMessage: (chatId: string, card: LarkCard) => Promise<{ cardId: string; messageId?: string }>;
    updateCardElementContent: (cardId: string, elementId: string, content: string, sequence: number) => Promise<void>;
    finishCardStreaming: (cardId: string, sequence: number, summary: string) => Promise<void>;
};

export function createLarkReactionGateway(client: Lark.Client): ReactionGateway {
    return {
        async add(messageId, emojiType) {
            const response = await client.im.v1.messageReaction.create({
                path: {
                    message_id: messageId
                },
                data: toLarkReactionPayload(emojiType)
            });

            return { reactionId: response.data?.reaction_id };
        },
        async remove(messageId, reactionId) {
            await client.im.v1.messageReaction.delete({
                path: {
                    message_id: messageId,
                    reaction_id: reactionId
                }
            });
        }
    };
}

export function createLarkMessageSender(client: Lark.Client): LarkMessageSender {
    return {
        async sendTextMessage(chatId, text) {
            const response = await client.im.v1.message.create({
                params: {
                    receive_id_type: 'chat_id'
                },
                data: {
                    receive_id: chatId,
                    msg_type: 'text',
                    content: toLarkTextContent(text)
                }
            });

            return { messageId: response.data?.message_id };
        },
        async updateTextMessage(messageId, text) {
            await client.im.v1.message.update({
                path: {
                    message_id: messageId
                },
                data: {
                    msg_type: 'text',
                    content: toLarkTextContent(text)
                }
            });
        },
        async sendCardMessage(chatId, card) {
            const cardResponse = await client.cardkit.v1.card.create({
                data: {
                    type: 'card_json',
                    data: JSON.stringify(card)
                }
            });
            const cardId = cardResponse.data?.card_id;

            if (!cardId) {
                throw new Error('Lark 卡片创建失败：缺少 card_id');
            }

            const messageResponse = await client.im.v1.message.create({
                params: {
                    receive_id_type: 'chat_id'
                },
                data: {
                    receive_id: chatId,
                    msg_type: 'interactive',
                    content: toLarkCardReferenceContent(cardId)
                }
            });

            return {
                cardId,
                messageId: messageResponse.data?.message_id
            };
        },
        async updateCardElementContent(cardId, elementId, content, sequence) {
            await client.cardkit.v1.cardElement.content({
                path: {
                    card_id: cardId,
                    element_id: elementId
                },
                data: {
                    content,
                    sequence,
                    uuid: `content_${cardId}_${sequence}`
                }
            });
        },
        async finishCardStreaming(cardId, sequence, summary) {
            await client.cardkit.v1.card.settings({
                path: {
                    card_id: cardId
                },
                data: {
                    settings: JSON.stringify({
                        config: {
                            streaming_mode: false,
                            summary: {
                                content: summary
                            }
                        }
                    }),
                    sequence,
                    uuid: `settings_${cardId}_${sequence}`
                }
            });
        }
    };
}
