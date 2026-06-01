import type { BotReply, ReplyStream } from '../../core/types.ts';
import { isReplyStream } from '../../core/types.ts';
import { CURSOR_REPLY_CARD_ELEMENT_ID, buildCursorReplyCard, buildMeetingCreateFailedCard, buildMeetingCreatedCard, formatMeetingCreateFailedReply, formatMeetingCreatedReply, summarizeCardText } from './renderers.ts';
import type { FeishuCard } from './renderers.ts';
import type { ReplyGateway } from '../../ports/reply.ts';
import type { Logger } from '../../ports/runtime.ts';

type SendTextMessageResult = { messageId?: string } | void;
type SendCardMessageResult = { messageId?: string; cardId?: string } | void;

const DEFAULT_STREAMING_UPDATE_INTERVAL_MS = 250;

export type FeishuReplyGatewayOptions = {
    finishCardStreaming?: (cardId: string, sequence: number, summary: string) => Promise<void>;
    logger?: Logger;
    sendCardMessage?: (chatId: string, card: FeishuCard) => Promise<SendCardMessageResult>;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    streamingUpdateIntervalMs?: number;
    updateCardElementContent?: (cardId: string, elementId: string, content: string, sequence: number) => Promise<void>;
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
};

export function createFeishuReplyGateway(options: FeishuReplyGatewayOptions): ReplyGateway {
    const logger = options.logger ?? console;
    const streamingUpdateIntervalMs = Math.max(0, options.streamingUpdateIntervalMs ?? DEFAULT_STREAMING_UPDATE_INTERVAL_MS);

    return {
        async send(chatId, reply) {
            if (isReplyStream(reply)) {
                await streamReplyToFeishuMessage(chatId, reply, {
                    ...options,
                    logger,
                    streamingUpdateIntervalMs
                });
                return;
            }

            await sendBotReply(chatId, reply, options);
        }
    };
}

async function sendBotReply(chatId: string, reply: BotReply, options: FeishuReplyGatewayOptions): Promise<void> {
    switch (reply.type) {
        case 'text':
            await options.sendTextMessage(chatId, reply.text);
            return;
        case 'meeting_created':
            if (options.sendCardMessage) {
                await options.sendCardMessage(chatId, buildMeetingCreatedCard(reply.data));
                return;
            }
            await options.sendTextMessage(chatId, formatMeetingCreatedReply(reply.data));
            return;
        case 'meeting_failed':
            if (options.sendCardMessage) {
                await options.sendCardMessage(chatId, buildMeetingCreateFailedCard(reply.error));
                return;
            }
            await options.sendTextMessage(chatId, formatMeetingCreateFailedReply(reply.error));
            return;
    }
}

type StreamReplyToFeishuMessageOptions = Required<Pick<FeishuReplyGatewayOptions, 'logger' | 'streamingUpdateIntervalMs'>> &
    Pick<FeishuReplyGatewayOptions, 'finishCardStreaming' | 'sendCardMessage' | 'sendTextMessage' | 'updateCardElementContent' | 'updateTextMessage'>;

async function streamReplyToFeishuMessage(chatId: string, cursorReply: ReplyStream, options: StreamReplyToFeishuMessageOptions): Promise<void> {
    if (options.sendCardMessage) {
        await streamReplyToFeishuCard(chatId, cursorReply, options);
        return;
    }

    await streamReplyToTextMessage(chatId, cursorReply, options);
}

async function streamReplyToFeishuCard(chatId: string, cursorReply: ReplyStream, options: StreamReplyToFeishuMessageOptions): Promise<void> {
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

async function streamReplyToTextMessage(chatId: string, cursorReply: ReplyStream, options: StreamReplyToFeishuMessageOptions): Promise<void> {
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

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
