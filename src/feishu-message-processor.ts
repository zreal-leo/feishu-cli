import { streamCursorReply as defaultStreamCursorReply } from './cursor-agent.js';
import type { AskCursorOptions } from './cursor-agent.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { DEFAULT_REACTION_EMOJI_TYPE, buildCursorPrompt, extractIncomingText, formatMeetingCreateFailedReply, formatMeetingCreatedReply, parseCreateMeetingCommand } from './message.js';
import type { MeetingCreatedReplyData } from './message.js';
import { createSegmentTimer, formatDurationMs } from './timing.js';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;
type SendTextMessageResult = { messageId?: string } | void;
type AddMessageReactionResult = { reactionId?: string } | void;
type CreateMeeting = (request: { title: string }) => Promise<MeetingCreatedReplyData>;

const DEFAULT_STREAMING_UPDATE_INTERVAL_MS = 250;

export type FeishuMessageProcessorOptions = {
    cursorApiKey: string;
    cursorModel: string;
    askCursor?: (options: AskCursorOptions) => Promise<string>;
    streamCursorReply?: CursorReplyStreamer;
    addMessageReaction?: (messageId: string, emojiType: string) => Promise<AddMessageReactionResult>;
    removeMessageReaction?: (messageId: string, reactionId: string) => Promise<void>;
    reactionEmojiType?: string;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    createMeeting?: CreateMeeting;
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
                let addedReactionId: string | undefined;

                try {
                    if (messageId && options.addMessageReaction) {
                        addedReactionId = extractAddedReactionId(await options.addMessageReaction(messageId, reactionEmojiType));
                        const reactionTiming = timer.mark();
                        logger.info(
                            `[feishu-bot] reaction added chatId=${chatId} messageId=${messageId} emojiType=${reactionEmojiType} segment=${formatDurationMs(reactionTiming.segmentMs)} total=${formatDurationMs(reactionTiming.totalMs)}`
                        );
                    }

                    const createMeetingCommand = parseCreateMeetingCommand(text);

                    if (createMeetingCommand) {
                        await handleCreateMeetingCommand(chatId, createMeetingCommand.title, {
                            createMeeting: options.createMeeting,
                            logger,
                            messageId,
                            sendTextMessage: options.sendTextMessage,
                            timer
                        });
                        return;
                    }

                    const cursorReply = streamCursorReply({
                        apiKey: options.cursorApiKey,
                        model: options.cursorModel,
                        prompt: buildCursorPrompt(text)
                    });

                    await streamReplyToFeishuMessage(chatId, cursorReply, {
                        sendTextMessage: options.sendTextMessage,
                        streamingUpdateIntervalMs
                    });

                    const sendTiming = timer.mark();
                    logger.info(`[feishu-bot] streaming reply sent chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(sendTiming.segmentMs)} total=${formatDurationMs(sendTiming.totalMs)}`);
                } catch (error) {
                    const failureTiming = timer.mark();
                    logger.error(`[feishu-bot] message handling failed chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(failureTiming.segmentMs)} total=${formatDurationMs(failureTiming.totalMs)}`, error);
                } finally {
                    if (messageId && addedReactionId && options.removeMessageReaction) {
                        await removeAddedReaction(messageId, addedReactionId, {
                            chatId,
                            logger,
                            removeMessageReaction: options.removeMessageReaction,
                            timer
                        });
                    }
                }
            });
        },

        drain() {
            return queue;
        }
    };
}

type RemoveAddedReactionOptions = {
    chatId: string;
    logger: Logger;
    removeMessageReaction: (messageId: string, reactionId: string) => Promise<void>;
    timer: ReturnType<typeof createSegmentTimer>;
};

async function removeAddedReaction(messageId: string, reactionId: string, options: RemoveAddedReactionOptions): Promise<void> {
    try {
        await options.removeMessageReaction(messageId, reactionId);
        const reactionRemovalTiming = options.timer.mark();
        options.logger.info(
            `[feishu-bot] reaction removed chatId=${options.chatId} messageId=${messageId} reactionId=${reactionId} segment=${formatDurationMs(reactionRemovalTiming.segmentMs)} total=${formatDurationMs(reactionRemovalTiming.totalMs)}`
        );
    } catch (removeReactionError) {
        const reactionRemovalFailureTiming = options.timer.mark();
        options.logger.error(
            `[feishu-bot] reaction removal failed chatId=${options.chatId} messageId=${messageId} reactionId=${reactionId} segment=${formatDurationMs(reactionRemovalFailureTiming.segmentMs)} total=${formatDurationMs(reactionRemovalFailureTiming.totalMs)}`,
            removeReactionError
        );
    }
}

type HandleCreateMeetingCommandOptions = {
    createMeeting?: CreateMeeting;
    logger: Logger;
    messageId?: string;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    timer: ReturnType<typeof createSegmentTimer>;
};

async function handleCreateMeetingCommand(chatId: string, title: string, options: HandleCreateMeetingCommandOptions): Promise<void> {
    try {
        if (!options.createMeeting) {
            throw new Error('创建会议能力未配置。');
        }

        const meeting = await options.createMeeting({ title });
        await options.sendTextMessage(chatId, formatMeetingCreatedReply(meeting));
        const createTiming = options.timer.mark();
        options.logger.info(
            `[feishu-bot] manager meeting created chatId=${chatId} messageId=${options.messageId ?? 'unknown'} roadshowId=${meeting.roadshowId} eventId=${meeting.eventId} segment=${formatDurationMs(createTiming.segmentMs)} total=${formatDurationMs(createTiming.totalMs)}`
        );
    } catch (error) {
        const failureTiming = options.timer.mark();
        options.logger.error(
            `[feishu-bot] manager meeting creation failed chatId=${chatId} messageId=${options.messageId ?? 'unknown'} segment=${formatDurationMs(failureTiming.segmentMs)} total=${formatDurationMs(failureTiming.totalMs)}`,
            error
        );
        await options.sendTextMessage(chatId, formatMeetingCreateFailedReply(error));
    }
}

function createCursorReplyStreamer(askCursor: (options: AskCursorOptions) => Promise<string>): CursorReplyStreamer {
    return async function* streamFromAskCursor(options: AskCursorOptions): AsyncGenerator<string, void> {
        yield await askCursor(options);
    };
}

type StreamReplyToFeishuMessageOptions = {
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    streamingUpdateIntervalMs: number;
};

async function streamReplyToFeishuMessage(chatId: string, cursorReply: AsyncIterable<string>, options: StreamReplyToFeishuMessageOptions): Promise<void> {
    let hasSentReplyChunk = false;
    let lastSendAt = 0;
    let pendingWhitespace = '';

    for await (const replyChunk of cursorReply) {
        if (replyChunk.length === 0) {
            continue;
        }

        if (replyChunk.trim().length === 0) {
            if (hasSentReplyChunk) {
                pendingWhitespace += replyChunk;
            }
            continue;
        }

        if (lastSendAt > 0) {
            const delayMs = options.streamingUpdateIntervalMs - (Date.now() - lastSendAt);
            if (delayMs > 0) {
                await sleep(delayMs);
            }
        }

        await options.sendTextMessage(chatId, pendingWhitespace + replyChunk);
        pendingWhitespace = '';
        hasSentReplyChunk = true;
        lastSendAt = Date.now();
    }
}

function extractAddedReactionId(result: AddMessageReactionResult): string | undefined {
    return result?.reactionId?.trim() || undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
