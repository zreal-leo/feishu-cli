import 'dotenv/config';

import { DEFAULT_CONFIG } from './default-config.ts';

type Config = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
    managerMeeting: ManagerMeetingConfig;
};

export type ManagerMeetingConfig = {
    env: 'test';
    baseUrl: string;
    loginName?: string;
    password?: string;
};

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function loadConfig(): Config {
    return {
        cursorApiKey: requireEnv('CURSOR_API_KEY'),
        cursorModel: DEFAULT_CONFIG.cursorModel,
        feishuAppId: requireEnv('FEISHU_APP_ID'),
        feishuAppSecret: requireEnv('FEISHU_APP_SECRET'),
        feishuEncryptKey: process.env.FEISHU_ENCRYPT_KEY?.trim() || undefined,
        managerMeeting: {
            env: DEFAULT_CONFIG.managerMeeting.env,
            baseUrl: DEFAULT_CONFIG.managerMeeting.baseUrl,
            loginName: process.env.MANAGER_LOGIN_NAME?.trim() || undefined,
            password: process.env.MANAGER_PASSWORD?.trim() || undefined
        }
    };
}
