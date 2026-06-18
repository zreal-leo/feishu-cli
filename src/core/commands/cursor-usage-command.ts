import type { CursorUsageGateway } from '../../ports/cursor-usage.ts';
import { formatCursorTokenUsageSummary } from '../cursor-usage.ts';
import { runCommandTraceStep } from '../system-trace.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';
import { parseCursorUsageCommand } from './cursor-usage-parser.ts';
import type { CursorUsageParseResult } from './cursor-usage-parser.ts';

type CursorUsageCommandMatch = CommandMatch<CursorUsageParseResult>;

export type CursorUsageCommandHandlerOptions = {
    now?: () => Date;
};

export function createCursorUsageCommandHandler(usage: CursorUsageGateway, options: CursorUsageCommandHandlerOptions = {}): CommandHandler<CursorUsageCommandMatch> {
    return {
        name: 'cursor-usage',
        match(input) {
            const result = parseCursorUsageCommand(input.text, options.now?.() ?? new Date());
            return result ? { commandName: 'cursor-usage', data: result } : null;
        },
        async execute(context, match) {
            const result = match.data;
            if (!result) {
                throw new Error('Cursor token 用量命令缺少解析结果。');
            }

            if (!result.ok) {
                return {
                    type: 'text',
                    text: result.error
                };
            }

            try {
                const summary = await runCommandTraceStep(context.trace, 'usage.fetch', () => usage.getUsageSummary(result.command.query));
                return {
                    type: 'text',
                    text: formatCursorTokenUsageSummary(summary)
                };
            } catch (error) {
                return {
                    type: 'text',
                    text: `查询 Cursor Token 用量失败：${formatErrorMessage(error)}`
                };
            }
        }
    };
}

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
