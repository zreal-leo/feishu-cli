import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCommandRegistry } from '../src/core/command-registry.ts';
import type { CommandHandler, MessageInput } from '../src/core/types.ts';

const input: MessageInput = {
    chatId: 'chat_1',
    messageId: 'om_1',
    text: '创建会议 AI 总结'
};

describe('createCommandRegistry', () => {
    it('resolves the first command handler whose matcher accepts the message', () => {
        const firstMatch: CommandHandler = {
            name: 'first-match',
            match(message) {
                return message.text.startsWith('创建会议') ? { commandName: 'first-match', data: { title: 'AI 总结' } } : null;
            },
            async execute() {
                return { type: 'text', text: 'first' };
            }
        };
        const secondMatch: CommandHandler = {
            name: 'second-match',
            match() {
                return { commandName: 'second-match' };
            },
            async execute() {
                return { type: 'text', text: 'second' };
            }
        };

        const registry = createCommandRegistry([firstMatch, secondMatch]);
        const resolved = registry.resolve(input);

        assert.equal(resolved?.handler.name, 'first-match');
        assert.deepEqual(resolved?.match, {
            commandName: 'first-match',
            data: {
                title: 'AI 总结'
            }
        });
    });

    it('falls back to the configured handler when no command matches', () => {
        const fallback: CommandHandler = {
            name: 'assistant-fallback',
            match() {
                return { commandName: 'assistant-fallback' };
            },
            async execute() {
                return { type: 'text', text: 'fallback' };
            }
        };

        const registry = createCommandRegistry([], fallback);
        const resolved = registry.resolve({ ...input, text: '你好' });

        assert.equal(resolved?.handler.name, 'assistant-fallback');
        assert.deepEqual(resolved?.match, { commandName: 'assistant-fallback' });
    });

    it('returns null when no command matches and no fallback is configured', () => {
        const registry = createCommandRegistry([]);

        assert.equal(registry.resolve({ ...input, text: '你好' }), null);
    });
});
