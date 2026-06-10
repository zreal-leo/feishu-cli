import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCursorMeetingParameterParser } from '../src/adapters/cursor/create-meeting-parameter-parser.ts';

describe('createCursorMeetingParameterParser', () => {
    it('normalizes Cursor JSON output into backend meeting parameters', async () => {
        const parser = createCursorMeetingParameterParser({
            apiKey: 'cursor_key',
            model: 'composer-2.5',
            askCursor: async options => {
                assert.equal(options.apiKey, 'cursor_key');
                assert.equal(options.model, 'composer-2.5');
                assert.match(options.prompt, /创建会议 明天10点/);
                return JSON.stringify({
                    title: 'AI策略会',
                    startTime: '2026-06-10T10:00:00+08:00',
                    eventWays: '视频路演',
                    length: '60',
                    eventMode: '上麦直播',
                    permission: '专场活动'
                });
            }
        });

        const result = await parser.parse({
            text: '创建会议 明天10点开视频路演，主题是AI策略会，权限专场活动，时长60分钟，直播类型上麦直播',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.deepEqual(result, {
            title: 'AI策略会',
            stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
            eventWays: 1,
            length: 60,
            eventMode: 567,
            serviceType: 7,
            openStatus: 2,
            tagName: '专场活动'
        });
    });

    it('rejects unsupported enum values returned by Cursor', async () => {
        const parser = createCursorMeetingParameterParser({
            apiKey: 'cursor_key',
            model: 'composer-2.5',
            askCursor: async () =>
                JSON.stringify({
                    title: '测试会议',
                    eventWays: '全息路演'
                })
        });

        await assert.rejects(
            () =>
                parser.parse({
                    text: '创建会议 测试会议 全息路演',
                    now: new Date('2026-06-09T17:30:00+08:00')
                }),
            /不支持的路演方式/
        );
    });
});
