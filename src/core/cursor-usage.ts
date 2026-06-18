export type CursorUsageQuery = {
    startDate: string;
    endDate: string;
};

export type CursorTokenUsageSummary = CursorUsageQuery & {
    recordsCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
};

export function formatCursorTokenUsageSummary(summary: CursorTokenUsageSummary): string {
    const totalTokens = summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheWriteTokens;
    return [
        'Cursor Token 用量',
        `时间范围：${summary.startDate} 至 ${summary.endDate}`,
        `记录数：${summary.recordsCount}`,
        `输入 Tokens：${formatTokenCount(summary.inputTokens)}`,
        `输出 Tokens：${formatTokenCount(summary.outputTokens)}`,
        `缓存读取 Tokens：${formatTokenCount(summary.cacheReadTokens)}`,
        `缓存写入 Tokens：${formatTokenCount(summary.cacheWriteTokens)}`,
        `合计 Tokens：${formatTokenCount(totalTokens)}`
    ].join('\n');
}

export function formatTokenCount(value: number): string {
    const digits = String(Math.trunc(value));
    if (digits.length <= 4) {
        return digits;
    }

    const parts: string[] = [];
    for (let end = digits.length; end > 0; end -= 4) {
        parts.unshift(digits.slice(Math.max(0, end - 4), end));
    }

    return parts.join(',');
}
