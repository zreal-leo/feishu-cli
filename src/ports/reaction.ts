export type ReactionGateway = {
    add: (messageId: string, emojiType: string) => Promise<{ reactionId?: string } | void>;
    remove: (messageId: string, reactionId: string) => Promise<void>;
};
