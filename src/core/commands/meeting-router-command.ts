import type { CreateMeetingRequest, MeetingGateway, ParsedMeetingIntentParameters } from '../../ports/meeting.ts';
import type { MessageRouterGateway } from '../../ports/message-router.ts';
import { runCommandTraceStep } from '../system-trace.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';

type MeetingRouterCommandMatch = CommandMatch;

const DEFAULT_MEETING_TOPIC = '会议';
const PARSED_PARAMETER_KEYS = ['stimeMs', 'eventWays', 'length', 'eventMode', 'serviceType', 'openStatus', 'tagName'] as const satisfies Array<keyof ParsedMeetingIntentParameters>;

export type CreateMeetingRouterCommandHandlerOptions = {
    router: MessageRouterGateway;
    meetings: MeetingGateway;
    now?: () => Date;
};

export function createMeetingRouterCommandHandler(options: CreateMeetingRouterCommandHandlerOptions): CommandHandler<MeetingRouterCommandMatch> {
    return {
        name: 'meeting-router',
        match() {
            return { commandName: 'meeting-router' };
        },
        async execute(context) {
            const route = await runCommandTraceStep(context.trace, 'router.invoke', () =>
                options.router.route({
                    text: context.message.text,
                    now: options.now?.() ?? new Date()
                })
            );

            if (route.action === 'create_meeting') {
                try {
                    const meeting = await runCommandTraceStep(context.trace, 'meeting.create', () => options.meetings.createMeeting(buildCreateMeetingRequest(route.parameters)));
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

            return route.stream;
        }
    };
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
