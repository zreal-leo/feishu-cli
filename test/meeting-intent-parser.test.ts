import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMeetingIntentResponse } from '../src/adapters/ai/meeting-intent-parser.ts';

describe('parseMeetingIntentResponse', () => {
    it('normalizes a create meeting intent into backend meeting parameters', () => {
        const result = parseMeetingIntentResponse(
            JSON.stringify({
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
            })
        );

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

    it('returns assistant intent for ordinary or ambiguous messages', () => {
        const result = parseMeetingIntentResponse(JSON.stringify({ action: 'assistant' }));

        assert.deepEqual(result, { action: 'assistant' });
    });

    it('rejects unsupported enum values returned for a create meeting intent', () => {
        assert.throws(
            () =>
                parseMeetingIntentResponse(
                    JSON.stringify({
                        action: 'create_meeting',
                        title: '测试会议',
                        eventWays: '全息路演'
                    })
                ),
            /不支持的路演方式/
        );
    });
});
