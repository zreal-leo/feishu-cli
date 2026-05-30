import { streamCursorReply as defaultStreamCursorReply } from './cursor-agent.js';
import type { AskCursorOptions } from './cursor-agent.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { DEFAULT_REACTION_EMOJI_TYPE, buildCursorPrompt, extractIncomingText } from './message.js';
import { createSegmentTimer, formatDurationMs } from './timing.js';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;
type SendTextMessageResult = { messageId?: string } | void;

const DEFAULT_STREAMING_UPDATE_INTERVAL_MS = 250;

export type FeishuMessageProcessorOptions = {
    cursorApiKey: string;
    cursorModel: string;
    askCursor?: (options: AskCursorOptions) => Promise<string>;
    streamCursorReply?: CursorReplyStreamer;
    addMessageReaction?: (messageId: string, emojiType: string) => Promise<void>;
    reactionEmojiType?: string;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
    streamingUpdateIntervalMs?: number;
    logger?: Logger;
};

export type FeishuMessageProcessor = {
    handleEvent: (event: FeishuIncomingMessageEvent) => void;
    drain: () => Promise<void>;
};

export function createFeishuMessageProcessor(options: FeishuMessageProcessorOptions): FeishuMessageProcessor {
    const streamCursorReply = options.streamCursorReply ?? (options.askCursor ? createCursorReplyStreamer(options.askCursor) : defaultStreamCursorReply);
    const logger = options.logger ?? console;
    const reactionEmojiType = options.reactionEmojiType ?? DEFAULT_REACTION_EMOJI_TYPE;
    const streamingUpdateIntervalMs = Math.max(0, options.streamingUpdateIntervalMs ?? DEFAULT_STREAMING_UPDATE_INTERVAL_MS);
    const seenMessageIds = new Set<string>();
    let queue: Promise<void> = Promise.resolve();

    function enqueue(job: () => Promise<void>): void {
        queue = queue.then(job, job);
        void queue.catch(() => undefined);
    }

    return {
        handleEvent(event) {
            const timer = createSegmentTimer();
            const text = extractIncomingText(event);
            const chatId = event.message?.chat_id;
            const messageId = event.message?.message_id?.trim();

            if (!text || !chatId) {
                return;
            }

            if (messageId) {
                if (seenMessageIds.has(messageId)) {
                    logger.info(`[feishu-bot] duplicate message ignored chatId=${chatId} messageId=${messageId} textLength=${text.length}`);
                    return;
                }
                seenMessageIds.add(messageId);
            }

            logger.info(`[feishu-bot] received message chatId=${chatId} messageId=${messageId ?? 'unknown'} textLength=${text.length}`);

            enqueue(async () => {
                try {
                    if (messageId && options.addMessageReaction) {
                        await options.addMessageReaction(messageId, reactionEmojiType);
                        const reactionTiming = timer.mark();
                        logger.info(
                            `[feishu-bot] reaction added chatId=${chatId} messageId=${messageId} emojiType=${reactionEmojiType} segment=${formatDurationMs(reactionTiming.segmentMs)} total=${formatDurationMs(reactionTiming.totalMs)}`
                        );
                    }

                    const cursorReply = streamCursorReply({
                        apiKey: options.cursorApiKey,
                        model: options.cursorModel,
                        prompt: buildCursorPrompt(text)
                    });

                    await streamReplyToFeishuMessage(chatId, cursorReply, {
                        logger,
                        sendTextMessage: options.sendTextMessage,
                        streamingUpdateIntervalMs,
                        updateTextMessage: options.updateTextMessage
                    });

                    const sendTiming = timer.mark();
                    logger.info(`[feishu-bot] streaming reply sent chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(sendTiming.segmentMs)} total=${formatDurationMs(sendTiming.totalMs)}`);
                } catch (error) {
                    const failureTiming = timer.mark();
                    logger.error(`[feishu-bot] message handling failed chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(failureTiming.segmentMs)} total=${formatDurationMs(failureTiming.totalMs)}`, error);
                }
            });
        },

        drain() {
            return queue;
        }
    };
}

function createCursorReplyStreamer(askCursor: (options: AskCursorOptions) => Promise<string>): CursorReplyStreamer {
    return async function* streamFromAskCursor(options: AskCursorOptions): AsyncGenerator<string, void> {
        yield await askCursor(options);
    };
}

type StreamReplyToFeishuMessageOptions = {
    logger: Logger;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    streamingUpdateIntervalMs: number;
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
};

async function streamReplyToFeishuMessage(chatId: string, cursorReply: AsyncIterable<string>, options: StreamReplyToFeishuMessageOptions): Promise<void> {
    let replyText = '';
    let sentInitialMessage = false;
    let sentMessageId: string | undefined;
    let fallbackToFinalMessage = false;
    let initialMessageText = '';
    let lastUpdateAt = 0;

    for await (const replyChunk of cursorReply) {
        if (replyChunk.length === 0 || (replyText.length === 0 && replyChunk.trim().length === 0)) {
            continue;
        }

        replyText += replyChunk;

        if (!options.updateTextMessage) {
            continue;
        }

        if (!sentInitialMessage) {
            sentInitialMessage = true;
            initialMessageText = replyText;
            sentMessageId = extractSentMessageId(await options.sendTextMessage(chatId, replyText));

            if (!sentMessageId) {
                fallbackToFinalMessage = true;
                options.logger.error(`[feishu-bot] streaming update skipped because sent message_id is missing chatId=${chatId}`);
            }

            continue;
        }

        if (!sentMessageId) {
            continue;
        }

        if (lastUpdateAt > 0) {
            const delayMs = options.streamingUpdateIntervalMs - (Date.now() - lastUpdateAt);
            if (delayMs > 0) {
                await sleep(delayMs);
            }
        }

        await options.updateTextMessage(sentMessageId, replyText);
        lastUpdateAt = Date.now();
    }

    if (!sentInitialMessage && replyText.trim().length > 0) {
        await options.sendTextMessage(chatId, replyText);
    }

    if (fallbackToFinalMessage && replyText !== initialMessageText && replyText.trim().length > 0) {
        await options.sendTextMessage(chatId, replyText);
    }
}

function extractSentMessageId(result: SendTextMessageResult): string | undefined {
    return result?.messageId?.trim() || undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
