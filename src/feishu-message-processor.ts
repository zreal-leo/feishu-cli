import { streamCursorReply as defaultStreamCursorReply } from './cursor-agent.js';
import type { AskCursorOptions } from './cursor-agent.js';
import type { FeishuCard, FeishuIncomingMessageEvent } from './message.js';
import {
    CURSOR_REPLY_CARD_ELEMENT_ID,
    DEFAULT_REACTION_EMOJI_TYPE,
    buildCursorPrompt,
    buildCursorReplyCard,
    buildMeetingCreateFailedCard,
    buildMeetingCreatedCard,
    extractIncomingText,
    formatMeetingCreateFailedReply,
    formatMeetingCreatedReply,
    parseCreateMeetingCommand,
    summarizeCardText
} from './message.js';
import type { CloudPlayerCommandOptions, CreateMeetingCommand, MeetingCreatedReplyData } from './message.js';
import { createSegmentTimer, formatDurationMs } from './timing.js';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;
type SendTextMessageResult = { messageId?: string } | void;
type SendCardMessageResult = { messageId?: string; cardId?: string } | void;
type AddMessageReactionResult = { reactionId?: string } | void;
type CreateMeeting = (request: { title: string; cloudPlayer?: CloudPlayerCommandOptions }) => Promise<MeetingCreatedReplyData>;

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
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
    sendCardMessage?: (chatId: string, card: FeishuCard) => Promise<SendCardMessageResult>;
    updateCardElementContent?: (cardId: string, elementId: string, content: string, sequence: number) => Promise<void>;
    finishCardStreaming?: (cardId: string, sequence: number, summary: string) => Promise<void>;
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
                        await handleCreateMeetingCommand(chatId, createMeetingCommand, {
                            createMeeting: options.createMeeting,
                            logger,
                            messageId,
                            sendCardMessage: options.sendCardMessage,
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
                        finishCardStreaming: options.finishCardStreaming,
                        logger,
                        sendCardMessage: options.sendCardMessage,
                        sendTextMessage: options.sendTextMessage,
                        streamingUpdateIntervalMs,
                        updateCardElementContent: options.updateCardElementContent,
                        updateTextMessage: options.updateTextMessage
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
    sendCardMessage?: (chatId: string, card: FeishuCard) => Promise<SendCardMessageResult>;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    timer: ReturnType<typeof createSegmentTimer>;
};

async function handleCreateMeetingCommand(chatId: string, command: CreateMeetingCommand, options: HandleCreateMeetingCommandOptions): Promise<void> {
    try {
        if (!options.createMeeting) {
            throw new Error('创建会议能力未配置。');
        }

        const meeting = await options.createMeeting({ title: command.title, cloudPlayer: command.cloudPlayer });
        await sendMeetingCreatedReply(chatId, meeting, options);
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
        await sendMeetingCreateFailedReply(chatId, error, options);
    }
}

async function sendMeetingCreatedReply(chatId: string, meeting: MeetingCreatedReplyData, options: Pick<HandleCreateMeetingCommandOptions, 'sendCardMessage' | 'sendTextMessage'>): Promise<void> {
    if (options.sendCardMessage) {
        await options.sendCardMessage(chatId, buildMeetingCreatedCard(meeting));
        return;
    }

    await options.sendTextMessage(chatId, formatMeetingCreatedReply(meeting));
}

async function sendMeetingCreateFailedReply(chatId: string, error: unknown, options: Pick<HandleCreateMeetingCommandOptions, 'sendCardMessage' | 'sendTextMessage'>): Promise<void> {
    if (options.sendCardMessage) {
        await options.sendCardMessage(chatId, buildMeetingCreateFailedCard(error));
        return;
    }

    await options.sendTextMessage(chatId, formatMeetingCreateFailedReply(error));
}

function createCursorReplyStreamer(askCursor: (options: AskCursorOptions) => Promise<string>): CursorReplyStreamer {
    return async function* streamFromAskCursor(options: AskCursorOptions): AsyncGenerator<string, void> {
        yield await askCursor(options);
    };
}

type StreamReplyToFeishuMessageOptions = {
    finishCardStreaming?: (cardId: string, sequence: number, summary: string) => Promise<void>;
    logger: Logger;
    sendCardMessage?: (chatId: string, card: FeishuCard) => Promise<SendCardMessageResult>;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    streamingUpdateIntervalMs: number;
    updateCardElementContent?: (cardId: string, elementId: string, content: string, sequence: number) => Promise<void>;
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
};

async function streamReplyToFeishuMessage(chatId: string, cursorReply: AsyncIterable<string>, options: StreamReplyToFeishuMessageOptions): Promise<void> {
    if (options.sendCardMessage) {
        await streamReplyToFeishuCard(chatId, cursorReply, options);
        return;
    }

    await streamReplyToTextMessage(chatId, cursorReply, options);
}

async function streamReplyToFeishuCard(chatId: string, cursorReply: AsyncIterable<string>, options: StreamReplyToFeishuMessageOptions): Promise<void> {
    const sendCardMessage = options.sendCardMessage;

    if (!sendCardMessage) {
        await streamReplyToTextMessage(chatId, cursorReply, options);
        return;
    }

    let replyText = '';
    let sentInitialCard = false;
    let sentCardId: string | undefined;
    let fallbackToFinalCard = false;
    let initialCardText = '';
    let lastUpdateAt = 0;
    let sequence = 0;

    try {
        for await (const replyChunk of cursorReply) {
            if (replyChunk.length === 0 || (replyText.length === 0 && replyChunk.trim().length === 0)) {
                continue;
            }

            replyText += replyChunk;

            if (!options.updateCardElementContent || !options.finishCardStreaming) {
                continue;
            }

            if (!sentInitialCard) {
                sentInitialCard = true;
                initialCardText = replyText;
                sentCardId = extractSentCardId(await sendCardMessage(chatId, buildCursorReplyCard(replyText, { streaming: true })));

                if (!sentCardId) {
                    fallbackToFinalCard = true;
                    options.logger.error(`[feishu-bot] streaming card update skipped because sent card_id is missing chatId=${chatId}`);
                }

                continue;
            }

            if (!sentCardId) {
                continue;
            }

            if (lastUpdateAt > 0) {
                const delayMs = options.streamingUpdateIntervalMs - (Date.now() - lastUpdateAt);
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            }

            await options.updateCardElementContent(sentCardId, CURSOR_REPLY_CARD_ELEMENT_ID, replyText, ++sequence);
            lastUpdateAt = Date.now();
        }
    } finally {
        if (sentCardId && options.finishCardStreaming) {
            await finishStreamingCardBestEffort(sentCardId, ++sequence, summarizeCardText(replyText), options);
        }
    }

    if (!sentInitialCard && replyText.trim().length > 0) {
        await sendCardMessage(chatId, buildCursorReplyCard(replyText));
    }

    if (fallbackToFinalCard && replyText !== initialCardText && replyText.trim().length > 0) {
        await sendCardMessage(chatId, buildCursorReplyCard(replyText));
    }
}

async function finishStreamingCardBestEffort(cardId: string, sequence: number, summary: string, options: Pick<StreamReplyToFeishuMessageOptions, 'finishCardStreaming' | 'logger'>): Promise<void> {
    try {
        await options.finishCardStreaming?.(cardId, sequence, summary);
    } catch (error) {
        options.logger.error(`[feishu-bot] streaming card finish failed cardId=${cardId}`, error);
    }
}

async function streamReplyToTextMessage(chatId: string, cursorReply: AsyncIterable<string>, options: StreamReplyToFeishuMessageOptions): Promise<void> {
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

function extractSentCardId(result: SendCardMessageResult): string | undefined {
    return result?.cardId?.trim() || undefined;
}

function extractAddedReactionId(result: AddMessageReactionResult): string | undefined {
    return result?.reactionId?.trim() || undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
