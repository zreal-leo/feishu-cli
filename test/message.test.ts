import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_REACTION_EMOJI_TYPE, buildCursorPrompt, extractIncomingText, toFeishuReactionPayload, toFeishuTextContent } from '../src/message.js';

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

describe('toFeishuReactionPayload', () => {
    it('defaults to Feishu Typing emoji', () => {
        assert.equal(DEFAULT_REACTION_EMOJI_TYPE, 'Typing');
        assert.deepEqual(toFeishuReactionPayload(), {
            reaction_type: {
                emoji_type: 'Typing'
            }
        });
    });

    it('builds a Feishu message reaction payload', () => {
        assert.deepEqual(toFeishuReactionPayload('THUMBSUP'), {
            reaction_type: {
                emoji_type: 'THUMBSUP'
            }
        });
    });
});
