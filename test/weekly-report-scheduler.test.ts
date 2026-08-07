import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getNextFridayAtLocalTime, startWeeklyReportScheduler } from '../src/app/weekly-report-scheduler.ts';

function localDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
    return new Date(year, month - 1, day, hour, minute, second);
}

function assertSameLocalTime(actual: Date, expected: Date): void {
    assert.equal(actual.getFullYear(), expected.getFullYear());
    assert.equal(actual.getMonth(), expected.getMonth());
    assert.equal(actual.getDate(), expected.getDate());
    assert.equal(actual.getHours(), expected.getHours());
    assert.equal(actual.getMinutes(), expected.getMinutes());
    assert.equal(actual.getSeconds(), 0);
    assert.equal(actual.getMilliseconds(), 0);
}

describe('getNextFridayAtLocalTime', () => {
    it('returns next-day Friday 18:00 when from is Thursday', () => {
        const from = localDate(2026, 8, 6, 12, 0);
        const next = getNextFridayAtLocalTime(from, 18, 0);
        assertSameLocalTime(next, localDate(2026, 8, 7, 18, 0));
    });

    it('returns same-day 18:00 when from is Friday before target time', () => {
        const from = localDate(2026, 8, 7, 17, 0);
        const next = getNextFridayAtLocalTime(from, 18, 0);
        assertSameLocalTime(next, localDate(2026, 8, 7, 18, 0));
    });

    it('returns next Friday 18:00 when from is Friday after target time', () => {
        const from = localDate(2026, 8, 7, 19, 0);
        const next = getNextFridayAtLocalTime(from, 18, 0);
        assertSameLocalTime(next, localDate(2026, 8, 14, 18, 0));
    });

    it('returns next Friday 18:00 when from is Friday exactly at target time', () => {
        const from = localDate(2026, 8, 7, 18, 0);
        const next = getNextFridayAtLocalTime(from, 18, 0);
        assertSameLocalTime(next, localDate(2026, 8, 14, 18, 0));
    });
});

describe('startWeeklyReportScheduler', () => {
    it('schedules run at the computed delay and reschedules after completion', async () => {
        const nowValues = [localDate(2026, 8, 6, 12, 0)];
        const delays: number[] = [];
        const callbacks: Array<() => void> = [];
        let runCount = 0;

        const scheduler = startWeeklyReportScheduler({
            hour: 18,
            minute: 0,
            now: () => nowValues[0]!,
            setTimeoutFn: ((callback, delay) => {
                delays.push(delay as number);
                callbacks.push(callback as () => void);
                return delays.length as unknown as ReturnType<typeof setTimeout>;
            }) as typeof setTimeout,
            clearTimeoutFn: () => {},
            run: async () => {
                runCount += 1;
            }
        });

        assert.equal(delays.length, 1);
        assert.equal(delays[0], 30 * 60 * 60 * 1000);

        await callbacks[0]!();
        assert.equal(runCount, 1);
        assert.equal(delays.length, 2);
        assert.equal(callbacks.length, 2);

        scheduler.stop();
    });

    it('logs run errors without stopping the reschedule chain', async () => {
        const errors: unknown[] = [];
        const callbacks: Array<() => void> = [];

        const scheduler = startWeeklyReportScheduler({
            hour: 18,
            minute: 0,
            now: () => localDate(2026, 8, 7, 17, 0),
            setTimeoutFn: (callback => {
                callbacks.push(callback as () => void);
                return callbacks.length as unknown as ReturnType<typeof setTimeout>;
            }) as typeof setTimeout,
            clearTimeoutFn: () => {},
            logger: {
                info: () => {},
                warn: () => {},
                error: (_message, error) => {
                    errors.push(error);
                }
            },
            run: async () => {
                throw new Error('scheduler run failed');
            }
        });

        await callbacks[0]!();

        assert.equal(errors.length, 1);
        assert.equal((errors[0] as Error).message, 'scheduler run failed');
        assert.equal(callbacks.length, 2);

        scheduler.stop();
    });

    it('stop clears the pending timeout', () => {
        const cleared: number[] = [];

        const scheduler = startWeeklyReportScheduler({
            hour: 18,
            minute: 0,
            now: () => localDate(2026, 8, 6, 12, 0),
            setTimeoutFn: (() => 42 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout,
            clearTimeoutFn: id => {
                cleared.push(id as number);
            },
            run: async () => {}
        });

        scheduler.stop();

        assert.deepEqual(cleared, [42]);
    });
});
