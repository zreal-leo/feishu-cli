import 'dotenv/config';

import { DEFAULT_CONFIG } from './default-config.ts';

type Config = {
    cursorApiKey: string;
    cursorModel: string;
    larkAppId: string;
    larkAppSecret: string;
    larkEncryptKey?: string;
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
        larkAppId: requireEnv('LARK_APP_ID'),
        larkAppSecret: requireEnv('LARK_APP_SECRET'),
        larkEncryptKey: process.env.LARK_ENCRYPT_KEY?.trim() || undefined,
        managerMeeting: {
            env: DEFAULT_CONFIG.managerMeeting.env,
            baseUrl: DEFAULT_CONFIG.managerMeeting.baseUrl,
            loginName: process.env.MANAGER_LOGIN_NAME?.trim() || undefined,
            password: process.env.MANAGER_PASSWORD?.trim() || undefined
        }
    };
}
