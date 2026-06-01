import type { CloudPlayerCommandOptions, CloudPlayerMediaStreamType, CloudPlayerPlayType, CloudPlayerRepeatMode, CloudPlayerType, CreateMeetingCommand } from '../meeting.ts';

const DEFAULT_MEETING_TOPIC = '会议';
const DEFAULT_CLOUD_PLAYER_PLAY_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_REPEAT_MODE = -1;
const DEFAULT_CLOUD_PLAYER_REPEAT_TIME = 1;
const DEFAULT_CLOUD_PLAYER_TYPE = 1;
const DEFAULT_CLOUD_PLAYER_VIDEO_URL = 'https://media.comein.cn/video/344317-1740031837920.mp4';

export function parseCreateMeetingCommand(text: string): CreateMeetingCommand | null {
    const trimmedText = text.trim();
    if (trimmedText === '创建会议并创建云播') {
        return {
            type: 'create_meeting',
            title: DEFAULT_MEETING_TOPIC,
            cloudPlayer: buildCloudPlayerOptions({
                mediaStreamType: 2,
                streamUrl: DEFAULT_CLOUD_PLAYER_VIDEO_URL
            })
        };
    }

    const match = trimmedText.match(/^创建会议(?:\s+(.+))?$/s);
    if (!match) {
        return null;
    }

    const commandBody = match[1]?.trim() || '';
    const cloudPlayer = parseCloudPlayerOptions(commandBody);
    const titleText = cloudPlayer ? commandBody.slice(0, cloudPlayer.titleEndIndex).trim() : commandBody;
    const command: CreateMeetingCommand = {
        type: 'create_meeting',
        title: titleText || DEFAULT_MEETING_TOPIC
    };
    if (cloudPlayer) {
        command.cloudPlayer = cloudPlayer.options;
    }

    return command;
}

function parseCloudPlayerOptions(commandBody: string): { titleEndIndex: number; options: CloudPlayerCommandOptions } | null {
    const match = commandBody.match(/(?:^|\s)(音频)?云播(?:\s+(https?:\/\/\S+))?\s*$/i);
    if (!match || match.index === undefined) {
        return null;
    }

    const isAudio = Boolean(match[1]);
    const streamUrl = match[2] ?? (isAudio ? undefined : DEFAULT_CLOUD_PLAYER_VIDEO_URL);
    if (!streamUrl) {
        return null;
    }

    return {
        titleEndIndex: match.index,
        options: buildCloudPlayerOptions({
            mediaStreamType: isAudio ? 1 : 2,
            streamUrl
        })
    };
}

function buildCloudPlayerOptions(options: { mediaStreamType: CloudPlayerMediaStreamType; streamUrl: string }): CloudPlayerCommandOptions {
    return {
        mediaStreamType: options.mediaStreamType,
        streamUrl: options.streamUrl,
        playType: DEFAULT_CLOUD_PLAYER_PLAY_TYPE as CloudPlayerPlayType,
        repeatMode: DEFAULT_CLOUD_PLAYER_REPEAT_MODE as CloudPlayerRepeatMode,
        repeatTime: DEFAULT_CLOUD_PLAYER_REPEAT_TIME,
        type: DEFAULT_CLOUD_PLAYER_TYPE as CloudPlayerType
    };
}
