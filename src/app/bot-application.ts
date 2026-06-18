import type { CommandRegistry } from '../core/command-registry.ts';
import type { MessageInput } from '../core/types.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from '../core/reactions.ts';
import { captureReplyOutput, createSystemTraceContext } from '../core/system-trace.ts';
import type { CommandTrace, SystemTraceContext, SystemTraceOutput, SystemTraceStatus } from '../core/system-trace.ts';
import type { ReplyGateway } from '../ports/reply.ts';
import type { ReactionGateway } from '../ports/reaction.ts';
import type { SystemTraceCollector } from '../ports/trace.ts';
import type { DedupStore, JobQueue, Logger } from '../ports/runtime.ts';
import { createInMemoryDedupStore } from './in-memory-dedup-store.ts';
import { createSerialJobQueue } from './serial-job-queue.ts';

export type BotApplication = {
    handleMessage: (message: MessageInput) => void;
    drain: () => Promise<void>;
};

export type BotApplicationOptions = {
    commandRegistry: CommandRegistry;
    dedupStore?: DedupStore;
    jobQueue?: JobQueue;
    logger?: Logger;
    now?: () => number;
    reactionEmojiType?: string;
    reactions?: ReactionGateway;
    replies: ReplyGateway;
    systemTraceCollector?: SystemTraceCollector;
};

export function createBotApplication(options: BotApplicationOptions): BotApplication {
    const dedupStore = options.dedupStore ?? createInMemoryDedupStore();
    const jobQueue = options.jobQueue ?? createSerialJobQueue();
    const logger = options.logger ?? console;
    const reactionEmojiType = options.reactionEmojiType ?? DEFAULT_REACTION_EMOJI_TYPE;

    return {
        handleMessage(message) {
            const trace = options.systemTraceCollector ? createSystemTraceContext(message, { now: options.now }) : undefined;

            if (message.messageId && !dedupStore.remember(message.messageId)) {
                logger.info(`[bot-app] duplicate message ignored chatId=${message.chatId} messageId=${message.messageId} ${formatSenderLogFields(message)} textLength=${message.text.length}`);
                void recordTraceBestEffort(options.systemTraceCollector, trace?.finish('duplicate_ignored'), logger);
                return;
            }

            jobQueue.add(() => processMessage(message, options, logger, reactionEmojiType, trace));
        },

        drain() {
            return jobQueue.drain();
        }
    };
}

async function processMessage(message: MessageInput, options: BotApplicationOptions, logger: Logger, reactionEmojiType: string, trace?: SystemTraceContext): Promise<void> {
    let addedReactionId: string | undefined;
    let status: SystemTraceStatus = 'success';
    let handlingError: unknown;
    let getOutput: (() => SystemTraceOutput) | undefined;

    try {
        if (message.messageId && options.reactions) {
            addedReactionId = extractReactionId(await runAsyncStep(trace, 'reaction.add', () => options.reactions?.add(message.messageId as string, reactionEmojiType) ?? Promise.resolve()));
        }

        const resolved = runSyncStep(trace, 'command.resolve', () => options.commandRegistry.resolve(message));
        if (!resolved) {
            status = 'no_command';
            logger.error(`[bot-app] no command resolved chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'} ${formatSenderLogFields(message)}`);
            return;
        }
        trace?.setCommandName(resolved.match.commandName);

        const executionResult = executeCommandStep(trace, commandTrace => resolved.handler.execute({ message, trace: commandTrace }, resolved.match));
        const reply = isPromiseLike(executionResult) ? await executionResult : executionResult;
        const captured = captureReplyOutput(reply);
        getOutput = captured.getOutput;
        await runAsyncStep(trace, 'reply.send', () => options.replies.send(message.chatId, captured.reply));
        trace?.setOutput(getOutput());
    } catch (error) {
        status = 'error';
        handlingError = error;
        if (getOutput) {
            trace?.setOutput(getOutput());
        }
        logger.error(`[bot-app] message handling failed chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'} ${formatSenderLogFields(message)}`, error);
    } finally {
        if (message.messageId && addedReactionId && options.reactions) {
            await removeReactionBestEffort(message.messageId, addedReactionId, options.reactions, logger, message.chatId, trace);
        }

        await recordTraceBestEffort(options.systemTraceCollector, trace?.finish(status, handlingError), logger);
    }
}

function extractReactionId(result: { reactionId?: string } | void): string | undefined {
    return result?.reactionId?.trim() || undefined;
}

async function removeReactionBestEffort(messageId: string, reactionId: string, reactions: ReactionGateway, logger: Logger, chatId: string, trace?: SystemTraceContext): Promise<void> {
    try {
        await reactions.remove(messageId, reactionId);
        trace?.markStep('reaction.remove');
    } catch (error) {
        trace?.markStep('reaction.remove', error);
        logger.error(`[bot-app] reaction removal failed chatId=${chatId} messageId=${messageId} reactionId=${reactionId}`, error);
    }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
    return typeof value === 'object' && value !== null && 'then' in value && typeof (value as { then?: unknown }).then === 'function';
}

async function runAsyncStep<T>(trace: SystemTraceContext | undefined, name: string, operation: () => Promise<T>): Promise<T> {
    try {
        const result = await operation();
        trace?.markStep(name);
        return result;
    } catch (error) {
        trace?.markStep(name, error);
        throw error;
    }
}

function createCommandTrace(trace: SystemTraceContext | undefined, onStepMarked: () => void): CommandTrace | undefined {
    if (!trace) {
        return undefined;
    }

    return {
        markStep(name, error) {
            onStepMarked();
            trace.markStep(name, error);
        }
    };
}

function executeCommandStep<T>(trace: SystemTraceContext | undefined, operation: (commandTrace: CommandTrace | undefined) => T | Promise<T>): T | Promise<T> {
    let commandStepCount = 0;
    const commandTrace = createCommandTrace(trace, () => {
        commandStepCount += 1;
    });

    const markFallbackExecuteStep = (error?: unknown) => {
        if (trace && commandStepCount === 0) {
            trace.markStep('command.execute', error);
        }
    };

    let result: T | Promise<T>;

    try {
        result = operation(commandTrace);
    } catch (error) {
        markFallbackExecuteStep(error);
        throw error;
    }

    if (!isPromiseLike(result)) {
        markFallbackExecuteStep();
        return result;
    }

    return result.then(
        awaitedResult => {
            markFallbackExecuteStep();
            return awaitedResult;
        },
        error => {
            markFallbackExecuteStep(error);
            throw error;
        }
    );
}

function runSyncStep<T>(trace: SystemTraceContext | undefined, name: string, operation: () => T): T {
    try {
        const result = operation();
        trace?.markStep(name);
        return result;
    } catch (error) {
        trace?.markStep(name, error);
        throw error;
    }
}

async function recordTraceBestEffort(collector: SystemTraceCollector | undefined, trace: ReturnType<SystemTraceContext['finish']> | undefined, logger: Logger): Promise<void> {
    if (!collector || !trace) {
        return;
    }

    try {
        await collector.record(trace);
    } catch (error) {
        logger.error(`[bot-app] system trace write failed chatId=${trace.chatId} messageId=${trace.messageId ?? 'unknown'}`, error);
    }
}

function formatSenderLogFields(message: MessageInput): string {
    return `senderId=${message.sender?.id ?? 'unknown'} senderName=${message.sender?.name ?? 'unknown'}`;
}
