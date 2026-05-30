import 'dotenv/config';

type Config = {
    cursorApiKey: string;
    cursorModel: string;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuEncryptKey?: string;
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
        feishuEncryptKey: process.env.FEISHU_ENCRYPT_KEY?.trim() || undefined
    };
}
