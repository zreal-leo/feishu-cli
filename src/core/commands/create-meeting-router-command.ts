import type { AssistantGateway } from '../../ports/assistant.ts';
import type { CreateMeetingRequest, MeetingGateway, MeetingIntentParser, ParsedMeetingIntentParameters } from '../../ports/meeting.ts';
import { buildCursorPrompt } from '../assistant-prompt.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';

type MeetingRouterCommandMatch = CommandMatch;

const DEFAULT_MEETING_TOPIC = '会议';
const PARSED_PARAMETER_KEYS = ['stimeMs', 'eventWays', 'length', 'eventMode', 'serviceType', 'openStatus', 'tagName'] as const satisfies Array<keyof ParsedMeetingIntentParameters>;

export type CreateMeetingRouterCommandHandlerOptions = {
    intentParser: MeetingIntentParser;
    meetings: MeetingGateway;
    assistant: AssistantGateway;
    now?: () => Date;
};

export function createMeetingRouterCommandHandler(options: CreateMeetingRouterCommandHandlerOptions): CommandHandler<MeetingRouterCommandMatch> {
    return {
        name: 'meeting-router',
        match() {
            return { commandName: 'meeting-router' };
        },
        async execute(context) {
            let intent;
            try {
                intent = await options.intentParser.parse({
                    text: context.message.text,
                    now: options.now?.() ?? new Date()
                });
            } catch {
                return streamAssistantReply(options.assistant, context.message.text);
            }

            if (intent.action !== 'create_meeting') {
                return streamAssistantReply(options.assistant, context.message.text);
            }

            try {
                const meeting = await options.meetings.createMeeting(buildCreateMeetingRequest(intent.parameters));
                return {
                    type: 'meeting_created',
                    data: meeting
                };
            } catch (error) {
                return {
                    type: 'meeting_failed',
                    error
                };
            }
        }
    };
}

function streamAssistantReply(assistant: AssistantGateway, text: string): AsyncIterable<string> {
    return assistant.streamReply(buildCursorPrompt(text));
}

function buildCreateMeetingRequest(parameters: ParsedMeetingIntentParameters): CreateMeetingRequest {
    const request: CreateMeetingRequest = {
        title: parameters.title ?? DEFAULT_MEETING_TOPIC
    };
    if (parameters.cloudPlayer) {
        request.cloudPlayer = parameters.cloudPlayer;
    }

    for (const key of PARSED_PARAMETER_KEYS) {
        const value = parameters[key];
        if (value !== undefined) {
            Object.assign(request, { [key]: value });
        }
    }

    return request;
}
