// apps/worker/src/workers/brief/briefNotificationSchedule.ts
import { fromZonedTime } from 'date-fns-tz';

interface FutureNotificationScheduleParams {
	briefDate: string;
	timeOfDay?: string | null;
	timezone: string;
	isActive?: boolean | null;
	now?: Date;
}

interface ImmediateBriefNotificationParams extends FutureNotificationScheduleParams {
	suppressIfPastPreferredTime?: boolean;
}

export type BriefNotificationSuppressionReason =
	| 'inactive_preference'
	| 'invalid_preference'
	| 'preferred_time_passed'
	| 'preference_lookup_failed'
	| 'preference_missing';

export type ImmediateBriefNotificationDecision =
	| {
			notificationScheduledFor: Date;
			suppressNotification: false;
			reason: 'preferred_time_pending';
	  }
	| {
			notificationScheduledFor?: undefined;
			suppressNotification: false;
			reason: 'notify_immediately';
	  }
	| {
			notificationScheduledFor?: undefined;
			suppressNotification: true;
			reason: 'inactive_preference' | 'invalid_preference' | 'preferred_time_passed';
	  };

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
	return resolveImmediateBriefNotification({
		briefDate,
		timeOfDay,
		timezone,
		isActive,
		now,
		suppressIfPastPreferredTime: true
	}).notificationScheduledFor;
}

/**
 * Resolves notification behavior for an immediately generated brief.
 *
 * A missing scheduled timestamp normally means "notify now" downstream, so
 * callers that generate a quiet app-open catch-up need an explicit suppression
 * decision after the user's preferred time has passed.
 */
export function resolveImmediateBriefNotification({
	briefDate,
	timeOfDay,
	timezone,
	isActive,
	now = new Date(),
	suppressIfPastPreferredTime = false
}: ImmediateBriefNotificationParams): ImmediateBriefNotificationDecision {
	if (isActive === false) {
		return {
			suppressNotification: true,
			reason: 'inactive_preference'
		};
	}

	const time = parseTimeOfDay(timeOfDay);
	const [year, month, day] = briefDate.split('-').map(Number);
	if (!time || !year || !month || !day) {
		return {
			suppressNotification: true,
			reason: 'invalid_preference'
		};
	}

	const localTimestamp = `${briefDate} ${String(time.hours).padStart(2, '0')}:${String(
		time.minutes
	).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;

	let targetUtcTime: Date;
	try {
		targetUtcTime = fromZonedTime(localTimestamp, timezone);
	} catch {
		return {
			suppressNotification: true,
			reason: 'invalid_preference'
		};
	}

	if (Number.isNaN(targetUtcTime.getTime())) {
		return {
			suppressNotification: true,
			reason: 'invalid_preference'
		};
	}

	if (targetUtcTime.getTime() > now.getTime()) {
		return {
			notificationScheduledFor: targetUtcTime,
			suppressNotification: false,
			reason: 'preferred_time_pending'
		};
	}

	if (suppressIfPastPreferredTime) {
		return {
			suppressNotification: true,
			reason: 'preferred_time_passed'
		};
	}

	return {
		suppressNotification: false,
		reason: 'notify_immediately'
	};
}
