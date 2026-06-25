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
    const tokenLine = summary.totalTokens > 0 ? `Token：${formatTokenCount(summary.totalTokens)}` : 'Token：N/A';
    const chargedLine = `费用：$${(summary.chargedCents / 100).toFixed(2)}`;
    return ['Cursor Token 用量', `时间范围：${summary.startDate} 至 ${summary.endDate}`, `记录数：${summary.recordsCount}`, tokenLine, chargedLine].join('\n');
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
