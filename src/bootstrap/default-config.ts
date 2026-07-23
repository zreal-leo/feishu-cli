export const DEFAULT_CONFIG = {
    aiModel: 'claude-sonnet-4-6',
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
    }
} as const;
