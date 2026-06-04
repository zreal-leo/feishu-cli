import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMeetingCreatedCard, formatMeetingCreatedReply } from '../src/adapters/lark/renderers.ts';
import { buildCursorPrompt } from '../src/core/assistant-prompt.ts';
import { parseCreateMeetingCommand } from '../src/core/commands/create-meeting-parser.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from '../src/core/reactions.ts';
import { extractIncomingText, toLarkReactionPayload, toLarkTextContent } from '../src/message.ts';

describe('extractIncomingText', () => {
    it('extracts text from a Lark text message event', () => {
        const text = extractIncomingText({
            message: {
                message_type: 'text',
                content: JSON.stringify({ text: '帮我看一下这个项目' })
            }
        });

        assert.equal(text, '帮我看一下这个项目');
    });

    it('removes leading Lark mention keys from text messages', () => {
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

    it('removes leading Lark at tags from text messages', () => {
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
    it('wraps the incoming Lark message with reply instructions', () => {
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

    it('parses a create meeting command with cloud player media', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议 跨项目接入测试会议 云播 https://media.comein.cn/video/344317-1740031837920.mp4'), {
            type: 'create_meeting',
            title: '跨项目接入测试会议',
            cloudPlayer: {
                mediaStreamType: 2,
                streamUrl: 'https://media.comein.cn/video/344317-1740031837920.mp4',
                playType: 1,
                repeatMode: -1,
                repeatTime: 1,
                type: 1
            }
        });
    });

    it('parses default video cloud player without requiring a title or URL', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议 云播'), {
            type: 'create_meeting',
            title: '会议',
            cloudPlayer: {
                mediaStreamType: 2,
                streamUrl: 'https://media.comein.cn/video/344317-1740031837920.mp4',
                playType: 1,
                repeatMode: -1,
                repeatTime: 1,
                type: 1
            }
        });
    });

    it('parses natural create meeting and cloud player wording', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议并创建云播'), {
            type: 'create_meeting',
            title: '会议',
            cloudPlayer: {
                mediaStreamType: 2,
                streamUrl: 'https://media.comein.cn/video/344317-1740031837920.mp4',
                playType: 1,
                repeatMode: -1,
                repeatTime: 1,
                type: 1
            }
        });
    });

    it('parses explicit audio cloud player media', () => {
        assert.deepEqual(parseCreateMeetingCommand('创建会议 语音会议 音频云播 https://media.comein.cn/audio/demo.mp3'), {
            type: 'create_meeting',
            title: '语音会议',
            cloudPlayer: {
                mediaStreamType: 1,
                streamUrl: 'https://media.comein.cn/audio/demo.mp3',
                playType: 1,
                repeatMode: -1,
                repeatTime: 1,
                type: 1
            }
        });
    });

    it('ignores non-command text', () => {
        assert.equal(parseCreateMeetingCommand('请帮我总结这段内容'), null);
    });
});

describe('formatMeetingCreatedReply', () => {
    it('formats the manager meeting result for Lark', () => {
        assert.equal(
            formatMeetingCreatedReply({ title: 'BOT: AI总结 15:33', roadshowId: 123456, eventId: 789012, netLiveUrl: 'http://s.comein.cn/live' }),
            ['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live'].join('\n')
        );
    });

    it('formats cloud player creation status separately from meeting success', () => {
        assert.equal(
            formatMeetingCreatedReply({
                title: 'BOT: AI总结 15:33',
                roadshowId: 123456,
                eventId: 789012,
                netLiveUrl: 'http://s.comein.cn/live',
                cloudPlayerError: '创建云播失败: {"code":"1","msg":"invalid stream"}'
            }),
            ['会议创建成功', '会议标题：BOT: AI总结 15:33', '会议 ID：123456', '事件 ID：789012', '观看链接：http://s.comein.cn/live', '云播：创建失败（创建云播失败: {"code":"1","msg":"invalid stream"}）'].join('\n')
        );
    });
});

describe('buildMeetingCreatedCard', () => {
    it('includes cloud player status in the manager meeting card', () => {
        const card = buildMeetingCreatedCard({
            title: 'BOT: AI总结 15:33',
            roadshowId: 123456,
            eventId: 789012,
            netLiveUrl: 'http://s.comein.cn/live',
            cloudPlayerCreated: true
        });

        assert.match(String(card.body.elements[0].content), /\*\*云播：\*\* 已创建/);
        assert.equal(card.card_link?.url, 'http://s.comein.cn/live');
    });
});

describe('toLarkTextContent', () => {
    it('serializes Cursor text as Lark text content', () => {
        assert.equal(toLarkTextContent('收到，我来处理。'), JSON.stringify({ text: '收到，我来处理。' }));
    });
});

describe('toLarkReactionPayload', () => {
    it('defaults to Lark Typing emoji', () => {
        assert.equal(DEFAULT_REACTION_EMOJI_TYPE, 'Typing');
        assert.deepEqual(toLarkReactionPayload(), {
            reaction_type: {
                emoji_type: 'Typing'
            }
        });
    });

    it('builds a Lark message reaction payload', () => {
        assert.deepEqual(toLarkReactionPayload('THUMBSUP'), {
            reaction_type: {
                emoji_type: 'THUMBSUP'
            }
        });
    });
});
