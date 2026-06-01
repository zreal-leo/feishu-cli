import type { AssistantGateway } from '../../ports/assistant.ts';
import { buildCursorPrompt } from '../assistant-prompt.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';

type AssistantCommandMatch = CommandMatch;

export function createAssistantCommandHandler(assistant: AssistantGateway): CommandHandler<AssistantCommandMatch> {
    return {
        name: 'assistant-fallback',
        match() {
            return { commandName: 'assistant-fallback' };
        },
        execute(context) {
            return assistant.streamReply(buildCursorPrompt(context.message.text));
        }
    };
}
