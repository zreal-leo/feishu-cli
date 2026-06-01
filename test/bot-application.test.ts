import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createBotApplication } from '../src/app/bot-application.ts';
import { createCommandRegistry } from '../src/core/command-registry.ts';
import type { BotReply, CommandHandler, MessageInput } from '../src/core/types.ts';

const input: MessageInput = {
    chatId: 'chat_1',
    messageId: 'om_1',
    text: '创建会议 AI 总结'
};

const silentLogger = {
    info() {},
    error() {}
};

describe('createBotApplication', () => {
    it('deduplicates messages, wraps command execution with reactions, and sends the command reply', async () => {
        const actions: string[] = [];
        const handler: CommandHandler = {
            name: 'create-meeting',
            match(message) {
                return message.text.startsWith('创建会议') ? { commandName: 'create-meeting' } : null;
            },
            async execute() {
                actions.push('handler:execute');
                return { type: 'text', text: '会议创建成功' };
            }
        };
        const application = createBotApplication({
            commandRegistry: createCommandRegistry([handler]),
            logger: silentLogger,
            reactions: {
                async add(messageId, emojiType) {
                    actions.push(`reaction:add:${messageId}:${emojiType}`);
                    return { reactionId: 'reaction_1' };
                },
                async remove(messageId, reactionId) {
                    actions.push(`reaction:remove:${messageId}:${reactionId}`);
                }
            },
            replies: {
                async send(chatId, reply) {
                    actions.push(`reply:${chatId}:${readTextReply(reply)}`);
                }
            }
        });

        application.handleMessage(input);
        application.handleMessage(input);
        await application.drain();

        assert.deepEqual(actions, ['reaction:add:om_1:Typing', 'handler:execute', 'reply:chat_1:会议创建成功', 'reaction:remove:om_1:reaction_1']);
    });

    it('logs and does not send a reply when no command is resolved', async () => {
        const actions: string[] = [];
        const application = createBotApplication({
            commandRegistry: createCommandRegistry([]),
            logger: {
                info() {},
                error(message) {
                    actions.push(`error:${message}`);
                }
            },
            replies: {
                async send() {
                    actions.push('reply:unexpected');
                }
            }
        });

        application.handleMessage({ ...input, text: '你好' });
        await application.drain();

        assert.deepEqual(actions, ['error:[bot-app] no command resolved chatId=chat_1 messageId=om_1']);
    });
});

function readTextReply(reply: BotReply | AsyncIterable<string>): string {
    if (Symbol.asyncIterator in reply) {
        return '<stream>';
    }

    return reply.type === 'text' ? reply.text : reply.type;
}
