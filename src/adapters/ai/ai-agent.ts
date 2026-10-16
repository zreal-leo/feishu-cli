import Anthropic from '@anthropic-ai/sdk';

export type AIEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AskAIOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
    effort?: AIEffort;
    prompt: string;
    cwd?: string;
};

export async function askAI(options: AskAIOptions): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of streamAIReply(options)) {
        chunks.push(chunk);
    }

    return chunks.join('').trim() || 'AI 没有返回可回复的内容。';
}

export async function* streamAIReply(options: AskAIOptions): AsyncGenerator<string, void> {
    const client = new Anthropic({
        apiKey: options.apiKey,
        baseURL: options.baseURL
    });

    const stream = client.messages.stream({
        model: options.model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: {
            effort: options.effort ?? 'high'
        },
        messages: [{ role: 'user', content: options.prompt }]
    });

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text.length > 0) {
            yield event.delta.text;
        }
    }
}
