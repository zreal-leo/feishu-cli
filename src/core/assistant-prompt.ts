export function buildCursorPrompt(text: string): string {
    return ['你正在通过飞书机器人回复用户。', '请用中文简洁回复，不要提及内部实现，除非用户明确询问。', '', '用户在飞书发送的消息：', text].join('\n');
}
