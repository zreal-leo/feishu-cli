import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAIWeeklyReportGenerator } from '../src/adapters/ai-weekly-report-generator.ts';

describe('createAIWeeklyReportGenerator', () => {
    it('forwards prompt to askAI and returns trimmed report text', async () => {
        const prompt = 'weekly report prompt';
        const generator = createAIWeeklyReportGenerator({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            effort: 'high',
            baseURL: 'https://example.com',
            askAI: async options => {
                assert.equal(options.apiKey, 'test_key');
                assert.equal(options.model, 'claude-haiku-4-5');
                assert.equal(options.effort, 'high');
                assert.equal(options.baseURL, 'https://example.com');
                assert.equal(options.prompt, prompt);
                return '  ## 周报\n内容  ';
            }
        });

        const result = await generator.generate(prompt);
        assert.equal(result, '## 周报\n内容');
    });

    it('returns fallback when askAI yields empty text', async () => {
        const generator = createAIWeeklyReportGenerator({
            apiKey: 'test_key',
            model: 'claude-haiku-4-5',
            askAI: async () => ''
        });

        const result = await generator.generate('prompt');
        assert.equal(result, '本周周报生成结果为空。');
    });
});
