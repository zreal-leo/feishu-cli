import type { BotReply, ReplyStream } from '../core/types.ts';

export type ReplyGateway = {
    send: (chatId: string, reply: BotReply | ReplyStream) => Promise<void>;
};
