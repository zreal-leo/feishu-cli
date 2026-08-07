import type { AskAIOptions, AIEffort } from './cursor/ai-agent.ts';
import { askAI as defaultAskAI } from './cursor/ai-agent.ts';
import type { WeeklyReportGenerator } from '../ports/weekly-report.ts';

type AskAI = (options: AskAIOptions) => Promise<string>;

const EMPTY_WEEKLY_AI_REPORT_TEXT = '本周周报生成结果为空。';

export type AIWeeklyReportGeneratorOptions = {
    apiKey: string;
    baseURL?: string;
    model: string;
    effort?: AIEffort;
    askAI?: AskAI;
};

export function createAIWeeklyReportGenerator(options: AIWeeklyReportGeneratorOptions): WeeklyReportGenerator {
    const askAI = options.askAI ?? defaultAskAI;

    return {
        async generate(prompt: string) {
            const text = await askAI({
                apiKey: options.apiKey,
                baseURL: options.baseURL,
                model: options.model,
                effort: options.effort,
                prompt
            });

            return text.trim() || EMPTY_WEEKLY_AI_REPORT_TEXT;
        }
    };
}
