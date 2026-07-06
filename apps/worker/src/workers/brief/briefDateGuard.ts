// apps/worker/src/workers/brief/briefDateGuard.ts
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

import type { BriefJobData } from '../shared/queueUtils';

export interface StaleBriefJobDecision {
	shouldSkip: boolean;
	currentBriefDate: string;
	reason?: string;
}

export type ExistingBriefSkipReason = 'skipped_existing_brief' | 'skipped_fresh_processing_brief';

export interface ExistingDailyBriefRecord {
	id?: string | null;
	generation_status?: string | null;
	updated_at?: string | null;
}

export interface ExistingBriefJobDecision {
	shouldSkip: boolean;
	reason?: ExistingBriefSkipReason;
	message?: string;
	existingBriefId?: string;
}

interface StaleBriefJobParams {
	briefDate: string;
	timezone: string;
	options?: BriefJobData['options'];
	now?: Date;
}

interface ExistingBriefJobParams {
	briefDate: string;
	existingBrief?: ExistingDailyBriefRecord | null;
	options?: BriefJobData['options'];
	now?: Date;
	freshProcessingWindowMs?: number;
	isRetryAttempt?: boolean;
}

interface ResolveBriefDateParams {
	scheduledFor: Date;
	timezone: string;
	notificationScheduledFor?: Date;
	requestedBriefDate?: string;
}

export const FRESH_PROCESSING_BRIEF_WINDOW_MS = 10 * 60 * 1000;

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

export function getExistingBriefJobDecision({
	briefDate,
	existingBrief,
	options,
	now = new Date(),
	freshProcessingWindowMs = FRESH_PROCESSING_BRIEF_WINDOW_MS,
	isRetryAttempt = false
}: ExistingBriefJobParams): ExistingBriefJobDecision {
	if (options?.forceRegenerate === true || !existingBrief) {
		return { shouldSkip: false };
	}

	const existingBriefId = existingBrief.id ?? undefined;
	const status = existingBrief.generation_status;

	if (status === 'completed') {
		return {
			shouldSkip: true,
			reason: 'skipped_existing_brief',
			existingBriefId,
			message: `Brief ${briefDate} already completed`
		};
	}

	// A retry means the prior attempt died (timeout/stall/crash) — its abandoned
	// generation promise may still be heartbeating updated_at, so a "fresh
	// processing" row must not swallow the retry or the day's brief can be left
	// stuck at generation_status='processing' with the job terminally completed.
	if (isRetryAttempt) {
		return { shouldSkip: false };
	}

	if (status === 'processing' && existingBrief.updated_at) {
		const updatedAtMs = new Date(existingBrief.updated_at).getTime();

		if (Number.isFinite(updatedAtMs)) {
			const processingAgeMs = now.getTime() - updatedAtMs;

			if (processingAgeMs <= freshProcessingWindowMs) {
				return {
					shouldSkip: true,
					reason: 'skipped_fresh_processing_brief',
					existingBriefId,
					message: `Brief ${briefDate} is already processing`
				};
			}
		}
	}

	return { shouldSkip: false };
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
