// apps/mobile/src/components/today/day-flags.ts
// Choices that last for one day: "Today went sideways" and a dismissed close-out. Kept in
// memory (the web keeps them in localStorage): they survive tab switches and reopening Today,
// and a cold start the next morning begins clean anyway.
export type DayFlag = 'sideways' | 'closeout-hidden';

const flags = new Set<string>();

export function readDayFlag(date: string, flag: DayFlag): boolean {
	return flags.has(`${date}:${flag}`);
}

export function writeDayFlag(date: string, flag: DayFlag, on: boolean): void {
	if (on) flags.add(`${date}:${flag}`);
	else flags.delete(`${date}:${flag}`);
}
