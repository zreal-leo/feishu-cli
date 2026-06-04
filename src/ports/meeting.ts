import type { CloudPlayerCommandOptions, MeetingCreatedReplyData } from '../core/meeting.ts';

export type CreateMeetingRequest = {
    title: string;
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type MeetingGateway = {
    createMeeting: (request: CreateMeetingRequest) => Promise<MeetingCreatedReplyData>;
};
