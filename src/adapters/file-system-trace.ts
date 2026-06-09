import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { SystemTraceCollector } from '../ports/runtime.ts';
import { serializeSystemTraceRecord } from '../system-trace.ts';

export function createFileSystemTraceCollector(options: { logPath: string }): SystemTraceCollector {
    return {
        async record(trace) {
            await mkdir(dirname(options.logPath), { recursive: true });
            await appendFile(options.logPath, serializeSystemTraceRecord(trace), 'utf8');
        }
    };
}
