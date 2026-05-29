import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSegmentTimer, formatDurationMs } from '../src/timing.js';

describe('formatDurationMs', () => {
    it('rounds elapsed milliseconds for logs', () => {
        assert.equal(formatDurationMs(12.4), '12ms');
        assert.equal(formatDurationMs(12.5), '13ms');
    });
});

describe('createSegmentTimer', () => {
    it('reports segment and total elapsed milliseconds', () => {
        const timestamps = [100, 175, 260];
        const timer = createSegmentTimer(() => timestamps.shift() ?? 260);

        assert.deepEqual(timer.mark(), {
            segmentMs: 75,
            totalMs: 75
        });
        assert.deepEqual(timer.mark(), {
            segmentMs: 85,
            totalMs: 160
        });
    });
});
