import type { JobQueue } from '../ports/runtime.ts';

export function createSerialJobQueue(): JobQueue {
    let queue: Promise<void> = Promise.resolve();

    return {
        add(job) {
            queue = queue.then(job, job);
            void queue.catch(() => undefined);
        },

        drain() {
            return queue;
        }
    };
}
