import { ASSISTANT_BEHAVIOR_LINES } from './assistant-behavior.ts';
import type { CrazyThursdaySkill } from './crazy-thursday.ts';
import { buildMeetingRoutingInstructions } from './meeting-routing-instructions.ts';
import type { ParseMeetingParametersInput } from '../ports/meeting.ts';

export function buildUnifiedRouterPrompt(input: ParseMeetingParametersInput, crazyThursdaySkill?: CrazyThursdaySkill): string {
    const now = input.now ?? new Date();

    return [
        '你正在通过 Lark 机器人处理用户消息，同时负责判断是否要创建会议，并直接回复用户。',
        ...ASSISTANT_BEHAVIOR_LINES,
        '',
        '## 路由规则',
        '1. 如果用户明确要求创建路演、直播、会议或云播：只输出一行合法 JSON，不要输出任何其它文字。',
        '2. 其他所有情况：直接用中文自然回复用户，不要输出 JSON。',
        ...buildMeetingRoutingInstructions(now),
        ...(crazyThursdaySkill
            ? [
                  '',
                  '## 疯狂星期四写作参考',
                  '以下 skill 和原创示例已由机器人加载，只用于疯狂星期四文案的创作、改写和拆解，无需读取文件或调用工具。',
                  '创建会议或云播的请求仍优先遵循上面的路由规则；写作参考不改变会议路由。',
                  '写作时按 skill 组织铺垫和反转，优先满足用户指定的主题、长度和结尾。创作或改写每次只输出一条文案，即使用户要求多条也只给一条，不编号、不提供备选版本。',
                  '示例仅用于学习结构和节奏，不照抄剧情；只输出用户要求的成品，不附 skill 名称、示例说明或内部过程。',
                  '<crazy_thursday_skill>',
                  crazyThursdaySkill.instructions,
                  '</crazy_thursday_skill>',
                  '<crazy_thursday_examples>',
                  crazyThursdaySkill.examples,
                  '</crazy_thursday_examples>'
              ]
            : []),
        '',
        '用户在 Lark 发送的消息：',
        input.text
    ].join('\n');
}
