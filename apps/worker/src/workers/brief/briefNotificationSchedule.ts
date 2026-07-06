// apps/worker/src/workers/brief/briefNotificationSchedule.ts
import { fromZonedTime } from 'date-fns-tz';

interface FutureNotificationScheduleParams {
	briefDate: string;
	timeOfDay?: string | null;
	timezone: string;
	isActive?: boolean | null;
	now?: Date;
}

function parseTimeOfDay(timeOfDay?: string | null) {
	const parts = (timeOfDay || '09:00:00').split(':');
	if (parts.length < 2) return null;

	const hours = Number(parts[0]);
	const minutes = Number(parts[1]);
	const seconds = Number(parts[2] ?? '0');

	if (
		!Number.isInteger(hours) ||
		!Number.isInteger(minutes) ||
		!Number.isInteger(seconds) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59 ||
		seconds < 0 ||
		seconds > 59
	) {
		return null;
	}

	return { hours, minutes, seconds };
}

export function getFutureNotificationScheduledFor({
	briefDate,
	timeOfDay,
	timezone,
	isActive,
	now = new Date()
}: FutureNotificationScheduleParams): Date | undefined {
	if (isActive === false) return undefined;

	const time = parseTimeOfDay(timeOfDay);
	if (!time) return undefined;

	const [year, month, day] = briefDate.split('-').map(Number);
	if (!year || !month || !day) return undefined;

	const localTimestamp = `${briefDate} ${String(time.hours).padStart(2, '0')}:${String(
		time.minutes
	).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;
	const targetUtcTime = fromZonedTime(localTimestamp, timezone);

	if (targetUtcTime.getTime() <= now.getTime()) {
		return undefined;
	}

	return targetUtcTime;
}
