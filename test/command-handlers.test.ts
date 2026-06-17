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
    it('creates a meeting when Cursor classifies the message as a create meeting intent', async () => {
        const handler = createMeetingRouterCommandHandler({
            intentParser: {
                async parse(input) {
                    assert.equal(input.text, '帮我明天10点开个视频路演，主题是AI策略会');
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
            },
            assistant: {
                streamReply() {
                    throw new Error('assistant should not be called');
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

    it('streams the assistant reply when Cursor does not classify the message as a meeting', async () => {
        const chunks: string[] = [];
        const handler = createMeetingRouterCommandHandler({
            intentParser: {
                async parse() {
                    return { action: 'assistant' };
                }
            },
            meetings: {
                async createMeeting() {
                    throw new Error('meeting should not be created');
                }
            },
            assistant: {
                streamReply(prompt) {
                    assert.match(prompt, /用户在 Lark 发送的消息：\n你好/);
                    return (async function* () {
                        yield '普通';
                        yield '回复';
                    })();
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

    it('falls back to the assistant without creating a meeting when intent parsing fails', async () => {
        const chunks: string[] = [];
        const handler = createMeetingRouterCommandHandler({
            intentParser: {
                async parse() {
                    throw new Error('Cursor 参数解析失败：返回内容不是合法 JSON。');
                }
            },
            meetings: {
                async createMeeting() {
                    throw new Error('meeting should not be created');
                }
            },
            assistant: {
                streamReply() {
                    return (async function* () {
                        yield '我不确定是否要创建会议，请再补充一下。';
                    })();
                }
            }
        });

        const message = { ...input, text: '可能要不要开个会' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.ok(reply && Symbol.asyncIterator in reply);
        for await (const chunk of reply as AsyncIterable<string>) {
            chunks.push(chunk);
        }
        assert.deepEqual(chunks, ['我不确定是否要创建会议，请再补充一下。']);
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
                        inputTokens: 1000,
                        outputTokens: 200,
                        cacheReadTokens: 3000
                    };
                }
            },
            {
                now: () => new Date(2026, 5, 4, 12)
            }
        );

        const message = { ...input, text: '查询token' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: ['Cursor Token 用量', '时间范围：2026-05-26 至 2026-06-04', '记录数：2', '输入 Tokens：0', '输出 Tokens：0', '缓存读取 Tokens：0', '合计 Tokens：0'].join('\n')
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
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadTokens: 0
                };
            }
        });

        const message = { ...input, text: '查询 token 2026-05-06 2026-06-04' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: ['Cursor Token 用量', '时间范围：2026-05-06 至 2026-06-04', '记录数：0', '输入 Tokens：0', '输出 Tokens：0', '缓存读取 Tokens：0', '合计 Tokens：0'].join('\n')
        });
    });

    it('returns a usage hint for invalid date ranges without calling the gateway', async () => {
        const handler = createCursorUsageCommandHandler({
            async getUsageSummary() {
                throw new Error('should not be called');
            }
        });

        const message = { ...input, text: '查询token 2026-06-04 2026-05-06' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'cursor-usage');
        assert.deepEqual(reply, {
            type: 'text',
            text: '查询 token 失败：开始日期不能晚于结束日期。\n用法：查询token 或 查询token YYYY-MM-DD YYYY-MM-DD'
        });
    });

    it('returns a readable failure reply when the usage gateway fails', async () => {
        const handler = createCursorUsageCommandHandler({
            async getUsageSummary() {
                throw new Error('Cursor 登录已失效');
            }
        });

        const message = { ...input, text: '查询token 2026-05-06 2026-06-04' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.deepEqual(reply, {
            type: 'text',
            text: '查询 Cursor Token 用量失败：Cursor 登录已失效'
        });
    });
});
