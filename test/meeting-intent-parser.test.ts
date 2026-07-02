import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAIMeetingIntentParser } from '../src/adapters/cursor/meeting-intent-parser.ts';

describe('createAIMeetingIntentParser', () => {
    it('normalizes a create meeting intent into backend meeting parameters', async () => {
        const parser = createAIMeetingIntentParser({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            askAI: async options => {
                assert.equal(options.apiKey, 'test_key');
                assert.equal(options.model, 'claude-haiku-4-5');
                assert.match(options.prompt, /帮我明天10点开个视频路演/);
                return JSON.stringify({
                    action: 'create_meeting',
                    title: 'AI策略会',
                    startTime: '2026-06-10T10:00:00+08:00',
                    eventWays: '视频路演',
                    length: '60',
                    eventMode: '上麦直播',
                    permission: '专场活动',
                    cloudPlayer: {
                        mediaStreamType: '视频',
                        streamUrl: 'https://media.comein.cn/video/demo.mp4'
                    }
                });
            }
        });

        const result = await parser.parse({
            text: '帮我明天10点开个视频路演，主题是AI策略会，权限专场活动，时长60分钟，用这个视频做云播 https://media.comein.cn/video/demo.mp4',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.deepEqual(result, {
            action: 'create_meeting',
            parameters: {
                title: 'AI策略会',
                stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
                eventWays: 1,
                length: 60,
                eventMode: 567,
                serviceType: 7,
                openStatus: 2,
                tagName: '专场活动',
                cloudPlayer: {
                    mediaStreamType: 2,
                    streamUrl: 'https://media.comein.cn/video/demo.mp4',
                    playType: 1,
                    repeatMode: -1,
                    repeatTime: 1,
                    type: 1
                }
            }
        });
    });

    it('returns assistant intent for ordinary or ambiguous messages', async () => {
        const parser = createAIMeetingIntentParser({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            askAI: async () =>
                JSON.stringify({
                    action: 'assistant'
                })
        });

        const result = await parser.parse({
            text: '你好，帮我总结一下今天的工作',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.deepEqual(result, {
            action: 'assistant'
        });
    });

    it('rejects unsupported enum values returned for a create meeting intent', async () => {
        const parser = createAIMeetingIntentParser({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            askAI: async () =>
                JSON.stringify({
                    action: 'create_meeting',
                    title: '测试会议',
                    eventWays: '全息路演'
                })
        });

        await assert.rejects(
            () =>
                parser.parse({
                    text: '帮我创建一个全息路演',
                    now: new Date('2026-06-09T17:30:00+08:00')
                }),
            /不支持的路演方式/
        );
    });
});
