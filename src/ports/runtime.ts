export type Logger = Pick<typeof console, 'error' | 'info'>;

export type DedupStore = {
    remember: (id: string) => boolean;
};

export type JobQueue = {
    add: (job: () => Promise<void>) => void;
    drain: () => Promise<void>;
};
