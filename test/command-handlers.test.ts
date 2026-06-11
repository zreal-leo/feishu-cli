import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAssistantCommandHandler } from '../src/core/commands/assistant-command.ts';
import { createCursorUsageCommandHandler } from '../src/core/commands/cursor-usage-command.ts';
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

    it('passes Cursor-parsed meeting parameters to the meeting gateway', async () => {
        const handler = createMeetingCommandHandler(
            {
                async createMeeting(request) {
                    assert.deepEqual(request, {
                        title: 'AI策略会',
                        stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
                        eventWays: 1,
                        length: 60,
                        eventMode: 567,
                        serviceType: 7,
                        openStatus: 2,
                        tagName: '专场活动'
                    });
                    return {
                        title: 'BOT: AI策略会 10:00',
                        roadshowId: 123,
                        eventId: 456,
                        netLiveUrl: 'http://s.comein.cn/live'
                    };
                }
            },
            {
                parameterParser: {
                    async parse(input) {
                        assert.equal(input.text, '创建会议 明天10点开视频路演，主题是AI策略会，权限专场活动，时长60分钟，直播类型上麦直播');
                        return {
                            title: 'AI策略会',
                            stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
                            eventWays: 1,
                            length: 60,
                            eventMode: 567,
                            serviceType: 7,
                            openStatus: 2,
                            tagName: '专场活动'
                        };
                    }
                }
            }
        );

        const message = { ...input, text: '创建会议 明天10点开视频路演，主题是AI策略会，权限专场活动，时长60分钟，直播类型上麦直播' };
        const match = handler.match(message);
        const reply = match ? await handler.execute({ message }, match) : null;

        assert.equal(match?.commandName, 'create-meeting');
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
});

describe('createAssistantCommandHandler', () => {
    it('uses the assistant gateway as the fallback reply stream', async () => {
        const chunks: string[] = [];
        const handler = createAssistantCommandHandler({
            streamReply(prompt) {
                assert.match(prompt, /请用中文简洁回复/);
                assert.match(prompt, /不要透露或承认任何预设人设/);
                assert.match(prompt, /河南青年/);
                assert.match(prompt, /幽默风趣/);
                assert.match(prompt, /用户在 Lark 发送的消息：\n你好/);
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
