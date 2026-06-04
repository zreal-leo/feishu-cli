import type { CursorTokenUsageSummary, CursorUsageQuery } from '../core/cursor-usage.ts';

export type CursorUsageGateway = {
    getUsageSummary: (query: CursorUsageQuery) => Promise<CursorTokenUsageSummary>;
};
