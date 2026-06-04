import { loadConfig } from './config.ts';
import { startLarkCursorBot } from './lark-bot.ts';

const config = loadConfig();

startLarkCursorBot(config);
console.log('lark-cli is running. Send a text message to the bot in Lark.');
