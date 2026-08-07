import { readFile as defaultReadFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseWeeklyCommitNdjson } from '../core/weekly-commit.ts';
import type { WeeklyCommitStore } from '../ports/weekly-commit-store.ts';

export function createFileSystemWeeklyCommitStore(options: { directory: string; readFile?: typeof defaultReadFile; logger?: { warn(message: string): void } }): WeeklyCommitStore {
    const readFile = options.readFile ?? defaultReadFile;

    return {
        async listCommitsForWeekFile(fileName) {
            const filePath = join(options.directory, fileName);

            try {
                const text = await readFile(filePath, 'utf8');
                const { entries, skippedLines } = parseWeeklyCommitNdjson(text);

                if (skippedLines > 0 && options.logger) {
                    options.logger.warn(`[weekly-commit] skipped ${skippedLines} invalid lines in ${fileName}`);
                }

                return { entries, skippedLines, missing: false };
            } catch (error) {
                if (isMissingFileError(error)) {
                    return { entries: [], skippedLines: 0, missing: true };
                }

                throw error;
            }
        }
    };
}

function isMissingFileError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
