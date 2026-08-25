import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    EMPTY_WEEKLY_REPORT_TEXT,
    buildWeeklyReportPrompt,
    groupWeeklyCommitsByProject,
    groupWeeklyCommitsByRequirement,
    parseWeeklyCommitNdjson
} from '../src/core/weekly-commit.ts';

function entry(overrides: Partial<{
    timestamp: string;
    project: string;
    projectPath: string;
    hash: string;
    branch: string;
    subject: string;
    body: string;
}>): {
    timestamp: string;
    project: string;
    projectPath: string;
    hash: string;
    branch: string;
    subject: string;
    body: string;
} {
    return {
        timestamp: '2026-08-13T10:00:00+08:00',
        project: 'alpha',
        projectPath: 'e:\\a',
        hash: 'aaa',
        branch: 'main',
        subject: 'feat: a',
        body: '',
        ...overrides
    };
}

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

    it('groups commits by story URL or branch id and titles unlinked work from the subject', () => {
        const grouped = groupWeeklyCommitsByRequirement([
            entry({
                hash: 'url1',
                project: 'brm',
                branch: 'feature-7068122779-路演-路演通知分身参会',
                subject: 'feat(roadshow): 预约提醒支持分身参会',
                body: '路演分身参会：https://project.feishu.cn/brm/story/detail/7068122779'
            }),
            entry({
                hash: 'url2',
                project: 'portal',
                branch: 'feature-7068122779-路演-路演通知分身参会',
                subject: 'feat(reminder): 路演日程提醒支持分身参会',
                body: '路演通知分身参会：https://project.feishu.cn/brm/story/detail/7068122779'
            }),
            entry({
                hash: 'branch1',
                project: 'mobile',
                branch: 'feature-7065290750-路演-专题推广',
                subject: 'feat(roadshow): 路演详情增加专题推广',
                body: ''
            }),
            entry({
                hash: 'slash1',
                project: 'portal',
                branch: 'feature/7070245081/workbuddy-entry',
                subject: 'fix: WorkBuddy 嵌入时禁用微博分享',
                body: ''
            }),
            entry({
                hash: 'none1',
                project: 'mobile',
                branch: 'August-week3',
                subject: 'feat(roadshow): 行业专家路演改用专题活动接口',
                body: ''
            })
        ]);

        assert.deepEqual(
            grouped.map(group => ({
                key: group.key,
                title: group.title,
                url: group.url,
                hashes: group.entries.map(item => item.hash),
                projects: group.entries.map(item => item.project)
            })),
            [
                {
                    key: '7068122779',
                    title: '路演分身参会',
                    url: 'https://project.feishu.cn/brm/story/detail/7068122779',
                    hashes: ['url1', 'url2'],
                    projects: ['brm', 'portal']
                },
                {
                    key: '7065290750',
                    title: '路演 专题推广',
                    url: undefined,
                    hashes: ['branch1'],
                    projects: ['mobile']
                },
                {
                    key: '7070245081',
                    title: 'WorkBuddy 嵌入时禁用微博分享',
                    url: undefined,
                    hashes: ['slash1'],
                    projects: ['portal']
                },
                {
                    key: 'unlinked:行业专家路演改用专题活动接口',
                    title: '行业专家路演改用专题活动接口',
                    url: undefined,
                    hashes: ['none1'],
                    projects: ['mobile']
                }
            ]
        );
    });

    it('builds a prompt that asks for overview plus completed items without story URLs', () => {
        const prompt = buildWeeklyReportPrompt({
            weekFileName: '2026-August-W1.ndjson',
            sunday: '2026-08-02',
            saturday: '2026-08-08',
            entries: [
                entry({
                    hash: 'url1',
                    project: 'brm',
                    branch: 'feature-7068122779-roadshow',
                    subject: 'feat(roadshow): 预约提醒支持分身参会',
                    body: '路演分身参会：https://project.feishu.cn/brm/story/detail/7068122779\n\nCo-authored-by: Cursor <cursoragent@cursor.com>'
                }),
                entry({
                    hash: 'url2',
                    project: 'portal',
                    branch: 'feature-7068122779-roadshow',
                    subject: 'feat(reminder): 路演日程提醒支持分身参会',
                    body: '路演通知分身参会：https://project.feishu.cn/brm/story/detail/7068122779'
                }),
                entry({
                    hash: 'none1',
                    project: 'mobile',
                    branch: 'main',
                    subject: 'feat: a',
                    body: '详情'
                })
            ]
        });
        assert.match(prompt, /2026-08-02/);
        assert.match(prompt, /本周工作/);
        assert.match(prompt, /本周完成/);
        assert.match(prompt, /一句话/);
        assert.match(prompt, /审阅/);
        assert.match(prompt, /不要直接输出提交信息/);
        assert.match(prompt, /不要编造下周计划/);
        assert.match(prompt, /不要输出需求(?:链接|地址)/);
        assert.match(prompt, /整合成一条列表项/);
        assert.match(prompt, /不要将全部 commit 简单罗列/);
        assert.match(prompt, /无序列表/);
        assert.match(prompt, /每条以 - 开头/);
        assert.match(prompt, /每条以【需求名称】开头/);
        assert.match(prompt, /须含中文/);
        assert.match(prompt, /不要使用纯英文/);
        assert.match(prompt, /7068122779/);
        assert.match(prompt, /路演分身参会/);
        assert.match(prompt, /涉及项目：brm、portal/);
        assert.match(prompt, /预约提醒支持分身参会/);
        assert.match(prompt, /不要写「未关联需求」/);
        assert.match(prompt, /50 字/);
        assert.match(prompt, /细小/);
        assert.match(prompt, /mobile/);
        assert.match(prompt, /详情/);
        assert.equal([...prompt.matchAll(/涉及项目：/g)].length, 2);
        assert.doesNotMatch(prompt, /https:\/\/project\.feishu\.cn/);
        assert.doesNotMatch(prompt, /链接（若有）/);
        assert.doesNotMatch(prompt, /关键提交摘录/);
        assert.doesNotMatch(prompt, /按项目分节/);
        assert.doesNotMatch(prompt, /projectPath/);
        assert.doesNotMatch(prompt, /e:\\\\a/);
        assert.doesNotMatch(prompt, /Co-authored-by/);
        assert.doesNotMatch(prompt, /\burl1\b/);
        assert.doesNotMatch(prompt, /\bnone1\b/);
        assert.doesNotMatch(prompt, /feat\(roadshow\)/);
        assert.doesNotMatch(prompt, /feat: a/);
    });

    it('exports empty-week copy', () => {
        assert.equal(EMPTY_WEEKLY_REPORT_TEXT, '本周无提交记录');
    });
});
