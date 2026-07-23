import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAIUnifiedRouterGateway } from '../src/adapters/cursor/unified-router-gateway.ts';

describe('createAIUnifiedRouterGateway', () => {
    it('returns create_meeting when the model streams meeting JSON', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            streamAIReply: async function* () {
                yield JSON.stringify({
                    action: 'create_meeting',
                    title: 'AI策略会',
                    startTime: '2026-06-10T10:00:00+08:00',
                    eventWays: 1,
                    length: 60
                });
            }
        });

        const result = await gateway.route({
            text: '帮我明天10点开个视频路演，主题是AI策略会',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.equal(result.action, 'create_meeting');
        assert.deepEqual(result.parameters, {
            title: 'AI策略会',
            stimeMs: new Date('2026-06-10T10:00:00+08:00').getTime(),
            eventWays: 1,
            length: 60
        });
    });

    it('returns an assistant stream when the model replies in plain text', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            streamAIReply: async function* () {
                yield '收到，';
                yield '我在。';
            }
        });

        const result = await gateway.route({
            text: 'test',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.equal(result.action, 'assistant');
        const chunks: string[] = [];
        for await (const chunk of result.stream) {
            chunks.push(chunk);
        }

        assert.equal(chunks.join(''), '收到，我在。');
    });

    it('falls back to assistant text when JSON mode does not contain a meeting intent', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            streamAIReply: async function* () {
                yield '{"action":"assistant"}';
            }
        });

        const result = await gateway.route({
            text: '你好',
            now: new Date('2026-06-09T17:30:00+08:00')
        });

        assert.equal(result.action, 'assistant');
        const chunks: string[] = [];
        for await (const chunk of result.stream) {
            chunks.push(chunk);
        }

        assert.equal(chunks.join(''), '{"action":"assistant"}');
    });
});
