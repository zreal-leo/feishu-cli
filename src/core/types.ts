import type { MeetingCreatedReplyData } from './meeting.ts';

export type MessageInput = {
    chatId: string;
    messageId?: string;
    text: string;
};

export type CommandMatch<TData = unknown> = {
    commandName: string;
    data?: TData;
};

export type TextReply = {
    type: 'text';
    text: string;
};

export type MeetingCreatedReply = {
    type: 'meeting_created';
    data: MeetingCreatedReplyData;
};

export type MeetingFailedReply = {
    type: 'meeting_failed';
    error: unknown;
};

export type BotReply = TextReply | MeetingCreatedReply | MeetingFailedReply;

export type ReplyStream = AsyncIterable<string>;

export type CommandContext = {
    message: MessageInput;
};

export type CommandHandler<TMatch extends CommandMatch = CommandMatch> = {
    name: string;
    match: (input: MessageInput) => TMatch | null;
    execute: (context: CommandContext, match: TMatch) => BotReply | ReplyStream | Promise<BotReply | ReplyStream>;
};

export function isReplyStream(reply: BotReply | ReplyStream): reply is ReplyStream {
    return Symbol.asyncIterator in reply;
}
