import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_WEEKLY_REPORT_TEXT } from '../src/core/weekly-commit.ts';
import { createWeeklyReportJob } from '../src/app/weekly-report-job.ts';
import type { WeeklyCommitEntry } from '../src/core/weekly-commit.ts';

const fixedNow = () => new Date(2026, 7, 7, 12, 0, 0);

const sampleEntry: WeeklyCommitEntry = {
    timestamp: '2026-08-07T10:00:00+08:00',
    project: 'alpha',
    projectPath: 'e:\\a',
    hash: 'aaa',
    branch: 'main',
    subject: 'feat: a',
    body: ''
};

describe('createWeeklyReportJob', () => {
    it('sends empty-week text without calling generator when there are no entries', async () => {
        let generatorCalled = false;
        const sent: Array<{ chatId: string; text: string }> = [];

        const job = createWeeklyReportJob({
            store: {
                listCommitsForWeekFile: async fileName => {
                    assert.equal(fileName, '2026-August-W1.ndjson');
                    return { entries: [], skippedLines: 0, missing: true };
                }
            },
            generator: {
                generate: async () => {
                    generatorCalled = true;
                    return 'should not run';
                }
            },
            sendText: async (chatId, text) => {
                sent.push({ chatId, text });
            },
            chatId: 'chat-1',
            now: fixedNow
        });

        await job.run();

        assert.equal(generatorCalled, false);
        assert.deepEqual(sent, [{ chatId: 'chat-1', text: EMPTY_WEEKLY_REPORT_TEXT }]);
    });

    it('generates a report and sends it when entries exist', async () => {
        let promptReceived = '';
        const sent: Array<{ chatId: string; text: string }> = [];

        const job = createWeeklyReportJob({
            store: {
                listCommitsForWeekFile: async () => ({
                    entries: [sampleEntry],
                    skippedLines: 0,
                    missing: false
                })
            },
            generator: {
                generate: async prompt => {
                    promptReceived = prompt;
                    return '## 周报\n内容';
                }
            },
            sendText: async (chatId, text) => {
                sent.push({ chatId, text });
            },
            chatId: 'chat-2',
            now: fixedNow
        });

        await job.run();

        assert.match(promptReceived, /2026-August-W1\.ndjson/);
        assert.match(promptReceived, /2026-08-02/);
        assert.match(promptReceived, /2026-08-08/);
        assert.match(promptReceived, /feat: a/);
        assert.deepEqual(sent, [{ chatId: 'chat-2', text: '## 周报\n内容' }]);
    });

    it('logs generator errors without rethrowing or sending', async () => {
        const errors: unknown[] = [];
        let sendCalled = false;

        const job = createWeeklyReportJob({
            store: {
                listCommitsForWeekFile: async () => ({
                    entries: [sampleEntry],
                    skippedLines: 0,
                    missing: false
                })
            },
            generator: {
                generate: async () => {
                    throw new Error('generation failed');
                }
            },
            sendText: async () => {
                sendCalled = true;
            },
            chatId: 'chat-3',
            now: fixedNow,
            logger: {
                info: () => {},
                warn: () => {},
                error: (_message, error) => {
                    errors.push(error);
                }
            }
        });

        await assert.doesNotReject(async () => job.run());

        assert.equal(sendCalled, false);
        assert.equal(errors.length, 1);
        assert.equal((errors[0] as Error).message, 'generation failed');
    });
});
