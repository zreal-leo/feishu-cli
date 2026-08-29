export type WeeklyReportGenerator = {
    generate: (prompt: string) => Promise<string>;
};
