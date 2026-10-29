import * as Lark from '@larksuiteoapi/node-sdk';

import { toLarkCardReferenceContent, toLarkTextContent } from './protocol.ts';
import type { LarkCard } from './renderers.ts';

export type LarkMessageSender = {
    sendTextMessage: (chatId: string, text: string) => Promise<{ messageId?: string }>;
    sendCardMessage: (chatId: string, card: LarkCard) => Promise<{ cardId: string; messageId?: string }>;
};

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
        }
    };
}
