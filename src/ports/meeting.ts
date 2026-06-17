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

export type ParsedMeetingIntentParameters = ParsedMeetingParameters & {
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type ParsedMeetingIntent =
    | {
          action: 'assistant';
      }
    | {
          action: 'create_meeting';
          parameters: ParsedMeetingIntentParameters;
      };

export type MeetingIntentParser = {
    parse: (input: ParseMeetingParametersInput) => Promise<ParsedMeetingIntent>;
};

export type MeetingGateway = {
    createMeeting: (request: CreateMeetingRequest) => Promise<MeetingCreatedReplyData>;
};
