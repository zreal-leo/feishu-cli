import * as Lark from '@larksuiteoapi/node-sdk';

import { createFeishuMessageProcessor } from './feishu-message-processor.js';
import { createManagerMeeting } from './manager-meeting.js';
import type { ManagerEnvironment } from './manager-meeting.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { toFeishuReactionPayload, toFeishuTextContent } from './message.js';

export type StartBotOptions = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
    managerEnv: ManagerEnvironment;
    managerToken?: string;
    managerLoginName?: string;
    managerPassword?: string;
    managerLoginId?: string;
    managerCode?: string;
};

export function startFeishuCursorBot(options: StartBotOptions): void {
    const baseConfig = {
        appId: options.feishuAppId,
        appSecret: options.feishuAppSecret
    };

    const client = new Lark.Client(baseConfig);
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
        createManagerMeeting: async ({ title }) => {
            return createManagerMeeting({
                env: options.managerEnv,
                title,
                token: options.managerToken,
                loginName: options.managerLoginName,
                password: options.managerPassword,
                loginId: options.managerLoginId,
                code: options.managerCode
            });
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
