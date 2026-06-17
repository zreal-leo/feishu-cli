import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSegmentTimer } from '../src/shared/timing.ts';

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
