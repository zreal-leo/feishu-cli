import type { SystemTraceRecord } from '../core/system-trace.ts';

export type SystemTraceCollector = {
    record: (trace: SystemTraceRecord) => Promise<void> | void;
};
