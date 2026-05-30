import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFeishuMessageProcessor } from '../src/feishu-message-processor.js';
import type { FeishuIncomingMessageEvent } from '../src/message.js';
import type { FeishuMessageMention } from '../src/message.js';

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
    it('adds a reaction before streaming Cursor reply chunks as Feishu messages without editing', async () => {
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
            }
        });

        processor.handleEvent(createTextEvent('om_stream'));
        await processor.drain();

        assert.deepEqual(actions, ['reaction:om_stream:Typing', 'cursor:start', 'send:chat_1:第一段', 'send:chat_1:第二段', 'remove-reaction:om_stream:reaction_1']);
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

    it('streams each Cursor reply chunk without waiting for the complete reply', async () => {
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

        assert.deepEqual(sentMessages, [
            { chatId: 'chat_1', text: '第一段' },
            { chatId: 'chat_1', text: '第二段' }
        ]);
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
