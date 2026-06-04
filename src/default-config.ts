export const DEFAULT_CONFIG = {
    cursorModel: 'composer-2.5',
    cursorUsage: {
        baseUrl: 'https://cursor.com',
        pageSize: 100
    },
    managerMeeting: {
        env: 'test',
        baseUrl: 'https://testserver.comein.cn/comein/manager'
    }
} as const;
