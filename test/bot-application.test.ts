import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createBotApplication } from '../src/app/bot-application.ts';
import { createCommandRegistry } from '../src/core/command-registry.ts';
import type { BotReply, CommandHandler, MessageInput } from '../src/core/types.ts';
import type { SystemTraceRecord } from '../src/system-trace.ts';

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

    it('records full input, output, status, command name, and step timings for a handled message', async () => {
        const traces: SystemTraceRecord[] = [];
        const timestamps = [100, 101, 104, 114, 116, 130, 150, 155];
        const handler: CommandHandler = {
            name: 'create-meeting',
            match(message) {
                return message.text.startsWith('创建会议') ? { commandName: 'create-meeting' } : null;
            },
            async execute() {
                return { type: 'text', text: '会议创建成功，详情见卡片。' };
            }
        };
        const application = createBotApplication({
            commandRegistry: createCommandRegistry([handler]),
            logger: silentLogger,
            now: () => timestamps.shift() ?? 155,
            reactions: {
                async add() {
                    return { reactionId: 'reaction_1' };
                },
                async remove() {}
            },
            replies: {
                async send() {}
            },
            systemTraceCollector: {
                async record(trace) {
                    traces.push(trace);
                }
            }
        });

        application.handleMessage(input);
        await application.drain();

        assert.equal(traces.length, 1);
        assert.deepEqual(
            {
                chatId: traces[0]?.chatId,
                commandName: traces[0]?.commandName,
                input: traces[0]?.input,
                messageId: traces[0]?.messageId,
                output: traces[0]?.output,
                status: traces[0]?.status,
                steps: traces[0]?.steps
            },
            {
                chatId: 'chat_1',
                commandName: 'create-meeting',
                input: { text: '创建会议 AI 总结' },
                messageId: 'om_1',
                output: { type: 'text', text: '会议创建成功，详情见卡片。' },
                status: 'success',
                steps: [
                    { name: '消息去重', durationMs: 1, elapsedMs: 1 },
                    { name: '队列等待', durationMs: 3, elapsedMs: 4 },
                    { name: '添加响应表情', durationMs: 10, elapsedMs: 14 },
                    { name: '解析命令', durationMs: 2, elapsedMs: 16 },
                    { name: '执行命令', durationMs: 14, elapsedMs: 30 },
                    { name: '发送回复', durationMs: 20, elapsedMs: 50 },
                    { name: '移除响应表情', durationMs: 5, elapsedMs: 55 }
                ]
            }
        );
        assert.match(traces[0]?.timestamp ?? '', /^\d{4}-\d{2}-\d{2}T/);
    });

    it('records duplicate messages without sending a second reply', async () => {
        const traces: SystemTraceRecord[] = [];
        const handler: CommandHandler = {
            name: 'assistant',
            match() {
                return { commandName: 'assistant' };
            },
            execute() {
                return { type: 'text', text: '收到' };
            }
        };
        const application = createBotApplication({
            commandRegistry: createCommandRegistry([handler]),
            logger: silentLogger,
            replies: {
                async send() {}
            },
            systemTraceCollector: {
                async record(trace) {
                    traces.push(trace);
                }
            }
        });

        application.handleMessage(input);
        application.handleMessage(input);
        await application.drain();

        const duplicateTrace = traces.find(trace => trace.status === 'duplicate_ignored');
        assert.deepEqual(duplicateTrace?.input, { text: '创建会议 AI 总结' });
        assert.equal(duplicateTrace?.chatId, 'chat_1');
        assert.equal(duplicateTrace?.messageId, 'om_1');
        assert.equal(duplicateTrace?.output, undefined);
        assert.deepEqual(
            duplicateTrace?.steps.map(step => step.name),
            ['消息去重']
        );
    });

    it('records the complete output from a streaming reply', async () => {
        const traces: SystemTraceRecord[] = [];
        const handler: CommandHandler = {
            name: 'assistant',
            match() {
                return { commandName: 'assistant' };
            },
            execute() {
                return (async function* () {
                    yield '第一段';
                    yield '第二段';
                })();
            }
        };
        const application = createBotApplication({
            commandRegistry: createCommandRegistry([handler]),
            logger: silentLogger,
            replies: {
                async send(_chatId, reply) {
                    for await (const _chunk of reply as AsyncIterable<string>) {
                        // consume the stream so the trace collector can see the final output
                    }
                }
            },
            systemTraceCollector: {
                async record(trace) {
                    traces.push(trace);
                }
            }
        });

        application.handleMessage(input);
        await application.drain();

        assert.equal(traces[0]?.status, 'success');
        assert.deepEqual(traces[0]?.output, { type: 'stream', text: '第一段第二段' });
    });
});

function readTextReply(reply: BotReply | AsyncIterable<string>): string {
    if (Symbol.asyncIterator in reply) {
        return '<stream>';
    }

    return reply.type === 'text' ? reply.text : reply.type;
}
