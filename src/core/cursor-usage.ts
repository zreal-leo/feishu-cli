export type CursorUsageQuery = {
    startDate: string;
    endDate: string;
};

export type CursorTokenUsageSummary = CursorUsageQuery & {
    recordsCount: number;
    totalTokens: number;
    chargedCents: number;
};

export function formatCursorTokenUsageSummary(summary: CursorTokenUsageSummary): string {
    return [
        'Cursor Token 用量',
        `时间范围：${summary.startDate} 至 ${summary.endDate}`,
        `记录数：${summary.recordsCount}`,
        `token : ${formatTokenCount(summary.totalTokens)}`
    ].join('\n');
}

function formatDollarsFromCents(chargedCents: number): string {
    const dollars = chargedCents / 100;
    return dollars.toFixed(2);
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
