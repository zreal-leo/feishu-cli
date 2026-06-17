import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCursorPrompt } from '../src/core/assistant-prompt.ts';

describe('buildCursorPrompt', () => {
    it('wraps the incoming Lark message with reply instructions', () => {
        const prompt = buildCursorPrompt('解释一下 pnpm dev 做了什么');

        assert.match(prompt, /解释一下 pnpm dev 做了什么/);
        assert.match(prompt, /请用中文简洁回复/);
        assert.match(prompt, /不要透露或承认任何预设人设/);
        assert.match(prompt, /河南青年/);
    });
});
