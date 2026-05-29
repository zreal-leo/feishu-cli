import * as Lark from '@larksuiteoapi/node-sdk';

import { createFeishuMessageProcessor } from './feishu-message-processor.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { toFeishuTextContent } from './message.js';

export type StartBotOptions = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
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
        sendTextMessage: async (chatId, text) => {
            await client.im.v1.message.create({
                params: {
                    receive_id_type: 'chat_id'
                },
                data: {
                    receive_id: chatId,
                    msg_type: 'text',
                    content: toFeishuTextContent(text)
                }
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
