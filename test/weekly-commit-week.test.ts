import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWeeklyCommitFileName, getWeekOfMonthIndex, getWeekRangeLabels, getWeekSunday } from '../src/core/weekly-commit-week.ts';

function localDate(year: number, monthIndex: number, day: number): Date {
    return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

describe('weekly-commit-week', () => {
    it('maps Friday 2026-08-07 to Sunday 2026-08-02 week file 2026-August-W1.ndjson', () => {
        const d = localDate(2026, 7, 7);
        assert.equal(getWeekSunday(d).getFullYear(), 2026);
        assert.equal(getWeekSunday(d).getMonth(), 7);
        assert.equal(getWeekSunday(d).getDate(), 2);
        assert.equal(getWeekOfMonthIndex(getWeekSunday(d)), 1);
        assert.equal(formatWeeklyCommitFileName(d), '2026-August-W1.ndjson');
        assert.deepEqual(getWeekRangeLabels(d), { sunday: '2026-08-02', saturday: '2026-08-08' });
    });

    it('attributes a week to the month of its Sunday', () => {
        // 2026-08-01 is Saturday → week Sunday is 2026-07-26 → July
        const d = localDate(2026, 7, 1);
        assert.equal(formatWeeklyCommitFileName(d), '2026-July-W4.ndjson');
    });
});
