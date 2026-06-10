import type { CloudPlayerCommandOptions, MeetingCreatedReplyData, MeetingParameterOptions } from '../core/meeting.ts';

export type CreateMeetingRequest = MeetingParameterOptions & {
    title: string;
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type ParseMeetingParametersInput = {
    text: string;
    now?: Date;
};

export type ParsedMeetingParameters = MeetingParameterOptions & {
    title?: string;
};

export type MeetingParameterParser = {
    parse: (input: ParseMeetingParametersInput) => Promise<ParsedMeetingParameters>;
};

export type MeetingGateway = {
    createMeeting: (request: CreateMeetingRequest) => Promise<MeetingCreatedReplyData>;
};
