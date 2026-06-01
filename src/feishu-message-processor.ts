import { mapFeishuIncomingMessage } from './adapters/feishu/inbound.ts';
import { createFeishuReplyGateway } from './adapters/feishu/reply-gateway.ts';
import { createBotApplication } from './app/bot-application.ts';
import { streamCursorReply as defaultStreamCursorReply } from './adapters/cursor/cursor-agent.ts';
import type { AskCursorOptions } from './adapters/cursor/cursor-agent.ts';
import { createAssistantCommandHandler } from './core/commands/assistant-command.ts';
import { createMeetingCommandHandler } from './core/commands/create-meeting-command.ts';
import { createCommandRegistry } from './core/command-registry.ts';
import type { CloudPlayerCommandOptions, MeetingCreatedReplyData } from './core/meeting.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from './core/reactions.ts';
import type { FeishuCard } from './adapters/feishu/renderers.ts';
import type { FeishuIncomingMessageEvent } from './message.ts';

type Logger = Pick<typeof console, 'error' | 'info'>;
type CursorReplyStreamer = (options: AskCursorOptions) => AsyncIterable<string>;
type SendTextMessageResult = { messageId?: string } | void;
type SendCardMessageResult = { messageId?: string; cardId?: string } | void;
type AddMessageReactionResult = { reactionId?: string } | void;
type CreateMeeting = (request: { title: string; cloudPlayer?: CloudPlayerCommandOptions }) => Promise<MeetingCreatedReplyData>;

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
        replies: createFeishuReplyGateway({
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
            const message = mapFeishuIncomingMessage(event);
            if (!message) {
                return;
            }

            logger.info(`[feishu-bot] received message chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'} textLength=${message.text.length}`);
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
