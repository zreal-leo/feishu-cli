import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFeishuMessageProcessor } from '../src/feishu-message-processor.ts';
import { CURSOR_REPLY_CARD_ELEMENT_ID } from '../src/adapters/feishu/renderers.ts';
import type { FeishuIncomingMessageEvent } from '../src/message.ts';
import type { FeishuMessageMention } from '../src/message.ts';

const silentLogger = {
    info() {},
    error() {}
};

function createTextEvent(messageId: string, text = '你好', mentions?: FeishuMessageMention[]): FeishuIncomingMessageEvent {
    return {
        message: {
            message_id: messageId,
            message_type: 'text',
            chat_id: 'chat_1',
            content: JSON.stringify({ text }),
            mentions
        }
    };
}

describe('createFeishuMessageProcessor', () => {
    it('streams the Cursor reply into a Feishu card', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            addMessageReaction: async (messageId, emojiType) => {
                actions.push(`reaction:${messageId}:${emojiType}`);
                return { reactionId: 'reaction_1' };
            },
            removeMessageReaction: async (messageId, reactionId) => {
                actions.push(`remove-reaction:${messageId}:${reactionId}`);
            },
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '第一段';
                yield '第二段';
            },
            sendCardMessage: async (chatId, card) => {
                const markdownElement = card.body.elements[0];
                actions.push(`send-card:${chatId}:${String(markdownElement.content)}:${String(card.config.streaming_mode)}`);
                return { messageId: 'om_reply', cardId: 'card_reply' };
            },
            updateCardElementContent: async (cardId, elementId, content, sequence) => {
                actions.push(`update-card:${cardId}:${elementId}:${content}:${sequence}`);
            },
            finishCardStreaming: async (cardId, sequence, summary) => {
                actions.push(`finish-card:${cardId}:${sequence}:${summary}`);
            },
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            }
        });

        processor.handleEvent(createTextEvent('om_card_stream'));
        await processor.drain();

        assert.deepEqual(actions, [
            'reaction:om_card_stream:Typing',
            'cursor:start',
            'send-card:chat_1:第一段:true',
            `update-card:card_reply:${CURSOR_REPLY_CARD_ELEMENT_ID}:第一段第二段:1`,
            'finish-card:card_reply:2:第一段第二段',
            'remove-reaction:om_card_stream:reaction_1'
        ]);
    });

    it('finishes a streaming Feishu card when an update fails', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            streamCursorReply: async function* () {
                yield '第一段';
                yield '第二段';
            },
            sendCardMessage: async (chatId, card) => {
                const markdownElement = card.body.elements[0];
                actions.push(`send-card:${chatId}:${String(markdownElement.content)}`);
                return { messageId: 'om_reply', cardId: 'card_reply' };
            },
            updateCardElementContent: async (cardId, elementId, content, sequence) => {
                actions.push(`update-card:${cardId}:${elementId}:${content}:${sequence}`);
                throw new Error('飞书卡片更新失败');
            },
            finishCardStreaming: async (cardId, sequence, summary) => {
                actions.push(`finish-card:${cardId}:${sequence}:${summary}`);
            },
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            }
        });

        processor.handleEvent(createTextEvent('om_card_update_failed'));
        await processor.drain();

        assert.deepEqual(actions, ['send-card:chat_1:第一段', `update-card:card_reply:${CURSOR_REPLY_CARD_ELEMENT_ID}:第一段第二段:1`, 'finish-card:card_reply:2:第一段第二段']);
    });

    it('adds a reaction before streaming the Cursor reply into one Feishu message', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamingUpdateIntervalMs: 0,
            addMessageReaction: async (messageId, emojiType) => {
                actions.push(`reaction:${messageId}:${emojiType}`);
                return { reactionId: 'reaction_1' };
            },
            removeMessageReaction: async (messageId, reactionId) => {
                actions.push(`remove-reaction:${messageId}:${reactionId}`);
            },
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '第一段';
                yield '第二段';
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
                return { messageId: 'om_reply' };
            },
            updateTextMessage: async (messageId, text) => {
                actions.push(`update:${messageId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_stream'));
        await processor.drain();

        assert.deepEqual(actions, ['reaction:om_stream:Typing', 'cursor:start', 'send:chat_1:第一段', 'update:om_reply:第一段第二段', 'remove-reaction:om_stream:reaction_1']);
    });

    it('returns after queueing without waiting for Cursor', async () => {
        const sentMessages: Array<{ chatId: string; text: string }> = [];
        let resolveCursor!: (reply: string) => void;

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            askCursor: async () =>
                new Promise<string>(resolve => {
                    resolveCursor = resolve;
                }),
            sendTextMessage: async (chatId, text) => {
                sentMessages.push({ chatId, text });
            }
        });

        const result = processor.handleEvent(createTextEvent('om_1'));

        assert.equal(result, undefined);
        assert.deepEqual(sentMessages, []);

        await Promise.resolve();
        resolveCursor('收到');
        await processor.drain();

        assert.deepEqual(sentMessages, [{ chatId: 'chat_1', text: '收到' }]);
    });

    it('sends one complete message when message updates are unavailable', async () => {
        const sentMessages: Array<{ chatId: string; text: string }> = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamCursorReply: async function* () {
                yield '第一段';
                yield '第二段';
            },
            sendTextMessage: async (chatId, text) => {
                sentMessages.push({ chatId, text });
            }
        });

        processor.handleEvent(createTextEvent('om_no_update'));
        await processor.drain();

        assert.deepEqual(sentMessages, [{ chatId: 'chat_1', text: '第一段第二段' }]);
    });

    it('falls back to a complete final message when the sent message id is missing', async () => {
        const actions: string[] = [];
        const logger = {
            info() {},
            error(message: string) {
                actions.push(`error:${message}`);
            }
        };

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger,
            streamCursorReply: async function* () {
                yield '第一段';
                yield '第二段';
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            },
            updateTextMessage: async (messageId, text) => {
                actions.push(`update:${messageId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_missing_reply_id'));
        await processor.drain();

        assert.deepEqual(actions, ['send:chat_1:第一段', 'error:[feishu-bot] streaming update skipped because sent message_id is missing chatId=chat_1', 'send:chat_1:第一段第二段']);
    });

    it('ignores duplicate events for the same message id', async () => {
        const sentMessages: Array<{ chatId: string; text: string }> = [];
        let cursorCalls = 0;

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            askCursor: async () => {
                cursorCalls += 1;
                return '同一条消息只回复一次';
            },
            sendTextMessage: async (chatId, text) => {
                sentMessages.push({ chatId, text });
            }
        });

        const event = createTextEvent('om_duplicate');
        processor.handleEvent(event);
        processor.handleEvent(event);
        await processor.drain();

        assert.equal(cursorCalls, 1);
        assert.deepEqual(sentMessages, [{ chatId: 'chat_1', text: '同一条消息只回复一次' }]);
    });

    it('creates a manager meeting for a create meeting command without calling Cursor', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            addMessageReaction: async (messageId, emojiType) => {
                actions.push(`reaction:${messageId}:${emojiType}`);
                return { reactionId: 'reaction_1' };
            },
            removeMessageReaction: async (messageId, reactionId) => {
                actions.push(`remove-reaction:${messageId}:${reactionId}`);
            },
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '不应该调用 Cursor';
            },
            createMeeting: async request => {
                actions.push(`create-meeting:${request.title}`);
                return {
                    title: 'BOT: 跨项目接入测试会议 15:33',
                    roadshowId: 123456,
                    eventId: 789012,
                    netLiveUrl: 'http://s.comein.cn/live'
                };
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_create_meeting', '创建会议 跨项目接入测试会议'));
        await processor.drain();

        assert.deepEqual(actions, [
            'reaction:om_create_meeting:Typing',
            'create-meeting:跨项目接入测试会议',
            `send:chat_1:${['会议创建成功', '会议标题：BOT: 跨项目接入测试会议 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live'].join('\n')}`,
            'remove-reaction:om_create_meeting:reaction_1'
        ]);
    });

    it('passes cloud player options from a create meeting command', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '不应该调用 Cursor';
            },
            createMeeting: async request => {
                actions.push(`create-meeting:${request.title}:${request.cloudPlayer?.streamUrl}:${request.cloudPlayer?.mediaStreamType}`);
                return {
                    title: 'BOT: 云播会议 15:33',
                    roadshowId: 123456,
                    eventId: 789012,
                    netLiveUrl: 'http://s.comein.cn/live'
                };
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_create_cloud_player', '创建会议 云播会议 云播 https://media.comein.cn/video/344317-1740031837920.mp4'));
        await processor.drain();

        assert.deepEqual(actions, [
            'create-meeting:云播会议:https://media.comein.cn/video/344317-1740031837920.mp4:2',
            `send:chat_1:${['会议创建成功', '会议标题：BOT: 云播会议 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live'].join('\n')}`
        ]);
    });

    it('uses the default title and video URL for a default cloud player command', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '不应该调用 Cursor';
            },
            createMeeting: async request => {
                actions.push(`create-meeting:${request.title}:${request.cloudPlayer?.streamUrl}:${request.cloudPlayer?.mediaStreamType}`);
                return {
                    title: 'BOT: 会议 15:33',
                    roadshowId: 123456,
                    eventId: 789012,
                    netLiveUrl: 'http://s.comein.cn/live',
                    cloudPlayerCreated: true
                };
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_create_default_cloud_player', '创建会议 云播'));
        await processor.drain();

        assert.deepEqual(actions, [
            'create-meeting:会议:https://media.comein.cn/video/344317-1740031837920.mp4:2',
            `send:chat_1:${['会议创建成功', '会议标题：BOT: 会议 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live', '云播：已创建'].join('\n')}`
        ]);
    });

    it('creates a clickable Feishu card for a manager meeting command', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '不应该调用 Cursor';
            },
            createMeeting: async request => {
                actions.push(`create-meeting:${request.title}`);
                return {
                    title: 'BOT: 跨项目接入测试会议 15:33',
                    roadshowId: 123456,
                    eventId: 789012,
                    netLiveUrl: 'http://s.comein.cn/live'
                };
            },
            sendCardMessage: async (chatId, card) => {
                const actionButton = card.body.elements.at(-1);
                assert.ok(card.card_link);
                actions.push(
                    `send-card:${chatId}:${card.card_link.url}:${card.card_link.pc_url}:${card.card_link.ios_url}:${card.card_link.android_url}:${actionButton?.url}:${actionButton?.pc_url}:${actionButton?.ios_url}:${actionButton?.android_url}`
                );
                return { messageId: 'om_meeting_card', cardId: 'card_meeting' };
            },
            sendTextMessage: async () => {
                actions.push('send-text:fallback');
            }
        });

        processor.handleEvent(createTextEvent('om_create_meeting_card', '创建会议 跨项目接入测试会议'));
        await processor.drain();

        assert.deepEqual(actions, [
            'create-meeting:跨项目接入测试会议',
            'send-card:chat_1:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live:http://s.comein.cn/live'
        ]);
    });

    it('creates a manager meeting when a group message mentions the bot before the command', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            streamCursorReply: async function* () {
                actions.push('cursor:start');
                yield '不应该调用 Cursor';
            },
            createMeeting: async request => {
                actions.push(`create-meeting:${request.title}`);
                return {
                    title: 'BOT: AI总结 15:33',
                    roadshowId: 123456,
                    eventId: 789012,
                    netLiveUrl: 'http://s.comein.cn/live'
                };
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_mention_create_meeting', '@_user_1 创建会议 AI总结', [{ key: '@_user_1', name: '会议机器人' }]));
        await processor.drain();

        assert.deepEqual(actions, ['create-meeting:AI总结', `send:chat_1:${['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live'].join('\n')}`]);
    });

    it('sends an error message when manager meeting creation fails', async () => {
        const sentMessages: Array<{ chatId: string; text: string }> = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            createMeeting: async () => {
                throw new Error('后台 token 失效');
            },
            sendTextMessage: async (chatId, text) => {
                sentMessages.push({ chatId, text });
            },
            askCursor: async () => {
                throw new Error('Cursor should not be called');
            }
        });

        processor.handleEvent(createTextEvent('om_create_meeting_failed', '创建会议'));
        await processor.drain();

        assert.deepEqual(sentMessages, [{ chatId: 'chat_1', text: '创建会议失败：后台 token 失效' }]);
    });
});
