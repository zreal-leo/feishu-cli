import * as Lark from '@larksuiteoapi/node-sdk';

import type { ManagerMeetingConfig } from './config.ts';
import { createManagerMeetingClient } from './adapters/manager/index.ts';
import { createFeishuMessageProcessor } from './feishu-message-processor.ts';
import type { FeishuIncomingMessageEvent } from './message.ts';
import { toFeishuCardReferenceContent, toFeishuReactionPayload, toFeishuTextContent } from './message.ts';

export type StartBotOptions = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
    managerMeeting: ManagerMeetingConfig;
};

export function startFeishuCursorBot(options: StartBotOptions): void {
    const baseConfig = {
        appId: options.feishuAppId,
        appSecret: options.feishuAppSecret
    };

    const client = new Lark.Client(baseConfig);
    const managerMeetingClient = createManagerMeetingClient(options.managerMeeting);
    const wsClient = new Lark.WSClient({
        ...baseConfig,
        loggerLevel: Lark.LoggerLevel.info
    });
    const messageProcessor = createFeishuMessageProcessor({
        cursorApiKey: options.cursorApiKey,
        cursorModel: options.cursorModel,
        addMessageReaction: async (messageId, emojiType) => {
            const response = await client.im.v1.messageReaction.create({
                path: {
                    message_id: messageId
                },
                data: toFeishuReactionPayload(emojiType)
            });

            return { reactionId: response.data?.reaction_id };
        },
        removeMessageReaction: async (messageId, reactionId) => {
            await client.im.v1.messageReaction.delete({
                path: {
                    message_id: messageId,
                    reaction_id: reactionId
                }
            });
        },
        sendTextMessage: async (chatId, text) => {
            const response = await client.im.v1.message.create({
                params: {
                    receive_id_type: 'chat_id'
                },
                data: {
                    receive_id: chatId,
                    msg_type: 'text',
                    content: toFeishuTextContent(text)
                }
            });

            return { messageId: response.data?.message_id };
        },
        updateTextMessage: async (messageId, text) => {
            await client.im.v1.message.update({
                path: {
                    message_id: messageId
                },
                data: {
                    msg_type: 'text',
                    content: toFeishuTextContent(text)
                }
            });
        },
        sendCardMessage: async (chatId, card) => {
            const cardResponse = await client.cardkit.v1.card.create({
                data: {
                    type: 'card_json',
                    data: JSON.stringify(card)
                }
            });
            const cardId = cardResponse.data?.card_id;

            if (!cardId) {
                throw new Error('飞书卡片创建失败：缺少 card_id');
            }

            const messageResponse = await client.im.v1.message.create({
                params: {
                    receive_id_type: 'chat_id'
                },
                data: {
                    receive_id: chatId,
                    msg_type: 'interactive',
                    content: toFeishuCardReferenceContent(cardId)
                }
            });

            return {
                cardId,
                messageId: messageResponse.data?.message_id
            };
        },
        updateCardElementContent: async (cardId, elementId, content, sequence) => {
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
        finishCardStreaming: async (cardId, sequence, summary) => {
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
        },
        createMeeting: async request => {
            return managerMeetingClient.createMeeting(request);
        }
    });

    const eventDispatcher = new Lark.EventDispatcher({
        encryptKey: options.feishuEncryptKey
    }).register({
        'im.message.receive_v1': (event: FeishuIncomingMessageEvent) => {
            messageProcessor.handleEvent(event);
        }
    });

    wsClient.start({ eventDispatcher });
}
