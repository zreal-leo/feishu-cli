import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_WEEKLY_REPORT_TEXT, buildWeeklyReportPrompt, groupWeeklyCommitsByProject, parseWeeklyCommitNdjson } from '../src/core/weekly-commit.ts';

describe('weekly-commit', () => {
    it('parses valid lines, skips bad lines, and groups by project', () => {
        const text = [
            JSON.stringify({
                timestamp: '2026-08-07T10:00:00+08:00',
                project: 'alpha',
                projectPath: 'e:\\a',
                hash: 'aaa',
                branch: 'main',
                subject: 'feat: a',
                body: ''
            }),
            '{not-json}',
            JSON.stringify({
                timestamp: '2026-08-07T11:00:00+08:00',
                project: 'beta',
                projectPath: 'e:\\b',
                hash: 'bbb',
                branch: 'main',
                subject: 'fix: b',
                body: '详情'
            }),
            ''
        ].join('\n');

        const parsed = parseWeeklyCommitNdjson(text);
        assert.equal(parsed.entries.length, 2);
        assert.equal(parsed.skippedLines, 1);
        const grouped = groupWeeklyCommitsByProject(parsed.entries);
        assert.deepEqual([...grouped.keys()], ['alpha', 'beta']);
    });

    it('parses NDJSON when the first line is prefixed with a UTF-8 BOM', () => {
        const line = JSON.stringify({
            timestamp: '2026-08-07T10:00:00+08:00',
            project: 'alpha',
            projectPath: 'e:\\a',
            hash: 'aaa',
            branch: 'main',
            subject: 'feat: a',
            body: ''
        });
        const parsed = parseWeeklyCommitNdjson(`\uFEFF${line}\n`);
        assert.equal(parsed.entries.length, 1);
        assert.equal(parsed.skippedLines, 0);
        assert.equal(parsed.entries[0]?.subject, 'feat: a');
    });

    it('builds a prompt that asks for excerpts plus short summary per project', () => {
        const prompt = buildWeeklyReportPrompt({
            weekFileName: '2026-August-W1.ndjson',
            sunday: '2026-08-02',
            saturday: '2026-08-08',
            entries: [
                {
                    timestamp: '2026-08-07T10:00:00+08:00',
                    project: 'alpha',
                    projectPath: 'e:\\a',
                    hash: 'aaa',
                    branch: 'main',
                    subject: 'feat: a',
                    body: ''
                },
                {
                    timestamp: '2026-08-07T11:00:00+08:00',
                    project: 'beta',
                    projectPath: 'e:\\b',
                    hash: 'bbb',
                    branch: 'main',
                    subject: 'fix: b',
                    body: '详情'
                }
            ]
        });
        assert.match(prompt, /2026-08-02/);
        assert.match(prompt, /alpha/);
        assert.match(prompt, /aaa feat: a/);
        assert.match(prompt, /beta/);
        assert.match(prompt, /bbb fix: b/);
        assert.match(prompt, /详情/);
        assert.match(prompt, /摘录/);
        assert.match(prompt, /总结/);
        assert.doesNotMatch(prompt, /projectPath/);
        assert.doesNotMatch(prompt, /e:\\\\a/);
    });

    it('exports empty-week copy', () => {
        assert.equal(EMPTY_WEEKLY_REPORT_TEXT, '本周无提交记录');
    });
});
