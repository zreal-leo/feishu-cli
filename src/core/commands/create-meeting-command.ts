import type { MeetingGateway } from '../../ports/meeting.ts';
import type { CreateMeetingCommand } from '../meeting.ts';
import type { CommandHandler, CommandMatch } from '../types.ts';
import { parseCreateMeetingCommand } from './create-meeting-parser.ts';

type CreateMeetingCommandMatch = CommandMatch<CreateMeetingCommand>;

export function createMeetingCommandHandler(meetings: MeetingGateway): CommandHandler<CreateMeetingCommandMatch> {
    return {
        name: 'create-meeting',
        match(input) {
            const command = parseCreateMeetingCommand(input.text);
            return command ? { commandName: 'create-meeting', data: command } : null;
        },
        async execute(_context, match) {
            const command = match.data;
            if (!command) {
                throw new Error('创建会议命令缺少解析结果。');
            }

            try {
                const meeting = await meetings.createMeeting({
                    title: command.title,
                    cloudPlayer: command.cloudPlayer
                });
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
