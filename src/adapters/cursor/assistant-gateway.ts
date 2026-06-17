import type { AssistantGateway } from '../../ports/assistant.ts';
import { streamCursorReply } from './cursor-agent.ts';

export type CursorAssistantGatewayOptions = {
    apiKey: string;
    model: string;
};

export function createCursorAssistantGateway(options: CursorAssistantGatewayOptions): AssistantGateway {
    return {
        streamReply(prompt) {
            return streamCursorReply({
                apiKey: options.apiKey,
                model: options.model,
                prompt
            });
        }
    };
}
