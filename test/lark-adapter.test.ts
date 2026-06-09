import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapLarkIncomingMessage } from '../src/adapters/lark/inbound.ts';
import { createLarkReplyGateway } from '../src/adapters/lark/reply-gateway.ts';
import { CURSOR_REPLY_CARD_ELEMENT_ID } from '../src/adapters/lark/renderers.ts';
import type { LarkIncomingMessageEvent } from '../src/message.ts';

describe('mapLarkIncomingMessage', () => {
    it('maps a Lark text event into the framework message input', () => {
        const event: LarkIncomingMessageEvent = {
            message: {
                message_id: 'om_1',
                message_type: 'text',
                chat_id: 'chat_1',
                content: JSON.stringify({ text: '@_user_1 你好' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            }
        };

        assert.deepEqual(mapLarkIncomingMessage(event), {
            chatId: 'chat_1',
            messageId: 'om_1',
            text: '你好'
        });
    });

    it('returns null for events without usable text or chat id', () => {
        assert.equal(
            mapLarkIncomingMessage({
                message: {
                    message_type: 'image',
                    chat_id: 'chat_1',
                    content: '{}'
                }
            }),
            null
        );
    });
});

describe('createLarkReplyGateway', () => {
    it('renders semantic meeting replies through Lark cards when card sending is available', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: silentLogger,
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            },
            sendCardMessage: async (chatId, card) => {
                const actionButton = card.body.elements.at(-1);
                assert.equal(card.card_link, undefined);
                actions.push(`send-card:${chatId}:${card.header?.title.content}:${actionButton?.url}`);
                return { messageId: 'om_reply', cardId: 'card_reply' };
            }
        });

        await gateway.send('chat_1', {
            type: 'meeting_created',
            data: {
                title: 'BOT: AI 总结 15:33',
                roadshowId: 123,
                eventId: 456,
                netLiveUrl: 'http://s.comein.cn/live'
            }
        });

        assert.deepEqual(actions, ['send-card:chat_1:会议创建成功:http://s.comein.cn/live']);
    });

    it('streams assistant replies into a Lark card', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            },
            sendCardMessage: async (chatId, card) => {
                actions.push(`send-card:${chatId}:${String(card.body.elements[0].content)}:${String(card.config.streaming_mode)}`);
                return { messageId: 'om_reply', cardId: 'card_reply' };
            },
            updateCardElementContent: async (cardId, elementId, content, sequence) => {
                actions.push(`update-card:${cardId}:${elementId}:${content}:${sequence}`);
            },
            finishCardStreaming: async (cardId, sequence, summary) => {
                actions.push(`finish-card:${cardId}:${sequence}:${summary}`);
            }
        });

        await gateway.send(
            'chat_1',
            (async function* () {
                yield '第一段';
                yield '第二段';
            })()
        );

        assert.deepEqual(actions, ['send-card:chat_1:第一段:true', `update-card:card_reply:${CURSOR_REPLY_CARD_ELEMENT_ID}:第一段第二段:1`, 'finish-card:card_reply:2:第一段第二段']);
    });
});

const silentLogger = {
    info() {},
    error() {}
};
