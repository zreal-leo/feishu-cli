import type { SystemTraceRecord } from '../system-trace.ts';

export type Logger = Pick<typeof console, 'error' | 'info'>;

export type SystemTraceCollector = {
    record: (trace: SystemTraceRecord) => Promise<void> | void;
};

export type ReactionGateway = {
    add: (messageId: string, emojiType: string) => Promise<{ reactionId?: string } | void>;
    remove: (messageId: string, reactionId: string) => Promise<void>;
};

export type DedupStore = {
    remember: (id: string) => boolean;
};

export type JobQueue = {
    add: (job: () => Promise<void>) => void;
    drain: () => Promise<void>;
};
