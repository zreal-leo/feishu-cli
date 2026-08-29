import type { WeeklyCommitEntry } from '../core/weekly-commit.ts';

export type WeeklyCommitStore = {
    listCommitsForWeekFile: (fileName: string) => Promise<{
        entries: WeeklyCommitEntry[];
        skippedLines: number;
        missing: boolean;
    }>;
};
