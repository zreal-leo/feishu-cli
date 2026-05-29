import { loadConfig } from './config.js';
import { startFeishuCursorBot } from './feishu-bot.js';

const config = loadConfig();

startFeishuCursorBot(config);
console.log('Feishu Cursor bot is running. Send a text message to the bot in Feishu.');
