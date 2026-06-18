import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildUnifiedRouterPrompt } from '../src/core/unified-router-prompt.ts';

describe('buildUnifiedRouterPrompt', () => {
    it('combines routing rules, assistant behavior constraints, and the user message', () => {
        const prompt = buildUnifiedRouterPrompt({
            text: 'test',
            now: new Date('2026-06-18T08:00:00+08:00')
        });

        assert.match(prompt, /test/);
        assert.match(prompt, /只输出一行合法 JSON/);
        assert.match(prompt, /不要使用工具/);
        assert.match(prompt, /2026-06-18T00:00:00.000Z/);
    });
});
