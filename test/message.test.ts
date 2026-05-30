import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DEFAULT_REACTION_EMOJI_TYPE,
    buildCursorPrompt,
    buildFeishuDocCursorPrompt,
    buildMeetingCreatedCard,
    extractIncomingText,
    formatMeetingCreatedReply,
    parseCreateMeetingCommand,
    parseFeishuDocCommand,
    toFeishuReactionPayload,
    toFeishuTextContent
} from '../src/message.js';

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

describe('parseFeishuDocCommand', () => {
    it('extracts a docx link and instruction from text', () => {
        assert.deepEqual(parseFeishuDocCommand('列出文档中所有需要国际化的文本 https://example.feishu.cn/docx/AbcD1234?from=from_copylink'), {
            type: 'feishu_doc',
            url: 'https://example.feishu.cn/docx/AbcD1234?from=from_copylink',
            resourceType: 'docx',
            token: 'AbcD1234',
            instruction: '列出文档中所有需要国际化的文本'
        });
    });

    it('extracts a wiki link when the instruction follows the URL', () => {
        assert.deepEqual(parseFeishuDocCommand('https://example.feishu.cn/wiki/WikiToken01 列出所有 TODO'), {
            type: 'feishu_doc',
            url: 'https://example.feishu.cn/wiki/WikiToken01',
            resourceType: 'wiki',
            token: 'WikiToken01',
            instruction: '列出所有 TODO'
        });
    });

    it('extracts the instruction when punctuation follows the document URL', () => {
        assert.deepEqual(parseFeishuDocCommand('https://example.feishu.cn/docx/DocToken01?from=copy，请列出所有标题'), {
            type: 'feishu_doc',
            url: 'https://example.feishu.cn/docx/DocToken01?from=copy',
            resourceType: 'docx',
            token: 'DocToken01',
            instruction: '请列出所有标题'
        });
    });

    it('uses a default instruction when only a document link is provided', () => {
        assert.equal(parseFeishuDocCommand('https://example.feishu.cn/docx/DocOnly01。')?.instruction, '请总结这份文档的核心内容。');
    });

    it('ignores non-Feishu document links', () => {
        assert.equal(parseFeishuDocCommand('请看 https://example.com/docx/AbcD1234'), null);
    });
});

describe('buildFeishuDocCursorPrompt', () => {
    it('wraps the document content with the user instruction', () => {
        const command = parseFeishuDocCommand('列出文档中所有需要国际化的文本 https://example.feishu.cn/docx/AbcD1234');
        assert.ok(command);

        const prompt = buildFeishuDocCursorPrompt(command, '按钮：提交\n占位符：请输入姓名');

        assert.match(prompt, /列出文档中所有需要国际化的文本/);
        assert.match(prompt, /按钮：提交/);
        assert.match(prompt, /只能根据下方“文档内容”回答/);
    });
});

describe('formatMeetingCreatedReply', () => {
    it('formats the manager meeting result for Feishu', () => {
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
