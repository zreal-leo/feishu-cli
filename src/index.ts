import { loadConfig } from './bootstrap/config.ts';
import { startBot } from './bootstrap/composition-root.ts';

const config = loadConfig();

startBot(config);
console.log('lark-cli is running. Send a text message to the bot in Lark.');
