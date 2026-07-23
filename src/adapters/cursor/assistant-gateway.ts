import type { AssistantGateway } from '../../ports/assistant.ts';
import { streamAIReply } from './ai-agent.ts';

export type AIAssistantGatewayOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
};

export function createAIAssistantGateway(options: AIAssistantGatewayOptions): AssistantGateway {
    return {
        streamReply(prompt) {
            return streamAIReply({
                apiKey: options.apiKey,
                baseURL: options.baseURL,
                model: options.model,
                prompt
            });
        }
    };
}
