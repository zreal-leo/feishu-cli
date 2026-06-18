import type { BotReply, MessageInput, MessageSender, ReplyStream } from './types.ts';
import { isReplyStream } from './types.ts';
import type { MeetingCreatedReplyData } from './meeting.ts';
import { createSegmentTimer } from '../shared/timing.ts';

export type SystemTraceStatus = 'success' | 'duplicate_ignored' | 'no_command' | 'error';

export type SerializedError = {
    message: string;
    name?: string;
    stack?: string;
};

export type SystemTraceStep = {
    name: string;
    durationMs: number;
    elapsedMs: number;
    error?: SerializedError;
};

export type SystemTraceInput = {
    text: string;
};

export type SystemTraceOutput =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'stream';
          text: string;
      }
    | {
          type: 'meeting_created';
          data: MeetingCreatedReplyData;
      }
    | {
          type: 'meeting_failed';
          error: SerializedError;
      };

export type SystemTraceRecord = {
    timestamp: string;
    chatId: string;
    messageId?: string;
    sender?: MessageSender;
    commandName?: string;
    input: SystemTraceInput;
    output?: SystemTraceOutput;
    status: SystemTraceStatus;
    steps: SystemTraceStep[];
    error?: SerializedError;
};

export type SystemTraceContext = {
    markStep: (name: string, error?: unknown) => void;
    setCommandName: (commandName: string) => void;
    setOutput: (output: SystemTraceOutput) => void;
    finish: (status: SystemTraceStatus, error?: unknown) => SystemTraceRecord;
};

export type CommandTrace = {
    markStep: (name: string, error?: unknown) => void;
};

const SYSTEM_TRACE_STEP_NAMES: Record<string, string> = {
    'assistant.prepare': '准备助手回复',
    'command.execute': '执行命令',
    'command.resolve': '解析命令',
    'intent.parse': '意图解析',
    'meeting.create': '创建会议',
    'reaction.add': '添加响应表情',
    'reaction.remove': '移除响应表情',
    'reply.send': '发送回复',
    'router.invoke': '路由调用',
    'usage.fetch': '查询用量'
};

export async function runCommandTraceStep<T>(trace: CommandTrace | undefined, name: string, operation: () => T | Promise<T>): Promise<T> {
    try {
        const result = await operation();
        trace?.markStep(name);
        return result;
    } catch (error) {
        trace?.markStep(name, error);
        throw error;
    }
}

export function createSystemTraceContext(
    message: MessageInput,
    options: {
        now?: () => number;
    } = {}
): SystemTraceContext {
    const timer = createSegmentTimer(options.now);
    const record: SystemTraceRecord = {
        timestamp: new Date().toISOString(),
        chatId: message.chatId,
        messageId: message.messageId,
        sender: message.sender,
        input: { text: message.text },
        status: 'success',
        steps: []
    };

    return {
        markStep(name, error) {
            const timing = timer.mark();
            const step: SystemTraceStep = {
                name: formatSystemTraceStepName(name),
                durationMs: roundDurationMs(timing.segmentMs),
                elapsedMs: roundDurationMs(timing.totalMs)
            };

            if (error !== undefined) {
                step.error = serializeError(error);
            }

            record.steps.push(step);
        },
        setCommandName(commandName) {
            record.commandName = commandName;
        },
        setOutput(output) {
            record.output = output;
        },
        finish(status, error) {
            record.status = status;

            if (error !== undefined) {
                record.error = serializeError(error);
            }

            return {
                ...record,
                steps: [...record.steps]
            };
        }
    };
}

function formatSystemTraceStepName(name: string): string {
    return SYSTEM_TRACE_STEP_NAMES[name] ?? name;
}

export function captureReplyOutput(reply: BotReply | ReplyStream): {
    reply: BotReply | ReplyStream;
    getOutput: () => SystemTraceOutput;
} {
    if (isReplyStream(reply)) {
        let text = '';
        const tracedReply: ReplyStream = {
            async *[Symbol.asyncIterator]() {
                for await (const chunk of reply) {
                    text += chunk;
                    yield chunk;
                }
            }
        };

        return {
            reply: tracedReply,
            getOutput: () => ({ type: 'stream', text })
        };
    }

    return {
        reply,
        getOutput: () => describeBotReplyOutput(reply)
    };
}

export function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }

    if (typeof error === 'string') {
        return { message: error };
    }

    return { message: stringifyUnknown(error) };
}

export function serializeSystemTraceRecord(record: SystemTraceRecord): string {
    return `${JSON.stringify(
        {
            ...record,
            timestamp: formatSystemTraceTime(record.timestamp)
        },
        jsonSafeReplacer
    )}\n`;
}

export function formatSystemTraceDate(timestamp: string): string {
    const date = parseSystemTraceDate(timestamp);
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatSystemTraceTime(timestamp: string): string {
    const date = parseSystemTraceDate(timestamp);
    return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

function describeBotReplyOutput(reply: BotReply): SystemTraceOutput {
    switch (reply.type) {
        case 'text':
            return { type: 'text', text: reply.text };
        case 'meeting_created':
            return { type: 'meeting_created', data: reply.data };
        case 'meeting_failed':
            return { type: 'meeting_failed', error: serializeError(reply.error) };
    }
}

function jsonSafeReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
        return serializeError(value);
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    return value;
}

function roundDurationMs(durationMs: number): number {
    return Math.round(Math.max(0, durationMs));
}

function parseSystemTraceDate(timestamp: string): Date {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return new Date();
    }

    return date;
}

function padDatePart(value: number): string {
    return String(value).padStart(2, '0');
}

function stringifyUnknown(value: unknown): string {
    try {
        return JSON.stringify(value, jsonSafeReplacer) ?? String(value);
    } catch {
        return String(value);
    }
}
