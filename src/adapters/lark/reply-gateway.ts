import type { BotReply, ReplyStream } from '../../core/types.ts';
import { isReplyStream } from '../../core/types.ts';
import { buildMeetingCreateFailedCard, buildMeetingCreatedCard, formatMeetingCreateFailedReply, formatMeetingCreatedReply } from './renderers.ts';
import type { LarkCard } from './renderers.ts';
import type { ReplyGateway } from '../../ports/reply.ts';

type SendTextMessageResult = { messageId?: string } | void;
type SendCardMessageResult = { messageId?: string; cardId?: string } | void;

export type LarkReplyGatewayOptions = {
    sendCardMessage?: (chatId: string, card: LarkCard) => Promise<SendCardMessageResult>;
    sendTextMessage: (chatId: string, text: string) => Promise<SendTextMessageResult>;
    // 由飞书 SDK 的 LarkChannel 驱动（合并节流 + 打字机动画），避免逐 token 打接口。
    streamReply: (chatId: string, reply: ReplyStream) => Promise<void>;
};

export function createLarkReplyGateway(options: LarkReplyGatewayOptions): ReplyGateway {
    return {
        async send(chatId, reply) {
            if (isReplyStream(reply)) {
                await options.streamReply(chatId, reply);
                return;
            }

            await sendBotReply(chatId, reply, options);
        }
    };
}

async function sendBotReply(chatId: string, reply: BotReply, options: LarkReplyGatewayOptions): Promise<void> {
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
