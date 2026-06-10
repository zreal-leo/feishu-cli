export type CloudPlayerMediaStreamType = 1 | 2;
export type CloudPlayerPlayType = 1;
export type CloudPlayerRepeatMode = -1 | 1 | 2;
export type CloudPlayerType = 0 | 1 | 2;

export type CloudPlayerCommandOptions = {
    mediaStreamType: CloudPlayerMediaStreamType;
    streamUrl: string;
    playType: CloudPlayerPlayType;
    repeatMode: CloudPlayerRepeatMode;
    repeatTime: number;
    type: CloudPlayerType;
};

export type MeetingEventWay = -1 | 0 | 1;
export type MeetingEventMode = 966 | 965 | 964 | 920 | 919 | 579 | 570 | 569 | 568 | 567 | 963;
export type MeetingServiceType = 0 | 3 | 5 | 7 | 8;
export type MeetingOpenStatus = 0 | 1 | 2 | 4 | 7 | 8 | 9 | 10;

export type MeetingParameterOptions = {
    stimeMs?: number;
    eventWays?: MeetingEventWay;
    length?: number;
    eventMode?: MeetingEventMode;
    serviceType?: MeetingServiceType;
    openStatus?: MeetingOpenStatus;
    tagName?: string;
};

export type MeetingPermissionBackendFields = {
    serviceType: MeetingServiceType;
    openStatus: MeetingOpenStatus;
    tagName: string;
};

export const MEETING_EVENT_WAY_LABELS = {
    '-1': '无直播',
    '0': '音频路演',
    '1': '视频路演'
} as const satisfies Record<`${MeetingEventWay}`, string>;

export const MEETING_EVENT_MODE_LABELS = {
    966: '直播类型删除标签',
    965: '直播类型10',
    964: '直播类型2',
    920: '文字路演',
    919: '电话会议联通',
    579: '其他',
    570: '上传回放',
    569: '线下直播',
    568: '电话会议直播',
    567: '上麦直播',
    963: '直播类型1编辑'
} as const satisfies Record<MeetingEventMode, string>;

export const MEETING_PERMISSION_OPTIONS = {
    '0': { serviceType: 0, openStatus: 1, tagName: '公开' },
    '7': { serviceType: 7, openStatus: 2, tagName: '专场活动' },
    '8': { serviceType: 8, openStatus: 7, tagName: '申请参会' },
    '3': { serviceType: 3, openStatus: 4, tagName: '金融课堂' },
    '5': { serviceType: 5, openStatus: 8, tagName: '投资调研' },
    '1': { serviceType: 0, openStatus: 0, tagName: '私密' },
    '2': { serviceType: 0, openStatus: 9, tagName: '专栏' },
    '9': { serviceType: 0, openStatus: 10, tagName: '付费' }
} as const satisfies Record<string, MeetingPermissionBackendFields>;

export type CreateMeetingCommand = {
    type: 'create_meeting';
    title: string;
    cloudPlayer?: CloudPlayerCommandOptions;
} & MeetingParameterOptions;

export type MeetingCreatedReplyData = {
    title: string;
    roadshowId: number;
    eventId: number;
    netLiveUrl: string;
    cloudPlayerCreated?: boolean;
    cloudPlayerError?: string;
};
