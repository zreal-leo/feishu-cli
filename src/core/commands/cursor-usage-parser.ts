import type { CursorUsageQuery } from '../cursor-usage.ts';

export type CursorUsageCommand = {
    type: 'cursor_usage';
    query: CursorUsageQuery;
};

export type CursorUsageParseResult =
    | {
          ok: true;
          command: CursorUsageCommand;
      }
    | {
          ok: false;
          error: string;
      };

const USAGE_HINT = '用法：cursor 或 cursor YYYY-MM-DD YYYY-MM-DD';

export function parseCursorUsageCommand(text: string, now = new Date()): CursorUsageParseResult | null {
    const match = text.trim().match(/^cursor(?:\s+(.+))?$/i);
    if (!match) {
        return null;
    }

    const body = match[1]?.trim();
    if (!body) {
        return {
            ok: true,
            command: {
                type: 'cursor_usage',
                query: getDefaultDateRange(now)
            }
        };
    }

    const parts = body.split(/\s+/).filter(Boolean);
    if (parts.length !== 2) {
        return parseError('请提供开始日期和结束日期。');
    }

    const [startDate, endDate] = parts;
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end) {
        return parseError('日期格式应为 YYYY-MM-DD。');
    }

    if (start.getTime() > end.getTime()) {
        return parseError('开始日期不能晚于结束日期。');
    }

    return {
        ok: true,
        command: {
            type: 'cursor_usage',
            query: {
                startDate,
                endDate
            }
        }
    };
}

function getDefaultDateRange(now: Date): CursorUsageQuery {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 26);

    return {
        startDate: formatDate(start),
        endDate: formatDate(end)
    };
}

function parseError(message: string): CursorUsageParseResult {
    return {
        ok: false,
        error: `查询 cursor token 失败：${message}\n${USAGE_HINT}`
    };
}

function parseDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }

    return date;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
