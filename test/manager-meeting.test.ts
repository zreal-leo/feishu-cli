import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ManagerMeetingConfig } from '../src/config.js';
import { buildMeetingPayload, createManagerMeeting, createManagerMeetingClient, getManagerToken } from '../src/manager-meeting.js';

function createTestConfig(overrides: Partial<ManagerMeetingConfig> = {}): ManagerMeetingConfig {
    return {
        env: 'test',
        baseUrl: 'https://testserver.comein.cn/comein/manager',
        loginName: 'admin',
        password: 'password',
        ...overrides
    };
}

describe('buildMeetingPayload', () => {
    it('uses test environment defaults', () => {
        const payload = buildMeetingPayload('自动化会议', 1760000000000);

        assert.equal(payload.stime, 1760000000000);
        assert.match(String(payload.title), /^自动化会议_/);
        assert.equal(payload.uid, 15281329);
        assert.equal(payload.organizationId, 747);
        assert.equal(payload.eventMode, 567);
        assert.equal(payload.serviceType, 7);
        assert.equal(payload.serviceId, '1357');
        assert.equal(payload.isTest, 0);
        assert.equal(payload.isHide, 0);
        assert.deepEqual(payload.transDestLanguage, [0, 1, 2]);
        assert.deepEqual(payload.selectedTransChannels, ['cn', 'en', 'jp']);
    });
});

describe('getManagerToken', () => {
    it('fetches a token through login and verifyCode requests without custom headers', async () => {
        const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
        const fetchImpl = (async (input, init) => {
            const url = String(input);
            requests.push({ url, init });
            if (url.includes('/system/login')) {
                return new Response(JSON.stringify({ code: '0', data: { id: 297, loginName: 'logged_admin', password: 'logged_password' } }), { status: 200 });
            }

            return new Response(JSON.stringify({ code: '0', data: { token: 'login_token' } }), { status: 200 });
        }) as typeof fetch;

        const token = await getManagerToken(
            createTestConfig({
                loginName: 'admin',
                password: 'password'
            }),
            fetchImpl
        );

        assert.equal(token, 'login_token');
        assert.equal(requests.length, 2);

        assert.equal(new URL(requests[0].url).pathname, '/comein/manager/system/login');
        assert.equal(requests[0].init?.method, 'POST');
        assert.equal(requests[0].init?.headers, undefined);
        assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
            loginName: 'admin',
            password: 'password',
            origin: 'manager-test.comein.cn'
        });

        assert.equal(new URL(requests[1].url).pathname, '/comein/manager/system/verifyCode');
        assert.equal(requests[1].init?.method, 'POST');
        assert.equal(requests[1].init?.headers, undefined);
        assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
            id: 297,
            loginName: 'logged_admin',
            password: 'logged_password',
            code: null,
            origin: 'manager-test.comein.cn'
        });
    });
});

