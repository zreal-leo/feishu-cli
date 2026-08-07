import * as Lark from '@larksuiteoapi/node-sdk';
import path from 'node:path';

import { createBotApplication } from '../app/bot-application.ts';
import { createWeeklyReportJob } from '../app/weekly-report-job.ts';
import { startWeeklyReportScheduler } from '../app/weekly-report-scheduler.ts';
import { createCommandRegistry } from '../core/command-registry.ts';
import { createCursorUsageCommandHandler } from '../core/commands/cursor-usage-command.ts';
import { createMeetingRouterCommandHandler } from '../core/commands/meeting-router-command.ts';
import { DEFAULT_REACTION_EMOJI_TYPE } from '../core/reactions.ts';
import { createAIWeeklyReportGenerator } from '../adapters/ai-weekly-report-generator.ts';
import { createAIUnifiedRouterGateway } from '../adapters/cursor/unified-router-gateway.ts';
import { createCursorUsageClient } from '../adapters/cursor/cursor-usage-client.ts';
import { createFileSystemTraceCollector } from '../adapters/file-system-trace.ts';
import { createFileSystemWeeklyCommitStore } from '../adapters/file-system-weekly-commit-store.ts';
import { createLarkMessageSender, createLarkReactionGateway } from '../adapters/lark/gateways.ts';
import { mapLarkIncomingMessage } from '../adapters/lark/inbound.ts';
import type { LarkIncomingMessageEvent } from '../adapters/lark/protocol.ts';
import { createLarkReplyGateway } from '../adapters/lark/reply-gateway.ts';
import { createManagerMeetingGateway } from '../adapters/manager/manager-meeting.ts';
import type { Config } from './config.ts';

export function startBot(config: Config): void {
    const baseConfig = {
        appId: config.larkAppId,
        appSecret: config.larkAppSecret
    };
    const logger = console;

    const client = new Lark.Client(baseConfig);
    const wsClient = new Lark.WSClient({
        ...baseConfig,
        loggerLevel: Lark.LoggerLevel.info
    });

    const messageSender = createLarkMessageSender(client);
    const replies = createLarkReplyGateway({
        finishCardStreaming: messageSender.finishCardStreaming,
        logger,
        sendCardMessage: messageSender.sendCardMessage,
        sendTextMessage: messageSender.sendTextMessage,
        updateCardElementContent: messageSender.updateCardElementContent,
        updateTextMessage: messageSender.updateTextMessage
    });
    const reactions = createLarkReactionGateway(client);

    const router = createAIUnifiedRouterGateway({
        apiKey: config.aiApiKey,
        baseURL: config.aiBaseUrl,
        model: config.aiModel,
        effort: config.aiEffort
    });
    const meetings = createManagerMeetingGateway(config.managerMeeting);
    const usage = createCursorUsageClient(config.cursorUsage);
    const systemTraceCollector = createFileSystemTraceCollector(config.systemTrace);

    const commandRegistry = createCommandRegistry([createCursorUsageCommandHandler(usage)], createMeetingRouterCommandHandler({ router, meetings }));

    const application = createBotApplication({
        commandRegistry,
        logger,
        reactionEmojiType: DEFAULT_REACTION_EMOJI_TYPE,
        reactions,
        replies,
        systemTraceCollector
    });

    const eventDispatcher = new Lark.EventDispatcher({
        encryptKey: config.larkEncryptKey
    }).register({
        'im.message.receive_v1': (event: LarkIncomingMessageEvent) => {
            const message = mapLarkIncomingMessage(event);
            if (!message) {
                return;
            }

            logger.info(
                `[lark-bot] received message chatId=${message.chatId} messageId=${message.messageId ?? 'unknown'} senderId=${message.sender?.id ?? 'unknown'} senderName=${message.sender?.name ?? 'unknown'} textLength=${message.text.length}`
            );
            application.handleMessage(message);
        }
    });

    const chatId = config.weeklyReport.chatId?.trim();
    if (chatId) {
        const directory = path.resolve(process.cwd(), config.weeklyReport.directory);
        const store = createFileSystemWeeklyCommitStore({ directory, logger });
        const generator = createAIWeeklyReportGenerator({
            apiKey: config.aiApiKey,
            baseURL: config.aiBaseUrl,
            model: config.aiModel,
            effort: config.aiEffort
        });
        const job = createWeeklyReportJob({
            store,
            generator,
            chatId,
            sendText: async (targetChatId, text) => {
                await messageSender.sendTextMessage(targetChatId, text);
            },
            logger
        });
        startWeeklyReportScheduler({
            hour: config.weeklyReport.hour,
            minute: config.weeklyReport.minute,
            run: () => job.run(),
            logger
        });
        logger.info(`weekly report scheduler started chatId=${chatId}`);
    } else {
        logger.info('weekly report scheduler skipped');
    }

    wsClient.start({ eventDispatcher });
}
