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

export type CreateMeetingCommand = {
    type: 'create_meeting';
    title: string;
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type MeetingCreatedReplyData = {
    title: string;
    roadshowId: number;
    eventId: number;
    netLiveUrl: string;
    cloudPlayerCreated?: boolean;
    cloudPlayerError?: string;
};
