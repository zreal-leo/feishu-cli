import type { CreateMeetingRequest, MeetingGateway, MeetingParameterParser, ParsedMeetingParameters } from '../../ports/meeting.ts';
import type { CreateMeetingCommand } from '../meeting.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';
import { parseCreateMeetingCommand } from './create-meeting-parser.ts';

type CreateMeetingCommandMatch = CommandMatch<CreateMeetingCommand>;

const PARSED_PARAMETER_KEYS = ['stimeMs', 'eventWays', 'length', 'eventMode', 'serviceType', 'openStatus', 'tagName'] as const satisfies Array<keyof ParsedMeetingParameters>;

export type CreateMeetingCommandHandlerOptions = {
    parameterParser?: MeetingParameterParser;
    now?: () => Date;
};

export function createMeetingCommandHandler(meetings: MeetingGateway, options: CreateMeetingCommandHandlerOptions = {}): CommandHandler<CreateMeetingCommandMatch> {
    return {
        name: 'create-meeting',
        match(input) {
            const command = parseCreateMeetingCommand(input.text);
            return command ? { commandName: 'create-meeting', data: command } : null;
        },
        async execute(context, match) {
            const command = match.data;
            if (!command) {
                throw new Error('创建会议命令缺少解析结果。');
            }

            try {
                const parsedParameters =
                    options.parameterParser?.parse({
                        text: context.message.text,
                        now: options.now?.() ?? new Date()
                    }) ?? Promise.resolve({});
                const meeting = await meetings.createMeeting(buildCreateMeetingRequest(command, await parsedParameters));
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

function buildCreateMeetingRequest(command: CreateMeetingCommand, parsedParameters: ParsedMeetingParameters): CreateMeetingRequest {
    const request: CreateMeetingRequest = {
        title: parsedParameters.title ?? command.title
    };
    if (command.cloudPlayer) {
        request.cloudPlayer = command.cloudPlayer;
    }

    for (const key of PARSED_PARAMETER_KEYS) {
        const value = parsedParameters[key];
        if (value !== undefined) {
            Object.assign(request, { [key]: value });
        }
    }

    return request;
}
