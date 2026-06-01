import type { CommandRegistry } from '../core/command-registry.ts';
import type { MessageInput } from '../core/types.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from '../core/reactions.ts';
import type { ReplyGateway } from '../ports/reply.ts';
import type { DedupStore, JobQueue, Logger, ReactionGateway } from '../ports/runtime.ts';
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
    reactionEmojiType?: string;
    reactions?: ReactionGateway;
    replies: ReplyGateway;
};

export function createBotApplication(options: BotApplicationOptions): BotApplication {
    const dedupStore = options.dedupStore ?? createInMemoryDedupStore();
    const jobQueue = options.jobQueue ?? createSerialJobQueue();
    const logger = options.logger ?? console;
    const reactionEmojiType = options.reactionEmojiType ?? DEFAULT_REACTION_EMOJI_TYPE;

    return {
        handleMessage(message) {
            if (message.messageId && !dedupStore.remember(message.messageId)) {
                logger.info(`[bot-app] duplicate message ignored chatId=${message.chatId} messageId=${message.messageId} textLength=${message.text.length}`);
                return;
            }

            jobQueue.add(() => processMessage(message, options, logger, reactionEmojiType));
        },

        drain() {
            return jobQueue.drain();
        }
    };
}

async function processMessage(message: MessageInput, options: BotApplicationOptions, logger: Logger, reactionEmojiType: string): Promise<void> {
    let addedReactionId: string | undefined;

    try {
        if (message.messageId && options.reactions) {
            addedReactionId = extractReactionId(await options.reactions.add(message.messageId, reactionEmojiType));
        }

        const resolved = options.commandRegistry.resolve(message);
        if (!resolved) {
            logger.error(`[bot-app] no command resolved chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'}`);
            return;
        }

        const executionResult = resolved.handler.execute({ message }, resolved.match);
        const reply = isPromiseLike(executionResult) ? await executionResult : executionResult;
        await options.replies.send(message.chatId, reply);
    } catch (error) {
        logger.error(`[bot-app] message handling failed chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'}`, error);
    } finally {
        if (message.messageId && addedReactionId && options.reactions) {
            await removeReactionBestEffort(message.messageId, addedReactionId, options.reactions, logger, message.chatId);
        }
    }
}

function extractReactionId(result: { reactionId?: string } | void): string | undefined {
    return result?.reactionId?.trim() || undefined;
}

async function removeReactionBestEffort(messageId: string, reactionId: string, reactions: ReactionGateway, logger: Logger, chatId: string): Promise<void> {
    try {
        await reactions.remove(messageId, reactionId);
    } catch (error) {
        logger.error(`[bot-app] reaction removal failed chatId=${chatId} messageId=${messageId} reactionId=${reactionId}`, error);
    }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
    return typeof value === 'object' && value !== null && 'then' in value && typeof (value as { then?: unknown }).then === 'function';
}
