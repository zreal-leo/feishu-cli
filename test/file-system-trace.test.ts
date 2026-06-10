import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { createFileSystemTraceCollector } from '../src/adapters/file-system-trace.ts';
import type { SystemTraceRecord } from '../src/system-trace.ts';

describe('createFileSystemTraceCollector', () => {
    it('creates a date-stamped log file and appends one NDJSON record per trace', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-trace-'));
        const logPath = join(directory, 'nested', 'system-trace.ndjson');
        const collector = createFileSystemTraceCollector({ logPath });
        const baseTrace: SystemTraceRecord = {
            timestamp: '2026-06-09T10:32:44',
            chatId: 'chat_1',
            messageId: 'om_1',
            input: { text: '完整输入' },
            output: { type: 'text', text: '完整输出' },
            status: 'success',
            steps: [{ name: 'reply.send', durationMs: 12, elapsedMs: 34 }]
        };

        await collector.record(baseTrace);
        await collector.record({
            ...baseTrace,
            messageId: 'om_2',
            status: 'error',
            error: { name: 'Error', message: '失败' }
        });

        const dateLogPath = join(directory, 'nested', 'system-trace-2026-06-09.ndjson');
        const lines = (await readFile(dateLogPath, 'utf8')).trim().split('\n');
        assert.equal(lines.length, 2);
        assert.deepEqual(JSON.parse(lines[0] ?? ''), {
            ...baseTrace,
            timestamp: '10:32:44'
        });
        assert.equal(JSON.parse(lines[1] ?? '').error.message, '失败');
    });

    it('writes traces from different dates to different log files', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-trace-'));
        const logPath = join(directory, 'nested', 'system-trace.ndjson');
        const collector = createFileSystemTraceCollector({ logPath });
        const baseTrace: SystemTraceRecord = {
            timestamp: '2026-06-09T10:32:44',
            chatId: 'chat_1',
            messageId: 'om_1',
            input: { text: '输入' },
            status: 'success',
            steps: []
        };

        await collector.record(baseTrace);
        await collector.record({
            ...baseTrace,
            timestamp: '2026-06-10T08:01:02',
            messageId: 'om_2'
        });

        const firstDayLines = (await readFile(join(directory, 'nested', 'system-trace-2026-06-09.ndjson'), 'utf8')).trim().split('\n');
        const secondDayLines = (await readFile(join(directory, 'nested', 'system-trace-2026-06-10.ndjson'), 'utf8')).trim().split('\n');

        assert.equal(firstDayLines.length, 1);
        assert.equal(secondDayLines.length, 1);
        assert.equal(JSON.parse(firstDayLines[0] ?? '').timestamp, '10:32:44');
        assert.equal(JSON.parse(secondDayLines[0] ?? '').timestamp, '08:01:02');
    });
});
