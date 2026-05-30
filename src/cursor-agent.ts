import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
type CursorSdkModule = typeof import('@cursor/sdk');

export type AskCursorOptions = {
    apiKey: string;
    model: string;
    prompt: string;
    cwd?: string;
};

export function getCursorSdkPlatformPackageName(platform: NodeJS.Platform = process.platform, arch: NodeJS.Architecture = process.arch): string | undefined {
    if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
        return `@cursor/sdk-darwin-${arch}`;
    }

    if (platform === 'linux' && (arch === 'arm64' || arch === 'x64')) {
        return `@cursor/sdk-linux-${arch}`;
    }

    if (platform === 'win32' && arch === 'x64') {
        return '@cursor/sdk-win32-x64';
    }

    return undefined;
}

export function getRipgrepExecutableName(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'rg.exe' : 'rg';
}

function resolvePackageRipgrepPath(packageName: string, executable: string, fromDirectory: string): string | undefined {
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [fromDirectory] });
        const candidate = join(dirname(packageJsonPath), 'bin', executable);

        return existsSync(candidate) ? candidate : undefined;
    } catch {
        return undefined;
    }
}

function resolveBundledRipgrepPath(): string | undefined {
    const executable = getRipgrepExecutableName();
    const sdkEntry = require.resolve('@cursor/sdk');
    const sdkRoot = resolve(dirname(sdkEntry), '../..');
    const platformPackageName = getCursorSdkPlatformPackageName();
    const platformPackageRipgrepPath = platformPackageName ? resolvePackageRipgrepPath(platformPackageName, executable, sdkRoot) : undefined;
    if (platformPackageRipgrepPath) {
        return platformPackageRipgrepPath;
    }

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

async function loadCursorSdk(): Promise<CursorSdkModule> {
    ensureCursorRipgrepPath();
    return import('@cursor/sdk');
}

export async function askCursor(options: AskCursorOptions): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of streamCursorReply(options)) {
        chunks.push(chunk);
    }

    return chunks.join('').trim() || 'Cursor 没有返回可回复的内容。';
}

export async function* streamCursorReply(options: AskCursorOptions): AsyncGenerator<string, void> {
    let CursorAgentError: CursorSdkModule['CursorAgentError'] | undefined;

    try {
        const cursorSdk = await loadCursorSdk();
        CursorAgentError = cursorSdk.CursorAgentError;

        const agent = await cursorSdk.Agent.create({
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
        if (CursorAgentError && error instanceof CursorAgentError) {
            yield `Cursor 启动失败：${error.message}`;
            return;
        }

        throw error;
    }
}
