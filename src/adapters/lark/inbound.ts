import type { MessageInput } from '../../core/types.ts';
import { extractIncomingText } from '../../message.ts';
import type { LarkIncomingMessageEvent } from '../../message.ts';

export function mapLarkIncomingMessage(event: LarkIncomingMessageEvent): MessageInput | null {
    const text = extractIncomingText(event);
    const chatId = event.message?.chat_id;

    if (!text || !chatId) {
        return null;
    }

    return {
        chatId,
        messageId: event.message?.message_id?.trim() || undefined,
        text
    };
}
