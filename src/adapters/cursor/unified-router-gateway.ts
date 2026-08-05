import type { AIEffort } from './ai-agent.ts';
import { buildUnifiedRouterPrompt } from '../../core/unified-router-prompt.ts';
import type { ParseMeetingParametersInput, ParsedMeetingIntentParameters } from '../../ports/meeting.ts';
import type { MessageRouterGateway, RoutedMessage } from '../../ports/message-router.ts';
import { parseMeetingIntentResponse } from './meeting-intent-parser.ts';
import { streamAIReply } from './ai-agent.ts';

const MAX_MEETING_JSON_BUFFER = 8_192;

export type AIUnifiedRouterGatewayOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
    effort?: AIEffort;
    streamAIReply?: typeof streamAIReply;
};

type StreamMode = 'undecided' | 'json' | 'assistant';

export function createAIUnifiedRouterGateway(options: AIUnifiedRouterGatewayOptions): MessageRouterGateway {
    const streamReply = options.streamAIReply ?? streamAIReply;

    return {
        route(input) {
            return routeMessage(input, streamReply, options.apiKey, options.baseURL, options.model, options.effort);
        }
    };
}

async function routeMessage(input: ParseMeetingParametersInput, streamReply: typeof streamAIReply, apiKey: string, baseURL: string | undefined, model: string, effort: AIEffort | undefined): Promise<RoutedMessage> {
    const source = streamReply({
        apiKey,
        baseURL,
        model,
        effort,
        prompt: buildUnifiedRouterPrompt(input)
    });
    const iterator = source[Symbol.asyncIterator]();

    let buffer = '';
    let mode: StreamMode = 'undecided';

    while (true) {
        const next = await iterator.next();
        if (next.done) {
            break;
        }

        buffer += next.value;

        if (mode === 'undecided') {
            const trimmed = buffer.trimStart();
            if (!trimmed) {
                continue;
            }

            if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
                mode = 'json';
            } else {
                mode = 'assistant';
                return {
                    action: 'assistant',
                    stream: prependStream(buffer, iterator)
                };
            }
        }

        if (mode === 'json') {
            const meetingParameters = tryParseCreateMeetingParameters(buffer);
            if (meetingParameters) {
                await iterator.return?.();
                return {
                    action: 'create_meeting',
                    parameters: meetingParameters
                };
            }

            if (buffer.length > MAX_MEETING_JSON_BUFFER) {
                return {
                    action: 'assistant',
                    stream: prependStream(buffer, iterator)
                };
            }
        }
    }

    if (mode === 'json') {
        const meetingParameters = tryParseCreateMeetingParameters(buffer);
        if (meetingParameters) {
            return {
                action: 'create_meeting',
                parameters: meetingParameters
            };
        }
    }

    const text = buffer.trim();
    return {
        action: 'assistant',
        stream: text ? singleChunkStream(text) : singleChunkStream('Cursor 没有返回可回复的内容。')
    };
}

function tryParseCreateMeetingParameters(buffer: string): ParsedMeetingIntentParameters | null {
    const trimmed = buffer.trim();
    if (!trimmed.startsWith('{') && !trimmed.includes('{')) {
        return null;
    }

    if (!hasCompleteJsonObject(trimmed)) {
        return null;
    }

    try {
        const intent = parseMeetingIntentResponse(trimmed);
        return intent.action === 'create_meeting' ? intent.parameters : null;
    } catch {
        return null;
    }
}

function hasCompleteJsonObject(text: string): boolean {
    const jsonText = extractJsonCandidate(text);
    if (!jsonText.startsWith('{')) {
        return false;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (const char of jsonText) {
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
            continue;
        }

        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return true;
            }
        }
    }

    return false;
}

function extractJsonCandidate(text: string): string {
    if (text.startsWith('{') && text.endsWith('}')) {
        return text;
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return text.slice(start, end + 1);
    }

    return text;
}

async function* prependStream(prefix: string, iterator: AsyncIterator<string>): AsyncGenerator<string, void> {
    if (prefix) {
        yield prefix;
    }

    while (true) {
        const next = await iterator.next();
        if (next.done) {
            return;
        }

        yield next.value;
    }
}

async function* singleChunkStream(text: string): AsyncGenerator<string, void> {
    yield text;
}
