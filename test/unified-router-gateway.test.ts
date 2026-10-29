import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAIUnifiedRouterGateway } from '../src/adapters/ai/unified-router-gateway.ts';

const unusedWritingSkill = {
    async load(): Promise<never> {
        throw new Error('This request must not load a writing skill.');
    }
};

describe('createAIUnifiedRouterGateway', () => {
    it('returns create_meeting when the model streams meeting JSON', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            crazyThursdaySkill: unusedWritingSkill,
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
            crazyThursdaySkill: unusedWritingSkill,
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
            crazyThursdaySkill: unusedWritingSkill,
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

    it('includes skill instructions and examples in the model request and streams only the reply', async () => {
        let receivedPrompt = '';
        let skillLoads = 0;
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            crazyThursdaySkill: {
                async load() {
                    skillLoads += 1;
                    return { instructions: '测试专用写作规则：铺垫必须接回结尾。', examples: '测试专用原创示例：会议纪要里的午饭。' };
                }
            },
            streamAIReply: async function* (options) {
                receivedPrompt = options.prompt;
                yield '今天的会议开了很久，';
                yield '最后唯一通过的议案是请我吃炸鸡。';
            }
        });
        const text = '帮我写一条程序员风格的疯狂星期四文案';

        const result = await gateway.route({ text });

        assert.equal(skillLoads, 1);
        assert.ok(receivedPrompt.includes('测试专用写作规则：铺垫必须接回结尾。'));
        assert.ok(receivedPrompt.includes('测试专用原创示例：会议纪要里的午饭。'));
        assert.ok(receivedPrompt.endsWith(text));
        assert.equal(result.action, 'assistant');
        const chunks: string[] = [];
        for await (const chunk of result.stream) {
            chunks.push(chunk);
        }
        assert.equal(chunks.join(''), '今天的会议开了很久，最后唯一通过的议案是请我吃炸鸡。');
    });

    it('does not load the writing skill for menu and price questions', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            crazyThursdaySkill: unusedWritingSkill,
            streamAIReply: async function* () {
                yield '请以门店展示的菜单为准。';
            }
        });

        for (const text of ['疯狂星期四有什么菜单？', '本周疯狂星期四多少钱？', '疯狂星期四是什么意思？']) {
            assert.equal((await gateway.route({ text })).action, 'assistant');
        }
    });

    it('does not call the model when a requested skill cannot be loaded', async () => {
        let modelCalls = 0;
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            crazyThursdaySkill: {
                async load(): Promise<never> {
                    throw new Error('Writing skill is unavailable.');
                }
            },
            streamAIReply: async function* () {
                modelCalls += 1;
                yield '未参考 skill 的结果';
            }
        });

        await assert.rejects(gateway.route({ text: '疯狂星期四文案' }), /Writing skill is unavailable/);
        assert.equal(modelCalls, 0);
    });

    it('still handles a meeting response when its topic mentions Crazy Thursday copywriting', async () => {
        const gateway = createAIUnifiedRouterGateway({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            crazyThursdaySkill: {
                async load() {
                    return { instructions: '写作规则', examples: '原创示例' };
                }
            },
            streamAIReply: async function* () {
                yield JSON.stringify({ action: 'create_meeting', title: '疯狂星期四文案分享', startTime: '2026-10-29T10:00:00+08:00' });
            }
        });

        const result = await gateway.route({ text: '创建会议，主题是疯狂星期四文案分享' });

        assert.equal(result.action, 'create_meeting');
        assert.equal(result.parameters.title, '疯狂星期四文案分享');
    });
});
