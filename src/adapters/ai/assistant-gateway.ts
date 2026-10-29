import type { AssistantGateway } from '../../ports/assistant.ts';
import { streamAIReply, type AIEffort } from './ai-agent.ts';

export type AIAssistantGatewayOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
    effort?: AIEffort;
};

export function createAIAssistantGateway(options: AIAssistantGatewayOptions): AssistantGateway {
    return {
        streamReply(prompt) {
            return streamAIReply({
                apiKey: options.apiKey,
                baseURL: options.baseURL,
                model: options.model,
                effort: options.effort,
                prompt
            });
        }
    };
}
