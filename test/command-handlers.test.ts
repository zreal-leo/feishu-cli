import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMeetingRouterCommandHandler } from '../src/core/commands/meeting-router-command.ts';
import type { MessageInput } from '../src/core/types.ts';

const input: MessageInput = {
    chatId: 'chat_1',
    messageId: 'om_1',
    text: '创建会议 AI 总结 云播 https://media.comein.cn/video/demo.mp4'
};

describe('createMeetingRouterCommandHandler', () => {
    it('creates a meeting when the unified router returns a create meeting route', async () => {
        const handler = createMeetingRouterCommandHandler({
            router: {
                async route(routeInput) {
                    assert.equal(routeInput.text, '帮我明天10点开个视频路演，主题是AI策略会');
                    return {
                        action: 'create_meeting',
                        parameters: {
                            title: 'AI策略会',
                            stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
                            eventWays: 1,
                            length: 60
                        }
                    };
                }
            },
            meetings: {
                async createMeeting(request) {
                    assert.deepEqual(request, {
                        title: 'AI策略会',
                        stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
                        eventWays: 1,
                        length: 60
                    });
                    return {
                        title: 'AI策略会 10:00',
                        roadshowId: 123,
                        eventId: 456,
                        netLiveUrl: 'http://s.comein.cn/live'
                    };
                }
            }
        });

        const message = { ...input, text: '帮我明天10点开个视频路演，主题是AI策略会' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'meeting-router');
        assert.deepEqual(reply, {
            type: 'meeting_created',
            data: {
                title: 'AI策略会 10:00',
                roadshowId: 123,
                eventId: 456,
                netLiveUrl: 'http://s.comein.cn/live'
            }
        });
    });

    it('returns the assistant stream when the unified router chooses assistant', async () => {
        const chunks: string[] = [];
        const handler = createMeetingRouterCommandHandler({
            router: {
                async route(routeInput) {
                    assert.equal(routeInput.text, '你好');
                    return {
                        action: 'assistant',
                        stream: (async function* () {
                            yield '普通';
                            yield '回复';
                        })()
                    };
                }
            },
            meetings: {
                async createMeeting() {
                    throw new Error('meeting should not be created');
                }
            }
        });

        const message = { ...input, text: '你好' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'meeting-router');
        assert.ok(reply && Symbol.asyncIterator in reply);
        for await (const chunk of reply as AsyncIterable<string>) {
            chunks.push(chunk);
        }
        assert.deepEqual(chunks, ['普通', '回复']);
    });
});
