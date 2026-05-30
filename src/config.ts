import 'dotenv/config';

import type { ManagerEnvironment } from './manager-meeting.js';

type Config = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
    managerEnv: ManagerEnvironment;
    managerToken?: string;
    managerLoginName?: string;
    managerPassword?: string;
    managerLoginId?: string;
    managerCode?: string;
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
        cursorModel: process.env.CURSOR_MODEL?.trim() || 'composer-2.5',
        feishuAppId: requireEnv('FEISHU_APP_ID'),
        feishuAppSecret: requireEnv('FEISHU_APP_SECRET'),
        feishuEncryptKey: process.env.FEISHU_ENCRYPT_KEY?.trim() || undefined,
        managerEnv: process.env.ENV?.trim() === 'prod' ? 'prod' : 'test',
        managerToken: process.env.MANAGER_TOKEN?.trim() || undefined,
        managerLoginName: process.env.MANAGER_LOGIN_NAME?.trim() || undefined,
        managerPassword: process.env.MANAGER_PASSWORD?.trim() || undefined,
        managerLoginId: process.env.MANAGER_LOGIN_ID?.trim() || undefined,
        managerCode: process.env.MANAGER_CODE?.trim() || undefined
    };
}
