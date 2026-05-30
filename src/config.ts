import 'dotenv/config';

type Config = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
    managerMeeting: ManagerMeetingConfig;
};

export type ManagerMeetingConfig = {
    env: 'test' | 'prod';
    baseUrl: string;
    token?: string;
    loginName?: string;
    password?: string;
    loginId?: string;
    code?: string;
};

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function loadConfig(): Config {
    const managerEnv = process.env.ENV?.trim() === 'prod' ? 'prod' : 'test';

    return {
        cursorApiKey: requireEnv('CURSOR_API_KEY'),
        cursorModel: process.env.CURSOR_MODEL?.trim() || 'composer-2.5',
        feishuAppId: requireEnv('FEISHU_APP_ID'),
        feishuAppSecret: requireEnv('FEISHU_APP_SECRET'),
        feishuEncryptKey: process.env.FEISHU_ENCRYPT_KEY?.trim() || undefined,
        managerMeeting: {
            env: managerEnv,
            baseUrl: process.env.MANAGER_BASE_URL?.trim() || (managerEnv === 'prod' ? 'https://server.comein.cn/comein/manager' : 'https://testserver.comein.cn/comein/manager'),
            token: process.env.MANAGER_TOKEN?.trim() || undefined,
            loginName: process.env.MANAGER_LOGIN_NAME?.trim() || undefined,
            password: process.env.MANAGER_PASSWORD?.trim() || undefined,
            loginId: process.env.MANAGER_LOGIN_ID?.trim() || undefined,
            code: process.env.MANAGER_CODE?.trim() || undefined
        }
    };
}
