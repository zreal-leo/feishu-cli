export type AssistantGateway = {
    streamReply: (prompt: string) => AsyncIterable<string>;
};
