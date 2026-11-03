import { appendFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import type { SystemTraceCollector } from '../ports/trace.ts';
import { formatSystemTraceDate, serializeSystemTraceRecord } from '../core/system-trace.ts';

export function createFileSystemTraceCollector(options: { logPath: string }): SystemTraceCollector {
    const createdDirectories = new Set<string>();

    return {
        async record(trace) {
            const logPath = createDatedLogPath(options.logPath, trace.timestamp);
            const directory = dirname(logPath);
            if (!createdDirectories.has(directory)) {
                await mkdir(directory, { recursive: true });
                createdDirectories.add(directory);
            }
            await appendFile(logPath, serializeSystemTraceRecord(trace), 'utf8');
        }
    };
}

function createDatedLogPath(logPath: string, timestamp: string): string {
    const extension = extname(logPath);
    const fileName = basename(logPath, extension);
    return join(dirname(logPath), `${fileName}-${formatSystemTraceDate(timestamp)}${extension}`);
}