describe('createManagerMeeting', () => {
    it('posts the meeting payload and extracts the meeting result', async () => {
        let requestedUrl = '';
        let requestInit: RequestInit | undefined;
        const fetchImpl = (async (input, init) => {
            requestedUrl = String(input);
            requestInit = init;
            return new Response(JSON.stringify({ code: '0', msg: 'success', data: { id: 123456, eid: 789012, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
        }) as typeof fetch;

        const result = await createManagerMeeting(createTestConfig(), { title: '跨项目接入测试会议', stimeMs: 1760000000000 }, 'manager_token', fetchImpl);

        assert.deepEqual(result, {
            roadshowId: 123456,
            eventId: 789012,
            netLiveUrl: 'http://s.comein.cn/live'
        });
        assert.equal(requestedUrl, 'https://testserver.comein.cn/comein/manager/managecenter/roadshow/create');
        assert.deepEqual(requestInit?.headers, {
            token: 'manager_token',
            'content-type': 'application/json'
        });

        const payload = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
        assert.equal(payload.stime, 1760000000000);
        assert.match(String(payload.title), /^跨项目接入测试会议_/);
        assert.equal(payload.uid, 15281329);
        assert.equal(payload.organizationId, 747);
    });

    it('throws when the manager backend returns a failure code', async () => {
        const fetchImpl = (async () => {
            return new Response(JSON.stringify({ code: '1', msg: 'token invalid' }), { status: 200 });
        }) as typeof fetch;

        await assert.rejects(() => createManagerMeeting(createTestConfig(), { title: '失败会议', stimeMs: 1760000000000 }, 'manager_token', fetchImpl), /创建会议失败/);
    });
});

describe('createManagerMeetingClient', () => {
    it('caches a token fetched through manager login credentials', async () => {
        const requestedUrls: string[] = [];
        const requestedTokens: string[] = [];
        const fetchImpl = (async (input, init) => {
            const url = String(input);
            requestedUrls.push(url);
            if (url.includes('/system/login')) {
                return new Response(JSON.stringify({ code: '0', data: { id: 297, loginName: 'logged_admin', password: 'logged_password' } }), { status: 200 });
            }

            if (url.includes('/system/verifyCode')) {
                return new Response(JSON.stringify({ code: '0', data: { token: 'login_token' } }), { status: 200 });
            }

            requestedTokens.push(getRequestToken(init));
            return new Response(JSON.stringify({ code: '0', data: { id: 1, eid: 2, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
        }) as typeof fetch;

        const client = createManagerMeetingClient(createTestConfig(), fetchImpl);

        await client.createMeeting({ title: '第一次会议', stimeMs: 1760000000000 });
        await client.createMeeting({ title: '第二次会议', stimeMs: 1760000000000 });

        assert.equal(requestedUrls.filter(url => url.includes('/system/login')).length, 1);
        assert.equal(requestedUrls.filter(url => url.includes('/system/verifyCode')).length, 1);
        assert.equal(requestedUrls.filter(url => url.includes('/managecenter/roadshow/create')).length, 2);
        assert.deepEqual(requestedTokens, ['login_token', 'login_token']);
    });

    it('clears the cached token and logs in again when meeting creation returns errorcode 201', async () => {
        const requestedUrls: string[] = [];
        const requestedTokens: string[] = [];
        let loginCount = 0;
        let createCount = 0;
        const fetchImpl = (async (input, init) => {
            const url = String(input);
            requestedUrls.push(url);

            if (url.includes('/system/login')) {
                loginCount += 1;
                return new Response(JSON.stringify({ code: '0', data: { id: 297, loginName: `logged_admin_${loginCount}`, password: `logged_password_${loginCount}` } }), { status: 200 });
            }

            if (url.includes('/system/verifyCode')) {
                return new Response(JSON.stringify({ code: '0', data: { token: `login_token_${loginCount}` } }), { status: 200 });
            }

            createCount += 1;
            requestedTokens.push(getRequestToken(init));
            if (createCount === 1) {
                return new Response(JSON.stringify({ errorcode: 201, msg: 'token invalid' }), { status: 200 });
            }

            return new Response(JSON.stringify({ code: '0', data: { id: 1, eid: 2, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
        }) as typeof fetch;

        const client = createManagerMeetingClient(createTestConfig(), fetchImpl);
        const result = await client.createMeeting({ title: '刷新 token 会议', stimeMs: 1760000000000 });

        assert.deepEqual(result, {
            roadshowId: 1,
            eventId: 2,
            netLiveUrl: 'http://s.comein.cn/live'
        });
        assert.equal(requestedUrls.filter(url => url.includes('/system/login')).length, 2);
        assert.equal(requestedUrls.filter(url => url.includes('/system/verifyCode')).length, 2);
        assert.equal(requestedUrls.filter(url => url.includes('/managecenter/roadshow/create')).length, 2);
        assert.deepEqual(requestedTokens, ['login_token_1', 'login_token_2']);
    });
});

function getRequestToken(init: RequestInit | undefined): string {
    const headers = init?.headers;
    if (headers && typeof headers === 'object' && !Array.isArray(headers) && !(headers instanceof Headers)) {
        return String((headers as Record<string, unknown>).token);
    }

    return '';
}
