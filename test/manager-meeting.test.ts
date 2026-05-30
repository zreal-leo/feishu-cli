import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildManagerMeetingPayload, createManagerMeeting, getManagerBaseUrl, parseCreateManagerMeetingCommand } from '../src/manager-meeting.js';

describe('parseCreateManagerMeetingCommand', () => {
    it('extracts the meeting title from create meeting commands', () => {
        assert.deepEqual(parseCreateManagerMeetingCommand('创建会议 跨项目接入测试'), { title: '跨项目接入测试' });
        assert.deepEqual(parseCreateManagerMeetingCommand('/meeting'), { title: undefined });
        assert.equal(parseCreateManagerMeetingCommand('帮我总结一下'), null);
    });
});

describe('getManagerBaseUrl', () => {
    it('maps manager environments to built-in backend domains', () => {
        assert.equal(getManagerBaseUrl('test'), 'https://testserver.comein.cn/comein/manager');
        assert.equal(getManagerBaseUrl('prod'), 'https://server.comein.cn/comein/manager');
    });
});

describe('buildManagerMeetingPayload', () => {
    it('uses test environment defaults from code instead of env', () => {
        const payload = buildManagerMeetingPayload({
            env: 'test',
            title: '自动化创建会议',
            startTimeMs: 1760000000000,
            now: new Date('2026-05-30T04:30:00.000Z')
        });

        assert.equal(payload.title, '自动化创建会议_05-30_04:30:00');
        assert.equal(payload.audioTitle, '自动化创建会议_05-30_04:30:00');
        assert.equal(payload.stime, 1760000000000);
        assert.equal(payload.uid, 15281329);
        assert.equal(payload.organizationId, 747);
        assert.equal(payload.eventMode, 567);
        assert.equal(payload.serviceType, 7);
        assert.equal(payload.serviceId, '1357');
        assert.equal(payload.isTest, 0);
        assert.equal(payload.isHide, 0);
        assert.deepEqual(payload.transDestLanguage, [0, 1, 2]);
        assert.deepEqual(payload.selectedTransChannels, ['cn', 'en', 'jp']);
        assert.deepEqual(payload.attendee, [
            {
                name: '联席主讲人',
                areaCode: '+86',
                phoneNumber: '1871872',
                company: '测试机构',
                occupation: '副董事长',
                identity: '2',
                isShow: 1,
                identityTypes: '4,7'
            }
        ]);
    });

    it('uses production defaults from code instead of env', () => {
        const payload = buildManagerMeetingPayload({
            env: 'prod',
            title: '生产会议',
            startTimeMs: 1760000000000,
            now: new Date('2026-05-30T04:30:00.000Z')
        });

        assert.equal(payload.uid, 2314049);
        assert.equal(payload.organizationId, 20164);
        assert.equal(payload.eventMode, 684);
        assert.equal(payload.serviceId, '1002');
        assert.equal(payload.isTest, 1);
        assert.equal(payload.isHide, 1);
        assert.equal(payload.needAssistant, 0);
    });
});

describe('createManagerMeeting', () => {
    it('posts roadshow create with token header and returns meeting identifiers', async () => {
        const calls: Array<{ url: string; options: { method?: string; headers?: Record<string, string>; body?: string } }> = [];

        const meeting = await createManagerMeeting({
            env: 'test',
            title: '跨项目接入测试',
            token: 'manager-token',
            now: new Date('2026-05-30T04:30:00.000Z'),
            startAfterMinutes: 20,
            httpClient: async (url, options) => {
                calls.push({ url, options });
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        code: '0',
                        msg: 'success',
                        data: {
                            id: 123456,
                            eid: 789012,
                            netLiveUrl: 'http://s.comein.cn/live'
                        }
                    })
                };
            }
        });

        assert.equal(calls[0]?.url, 'https://testserver.comein.cn/comein/manager/managecenter/roadshow/create');
        assert.equal(calls[0]?.options.method, 'POST');
        assert.deepEqual(calls[0]?.options.headers, {
            token: 'manager-token',
            'content-type': 'application/json'
        });
        assert.equal(JSON.parse(calls[0]?.options.body ?? '{}').title, '跨项目接入测试_05-30_04:30:00');
        assert.deepEqual(meeting, {
            id: 123456,
            eid: 789012,
            netLiveUrl: 'http://s.comein.cn/live'
        });
    });

    it('falls back to verifyCode login when MANAGER_TOKEN is missing', async () => {
        const urls: string[] = [];

        const meeting = await createManagerMeeting({
            env: 'test',
            title: '验证码登录',
            loginName: 'admin',
            password: 'secret',
            loginId: 'login-id',
            code: '1234',
            now: new Date('2026-05-30T04:30:00.000Z'),
            httpClient: async (url, options) => {
                urls.push(url);
                if (url.includes('/system/verifyCode')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ data: { token: 'login-token' } })
                    };
                }

                assert.equal(options.headers?.token, 'login-token');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ code: '0', data: { id: 1, eid: 2, netLiveUrl: 'http://s.comein.cn/1' } })
                };
            }
        });

        assert.match(urls[0] ?? '', /\/system\/verifyCode\?/);
        assert.deepEqual(meeting, { id: 1, eid: 2, netLiveUrl: 'http://s.comein.cn/1' });
    });

    it('rejects non-success roadshow create responses', async () => {
        await assert.rejects(
            createManagerMeeting({
                env: 'test',
                title: '失败会议',
                token: 'manager-token',
                httpClient: async () => ({
                    ok: true,
                    status: 200,
                    json: async () => ({ code: '500', msg: 'failed' })
                })
            }),
            /创建管理后台会议失败/
        );
    });

    it('rejects successful responses with missing identifiers or live url', async () => {
        await assert.rejects(
            createManagerMeeting({
                env: 'test',
                title: '字段缺失会议',
                token: 'manager-token',
                httpClient: async () => ({
                    ok: true,
                    status: 200,
                    json: async () => ({ code: '0', data: { id: '', eid: null, netLiveUrl: 'http://s.comein.cn/live' } })
                })
            }),
            /响应缺少必要字段/
        );
    });
});
