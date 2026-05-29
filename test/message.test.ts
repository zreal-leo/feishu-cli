import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCursorPrompt, extractIncomingText, toFeishuTextContent } from '../src/message.js';

describe('extractIncomingText', () => {
    it('extracts text from a Feishu text message event', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '帮我看一下这个项目' })
            }
        });

        assert.equal(text, '帮我看一下这个项目');
    });

    it('ignores non-text message events', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'image',
                content: '{}'
            }
        });

        assert.equal(text, null);
    });
});

describe('buildCursorPrompt', () => {
    it('wraps the incoming Feishu message with reply instructions', () => {
        const prompt = buildCursorPrompt('解释一下 pnpm dev 做了什么');

        assert.match(prompt, /解释一下 pnpm dev 做了什么/);
        assert.match(prompt, /请用中文简洁回复/);
    });
});

describe('toFeishuTextContent', () => {
    it('serializes Cursor text as Feishu text content', () => {
        assert.equal(toFeishuTextContent('收到，我来处理。'), JSON.stringify({ text: '收到，我来处理。' }));
    });
});
