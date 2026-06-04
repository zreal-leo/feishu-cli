import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { DEFAULT_CONFIG } from '../src/default-config.ts';

const managedEnvNames = [
    'CURSOR_API_KEY',
    'CURSOR_MODEL',
    'CURSOR_USAGE_COOKIE',
    'CURSOR_USAGE_TEAM_ID',
    'CURSOR_USAGE_USER_ID',
    'LARK_APP_ID',
    'LARK_APP_SECRET',
    'LARK_ENCRYPT_KEY',
    'ENV',
    'MANAGER_BASE_URL',
    'MANAGER_LOGIN_NAME',
    'MANAGER_PASSWORD'
] as const;
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
        process.env.CURSOR_USAGE_COOKIE = 'WorkosCursorSessionToken=session';
        process.env.CURSOR_USAGE_TEAM_ID = '11326557';
        process.env.CURSOR_USAGE_USER_ID = '208513979';
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
        assert.deepEqual(config.cursorUsage, {
            baseUrl: DEFAULT_CONFIG.cursorUsage.baseUrl,
            cookie: 'WorkosCursorSessionToken=session',
            pageSize: DEFAULT_CONFIG.cursorUsage.pageSize,
            teamId: 11326557,
            userId: 208513979
        });
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

    it('does not require Cursor usage credentials during startup', () => {
        process.env.CURSOR_API_KEY = 'cursor_key';
        delete process.env.CURSOR_USAGE_COOKIE;
        delete process.env.CURSOR_USAGE_TEAM_ID;
        delete process.env.CURSOR_USAGE_USER_ID;
        process.env.LARK_APP_ID = 'lark_app_id';
        process.env.LARK_APP_SECRET = 'lark_app_secret';

        const config = loadConfig();

        assert.deepEqual(config.cursorUsage, {
            baseUrl: DEFAULT_CONFIG.cursorUsage.baseUrl,
            cookie: undefined,
            pageSize: DEFAULT_CONFIG.cursorUsage.pageSize,
            teamId: undefined,
            userId: undefined
        });
    });
});
