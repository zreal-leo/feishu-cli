import { streamCursorReply as defaultStreamCursorReply } from './cursor-agent.js';
import type { AskCursorOptions } from './cursor-agent.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { DEFAULT_REACTION_EMOJI_TYPE, buildCursorPrompt, extractIncomingText } from './message.js';
import { createSegmentTimer, formatDurationMs } from './timing.js';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;

export type FeishuMessageProcessorOptions = {
    cursorApiKey: string;
    cursorModel: string;
    askCursor?: (options: AskCursorOptions) => Promise<string>;
    streamCursorReply?: CursorReplyStreamer;
    addMessageReaction?: (messageId: string, emojiType: string) => Promise<void>;
    reactionEmojiType?: string;
    sendTextMessage: (chatId: string, text: string) => Promise<void>;
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
                        logger.info(`[feishu-bot] reaction added chatId=${chatId} messageId=${messageId} emojiType=${reactionEmojiType} segment=${formatDurationMs(reactionTiming.segmentMs)} total=${formatDurationMs(reactionTiming.totalMs)}`);
                    }

                    const cursorReply = streamCursorReply({
                        apiKey: options.cursorApiKey,
                        model: options.cursorModel,
                        prompt: buildCursorPrompt(text)
                    });

                    for await (const replyChunk of cursorReply) {
                        if (replyChunk.trim().length === 0) {
                            continue;
                        }

                        await options.sendTextMessage(chatId, replyChunk);
                    }

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
