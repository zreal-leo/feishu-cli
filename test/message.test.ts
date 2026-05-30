import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_REACTION_EMOJI_TYPE, buildCursorPrompt, extractIncomingText, formatMeetingCreatedReply, parseCreateMeetingCommand, toFeishuReactionPayload, toFeishuTextContent } from '../src/message.js';

describe('extractIncomingText', () => {
    it('extracts text from a Feishu text message event', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '帮我看一下这个项目' })
            }
        });

        assert.equal(text, '帮我看一下这个项目');
    });

    it('removes leading Feishu mention keys from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '@_user_1 创建会议 AI总结' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('removes leading named bot mentions from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '@会议机器人 创建会议 AI总结' }),
                mentions: [{ key: '@_user_1', name: '会议机器人' }]
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('removes leading Feishu at tags from text messages', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '<at user_id="ou_bot">会议机器人</at> 创建会议 AI总结' })
            }
        });

        assert.equal(text, '创建会议 AI总结');
    });

    it('ignores non-text message events', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'image',
                content: '{}'
            }
        });

        assert.equal(text, null);
    });
});

describe('buildCursorPrompt', () => {
    it('wraps the incoming Feishu message with reply instructions', () => {
        const prompt = buildCursorPrompt('解释一下 pnpm dev 做了什么');

        assert.match(prompt, /解释一下 pnpm dev 做了什么/);
        assert.match(prompt, /请用中文简洁回复/);
    });
});

describe('parseCreateMeetingCommand', () => {
    it('parses the default create meeting command', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议'), {
            type: 'create_meeting',
            title: '会议'
        });
    });

    it('parses a create meeting command with a custom title', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议 跨项目接入测试会议'), {
            type: 'create_meeting',
            title: '跨项目接入测试会议'
        });
    });

    it('ignores non-command text', () => {
        assert.equal(parseCreateMeetingCommand('请帮我总结这段内容'), null);
    });
});

describe('formatMeetingCreatedReply', () => {
    it('formats the manager meeting result for Feishu', () => {
        assert.equal(
            formatMeetingCreatedReply({ title: 'BOT: AI总结 15:33', roadshowId: 123456, eventId: 789012, netLiveUrl: 'http://s.comein.cn/live' }),
            ['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live'].join('\n')
        );
    });
});

describe('toFeishuTextContent', () => {
    it('serializes Cursor text as Feishu text content', () => {
        assert.equal(toFeishuTextContent('收到，我来处理。'), JSON.stringify({ text: '收到，我来处理。' }));
    });
});

describe('toFeishuReactionPayload', () => {
    it('defaults to Feishu Typing emoji', () => {
        assert.equal(DEFAULT_REACTION_EMOJI_TYPE, 'Typing');
        assert.deepEqual(toFeishuReactionPayload(), {
            reaction_type: {
                emoji_type: 'Typing'
            }
        });
    });

    it('builds a Feishu message reaction payload', () => {
        assert.deepEqual(toFeishuReactionPayload('THUMBSUP'), {
            reaction_type: {
                emoji_type: 'THUMBSUP'
            }
        });
    });
});
