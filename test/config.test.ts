import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { DEFAULT_CONFIG } from '../src/default-config.ts';

const managedEnvNames = ['CURSOR_API_KEY', 'CURSOR_MODEL', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_ENCRYPT_KEY', 'ENV', 'MANAGER_BASE_URL', 'MANAGER_LOGIN_NAME', 'MANAGER_PASSWORD'] as const;
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
        process.env.LARK_APP_ID = 'lark_app_id';
        process.env.LARK_APP_SECRET = 'lark_app_secret';
        process.env.LARK_ENCRYPT_KEY = 'encrypt_key';
        process.env.ENV = 'env_value_should_be_ignored';
        process.env.MANAGER_BASE_URL = 'https://env.example.com/manager';
        process.env.MANAGER_LOGIN_NAME = 'admin';
        process.env.MANAGER_PASSWORD = 'password';

        const config = loadConfig();

        assert.equal(config.cursorApiKey, 'cursor_key');
        assert.equal(config.cursorModel, DEFAULT_CONFIG.cursorModel);
        assert.equal(config.larkAppId, 'lark_app_id');
        assert.equal(config.larkAppSecret, 'lark_app_secret');
        assert.equal(config.larkEncryptKey, 'encrypt_key');
        assert.deepEqual(config.managerMeeting, {
            env: DEFAULT_CONFIG.managerMeeting.env,
            baseUrl: DEFAULT_CONFIG.managerMeeting.baseUrl,
            loginName: 'admin',
            password: 'password'
        });
    });
});
