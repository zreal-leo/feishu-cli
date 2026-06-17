import 'dotenv/config';

import type { CursorUsageClientConfig } from '../adapters/cursor/cursor-usage-client.ts';
import type { ManagerMeetingConfig } from '../adapters/manager/manager-meeting.ts';
import { DEFAULT_CONFIG } from './default-config.ts';

export type SystemTraceConfig = {
    logPath: string;
};

export type Config = {
    cursorApiKey: string;
    cursorModel: string;
    cursorUsage: CursorUsageClientConfig;
    larkAppId: string;
    larkAppSecret: string;
    larkEncryptKey?: string;
    managerMeeting: ManagerMeetingConfig;
    systemTrace: SystemTraceConfig;
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

export function loadConfig(): Config {
    return {
        cursorApiKey: requireEnv('CURSOR_API_KEY'),
        cursorModel: DEFAULT_CONFIG.cursorModel,
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
        }
    };
}
