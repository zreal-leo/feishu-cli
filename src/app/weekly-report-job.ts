import { EMPTY_WEEKLY_REPORT_TEXT, buildWeeklyReportPrompt } from '../core/weekly-commit.ts';
import { formatWeeklyCommitFileName, getWeekRangeLabels } from '../core/weekly-commit-week.ts';
import type { WeeklyCommitStore } from '../ports/weekly-commit-store.ts';
import type { WeeklyReportGenerator } from '../ports/weekly-report.ts';

type JobLogger = {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
};

export type WeeklyReportJobOptions = {
    store: WeeklyCommitStore;
    generator: WeeklyReportGenerator;
    sendText: (chatId: string, text: string) => Promise<void>;
    chatId: string;
    now?: () => Date;
    logger?: JobLogger;
};

export function createWeeklyReportJob(options: WeeklyReportJobOptions): { run(): Promise<void> } {
    const now = options.now ?? (() => new Date());
    const logger = options.logger ?? console;

    return {
        async run() {
            try {
                const date = now();
                const fileName = formatWeeklyCommitFileName(date);
                const { entries } = await options.store.listCommitsForWeekFile(fileName);

                if (entries.length === 0) {
                    await options.sendText(options.chatId, EMPTY_WEEKLY_REPORT_TEXT);
                    return;
                }

                const { sunday, saturday } = getWeekRangeLabels(date);
                const prompt = buildWeeklyReportPrompt({
                    weekFileName: fileName,
                    sunday,
                    saturday,
                    entries
                });
                const text = await options.generator.generate(prompt);
                await options.sendText(options.chatId, text);
            } catch (error) {
                logger.error('[weekly-report-job] run failed', error);
            }
        }
    };
}
