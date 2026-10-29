export const DEFAULT_CONFIG = {
    aiModel: 'gpt-6-luna',
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
