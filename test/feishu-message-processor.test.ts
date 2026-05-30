import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFeishuMessageProcessor } from '../src/feishu-message-processor.js';
import type { FeishuIncomingMessageEvent } from '../src/message.js';

const silentLogger = {
    info() {},
    error() {}
};

function createTextEvent(messageId: string, text = '你好', senderOpenId = 'ou_sender'): FeishuIncomingMessageEvent {
    return {
        message: {
            message_id: messageId,
            message_type: 'text',
            chat_id: 'chat_1',
            content: JSON.stringify({ text })
        },
        sender: {
            sender_type: 'user',
            sender_id: {
                open_id: senderOpenId
            }
        }
    };
}

describe('createFeishuMessageProcessor', () => {
    it('creates a Feishu meeting from a create meeting command without asking Cursor', async () => {
        const actions: string[] = [];

        const processor = createFeishuMessageProcessor({
            cursorApiKey: 'cursor_key',
            cursorModel: 'composer-2.5',
            logger: silentLogger,
            askCursor: async () => {
                actions.push('cursor:start');
                return '不应调用 Cursor';
            },
            createMeeting: async ({ ownerOpenId, topic }) => {
                actions.push(`create-meeting:${ownerOpenId}:${topic}`);
                return {
                    id: 'reserve_1',
                    topic,
                    meetingNo: '112000358',
                    url: 'https://vc.feishu.cn/j/337736498',
                    password: '971024',
                    endTime: '1608883322'
                };
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_create_meeting', '创建会议 需求评审', 'ou_owner'));
        await processor.drain();

        assert.deepEqual(actions, ['create-meeting:ou_owner:需求评审', 'send:chat_1:会议已创建：需求评审\n会议号：112000358\n入会链接：https://vc.feishu.cn/j/337736498\n会议密码：971024\n预约到期：2020-12-25 08:02']);
    });

    it('replies with a failure hint when creating a Feishu meeting fails', async () => {
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
            createMeeting: async () => {
                throw new Error('no permission');
            },
            sendTextMessage: async (chatId, text) => {
                actions.push(`send:${chatId}:${text}`);
            }
        });

        processor.handleEvent(createTextEvent('om_create_meeting_failed', '创建会议'));
        await processor.drain();

        assert.equal(actions[0], 'send:chat_1:创建会议失败，请检查飞书会议权限或稍后重试。');
        assert.match(actions[1] ?? '', /^error:\[feishu-bot] message handling failed chatId=chat_1 messageId=om_create_meeting_failed/);
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
});
