export type CrazyThursdaySkill = {
    instructions: string;
    examples: string;
};

const CRAZY_THURSDAY_TOPIC = /疯狂\s*星期\s*(?:四|4)|疯\s*四|v\s*我\s*50/i;
const CRAZY_THURSDAY_SHORTHAND = /^(?:疯狂\s*星期\s*(?:四|4)|疯\s*四|v\s*我\s*50)[\s！!。,.，~～]*$/i;
const WRITING_REQUEST = /文案|段子|文学|笑话|整活|创作|改写|润色|仿写|续写|拆解|写法|写|编|(?:来|整)(?:一|几|点|个|条)/;

export function isCrazyThursdayWritingRequest(text: string): boolean {
    const message = text.trim();
    if (!CRAZY_THURSDAY_TOPIC.test(message)) {
        return false;
    }

    // 仅提及活动不代表想要段子，菜单、价格和日期问题仍走普通助手回复。
    return CRAZY_THURSDAY_SHORTHAND.test(message) || WRITING_REQUEST.test(message);
}
