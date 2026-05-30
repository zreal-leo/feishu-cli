import type { ManagerMeetingEnv } from './config.js';

export const DEFAULT_CONFIG = {
    cursorModel: 'composer-2.5',
    managerMeeting: {
        env: 'test' as ManagerMeetingEnv,
        baseUrls: {
            test: 'https://testserver.comein.cn/comein/manager',
            prod: 'https://server.comein.cn/comein/manager'
        }
    }
};
