import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCursorUsageClient } from '../src/adapters/cursor/cursor-usage-client.ts';
import type { CursorUsageClientConfig } from '../src/adapters/cursor/cursor-usage-client.ts';
import { formatCursorTokenUsageSummary, formatTokenCount } from '../src/core/cursor-usage.ts';

function createTestConfig(overrides: Partial<CursorUsageClientConfig> = {}): CursorUsageClientConfig {
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

    it('fetches one usage page and sums token totals and charged cents', async () => {
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
                            chargedCents: 1362,
                            tokenUsage: {
                                inputTokens: 2898,
                                outputTokens: 83,
                                cacheReadTokens: 7364,
                                cacheWriteTokens: 500,
                                totalCents: 1300
                            }
                        },
                        {
                            chargedCents: 99,
                            tokenUsage: {
                                inputTokens: 100,
                                outputTokens: 20,
                                cacheReadTokens: 300,
                                cacheWriteTokens: 50,
                                totalCents: 80
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
            totalTokens: 11315,
            chargedCents: 1461
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
                        usageEventsDisplay: [
                            { chargedCents: 100, tokenUsage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, totalCents: 90 } },
                            { chargedCents: 200, tokenUsage: { inputTokens: 4, outputTokens: 5, cacheReadTokens: 6, cacheWriteTokens: 7, totalCents: 180 } }
                        ]
                    }),
                    { status: 200 }
                );
            }

            return new Response(
                JSON.stringify({
                    totalUsageEventsCount: 3,
                    usageEventsDisplay: [{ chargedCents: 300, tokenUsage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheWriteTokens: 10, totalCents: 280 } }]
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
            totalTokens: 66,
            chargedCents: 600
        });
    });

    it('falls back to tokenUsage.totalCents plus cursorTokenFee when chargedCents is missing', async () => {
        const fetchImpl = (async () =>
            new Response(
                JSON.stringify({
                    totalUsageEventsCount: 1,
                    usageEventsDisplay: [
                        {
                            cursorTokenFee: 3.32,
                            tokenUsage: {
                                inputTokens: 3,
                                outputTokens: 20525,
                                cacheWriteTokens: 112151,
                                totalCents: 121.41
                            }
                        }
                    ]
                }),
                { status: 200 }
            )) as typeof fetch;

        const summary = await createCursorUsageClient(createTestConfig(), fetchImpl).getUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04'
        });

        assert.equal(summary.chargedCents, 125);
    });

    it('rounds the summed charged cents after accumulation', async () => {
        const fetchImpl = (async () =>
            new Response(
                JSON.stringify({
                    totalUsageEventsCount: 2,
                    usageEventsDisplay: [{ chargedCents: 50.556 }, { chargedCents: 50.556 }]
                }),
                { status: 200 }
            )) as typeof fetch;

        const summary = await createCursorUsageClient(createTestConfig(), fetchImpl).getUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04'
        });

        assert.equal(summary.chargedCents, 101);
    });

    it('matches reference usage events by summing charged cents before final rounding', async () => {
        const fetchImpl = (async () =>
            new Response(
                JSON.stringify({
                    totalUsageEventsCount: 3,
                    usageEventsDisplay: [
                        {
                            usageBasedCosts: '$0.03',
                            tokenUsage: { totalCents: 3.3828999996185303 },
                            cursorTokenFee: 0.2772749960422516,
                            chargedCents: 3.660175085067749
                        },
                        {
                            usageBasedCosts: '$0.38',
                            tokenUsage: { totalCents: 38.47526931762695 },
                            cursorTokenFee: 6.665174961090088,
                            chargedCents: 45.140445709228516
                        },
                        {
                            usageBasedCosts: '$0.04',
                            tokenUsage: { totalCents: 3.5501999855041504 },
                            cursorTokenFee: 0.27445000410079956,
                            chargedCents: 3.8246500492095947
                        }
                    ]
                }),
                { status: 200 }
            )) as typeof fetch;

        const summary = await createCursorUsageClient(createTestConfig(), fetchImpl).getUsageSummary({
            startDate: '2026-06-01',
            endDate: '2026-06-19'
        });

        assert.equal(summary.chargedCents, 53);
        assert.equal(
            formatCursorTokenUsageSummary(summary),
            ['Cursor Token 用量', '时间范围：2026-06-01 至 2026-06-19', '记录数：3', 'token : 0'].join('\n')
        );
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

describe('formatTokenCount', () => {
    it('groups digits in fours from right to left with commas', () => {
        assert.equal(formatTokenCount(0), '0');
        assert.equal(formatTokenCount(9999), '9999');
        assert.equal(formatTokenCount(10000), '1,0000');
        assert.equal(formatTokenCount(123456789), '1,2345,6789');
        assert.equal(formatTokenCount(100009999), '1,0000,9999');
    });
});

describe('formatCursorTokenUsageSummary', () => {
    it('formats token counts with comma-separated groups of four digits', () => {
        const text = formatCursorTokenUsageSummary({
            startDate: '2026-05-06',
            endDate: '2026-06-04',
            recordsCount: 2,
            totalTokens: 223481787,
            chargedCents: 123456
        } as any);

        assert.equal(text, ['Cursor Token 用量', '时间范围：2026-05-06 至 2026-06-04', '记录数：2', 'token : 2,2348,1787'].join('\n'));
    });
});
