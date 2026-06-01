import type { CommandHandler, CommandMatch, MessageInput } from './types.ts';

type RegisteredCommandHandler = CommandHandler<CommandMatch<any>>;

export type ResolvedCommand = {
    handler: RegisteredCommandHandler;
    match: CommandMatch;
};

export type CommandRegistry = {
    resolve: (input: MessageInput) => ResolvedCommand | null;
};

export function createCommandRegistry(handlers: RegisteredCommandHandler[], fallback?: RegisteredCommandHandler): CommandRegistry {
    return {
        resolve(input) {
            for (const handler of handlers) {
                const match = handler.match(input);
                if (match) {
                    return { handler, match };
                }
            }

            if (!fallback) {
                return null;
            }

            const fallbackMatch = fallback.match(input);
            return fallbackMatch ? { handler: fallback, match: fallbackMatch } : null;
        }
    };
}
