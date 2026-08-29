import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { createFileSystemWeeklyCommitStore } from '../src/adapters/file-system-weekly-commit-store.ts';

describe('createFileSystemWeeklyCommitStore', () => {
    it('reads and parses an existing week file', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-weekly-'));
        const fileName = '2026-August-W1.ndjson';
        const entry = {
            timestamp: '2026-08-07T10:00:00+08:00',
            project: 'alpha',
            projectPath: 'e:\\a',
            hash: 'aaa',
            branch: 'main',
            subject: 'feat: a',
            body: ''
        };
        await writeFile(join(directory, fileName), `${JSON.stringify(entry)}\n`, 'utf8');

        const store = createFileSystemWeeklyCommitStore({ directory });
        const result = await store.listCommitsForWeekFile(fileName);

        assert.equal(result.missing, false);
        assert.equal(result.entries.length, 1);
        assert.deepEqual(result.entries[0], entry);
        assert.equal(result.skippedLines, 0);
    });

    it('warns when invalid lines are skipped', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-weekly-'));
        const fileName = '2026-August-W1.ndjson';
        const entry = {
            timestamp: '2026-08-07T10:00:00+08:00',
            project: 'alpha',
            projectPath: 'e:\\a',
            hash: 'aaa',
            branch: 'main',
            subject: 'feat: a',
            body: ''
        };
        await writeFile(join(directory, fileName), `${JSON.stringify(entry)}\n{not-json}\n`, 'utf8');

        const warnings: string[] = [];
        const store = createFileSystemWeeklyCommitStore({
            directory,
            logger: { warn: message => warnings.push(message) }
        });
        const result = await store.listCommitsForWeekFile(fileName);

        assert.equal(result.entries.length, 1);
        assert.equal(result.skippedLines, 1);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0]!, /skipped 1 invalid lines/);
    });

    it('returns empty result when the week file is missing', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-weekly-'));
        const store = createFileSystemWeeklyCommitStore({ directory });

        const result = await store.listCommitsForWeekFile('missing.ndjson');

        assert.equal(result.missing, true);
        assert.deepEqual(result.entries, []);
        assert.equal(result.skippedLines, 0);
    });
});
