import { loadConfig } from './config.ts';
import { startFeishuCursorBot } from './feishu-bot.ts';

const config = loadConfig();

startFeishuCursorBot(config);
console.log('lark-cli is running. Send a text message to the bot in Feishu.');
