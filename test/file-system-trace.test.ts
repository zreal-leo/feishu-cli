import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { createFileSystemTraceCollector } from '../src/adapters/file-system-trace.ts';
import type { SystemTraceRecord } from '../src/system-trace.ts';

describe('createFileSystemTraceCollector', () => {
    it('creates the log directory and appends one NDJSON record per trace', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-trace-'));
        const logPath = join(directory, 'nested', 'system-trace.ndjson');
        const collector = createFileSystemTraceCollector({ logPath });
        const baseTrace: SystemTraceRecord = {
            timestamp: '2026-06-09T07:30:00.000Z',
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

        const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
        assert.equal(lines.length, 2);
        assert.deepEqual(JSON.parse(lines[0] ?? ''), baseTrace);
        assert.equal(JSON.parse(lines[1] ?? '').error.message, '失败');
    });
});
