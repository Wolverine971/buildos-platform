// apps/worker/src/workers/brief/briefScheduleIdempotency.ts
import type { QueueJobStatus } from '@buildos/shared-types';

export const BRIEF_SCHEDULE_BLOCKING_STATUSES: QueueJobStatus[] = [
	'pending',
	'processing',
	'retrying',
	'completed',
	'failed'
];

export interface ExistingBriefScheduleJob {
	user_id: string;
	status: QueueJobStatus;
	metadata: unknown;
}

function hasSuppressedNotification(metadata: unknown): boolean {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return false;
	}

	const options = (metadata as Record<string, unknown>).options;
	return (
		Boolean(options) &&
		typeof options === 'object' &&
		!Array.isArray(options) &&
		(options as Record<string, unknown>).suppressNotification === true
	);
}

function hasDurableNotificationOutcome(metadata: unknown): boolean {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return false;
	}

	const outcome = (metadata as Record<string, unknown>).notificationOutcome;
	return outcome === 'emitted' || outcome === 'suppressed';
}

function getBriefDate(metadata: unknown): string | undefined {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return undefined;
	}

	const briefDate = (metadata as Record<string, unknown>).briefDate;
	return typeof briefDate === 'string' ? briefDate : undefined;
}

export function getBriefScheduleKey(userId: string, briefDate: string): string {
	return `${userId}:${briefDate}`;
}

/**
 * Queue-level deduplication protects concurrent active jobs. A terminal quiet
 * catch-up also blocks a later scheduler backfill, because that would turn an
 * intentionally in-app-only attempt into an out-of-window email/SMS.
 *
 * Completed scheduled jobs without a durable emission outcome remain eligible
 * for one recovery pass: the brief worker deliberately re-emits the idempotent
 * notification event when a brief exists, covering a crash after persistence
 * but before event emission.
 */
export function getBlockingBriefScheduleKeys(jobs: ExistingBriefScheduleJob[]): Set<string> {
	const blockingStatuses = new Set<QueueJobStatus>(BRIEF_SCHEDULE_BLOCKING_STATUSES);
	const keys = new Set<string>();

	for (const job of jobs) {
		if (!blockingStatuses.has(job.status)) continue;
		if (
			(job.status === 'completed' || job.status === 'failed') &&
			!hasSuppressedNotification(job.metadata) &&
			!hasDurableNotificationOutcome(job.metadata)
		) {
			continue;
		}

		const briefDate = getBriefDate(job.metadata);
		if (!briefDate) continue;

		keys.add(getBriefScheduleKey(job.user_id, briefDate));
	}

	return keys;
}
