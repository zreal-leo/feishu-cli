import { ASSISTANT_BEHAVIOR_LINES } from './assistant-behavior.ts';

export function buildCursorPrompt(text: string): string {
    return ['你正在通过 Lark 机器人回复用户。', ...ASSISTANT_BEHAVIOR_LINES, '', '用户在 Lark 发送的消息：', text].join('\n');
}
