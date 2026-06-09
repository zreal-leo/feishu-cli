import { mapLarkIncomingMessage } from './adapters/lark/inbound.ts';
import { createLarkReplyGateway } from './adapters/lark/reply-gateway.ts';
import { createBotApplication } from './app/bot-application.ts';
import { streamCursorReply as defaultStreamCursorReply } from './adapters/cursor/cursor-agent.ts';
import type { AskCursorOptions } from './adapters/cursor/cursor-agent.ts';
import { createAssistantCommandHandler } from './core/commands/assistant-command.ts';
import { createCursorUsageCommandHandler } from './core/commands/cursor-usage-command.ts';
import { createMeetingCommandHandler } from './core/commands/create-meeting-command.ts';
import { createCommandRegistry } from './core/command-registry.ts';
import type { CursorTokenUsageSummary, CursorUsageQuery } from './core/cursor-usage.ts';
import type { CloudPlayerCommandOptions, MeetingCreatedReplyData } from './core/meeting.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from './core/reactions.ts';
import type { LarkCard } from './adapters/lark/renderers.ts';
import type { LarkIncomingMessageEvent } from './message.ts';
import type { SystemTraceCollector } from './ports/runtime.ts';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;
type SendTextMessageResult = { messageId?: string } | void;
type SendCardMessageResult = { messageId?: string; cardId?: string } | void;
type AddMessageReactionResult = { reactionId?: string } | void;
type CreateMeeting = (request: { title: string; cloudPlayer?: CloudPlayerCommandOptions }) => Promise<MeetingCreatedReplyData>;
type GetCursorUsageSummary = (query: CursorUsageQuery) => Promise<CursorTokenUsageSummary>;

export type LarkMessageProcessorOptions = {
    cursorApiKey: string;
    cursorModel: string;
    askCursor?: (options: AskCursorOptions) => Promise<string>;
    streamCursorReply?: CursorReplyStreamer;
    addMessageReaction?: (messageId: string, emojiType: string) => Promise<AddMessageReactionResult>;
    removeMessageReaction?: (messageId: string, reactionId: string) => Promise<void>;
    reactionEmojiType?: string;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    updateTextMessage?: (messageId: string, text: string) => Promise<void>;
    sendCardMessage?: (chatId: string, card: LarkCard) => Promise<SendCardMessageResult>;
    updateCardElementContent?: (cardId: string, elementId: string, content: string, sequence: number) => Promise<void>;
    finishCardStreaming?: (cardId: string, sequence: number, summary: string) => Promise<void>;
    createMeeting?: CreateMeeting;
    getCursorUsageSummary?: GetCursorUsageSummary;
    streamingUpdateIntervalMs?: number;
    logger?: Logger;
    systemTraceCollector?: SystemTraceCollector;
};

export type LarkMessageProcessor = {
    handleEvent: (event: LarkIncomingMessageEvent) => void;
    drain: () => Promise<void>;
};

export function createLarkMessageProcessor(options: LarkMessageProcessorOptions): LarkMessageProcessor {
    const streamCursorReply = options.streamCursorReply ?? (options.askCursor ? createCursorReplyStreamer(options.askCursor) : defaultStreamCursorReply);
    const logger = options.logger ?? console;
    const application = createBotApplication({
        commandRegistry: createCommandRegistry(
            [
                createMeetingCommandHandler({
                    async createMeeting(request) {
                        if (!options.createMeeting) {
                            throw new Error('创建会议能力未配置。');
                        }

                        return options.createMeeting(request);
                    }
                }),
                createCursorUsageCommandHandler({
                    async getUsageSummary(query) {
                        if (!options.getCursorUsageSummary) {
                            throw new Error('Cursor 用量查询能力未配置。');
                        }

                        return options.getCursorUsageSummary(query);
                    }
                })
            ],
            createAssistantCommandHandler({
                streamReply(prompt) {
                    return streamCursorReply({
                        apiKey: options.cursorApiKey,
                        model: options.cursorModel,
                        prompt
                    });
                }
            })
        ),
        logger,
        reactionEmojiType: options.reactionEmojiType ?? DEFAULT_REACTION_EMOJI_TYPE,
        reactions: options.addMessageReaction
            ? {
                  add: options.addMessageReaction,
                  remove: options.removeMessageReaction ?? (async () => {})
              }
            : undefined,
        systemTraceCollector: options.systemTraceCollector,
        replies: createLarkReplyGateway({
            finishCardStreaming: options.finishCardStreaming,
            logger,
            sendCardMessage: options.sendCardMessage,
            sendTextMessage: options.sendTextMessage,
            streamingUpdateIntervalMs: options.streamingUpdateIntervalMs,
            updateCardElementContent: options.updateCardElementContent,
            updateTextMessage: options.updateTextMessage
        })
    });

    return {
        handleEvent(event) {
            const message = mapLarkIncomingMessage(event);
            if (!message) {
                return;
            }

            logger.info(`[lark-bot] received message chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'} textLength=${message.text.length}`);
            application.handleMessage(message);
        },

        drain() {
            return application.drain();
        }
    };
}

function createCursorReplyStreamer(askCursor: (options: AskCursorOptions) => Promise<string>): CursorReplyStreamer {
    return async function* streamFromAskCursor(options: AskCursorOptions): AsyncGenerator<string, void> {
        yield await askCursor(options);
    };
}
