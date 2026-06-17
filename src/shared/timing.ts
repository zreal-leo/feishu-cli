export type SegmentTiming = {
    segmentMs: number;
    totalMs: number;
};

export function createSegmentTimer(now: () => number = () => performance.now()): {
    mark: () => SegmentTiming;
} {
    const startedAt = now();
    let previousAt = startedAt;

    return {
        mark() {
            const currentAt = now();
            const segmentMs = Math.max(0, currentAt - previousAt);
            const totalMs = Math.max(0, currentAt - startedAt);
            previousAt = currentAt;

            return { segmentMs, totalMs };
        }
    };
}
