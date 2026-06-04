import type { DedupStore } from '../ports/runtime.ts';

export function createInMemoryDedupStore(): DedupStore {
    const seenIds = new Set<string>();

    return {
        remember(id) {
            if (seenIds.has(id)) {
                return false;
            }

            seenIds.add(id);
            return true;
        }
    };
}
