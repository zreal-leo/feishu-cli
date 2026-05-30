import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMeetingReservationPayload, createFeishuMeetingReservation, formatCreatedMeetingReply, parseCreateMeetingCommand } from '../src/feishu-meeting.js';

describe('parseCreateMeetingCommand', () => {
    it('extracts the optional topic from a create meeting command', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议 需求评审'), { topic: '需求评审' });
        assert.deepEqual(parseCreateMeetingCommand('/meeting'), { topic: undefined });
        assert.equal(parseCreateMeetingCommand('帮我解释代码'), null);
    });
});

describe('buildMeetingReservationPayload', () => {
    it('builds the Feishu reserve.apply payload with code defaults and no privacy-sensitive defaults', () => {
        const now = new Date('2026-05-30T03:42:00.000Z');

        const payload = buildMeetingReservationPayload({
            now,
            ownerOpenId: 'ou_owner',
            topic: '需求评审'
        });

        assert.deepEqual(payload, {
            params: {
                user_id_type: 'open_id'
            },
            data: {
                end_time: '1782704520',
                owner_id: 'ou_owner',
                meeting_settings: {
                    topic: '需求评审',
                    meeting_initial_type: 1,
                    meeting_connect: true
                }
            }
        });
    });
});

describe('createFeishuMeetingReservation', () => {
    it('calls reserve.apply and maps Feishu response fields into reply data', async () => {
        const calls: unknown[] = [];

        const meeting = await createFeishuMeetingReservation({
            now: new Date('2026-05-30T03:42:00.000Z'),
            ownerOpenId: 'ou_owner',
            topic: '需求评审',
            applyReserve: async payload => {
                calls.push(payload);
                return {
                    code: 0,
                    msg: 'success',
                    data: {
                        reserve: {
                            id: 'reserve_1',
                            meeting_no: '112000358',
                            password: '971024',
                            url: 'https://vc.feishu.cn/j/337736498',
                            end_time: '1782704520'
                        }
                    }
                };
            }
        });

        assert.equal(calls.length, 1);
        assert.deepEqual(meeting, {
            id: 'reserve_1',
            topic: '需求评审',
            meetingNo: '112000358',
            password: '971024',
            url: 'https://vc.feishu.cn/j/337736498',
            endTime: '1782704520'
        });
    });
});

describe('formatCreatedMeetingReply', () => {
    it('formats the fields users need to join the created meeting', () => {
        assert.equal(
            formatCreatedMeetingReply({
                id: 'reserve_1',
                topic: '需求评审',
                meetingNo: '112000358',
                password: '971024',
                url: 'https://vc.feishu.cn/j/337736498',
                endTime: '1608883322'
            }),
            '会议已创建：需求评审\n会议号：112000358\n入会链接：https://vc.feishu.cn/j/337736498\n会议密码：971024\n预约到期：2020-12-25 08:02'
        );
    });
});
