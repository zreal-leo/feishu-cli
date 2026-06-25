import type { CursorTokenUsageSummary, CursorUsageQuery } from '../../core/cursor-usage.ts';
import type { CursorUsageGateway } from '../../ports/cursor-usage.ts';

type FetchLike = typeof fetch;

export type CursorUsageClientConfig = {
    baseUrl: string;
    cookie?: string;
    pageSize: number;
    teamId?: number;
    userId?: number;
};

type CursorUsageEvent = {
    chargedCents?: number;
    cursorTokenFee?: number;
    tokenUsage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        totalCents?: number;
    };
};

type CursorUsageApiResponse = {
    totalUsageEventsCount?: number;
    usageEventsDisplay?: CursorUsageEvent[];
};

export function createCursorUsageClient(config: CursorUsageClientConfig, fetchImpl: FetchLike = fetch): CursorUsageGateway {
    return {
        async getUsageSummary(query) {
            const requestConfig = requireCursorUsageRequestConfig(config);
            let page = 1;
            let totalUsageEventsCount = 0;
            const summary: CursorTokenUsageSummary = {
                startDate: query.startDate,
                endDate: query.endDate,
                recordsCount: 0,
                totalTokens: 0,
                chargedCents: 0
            };

            do {
                const body = await fetchUsagePage(requestConfig, query, page, fetchImpl);
                totalUsageEventsCount = normalizeCount(body.totalUsageEventsCount);
                for (const event of body.usageEventsDisplay ?? []) {
                    summary.totalTokens +=
                        normalizeNumber(event.tokenUsage?.inputTokens) + normalizeNumber(event.tokenUsage?.outputTokens) + normalizeNumber(event.tokenUsage?.cacheReadTokens) + normalizeNumber(event.tokenUsage?.cacheWriteTokens);
                    summary.chargedCents += resolveEventChargedCents(event);
                }

                page += 1;
            } while (totalUsageEventsCount > (page - 1) * config.pageSize);

            summary.recordsCount = totalUsageEventsCount;
            return summary;
        }
    };
}

type CursorUsageRequestConfig = Required<CursorUsageClientConfig>;

function requireCursorUsageRequestConfig(config: CursorUsageClientConfig): CursorUsageRequestConfig {
    const missing: string[] = [];
    if (!config.cookie) {
        missing.push('CURSOR_USAGE_COOKIE');
    }
    if (!config.teamId) {
        missing.push('CURSOR_USAGE_TEAM_ID');
    }
    if (!config.userId) {
        missing.push('CURSOR_USAGE_USER_ID');
    }

    if (missing.length > 0) {
        throw new Error(`缺少 Cursor 用量查询配置：${missing.join('、')}`);
    }

    return config as CursorUsageRequestConfig;
}

async function fetchUsagePage(config: CursorUsageRequestConfig, query: CursorUsageQuery, page: number, fetchImpl: FetchLike): Promise<CursorUsageApiResponse> {
    const response = await fetchImpl(joinUrl(config.baseUrl, '/api/dashboard/get-filtered-usage-events'), {
        method: 'POST',
        headers: {
            accept: '*/*',
            'content-type': 'application/json',
            cookie: config.cookie,
            origin: config.baseUrl,
            referer: `${config.baseUrl}/cn/dashboard/usage?from=${query.startDate}&to=${query.endDate}`
        },
        body: JSON.stringify({
            teamId: config.teamId,
            startDate: String(toStartOfDayMs(query.startDate)),
            endDate: String(toEndOfDayMs(query.endDate)),
            userId: config.userId,
            page,
            pageSize: config.pageSize
        })
    });

    if (!response.ok) {
        throw new Error(`Cursor 用量查询失败：HTTP ${response.status}`);
    }

    const body = (await response.json()) as CursorUsageApiResponse;
    if (!Array.isArray(body.usageEventsDisplay)) {
        throw new Error('Cursor 用量查询失败：响应缺少 usageEventsDisplay。');
    }

    return body;
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/u, '')}${path}`;
}

function toStartOfDayMs(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function toEndOfDayMs(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function resolveEventChargedCents(event: CursorUsageEvent): number {
    if (typeof event.chargedCents === 'number' && Number.isFinite(event.chargedCents)) {
        return Math.round(event.chargedCents);
    }

    return Math.round(normalizeNumber(event.tokenUsage?.totalCents) + normalizeNumber(event.cursorTokenFee));
}

function normalizeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeCount(value: unknown): number {
    return Math.max(0, Math.trunc(normalizeNumber(value)));
}
