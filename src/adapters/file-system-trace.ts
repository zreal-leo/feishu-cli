import { appendFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import type { SystemTraceCollector } from '../ports/runtime.ts';
import { formatSystemTraceDate, serializeSystemTraceRecord } from '../system-trace.ts';

export function createFileSystemTraceCollector(options: { logPath: string }): SystemTraceCollector {
    return {
        async record(trace) {
            const logPath = createDatedLogPath(options.logPath, trace.timestamp);
            await mkdir(dirname(logPath), { recursive: true });
            await appendFile(logPath, serializeSystemTraceRecord(trace), 'utf8');
        }
    };
}

function createDatedLogPath(logPath: string, timestamp: string): string {
    const extension = extname(logPath);
    const fileName = basename(logPath, extension);
    return join(dirname(logPath), `${fileName}-${formatSystemTraceDate(timestamp)}${extension}`);
}
