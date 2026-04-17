// apps/worker/src/workers/brief/briefDateGuard.ts
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import type { BriefJobData } from '../shared/queueUtils';

export interface StaleBriefJobDecision {
	shouldSkip: boolean;
	currentBriefDate: string;
	reason?: string;
}

interface StaleBriefJobParams {
	briefDate: string;
	timezone: string;
	options?: BriefJobData['options'];
	now?: Date;
}

interface ResolveBriefDateParams {
	scheduledFor: Date;
	timezone: string;
	notificationScheduledFor?: Date;
	requestedBriefDate?: string;
}

export function getLocalDateString(date: Date, timezone: string): string {
	return format(toZonedTime(date, timezone), 'yyyy-MM-dd');
}

function isExplicitBriefDateRequest(options?: BriefJobData['options']): boolean {
	return options?.forceRegenerate === true || typeof options?.requestedBriefDate === 'string';
}

export function getStaleBriefJobDecision({
	briefDate,
	timezone,
	options,
	now = new Date()
}: StaleBriefJobParams): StaleBriefJobDecision {
	const currentBriefDate = getLocalDateString(now, timezone);

	if (isExplicitBriefDateRequest(options)) {
		return {
			shouldSkip: false,
			currentBriefDate
		};
	}

	if (briefDate < currentBriefDate) {
		return {
			shouldSkip: true,
			currentBriefDate,
			reason: `Brief date ${briefDate} is before current local date ${currentBriefDate} in ${timezone}`
		};
	}

	return {
		shouldSkip: false,
		currentBriefDate
	};
}

export function resolveScheduledBriefDate({
	scheduledFor,
	timezone,
	notificationScheduledFor,
	requestedBriefDate
}: ResolveBriefDateParams): string {
	if (requestedBriefDate) {
		return requestedBriefDate;
	}

	const dateSource = notificationScheduledFor ?? scheduledFor;
	return getLocalDateString(dateSource, timezone);
}
