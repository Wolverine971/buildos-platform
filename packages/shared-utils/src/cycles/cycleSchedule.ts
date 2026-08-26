// packages/shared-utils/src/cycles/cycleSchedule.ts
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { CycleSchedule, CycleWeekday } from '@buildos/shared-types';

const MINUTE_MS = 60_000;

function normalizeTimeOfDay(value: string): string {
	return value.length === 5 ? `${value}:00` : value;
}

function addCalendarDays(date: string, days: number): string {
	const calendarDate = new Date(`${date}T00:00:00.000Z`);
	calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
	return calendarDate.toISOString().slice(0, 10);
}

function weekdayForDate(date: string): CycleWeekday {
	return new Date(`${date}T00:00:00.000Z`).getUTCDay() as CycleWeekday;
}

function localOccurrence(date: string, timeOfDay: string, timezone: string): Date {
	const requestedWallTime = `${date}T${normalizeTimeOfDay(timeOfDay)}`;
	const candidate = fromZonedTime(requestedWallTime, timezone);
	const resolvedWallTime = formatInTimeZone(candidate, timezone, "yyyy-MM-dd'T'HH:mm:ss");

	// Advance nonexistent spring-forward wall times by the DST gap. Repeated
	// fall-back wall times intentionally resolve to one earlier-offset occurrence.
	if (resolvedWallTime < requestedWallTime) {
		const gapMs = Date.parse(`${requestedWallTime}Z`) - Date.parse(`${resolvedWallTime}Z`);
		return new Date(candidate.getTime() + gapMs);
	}

	return candidate;
}

function calculateDailyNextRun(
	schedule: Extract<CycleSchedule, { type: 'daily' }>,
	now: Date
): Date {
	const localDate = formatInTimeZone(now, schedule.timezone, 'yyyy-MM-dd');
	const today = localOccurrence(localDate, schedule.time_of_day, schedule.timezone);
	if (today.getTime() >= now.getTime()) return today;

	return localOccurrence(addCalendarDays(localDate, 1), schedule.time_of_day, schedule.timezone);
}

function calculateWeeklyNextRun(
	schedule: Extract<CycleSchedule, { type: 'weekly' }>,
	now: Date
): Date {
	const localDate = formatInTimeZone(now, schedule.timezone, 'yyyy-MM-dd');
	const scheduledDays = new Set(schedule.days_of_week);

	for (let offset = 0; offset <= 7; offset += 1) {
		const candidateDate = addCalendarDays(localDate, offset);
		if (!scheduledDays.has(weekdayForDate(candidateDate))) continue;

		const candidate = localOccurrence(candidateDate, schedule.time_of_day, schedule.timezone);
		if (candidate.getTime() >= now.getTime()) return candidate;
	}

	throw new Error('A validated weekly schedule must have a next occurrence.');
}

function calculateIntervalNextRun(
	schedule: Extract<CycleSchedule, { type: 'interval' }>,
	now: Date
): Date {
	const anchor = new Date(schedule.anchor_at);
	const intervalMs = schedule.every_minutes * MINUTE_MS;
	if (anchor.getTime() >= now.getTime()) return anchor;

	const elapsed = now.getTime() - anchor.getTime();
	return new Date(anchor.getTime() + Math.ceil(elapsed / intervalMs) * intervalMs);
}

/** Project the first occurrence at or after `now` for a validated schedule. */
export function calculateNextCycleScheduleAt(schedule: CycleSchedule, now = new Date()): Date {
	if (schedule.type === 'daily') return calculateDailyNextRun(schedule, now);
	if (schedule.type === 'weekly') return calculateWeeklyNextRun(schedule, now);
	return calculateIntervalNextRun(schedule, now);
}
