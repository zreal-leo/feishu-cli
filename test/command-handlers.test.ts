import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCursorUsageCommandHandler } from '../src/core/commands/cursor-usage-command.ts';
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
                        title: 'BOT: AI策略会 10:00',
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
                title: 'BOT: AI策略会 10:00',
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

describe('createCursorUsageCommandHandler', () => {
    it('queries token usage from the 26th of last month by default', async () => {
        const handler = createCursorUsageCommandHandler(
            {
                async getUsageSummary(query) {
                    assert.deepEqual(query, {
                        startDate: '2026-05-26',
                        endDate: '2026-06-04'
                    });
                    return {
                        startDate: query.startDate,
                        endDate: query.endDate,
                        recordsCount: 2,
                        totalTokens: 4700,
                        chargedCents: 1234
                    } as any;
                }
            },
            {
                now: () => new Date(2026, 5, 4, 12)
            }
        );

        const message = { ...input, text: 'cursor' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: ['Cursor Token 用量', '时间范围：2026-05-26 至 2026-06-04', '记录数：2', 'token : 4700'].join('\n')
        });
    });

    it('queries an explicit token usage range', async () => {
        const handler = createCursorUsageCommandHandler({
            async getUsageSummary(query) {
                assert.deepEqual(query, {
                    startDate: '2026-05-06',
                    endDate: '2026-06-04'
                });
                return {
                    startDate: query.startDate,
                    endDate: query.endDate,
                    recordsCount: 0,
                    totalTokens: 0,
                    chargedCents: 0
                } as any;
            }
        });

        const message = { ...input, text: 'cursor 2026-05-06 2026-06-04' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: ['Cursor Token 用量', '时间范围：2026-05-06 至 2026-06-04', '记录数：0', 'token : 0'].join('\n')
        });
    });

    it('returns a usage hint for invalid date ranges without calling the gateway', async () => {
        const handler = createCursorUsageCommandHandler({
            async getUsageSummary() {
                throw new Error('should not be called');
            }
        });

        const message = { ...input, text: 'cursor 2026-06-04 2026-05-06' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: '查询 cursor token 失败：开始日期不能晚于结束日期。\n用法：cursor 或 cursor YYYY-MM-DD YYYY-MM-DD'
        });
    });

    it('returns a readable failure reply when the usage gateway fails', async () => {
        const handler = createCursorUsageCommandHandler({
            async getUsageSummary() {
                throw new Error('Cursor 登录已失效');
            }
        });

        const message = { ...input, text: 'cursor 2026-05-06 2026-06-04' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.deepEqual(reply, {
            type: 'text',
            text: '查询 Cursor Token 用量失败：Cursor 登录已失效'
        });
    });
});
