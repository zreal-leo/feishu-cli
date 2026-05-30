const DEFAULT_MEETING_TOPIC = 'Cursor 临时会议';
const DEFAULT_MEETING_DURATION_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_MEETING_INITIAL_TYPE = 1;
const DEFAULT_MEETING_CONNECT = true;

export type CreateMeetingCommand = {
    topic?: string;
};

export type CreatedMeeting = {
    id?: string;
    topic?: string;
    meetingNo?: string;
    password?: string;
    url?: string;
    endTime?: string;
};

export type MeetingReservationPayload = {
    params: {
        user_id_type: 'open_id';
    };
    data: {
        end_time: string;
        owner_id: string;
        meeting_settings: {
            topic: string;
            meeting_initial_type: typeof DEFAULT_MEETING_INITIAL_TYPE;
            meeting_connect: typeof DEFAULT_MEETING_CONNECT;
        };
    };
};

export type MeetingReservationResponse = {
    code?: number;
    msg?: string;
    data?: {
        reserve?: {
            id?: string;
            meeting_no?: string;
            password?: string;
            url?: string;
            end_time?: string;
        };
    };
};

export type ApplyMeetingReserve = (payload: MeetingReservationPayload) => Promise<MeetingReservationResponse>;

export type CreateFeishuMeetingReservationOptions = {
    applyReserve: ApplyMeetingReserve;
    ownerOpenId: string;
    topic?: string;
    now?: Date;
};

const CREATE_MEETING_COMMAND_PATTERN = /^(?:\/?创建会议|\/?新建会议|\/?meeting)(?:\s+(.+))?$/i;

export function parseCreateMeetingCommand(text: string): CreateMeetingCommand | null {
    const match = text.trim().match(CREATE_MEETING_COMMAND_PATTERN);
    if (!match) {
        return null;
    }

    const topic = match[1]?.trim();
    return { topic: topic || undefined };
}

export function buildMeetingReservationPayload(options: { ownerOpenId: string; topic?: string; now?: Date }): MeetingReservationPayload {
    const now = options.now ?? new Date();
    const topic = options.topic?.trim() || DEFAULT_MEETING_TOPIC;

    return {
        params: {
            user_id_type: 'open_id'
        },
        data: {
            end_time: String(Math.floor(now.getTime() / 1000) + DEFAULT_MEETING_DURATION_SECONDS),
            owner_id: options.ownerOpenId,
            meeting_settings: {
                topic,
                meeting_initial_type: DEFAULT_MEETING_INITIAL_TYPE,
                meeting_connect: DEFAULT_MEETING_CONNECT
            }
        }
    };
}

export async function createFeishuMeetingReservation(options: CreateFeishuMeetingReservationOptions): Promise<CreatedMeeting> {
    const payload = buildMeetingReservationPayload(options);
    const response = await options.applyReserve(payload);

    if (response.code !== undefined && response.code !== 0) {
        throw new Error(`Feishu meeting reservation failed: ${response.msg ?? response.code}`);
    }

    const reserve = response.data?.reserve;
    if (!reserve) {
        throw new Error('Feishu meeting reservation response is missing reserve data');
    }

    return {
        id: reserve.id,
        topic: payload.data.meeting_settings.topic,
        meetingNo: reserve.meeting_no,
        password: reserve.password,
        url: reserve.url,
        endTime: reserve.end_time
    };
}

export function formatCreatedMeetingReply(meeting: CreatedMeeting): string {
    const lines = [`会议已创建：${meeting.topic?.trim() || DEFAULT_MEETING_TOPIC}`];

    if (meeting.meetingNo) {
        lines.push(`会议号：${meeting.meetingNo}`);
    }

    if (meeting.url) {
        lines.push(`入会链接：${meeting.url}`);
    }

    if (meeting.password) {
        lines.push(`会议密码：${meeting.password}`);
    }

    if (meeting.endTime) {
        lines.push(`预约到期：${formatUnixSeconds(meeting.endTime)}`);
    }

    return lines.join('\n');
}

function formatUnixSeconds(value: string): string {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
        return value;
    }

    const date = new Date(seconds * 1000);
    const year = date.getUTCFullYear();
    const month = padTwoDigits(date.getUTCMonth() + 1);
    const day = padTwoDigits(date.getUTCDate());
    const hour = padTwoDigits(date.getUTCHours());
    const minute = padTwoDigits(date.getUTCMinutes());

    return `${year}-${month}-${day} ${hour}:${minute}`;
}

function padTwoDigits(value: number): string {
    return String(value).padStart(2, '0');
}
