import 'dotenv/config';

import type { AIEffort } from '../adapters/cursor/ai-agent.ts';
import type { CursorUsageClientConfig } from '../adapters/cursor/cursor-usage-client.ts';
import type { ManagerMeetingConfig } from '../adapters/manager/manager-meeting.ts';
import { DEFAULT_CONFIG } from './default-config.ts';

export type { AIEffort };

export type SystemTraceConfig = {
    logPath: string;
};

export type WeeklyReportConfig = {
    chatId?: string;
    hour: number;
    minute: number;
    directory: string;
};

export type Config = {
    aiApiKey: string;
    aiBaseUrl?: string;
    aiModel: string;
    aiEffort: AIEffort;
    cursorUsage: CursorUsageClientConfig;
    larkAppId: string;
    larkAppSecret: string;
    larkEncryptKey?: string;
    managerMeeting: ManagerMeetingConfig;
    systemTrace: SystemTraceConfig;
    weeklyReport: WeeklyReportConfig;
};

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function parsePositiveIntegerEnv(name: string, value: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid positive integer environment variable: ${name}`);
    }
    return parsed;
}

function parseHourEnv(name: string, value: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 23) {
        throw new Error(`Invalid hour environment variable: ${name}`);
    }
    return parsed;
}

function parseMinuteEnv(name: string, value: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 59) {
        throw new Error(`Invalid minute environment variable: ${name}`);
    }
    return parsed;
}

export function loadConfig(): Config {
    return {
        aiApiKey: requireEnv('ANTHROPIC_API_KEY'),
        aiBaseUrl: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
        aiModel: DEFAULT_CONFIG.aiModel,
        aiEffort: DEFAULT_CONFIG.aiEffort,
        cursorUsage: {
            baseUrl: DEFAULT_CONFIG.cursorUsage.baseUrl,
            cookie: process.env.CURSOR_USAGE_COOKIE?.trim() || undefined,
            pageSize: DEFAULT_CONFIG.cursorUsage.pageSize,
            teamId: process.env.CURSOR_USAGE_TEAM_ID?.trim() ? parsePositiveIntegerEnv('CURSOR_USAGE_TEAM_ID', process.env.CURSOR_USAGE_TEAM_ID.trim()) : undefined,
            userId: process.env.CURSOR_USAGE_USER_ID?.trim() ? parsePositiveIntegerEnv('CURSOR_USAGE_USER_ID', process.env.CURSOR_USAGE_USER_ID.trim()) : undefined
        },
        larkAppId: requireEnv('LARK_APP_ID'),
        larkAppSecret: requireEnv('LARK_APP_SECRET'),
        larkEncryptKey: process.env.LARK_ENCRYPT_KEY?.trim() || undefined,
        managerMeeting: {
            env: DEFAULT_CONFIG.managerMeeting.env,
            baseUrl: DEFAULT_CONFIG.managerMeeting.baseUrl,
            loginName: process.env.MANAGER_LOGIN_NAME?.trim() || undefined,
            password: process.env.MANAGER_PASSWORD?.trim() || undefined
        },
        systemTrace: {
            logPath: DEFAULT_CONFIG.systemTrace.logPath
        },
        weeklyReport: {
            chatId: process.env.WEEKLY_REPORT_CHAT_ID?.trim() || undefined,
            hour: process.env.WEEKLY_REPORT_HOUR?.trim() ? parseHourEnv('WEEKLY_REPORT_HOUR', process.env.WEEKLY_REPORT_HOUR.trim()) : DEFAULT_CONFIG.weeklyReport.hour,
            minute: process.env.WEEKLY_REPORT_MINUTE?.trim() ? parseMinuteEnv('WEEKLY_REPORT_MINUTE', process.env.WEEKLY_REPORT_MINUTE.trim()) : DEFAULT_CONFIG.weeklyReport.minute,
            directory: DEFAULT_CONFIG.weeklyReport.directory
        }
    };
}
