import type { ParseMeetingParametersInput, ParsedMeetingIntentParameters } from './meeting.ts';
import type { ReplyStream } from '../core/types.ts';

export type RoutedMessage =
    | {
          action: 'assistant';
          stream: ReplyStream;
      }
    | {
          action: 'create_meeting';
          parameters: ParsedMeetingIntentParameters;
      };

export type MessageRouterGateway = {
    route: (input: ParseMeetingParametersInput) => Promise<RoutedMessage>;
};
