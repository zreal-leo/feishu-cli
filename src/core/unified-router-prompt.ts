import { ASSISTANT_BEHAVIOR_LINES } from './assistant-behavior.ts';
import { buildMeetingRoutingInstructions } from './meeting-routing-instructions.ts';
import type { ParseMeetingParametersInput } from '../ports/meeting.ts';

export function buildUnifiedRouterPrompt(input: ParseMeetingParametersInput): string {
    const now = input.now ?? new Date();

    return [
        '你正在通过 Lark 机器人处理用户消息，同时负责判断是否要创建会议，并直接回复用户。',
        ...ASSISTANT_BEHAVIOR_LINES,
        '',
        '## 路由规则',
        '1. 如果用户明确要求创建路演、直播、会议或云播：只输出一行合法 JSON，不要输出任何其它文字。',
        '2. 其他所有情况：直接用中文自然回复用户，不要输出 JSON。',
        ...buildMeetingRoutingInstructions(now),
        '',
        '用户在 Lark 发送的消息：',
        input.text
    ].join('\n');
}
