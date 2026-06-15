export type CursorUsageQuery = {
    startDate: string;
    endDate: string;
};

export type CursorTokenUsageSummary = CursorUsageQuery & {
    recordsCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
};

export function formatCursorTokenUsageSummary(summary: CursorTokenUsageSummary): string {
    const totalTokens = summary.inputTokens + summary.outputTokens + summary.cacheReadTokens;
    return [
        'Cursor Token 用量',
        `时间范围：${summary.startDate} 至 ${summary.endDate}`,
        `记录数：${formatNumber(summary.recordsCount)}`,
        `输入 Tokens：${formatNumber(summary.inputTokens)}`,
        `输出 Tokens：${formatNumber(summary.outputTokens)}`,
        `缓存读取 Tokens：${formatNumber(summary.cacheReadTokens)}`,
        `合计 Tokens：${formatNumber(totalTokens)}`
    ].join('\n');
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(Math.trunc(value));
}
