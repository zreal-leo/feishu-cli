import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isCrazyThursdayWritingRequest } from '../src/core/crazy-thursday.ts';

describe('isCrazyThursdayWritingRequest', () => {
    for (const text of [
        '疯狂星期四文案',
        '帮我写3条程序员风格的疯四段子，适合发朋友群',
        '来一条苦情风格的V我50文案，不超过100字',
        '把这段疯狂星期四文案改成公文风：刚开完会……',
        '拆解一下疯狂星期四段子的写法',
        '来点疯四',
        '疯狂星期四！',
        ' 疯四 ',
        'v 我 50',
        '请编一个疯狂星期4笑话'
    ]) {
        it(`recognizes a writing request: ${text}`, () => {
            assert.equal(isCrazyThursdayWritingRequest(text), true);
        });
    }

    for (const text of ['你好', '今天是不是星期四？', '本周疯狂星期四菜单有什么？', '疯狂星期四多少钱？', '疯狂星期四是什么意思？', '肯德基现在营业吗？', '创建会议 AI策略会', '帮我写一个普通促销广告']) {
        it(`keeps an ordinary request out of the writing skill: ${text}`, () => {
            assert.equal(isCrazyThursdayWritingRequest(text), false);
        });
    }
});
