import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { askAI, streamAIReply } from '../src/adapters/cursor/ai-agent.ts';

describe('ai-agent exports', () => {
    it('exports askAI and streamAIReply functions', () => {
        assert.equal(typeof askAI, 'function');
        assert.equal(typeof streamAIReply, 'function');
    });
});
