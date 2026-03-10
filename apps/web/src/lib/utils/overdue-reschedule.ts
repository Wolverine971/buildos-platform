// apps/web/src/lib/utils/overdue-reschedule.ts
import { addDays, endOfDay, endOfWeek, startOfDay, startOfWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type OverdueReschedulePreset = 'today' | 'tomorrow' | 'plus3' | 'nextWeek';

export interface SchedulingPreferencesShape {
	work_start_time?: string | null;
	work_end_time?: string | null;
	working_days?: number[] | null;
	default_task_duration_minutes?: number | null;
	min_task_duration_minutes?: number | null;
	max_task_duration_minutes?: number | null;
	prefer_morning_for_important_tasks?: boolean | null;
}

export interface CandidateSlot {
	start: Date;
	end: Date;
}

export interface RescheduleWindow {
	requestedStartLocal: Date;
	requestedEndLocal: Date;
	startLocal: Date;
	endLocal: Date;
	note: string | null;
}

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const MIN_NEXT_WEEK_BUFFER_DAYS = 5;

function cloneDate(value: Date): Date {
	return new Date(value.getTime());
}

function isFiniteInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

export function getWorkingDays(workingDays?: number[] | null): number[] {
	if (!Array.isArray(workingDays)) {
		return [...DEFAULT_WORKING_DAYS];
	}

	const normalized = workingDays.filter(
		(day): day is number => isFiniteInteger(day) && day >= 0 && day <= 6
	);

	return normalized.length > 0 ? normalized : [...DEFAULT_WORKING_DAYS];
}

export function isWorkingDay(date: Date, workingDays?: number[] | null): boolean {
	return getWorkingDays(workingDays).includes(date.getDay());
}

function sameLocalDay(left: Date, right: Date): boolean {
	return (
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth() &&
		left.getDate() === right.getDate()
	);
}

function maxDate(left: Date, right: Date): Date {
	return left.getTime() >= right.getTime() ? left : right;
}

function startOfNextCalendarWeek(localNow: Date): Date {
	return startOfWeek(addDays(startOfDay(localNow), 7), { weekStartsOn: 1 });
}

function findNextWorkingDayStart(
	startLocal: Date,
	endLocal: Date,
	workingDays?: number[] | null
): Date | null {
	let cursor = startOfDay(startLocal);
	const boundary = startOfDay(endLocal);

	while (cursor.getTime() <= boundary.getTime()) {
		if (isWorkingDay(cursor, workingDays)) {
			if (sameLocalDay(cursor, startLocal)) {
				return cloneDate(startLocal);
			}
			return cursor;
		}
		cursor = addDays(cursor, 1);
	}

	return null;
}

function formatLocalDateTimeForTest(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	const hours = String(value.getHours()).padStart(2, '0');
	const minutes = String(value.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function debugLocalDateTime(value: Date): string {
	return formatLocalDateTimeForTest(value);
}

export function buildRescheduleWindow(params: {
	preset: OverdueReschedulePreset;
	now?: Date;
	timezone: string;
	workingDays?: number[] | null;
}): RescheduleWindow {
	const localNow = toZonedTime(params.now ?? new Date(), params.timezone);
	let requestedStartLocal: Date;
	let requestedEndLocal: Date;
	let startLocal: Date;
	let note: string | null = null;

	switch (params.preset) {
		case 'today':
			requestedStartLocal = cloneDate(localNow);
			requestedEndLocal = endOfDay(localNow);
			startLocal = cloneDate(requestedStartLocal);
			break;
		case 'tomorrow': {
			const target = addDays(startOfDay(localNow), 1);
			requestedStartLocal = target;
			requestedEndLocal = endOfDay(target);
			startLocal = cloneDate(requestedStartLocal);
			break;
		}
		case 'plus3': {
			const target = addDays(startOfDay(localNow), 3);
			requestedStartLocal = target;
			requestedEndLocal = endOfDay(target);
			startLocal = cloneDate(requestedStartLocal);
			break;
		}
		case 'nextWeek': {
			const nextWeekStart = startOfNextCalendarWeek(localNow);
			const minBufferedStart = addDays(localNow, MIN_NEXT_WEEK_BUFFER_DAYS);
			requestedStartLocal = nextWeekStart;
			requestedEndLocal = endOfWeek(nextWeekStart, { weekStartsOn: 1 });
			startLocal = maxDate(nextWeekStart, minBufferedStart);
			if (startLocal.getTime() > nextWeekStart.getTime()) {
				note = 'Next week starts later to preserve at least a five-day buffer.';
			}
			break;
		}
	}

	if (params.preset !== 'today') {
		const workingDayBoundary =
			params.preset === 'nextWeek' ? requestedEndLocal : addDays(requestedEndLocal, 7);
		const shiftedStart = findNextWorkingDayStart(
			startLocal,
			workingDayBoundary,
			params.workingDays
		);
		if (!shiftedStart) {
			return {
				requestedStartLocal,
				requestedEndLocal,
				startLocal: requestedEndLocal,
				endLocal: requestedEndLocal,
				note: note ?? 'No working days are available inside the selected scheduling window.'
			};
		}
		if (shiftedStart.getTime() !== startLocal.getTime()) {
			note =
				params.preset === 'nextWeek'
					? note
						? `${note} Suggestions begin on the next working day inside that week.`
						: 'Suggestions begin on the next working day inside that week.'
					: 'The selected day is outside your working days, so suggestions begin on the next working day.';
			if (params.preset !== 'nextWeek') {
				requestedEndLocal = endOfDay(shiftedStart);
			}
			startLocal = shiftedStart;
		}
	}

	return {
		requestedStartLocal,
		requestedEndLocal,
		startLocal,
		endLocal: requestedEndLocal,
		note
	};
}

export function resolveDurationMinutes(
	taskDurationMinutes: number | null | undefined,
	preferences: SchedulingPreferencesShape
): number {
	const defaultDuration =
		typeof preferences.default_task_duration_minutes === 'number' &&
		Number.isFinite(preferences.default_task_duration_minutes)
			? preferences.default_task_duration_minutes
			: 60;
	const minDuration =
		typeof preferences.min_task_duration_minutes === 'number' &&
		Number.isFinite(preferences.min_task_duration_minutes)
			? preferences.min_task_duration_minutes
			: 30;
	const maxDuration =
		typeof preferences.max_task_duration_minutes === 'number' &&
		Number.isFinite(preferences.max_task_duration_minutes)
			? preferences.max_task_duration_minutes
			: 240;

	let duration =
		typeof taskDurationMinutes === 'number' && Number.isFinite(taskDurationMinutes)
			? taskDurationMinutes
			: defaultDuration;
	duration = Math.max(duration, minDuration, 15);
	duration = Math.min(duration, maxDuration);

	return Math.round(duration);
}

export function parseClockTime(
	value: string | null | undefined,
	fallbackHours: number,
	fallbackMinutes = 0
): { hours: number; minutes: number } {
	if (!value) {
		return { hours: fallbackHours, minutes: fallbackMinutes };
	}

	const [hoursRaw = '0', minutesRaw = '0'] = value.split(':');
	const hours = Number.parseInt(hoursRaw, 10);
	const minutes = Number.parseInt(minutesRaw, 10);

	return {
		hours: Number.isFinite(hours) ? hours : fallbackHours,
		minutes: Number.isFinite(minutes) ? minutes : fallbackMinutes
	};
}

export function createLocalWorkWindow(
	dayLocal: Date,
	preferences: SchedulingPreferencesShape
): { startLocal: Date; endLocal: Date } {
	const dayStart = startOfDay(dayLocal);
	const startTime = parseClockTime(preferences.work_start_time, 9, 0);
	const endTime = parseClockTime(preferences.work_end_time, 17, 0);

	const startLocal = new Date(dayStart);
	startLocal.setHours(startTime.hours, startTime.minutes, 0, 0);

	const endLocal = new Date(dayStart);
	endLocal.setHours(endTime.hours, endTime.minutes, 0, 0);

	return { startLocal, endLocal };
}

export function roundUpToInterval(date: Date, minutes: number): Date {
	const rounded = new Date(date);
	rounded.setSeconds(0, 0);

	const minuteValue = rounded.getMinutes();
	const remainder = minuteValue % minutes;

	if (remainder === 0) {
		return rounded;
	}

	rounded.setMinutes(minuteValue + (minutes - remainder));
	return rounded;
}

export function sortCandidateSlots(
	slots: CandidateSlot[],
	options: {
		searchStartLocal: Date;
		timezone: string;
		preferMorning: boolean;
	}
): CandidateSlot[] {
	const originDay = startOfDay(options.searchStartLocal).getTime();

	function morningBucket(date: Date): number {
		if (!options.preferMorning) return 0;
		const local = toZonedTime(date, options.timezone);
		const hour = local.getHours();
		if (hour < 12) return 0;
		if (hour < 15) return 1;
		return 2;
	}

	return [...slots].sort((left, right) => {
		const leftLocal = toZonedTime(left.start, options.timezone);
		const rightLocal = toZonedTime(right.start, options.timezone);
		const leftDayDelta = startOfDay(leftLocal).getTime() - originDay;
		const rightDayDelta = startOfDay(rightLocal).getTime() - originDay;
		if (leftDayDelta !== rightDayDelta) {
			return leftDayDelta - rightDayDelta;
		}

		const leftBucket = morningBucket(left.start);
		const rightBucket = morningBucket(right.start);
		if (leftBucket !== rightBucket) {
			return leftBucket - rightBucket;
		}

		return left.start.getTime() - right.start.getTime();
	});
}
