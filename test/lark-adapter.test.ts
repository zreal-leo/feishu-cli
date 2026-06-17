import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractIncomingText, mapLarkIncomingMessage } from '../src/adapters/lark/inbound.ts';
import { createLarkReplyGateway } from '../src/adapters/lark/reply-gateway.ts';
import { buildMeetingCreatedCard, CURSOR_REPLY_CARD_ELEMENT_ID, formatMeetingCreatedReply } from '../src/adapters/lark/renderers.ts';
import { DEFAULT_REACTION_EMOJI_TYPE, toLarkReactionPayload, toLarkTextContent } from '../src/adapters/lark/protocol.ts';
import type { LarkIncomingMessageEvent } from '../src/adapters/lark/protocol.ts';

const silentLogger = {
    info() {},
    error() {}
};

describe('extractIncomingText', () => {
    it('extracts text from a Lark text message event', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '帮我看一下这个项目' })
            }
        });

        assert.equal(text, '帮我看一下这个项目');
    });

    it('removes leading Lark mention keys from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '@_user_1 创建会议 AI总结' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('removes leading named bot mentions from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '@会议机器人 创建会议 AI总结' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('removes leading Lark at tags from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '<at user_id="ou_bot">会议机器人</at> 创建会议 AI总结' })
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('ignores messages that mention everyone (@所有人)', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '@_all 大家好' })
            }
        });

        assert.equal(text, null);
    });

    it('ignores non-text message events', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'image',
                content: '{}'
            }
        });

        assert.equal(text, null);
    });
});

describe('mapLarkIncomingMessage', () => {
    it('maps a Lark text event into the framework message input', () => {
        const event: LarkIncomingMessageEvent = {
            message: {
                message_id: 'om_1',
                message_type: 'text',
                chat_id: 'chat_1',
                content: JSON.stringify({ text: '@_user_1 你好' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            },
            sender: {
                sender_type: 'user',
                sender_id: {
                    open_id: 'ou_sender',
                    user_id: 'user_sender'
                },
                sender_name: '张三'
            }
        };

        assert.deepEqual(mapLarkIncomingMessage(event), {
            chatId: 'chat_1',
            messageId: 'om_1',
            sender: {
                id: 'ou_sender',
                name: '张三'
            },
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

describe('toLarkTextContent', () => {
    it('serializes Cursor text as Lark text content', () => {
        assert.equal(toLarkTextContent('收到，我来处理。'), JSON.stringify({ text: '收到，我来处理。' }));
    });
});

describe('toLarkReactionPayload', () => {
    it('defaults to Lark Typing emoji', () => {
        assert.equal(DEFAULT_REACTION_EMOJI_TYPE, 'Typing');
        assert.deepEqual(toLarkReactionPayload(), {
            reaction_type: {
                emoji_type: 'Typing'
            }
        });
    });

    it('builds a Lark message reaction payload', () => {
        assert.deepEqual(toLarkReactionPayload('THUMBSUP'), {
            reaction_type: {
                emoji_type: 'THUMBSUP'
            }
        });
    });
});

describe('formatMeetingCreatedReply', () => {
    it('formats the manager meeting result for Lark', () => {
        assert.equal(
            formatMeetingCreatedReply({ title: 'BOT: AI总结 15:33', roadshowId: 123456, eventId: 789012, netLiveUrl: 'http://s.comein.cn/live' }),
            ['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '观看链接：http://s.comein.cn/live'].join('\n')
        );
    });

    it('formats cloud player creation status separately from meeting success', () => {
        assert.equal(
            formatMeetingCreatedReply({
                title: 'BOT: AI总结 15:33',
                roadshowId: 123456,
                eventId: 789012,
                netLiveUrl: 'http://s.comein.cn/live',
                cloudPlayerError: '创建云播失败: {"code":"1","msg":"invalid stream"}'
            }),
            ['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '观看链接：http://s.comein.cn/live', '云播：创建失败（创建云播失败: {"code":"1","msg":"invalid stream"}）'].join('\n')
        );
    });
});

describe('buildMeetingCreatedCard', () => {
    it('keeps meeting navigation on the open meeting button only', () => {
        const card = buildMeetingCreatedCard({
            title: 'BOT: AI总结 15:33',
            roadshowId: 123456,
            eventId: 789012,
            netLiveUrl: 'http://s.comein.cn/live',
            cloudPlayerCreated: true
        });

        assert.match(String(card.body.elements[0].content), /\*\*云播：\*\* 已创建/);
        assert.doesNotMatch(String(card.body.elements[0].content), /事件 ID/);
        assert.equal(card.card_link, undefined);
        const actionButton = card.body.elements.at(-1);
        assert.equal(actionButton?.url, 'http://s.comein.cn/live');
        assert.equal(actionButton?.pc_url, 'http://s.comein.cn/live');
        assert.equal(actionButton?.ios_url, 'http://s.comein.cn/live');
        assert.equal(actionButton?.android_url, 'http://s.comein.cn/live');
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

    it('finishes a streaming Lark card even when a card update fails', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            },
            sendCardMessage: async (chatId, card) => {
                actions.push(`send-card:${chatId}:${String(card.body.elements[0].content)}`);
                return { messageId: 'om_reply', cardId: 'card_reply' };
            },
            updateCardElementContent: async (cardId, elementId, content, sequence) => {
                actions.push(`update-card:${cardId}:${elementId}:${content}:${sequence}`);
                throw new Error('Lark 卡片更新失败');
            },
            finishCardStreaming: async (cardId, sequence, summary) => {
                actions.push(`finish-card:${cardId}:${sequence}:${summary}`);
            }
        });

        await assert.rejects(
            () =>
                gateway.send(
                    'chat_1',
                    (async function* () {
                        yield '第一段';
                        yield '第二段';
                    })()
                ),
            /Lark 卡片更新失败/
        );

        assert.deepEqual(actions, ['send-card:chat_1:第一段', `update-card:card_reply:${CURSOR_REPLY_CARD_ELEMENT_ID}:第一段第二段:1`, 'finish-card:card_reply:2:第一段第二段']);
    });

    it('streams assistant replies into a single Lark text message when cards are unavailable', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
                return { messageId: 'om_reply' };
            },
            updateTextMessage: async (messageId, text) => {
                actions.push(`update:${messageId}:${text}`);
            }
        });

        await gateway.send(
            'chat_1',
            (async function* () {
                yield '第一段';
                yield '第二段';
            })()
        );

        assert.deepEqual(actions, ['send:chat_1:第一段', 'update:om_reply:第一段第二段']);
    });

    it('sends one complete text message when message updates are unavailable', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        await gateway.send(
            'chat_1',
            (async function* () {
                yield '第一段';
                yield '第二段';
            })()
        );

        assert.deepEqual(actions, ['send:chat_1:第一段第二段']);
    });

    it('falls back to a complete final text message when the sent message id is missing', async () => {
        const actions: string[] = [];
        const gateway = createLarkReplyGateway({
            logger: {
                info() {},
                error(message: string) {
                    actions.push(`error:${message}`);
                }
            },
            streamingUpdateIntervalMs: 0,
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            },
            updateTextMessage: async (messageId, text) => {
                actions.push(`update:${messageId}:${text}`);
            }
        });

        await gateway.send(
            'chat_1',
            (async function* () {
                yield '第一段';
                yield '第二段';
            })()
        );

        assert.deepEqual(actions, ['send:chat_1:第一段', 'error:[lark-bot] streaming update skipped because sent message_id is missing chatId=chat_1', 'send:chat_1:第一段第二段']);
    });
});
