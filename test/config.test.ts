import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/default-config.js';

const managedEnvNames = ['CURSOR_API_KEY', 'CURSOR_MODEL', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ENCRYPT_KEY', 'ENV', 'MANAGER_BASE_URL', 'MANAGER_TOKEN'] as const;
const originalEnv = new Map<string, string | undefined>(managedEnvNames.map(name => [name, process.env[name]]));

afterEach(() => {
    for (const [name, value] of originalEnv) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe('loadConfig', () => {
    it('loads secrets from env and non-sensitive defaults from the default config file', () => {
        process.env.CURSOR_API_KEY = 'cursor_key';
        process.env.CURSOR_MODEL = 'env_model_should_be_ignored';
        process.env.FEISHU_APP_ID = 'feishu_app_id';
        process.env.FEISHU_APP_SECRET = 'feishu_app_secret';
        process.env.FEISHU_ENCRYPT_KEY = 'encrypt_key';
        process.env.ENV = 'prod';
        process.env.MANAGER_BASE_URL = 'https://env.example.com/manager';
        process.env.MANAGER_TOKEN = 'manager_token';

        const config = loadConfig();

        assert.equal(config.cursorApiKey, 'cursor_key');
        assert.equal(config.cursorModel, DEFAULT_CONFIG.cursorModel);
        assert.equal(config.feishuAppId, 'feishu_app_id');
        assert.equal(config.feishuAppSecret, 'feishu_app_secret');
        assert.equal(config.feishuEncryptKey, 'encrypt_key');
        assert.deepEqual(config.managerMeeting, {
            env: DEFAULT_CONFIG.managerMeeting.env,
            baseUrl: DEFAULT_CONFIG.managerMeeting.baseUrls[DEFAULT_CONFIG.managerMeeting.env],
            token: 'manager_token',
            loginName: undefined,
            password: undefined,
            loginId: undefined,
            code: undefined
        });
    });
});
