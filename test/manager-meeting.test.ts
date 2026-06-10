import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ManagerMeetingConfig } from '../src/config.ts';
import { buildMeetingPayload, createManagerMeeting, createManagerMeetingClient, getManagerToken } from '../src/manager-meeting.ts';

const expectedLogoUrl = 'https://image.comein.cn/comein-files/img/1ead173108694842bcbea9227c70b4ce.jpg';
const expectedLoginHeaders = {
    accept: '*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    b: '3.0.3',
    browse: 'Netscape',
    'content-type': 'application/json;charset=utf-8',
    currentuid: '297',
    origin: 'https://manager-test.comein.cn',
    priority: 'u=1, i',
    'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    token: 'null',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    uc: 'comein-pc',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
};

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
        const stimeMs = new Date('2026-05-30T15:33:00+08:00').getTime();
        const payload = buildMeetingPayload('AI总结', stimeMs);

        assert.equal(payload.stime, stimeMs);
        assert.equal(payload.title, 'BOT: AI总结 15:33');
        assert.equal(payload.logo, expectedLogoUrl);
        assert.equal(payload.logoWeb, expectedLogoUrl);
        assert.equal(payload.logoWall, expectedLogoUrl);
        assert.equal(payload.logoWall169, expectedLogoUrl);
        assert.equal(payload.uid, 15281329);
        assert.equal(payload.organizationId, 747);
        assert.equal(payload.eventMode, 567);
        assert.equal(payload.serviceType, 0);
        assert.equal(payload.serviceId, '1357');
        assert.equal(payload.isTest, 0);
        assert.equal(payload.isHide, 0);
        assert.deepEqual(payload.transDestLanguage, [0, 1, 2]);
        assert.deepEqual(payload.selectedTransChannels, ['cn', 'en', 'jp']);
    });

    it('overrides meeting defaults with parsed command parameters', () => {
        const stimeMs = new Date('2026-06-10T10:00:00+08:00').getTime();
        const payload = buildMeetingPayload('AI策略会', stimeMs, {
            eventWays: 1,
            length: 60,
            eventMode: 567,
            serviceType: 7,
            openStatus: 2,
            tagName: '专场活动'
        });

        assert.equal(payload.stime, stimeMs);
        assert.equal(payload.title, 'BOT: AI策略会 10:00');
        assert.equal(payload.audioTitle, 'BOT: AI策略会 10:00');
        assert.equal(payload.eventWays, 1);
        assert.equal(payload.length, 60);
        assert.equal(payload.eventMode, 567);
        assert.equal(payload.serviceType, 7);
        assert.equal(payload.openStatus, 2);
        assert.equal(payload.tagName, '专场活动');
    });
});

describe('getManagerToken', () => {
    it('fetches a token through login and verifyCode requests', async () => {
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
        assert.deepEqual(requests[0].init?.headers, expectedLoginHeaders);
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
    it('posts the meeting payload with a default start time and extracts the meeting result', async () => {
        let requestedUrl = '';
        let requestInit: RequestInit | undefined;
        const fetchImpl = (async (input, init) => {
            requestedUrl = String(input);
            requestInit = init;
            return new Response(JSON.stringify({ code: '0', msg: 'success', data: { id: 123456, eid: 789012, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
        }) as typeof fetch;

        const result = await createManagerMeeting(createTestConfig(), { title: '跨项目接入测试会议', now: new Date('2026-05-30T15:30:00+08:00') }, 'manager_token', fetchImpl);

        assert.deepEqual(result, {
            title: 'BOT: 跨项目接入测试会议 15:33',
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
        assert.equal(payload.stime, new Date('2026-05-30T15:33:00+08:00').getTime());
        assert.equal(payload.title, 'BOT: 跨项目接入测试会议 15:33');
        assert.equal(payload.uid, 15281329);
        assert.equal(payload.organizationId, 747);
    });

    it('creates a cloud player after the meeting is created when requested', async () => {
        const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
        const fetchImpl = (async (input, init) => {
            const url = String(input);
            requests.push({ url, init });

            if (url.includes('/managecenter/roadshow/create')) {
                return new Response(JSON.stringify({ code: '0', msg: 'success', data: { id: 123456, eid: 789012, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
            }

            return new Response(JSON.stringify({ code: '0', msg: 'success' }), { status: 200 });
        }) as typeof fetch;

        const result = await createManagerMeeting(
            createTestConfig(),
            {
                title: '云播会议',
                stimeMs: 1760000000000,
                cloudPlayer: {
                    mediaStreamType: 2,
                    streamUrl: 'https://media.comein.cn/video/344317-1740031837920.mp4',
                    playType: 1,
                    repeatMode: -1,
                    repeatTime: 1,
                    type: 1
                }
            },
            'manager_token',
            fetchImpl
        );

        assert.equal(result.roadshowId, 123456);
        assert.equal(requests.length, 2);
        assert.equal(requests[0].url, 'https://testserver.comein.cn/comein/manager/managecenter/roadshow/create');
        assert.equal(requests[1].url, 'https://testserver.comein.cn/comein/manager/managecenter/cloud-player/create');
        assert.deepEqual(requests[1].init?.headers, {
            token: 'manager_token',
            'content-type': 'application/json'
        });
        assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
            roadshowId: 123456,
            mediaStreamType: 2,
            streamUrl: 'https://media.comein.cn/video/344317-1740031837920.mp4',
            playType: 1,
            repeatMode: -1,
            repeatTime: 1,
            playTs: 1760000000,
            region: null,
            type: 1
        });
    });

    it('returns the meeting result with a cloud player error when optional cloud player creation fails', async () => {
        const stimeMs = new Date('2026-05-30T15:33:00+08:00').getTime();
        const fetchImpl = (async (input, init) => {
            const url = String(input);

            if (url.includes('/managecenter/roadshow/create')) {
                return new Response(JSON.stringify({ code: '0', msg: 'success', data: { id: 123456, eid: 789012, netLiveUrl: 'http://s.comein.cn/live' } }), { status: 200 });
            }

            assert.equal(getRequestToken(init), 'manager_token');
            return new Response(JSON.stringify({ code: '1', msg: 'invalid stream' }), { status: 200 });
        }) as typeof fetch;

        const result = await createManagerMeeting(
            createTestConfig(),
            {
                title: '云播失败会议',
                stimeMs,
                cloudPlayer: {
                    mediaStreamType: 2,
                    streamUrl: 'https://media.comein.cn/video/invalid.mp4',
                    playType: 1,
                    repeatMode: -1,
                    repeatTime: 1,
                    type: 1
                }
            },
            'manager_token',
            fetchImpl
        );

        assert.deepEqual(result, {
            title: 'BOT: 云播失败会议 15:33',
            roadshowId: 123456,
            eventId: 789012,
            netLiveUrl: 'http://s.comein.cn/live',
            cloudPlayerError: '创建云播失败: {"code":"1","msg":"invalid stream"}'
        });
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
        const result = await client.createMeeting({ title: '刷新 token 会议', stimeMs: new Date('2026-05-30T15:33:00+08:00').getTime() });

        assert.deepEqual(result, {
            title: 'BOT: 刷新 token 会议 15:33',
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
