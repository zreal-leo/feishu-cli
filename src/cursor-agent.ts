import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { Agent, CursorAgentError } from '@cursor/sdk';

const require = createRequire(import.meta.url);

export type AskCursorOptions = {
    apiKey: string;
    model: string;
    prompt: string;
    cwd?: string;
};

function resolveBundledRipgrepPath(): string | undefined {
    const sdkEntry = require.resolve('@cursor/sdk');
    const sdkRoot = resolve(dirname(sdkEntry), '../..');
    const executable = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const candidate = join(sdkRoot, 'node_modules', '.bin', executable);

    return existsSync(candidate) ? candidate : undefined;
}

export function ensureCursorRipgrepPath(): void {
    if (process.env.CURSOR_RIPGREP_PATH?.trim()) {
        return;
    }

    const bundledRipgrepPath = resolveBundledRipgrepPath();
    if (bundledRipgrepPath) {
        process.env.CURSOR_RIPGREP_PATH = bundledRipgrepPath;
    }
}

export async function askCursor(options: AskCursorOptions): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of streamCursorReply(options)) {
        chunks.push(chunk);
    }

    return chunks.join('').trim() || 'Cursor 没有返回可回复的内容。';
}

export async function* streamCursorReply(options: AskCursorOptions): AsyncGenerator<string, void> {
    try {
        ensureCursorRipgrepPath();

        const agent = await Agent.create({
            apiKey: options.apiKey,
            model: { id: options.model },
            local: { cwd: options.cwd ?? process.cwd() }
        });

        try {
            const run = await agent.send(options.prompt);
            let streamedText = false;

            for await (const event of run.stream()) {
                if (event.type !== 'assistant') {
                    continue;
                }

                for (const block of event.message.content) {
                    if (block.type === 'text' && block.text.length > 0) {
                        streamedText = true;
                        yield block.text;
                    }
                }
            }

            const result = await run.wait();
            if (result.status === 'error') {
                yield `Cursor 运行失败，runId=${result.id}`;
                return;
            }

            if (!streamedText && result.result?.trim()) {
                yield result.result.trim();
            }
        } finally {
            await agent[Symbol.asyncDispose]();
        }
    } catch (error) {
        if (error instanceof CursorAgentError) {
            yield `Cursor 启动失败：${error.message}`;
            return;
        }

        throw error;
    }
}
