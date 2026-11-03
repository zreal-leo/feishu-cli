export const DEFAULT_CONFIG = {
    // 走 Anthropic 兼容网关的模型标识。
    aiModel: 'gpt-6-luna',
    // Anthropic output_config.effort 取值。
    aiEffort: 'xhigh',
    managerMeeting: {
        env: 'test',
        baseUrl: 'https://testserver.comein.cn/comein/manager'
    },
    systemTrace: {
        logPath: 'logs/system-trace.ndjson'
    },
    weeklyReport: {
        directory: 'weekly-commits',
        hour: 17,
        minute: 0
    }
} as const;
