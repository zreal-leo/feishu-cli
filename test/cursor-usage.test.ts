import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCursorUsageClient } from '../src/adapters/cursor/cursor-usage.ts';
import type { CursorUsageConfig } from '../src/config.ts';
import { formatCursorTokenUsageSummary } from '../src/core/cursor-usage.ts';

function createTestConfig(overrides: Partial<CursorUsageConfig> = {}): CursorUsageConfig {
    return {
        baseUrl: 'https://cursor.com',
        cookie: 'WorkosCursorSessionToken=session',
        teamId: 11326557,
        userId: 208513979,
        pageSize: 100,
        ...overrides
    };
}

describe('createCursorUsageClient', () => {
    it('validates optional credentials only when token usage is queried', async () => {
        let fetchCalled = false;
        const fetchImpl = (async () => {
            fetchCalled = true;
            return new Response('{}', { status: 200 });
        }) as typeof fetch;

        await assert.rejects(
            () =>
                createCursorUsageClient(createTestConfig({ cookie: undefined, teamId: undefined, userId: undefined }), fetchImpl).getUsageSummary({
                    startDate: '2026-05-06',
                    endDate: '2026-06-04'
                }),
            /缺少 Cursor 用量查询配置：CURSOR_USAGE_COOKIE、CURSOR_USAGE_TEAM_ID、CURSOR_USAGE_USER_ID/
        );
        assert.equal(fetchCalled, false);
    });

    it('fetches one usage page and sums token fields except totalCents', async () => {
        let requestedUrl = '';
        let requestInit: RequestInit | undefined;
        const fetchImpl = (async (input, init) => {
            requestedUrl = String(input);
            requestInit = init;
            return new Response(
                JSON.stringify({
                    totalUsageEventsCount: 2,
                    usageEventsDisplay: [
                        {
                            tokenUsage: {
                                inputTokens: 2898,
                                outputTokens: 83,
                                cacheReadTokens: 7364,
                                totalCents: 1.3621000051498413
                            }
                        },
                        {
                            tokenUsage: {
                                inputTokens: 100,
                                outputTokens: 20,
                                cacheReadTokens: 300,
                                totalCents: 99
                            }
                        }
                    ]
                }),
                { status: 200 }
            );
        }) as typeof fetch;

        const summary = await createCursorUsageClient(createTestConfig(), fetchImpl).getUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04'
        });

        assert.deepEqual(summary, {
            startDate: '2026-05-06',
            endDate: '2026-06-04',
            recordsCount: 2,
            inputTokens: 2998,
            outputTokens: 103,
            cacheReadTokens: 7664
        });
        assert.equal(requestedUrl, 'https://cursor.com/api/dashboard/get-filtered-usage-events');
        assert.equal(requestInit?.method, 'POST');
        assert.deepEqual(requestInit?.headers, {
            accept: '*/*',
            'content-type': 'application/json',
            cookie: 'WorkosCursorSessionToken=session',
            origin: 'https://cursor.com',
            referer: 'https://cursor.com/cn/dashboard/usage?from=2026-05-06&to=2026-06-04'
        });
        assert.deepEqual(JSON.parse(String(requestInit?.body)), {
            teamId: 11326557,
            startDate: String(new Date(2026, 4, 6, 0, 0, 0, 0).getTime()),
            endDate: String(new Date(2026, 5, 4, 23, 59, 59, 999).getTime()),
            userId: 208513979,
            page: 1,
            pageSize: 100
        });
    });

    it('keeps fetching pages until totalUsageEventsCount is covered', async () => {
        const requestedBodies: unknown[] = [];
        const fetchImpl = (async (_input, init) => {
            const body = JSON.parse(String(init?.body));
            requestedBodies.push(body);
            if (body.page === 1) {
                return new Response(
                    JSON.stringify({
                        totalUsageEventsCount: 3,
                        usageEventsDisplay: [{ tokenUsage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, totalCents: 1 } }, { tokenUsage: { inputTokens: 4, outputTokens: 5, cacheReadTokens: 6, totalCents: 1 } }]
                    }),
                    { status: 200 }
                );
            }

            return new Response(
                JSON.stringify({
                    totalUsageEventsCount: 3,
                    usageEventsDisplay: [{ tokenUsage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, totalCents: 1 } }]
                }),
                { status: 200 }
            );
        }) as typeof fetch;

        const summary = await createCursorUsageClient(createTestConfig({ pageSize: 2 }), fetchImpl).getUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04'
        });

        assert.deepEqual(
            requestedBodies.map(body => (body as { page: number }).page),
            [1, 2]
        );
        assert.deepEqual(summary, {
            startDate: '2026-05-06',
            endDate: '2026-06-04',
            recordsCount: 3,
            inputTokens: 12,
            outputTokens: 15,
            cacheReadTokens: 18
        });
    });

    it('throws a readable error when the Cursor API returns a non-2xx response', async () => {
        const fetchImpl = (async () => new Response('Unauthorized', { status: 401 })) as typeof fetch;

        await assert.rejects(
            () =>
                createCursorUsageClient(createTestConfig(), fetchImpl).getUsageSummary({
                    startDate: '2026-05-06',
                    endDate: '2026-06-04'
                }),
            /Cursor 用量查询失败：HTTP 401/
        );
    });
});

describe('formatCursorTokenUsageSummary', () => {
    it('formats token counts in yi and wan units while dropping sub-wan remainders', () => {
        const text = formatCursorTokenUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04',
            recordsCount: 2,
            inputTokens: 123456789,
            outputTokens: 100009999,
            cacheReadTokens: 9999
        });

        assert.equal(text, ['Cursor Token 用量', '时间范围：2026-05-06 至 2026-06-04', '记录数：2', '输入 Tokens：1亿2345万', '输出 Tokens：1亿', '缓存读取 Tokens：0', '合计 Tokens：2亿2347万'].join('\n'));
    });
});
