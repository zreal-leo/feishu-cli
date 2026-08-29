type SchedulerLogger = {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
};

export type WeeklyReportSchedulerOptions = {
    hour: number;
    minute: number;
    run: () => Promise<void>;
    now?: () => Date;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
    logger?: SchedulerLogger;
};

export function getNextFridayAtLocalTime(from: Date, hour: number, minute: number): Date {
    const day = from.getDay();
    const currentMinutes = from.getHours() * 60 + from.getMinutes();
    const targetMinutes = hour * 60 + minute;

    let daysUntilFriday: number;
    if (day === 5) {
        daysUntilFriday = currentMinutes >= targetMinutes ? 7 : 0;
    } else {
        daysUntilFriday = (5 - day + 7) % 7;
    }

    const next = new Date(from);
    next.setDate(from.getDate() + daysUntilFriday);
    next.setHours(hour, minute, 0, 0);
    return next;
}

export function startWeeklyReportScheduler(options: WeeklyReportSchedulerOptions): { stop(): void } {
    const now = options.now ?? (() => new Date());
    const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    const logger = options.logger ?? console;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const scheduleNext = () => {
        if (stopped) {
            return;
        }

        const from = now();
        const next = getNextFridayAtLocalTime(from, options.hour, options.minute);
        const delay = next.getTime() - from.getTime();

        timeoutId = setTimeoutFn(() => {
            void (async () => {
                try {
                    await options.run();
                } catch (error) {
                    logger.error('[weekly-report-scheduler] run failed', error);
                }
                scheduleNext();
            })();
        }, delay);
    };

    scheduleNext();

    return {
        stop() {
            stopped = true;
            if (timeoutId !== undefined) {
                clearTimeoutFn(timeoutId);
                timeoutId = undefined;
            }
        }
    };
}
