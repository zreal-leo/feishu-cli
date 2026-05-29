import { askCursor as defaultAskCursor } from './cursor-agent.js';
import type { AskCursorOptions } from './cursor-agent.js';
import type { FeishuIncomingMessageEvent } from './message.js';
import { buildCursorPrompt, extractIncomingText } from './message.js';
import { createSegmentTimer, formatDurationMs } from './timing.js';

type Logger = Pick<typeof console, 'error' | 'info'>;

export type FeishuMessageProcessorOptions = {
    cursorApiKey: string;
    cursorModel: string;
    askCursor?: (options: AskCursorOptions) => Promise<string>;
    sendTextMessage: (chatId: string, text: string) => Promise<void>;
    logger?: Logger;
};

export type FeishuMessageProcessor = {
    handleEvent: (event: FeishuIncomingMessageEvent) => void;
    drain: () => Promise<void>;
};

export function createFeishuMessageProcessor(options: FeishuMessageProcessorOptions): FeishuMessageProcessor {
    const askCursor = options.askCursor ?? defaultAskCursor;
    const logger = options.logger ?? console;
    const seenMessageIds = new Set<string>();
    let queue: Promise<void> = Promise.resolve();

    function enqueue(job: () => Promise<void>): void {
        queue = queue.then(job, job);
        void queue.catch(() => undefined);
    }

    return {
        handleEvent(event) {
            const timer = createSegmentTimer();
            const text = extractIncomingText(event);
            const chatId = event.message?.chat_id;
            const messageId = event.message?.message_id?.trim();

            if (!text || !chatId) {
                return;
            }

            if (messageId) {
                if (seenMessageIds.has(messageId)) {
                    logger.info(`[feishu-bot] duplicate message ignored chatId=${chatId} messageId=${messageId} textLength=${text.length}`);
                    return;
                }
                seenMessageIds.add(messageId);
            }

            logger.info(`[feishu-bot] received message chatId=${chatId} messageId=${messageId ?? 'unknown'} textLength=${text.length}`);

            enqueue(async () => {
                try {
                    const reply = await askCursor({
                        apiKey: options.cursorApiKey,
                        model: options.cursorModel,
                        prompt: buildCursorPrompt(text)
                    });
                    const cursorTiming = timer.mark();
                    logger.info(`[feishu-bot] cursor reply ready chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(cursorTiming.segmentMs)} total=${formatDurationMs(cursorTiming.totalMs)}`);

                    await options.sendTextMessage(chatId, reply);
                    const sendTiming = timer.mark();
                    logger.info(`[feishu-bot] reply sent chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(sendTiming.segmentMs)} total=${formatDurationMs(sendTiming.totalMs)}`);
                } catch (error) {
                    const failureTiming = timer.mark();
                    logger.error(`[feishu-bot] message handling failed chatId=${chatId} messageId=${messageId ?? 'unknown'} segment=${formatDurationMs(failureTiming.segmentMs)} total=${formatDurationMs(failureTiming.totalMs)}`, error);
                }
            });
        },

        drain() {
            return queue;
        }
    };
}
