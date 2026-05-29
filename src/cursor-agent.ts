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
    try {
        ensureCursorRipgrepPath();

        const result = await Agent.prompt(options.prompt, {
            apiKey: options.apiKey,
            model: { id: options.model },
            local: { cwd: options.cwd ?? process.cwd() }
        });

        if (result.status === 'error') {
            return `Cursor 运行失败，runId=${result.id}`;
        }

        return result.result?.trim() || 'Cursor 没有返回可回复的内容。';
    } catch (error) {
        if (error instanceof CursorAgentError) {
            return `Cursor 启动失败：${error.message}`;
        }

        throw error;
    }
}
