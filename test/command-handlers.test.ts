import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAssistantCommandHandler } from '../src/core/commands/assistant-command.ts';
import { createMeetingCommandHandler } from '../src/core/commands/create-meeting-command.ts';
import type { MessageInput } from '../src/core/types.ts';

const input: MessageInput = {
    chatId: 'chat_1',
    messageId: 'om_1',
    text: '创建会议 AI 总结 云播 https://media.comein.cn/video/demo.mp4'
};

describe('createMeetingCommandHandler', () => {
    it('matches a create meeting command and returns a semantic meeting reply', async () => {
        const handler = createMeetingCommandHandler({
            async createMeeting(request) {
                assert.equal(request.title, 'AI 总结');
                assert.equal(request.cloudPlayer?.streamUrl, 'https://media.comein.cn/video/demo.mp4');
                return {
                    title: 'BOT: AI 总结 15:33',
                    roadshowId: 123,
                    eventId: 456,
                    netLiveUrl: 'http://s.comein.cn/live',
                    cloudPlayerCreated: true
                };
            }
        });

        const match = handler.match(input);
        const reply = match ? await handler.execute({ message: input }, match) : null;

        assert.equal(match?.commandName, 'create-meeting');
        assert.deepEqual(reply, {
            type: 'meeting_created',
            data: {
                title: 'BOT: AI 总结 15:33',
                roadshowId: 123,
                eventId: 456,
                netLiveUrl: 'http://s.comein.cn/live',
                cloudPlayerCreated: true
            }
        });
    });

    it('returns a meeting failure reply when the meeting gateway fails', async () => {
        const expectedError = new Error('后台 token 失效');
        const handler = createMeetingCommandHandler({
            async createMeeting() {
                throw expectedError;
            }
        });

        const match = handler.match({ ...input, text: '创建会议' });
        const reply = match ? await handler.execute({ message: input }, match) : null;

        assert.deepEqual(reply, {
            type: 'meeting_failed',
            error: expectedError
        });
    });

    it('does not match ordinary assistant messages', () => {
        const handler = createMeetingCommandHandler({
            async createMeeting() {
                throw new Error('should not be called');
            }
        });

        assert.equal(handler.match({ ...input, text: '你好' }), null);
    });
});

describe('createAssistantCommandHandler', () => {
    it('uses the assistant gateway as the fallback reply stream', async () => {
        const chunks: string[] = [];
        const handler = createAssistantCommandHandler({
            streamReply(prompt) {
                assert.match(prompt, /请用中文简洁回复/);
                assert.match(prompt, /用户在飞书发送的消息：\n你好/);
                return (async function* () {
                    yield '第一段';
                    yield '第二段';
                })();
            }
        });

        const message = { ...input, text: '你好' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'assistant-fallback');
        assert.ok(reply && Symbol.asyncIterator in reply);
        for await (const chunk of reply as AsyncIterable<string>) {
            chunks.push(chunk);
        }
        assert.deepEqual(chunks, ['第一段', '第二段']);
    });
});
