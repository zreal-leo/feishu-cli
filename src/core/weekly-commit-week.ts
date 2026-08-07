export const ENGLISH_MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
] as const;

export function getWeekSunday(date: Date): Date {
    const sunday = new Date(date);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(date.getDate() - date.getDay());
    return sunday;
}

export function getWeekOfMonthIndex(sunday: Date): number {
    const year = sunday.getFullYear();
    const month = sunday.getMonth();
    const sundays: number[] = [];
    const cursor = new Date(year, month, 1);

    while (cursor.getMonth() === month) {
        if (cursor.getDay() === 0) {
            sundays.push(cursor.getDate());
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return sundays.indexOf(sunday.getDate()) + 1;
}

export function formatWeeklyCommitFileName(date: Date): string {
    const sunday = getWeekSunday(date);
    const year = sunday.getFullYear();
    const month = ENGLISH_MONTH_NAMES[sunday.getMonth()];
    const weekIndex = getWeekOfMonthIndex(sunday);
    return `${year}-${month}-W${weekIndex}.ndjson`;
}

function formatLocalDateLabel(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getWeekRangeLabels(date: Date): { sunday: string; saturday: string } {
    const sunday = getWeekSunday(date);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);

    return {
        sunday: formatLocalDateLabel(sunday),
        saturday: formatLocalDateLabel(saturday)
    };
}
