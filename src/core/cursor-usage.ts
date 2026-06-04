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
        `输入 Tokens：${formatTokenCount(summary.inputTokens)}`,
        `输出 Tokens：${formatTokenCount(summary.outputTokens)}`,
        `缓存读取 Tokens：${formatTokenCount(summary.cacheReadTokens)}`,
        `合计 Tokens：${formatTokenCount(totalTokens)}`
    ].join('\n');
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function formatTokenCount(value: number): string {
    const integerValue = Math.trunc(value);
    const yi = Math.floor(integerValue / 100_000_000);
    const wan = Math.floor(integerValue / 10_000) % 10_000;

    if (yi > 0) {
        return wan > 0 ? `${yi}亿${wan}万` : `${yi}亿`;
    }

    return wan > 0 ? `${wan}万` : '0';
}
