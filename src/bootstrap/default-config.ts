export const DEFAULT_CONFIG = {
    aiModel: 'gpt-5.6-luna',
    aiEffort: 'high',
    cursorUsage: {
        baseUrl: 'https://cursor.com',
        pageSize: 100
    },
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
