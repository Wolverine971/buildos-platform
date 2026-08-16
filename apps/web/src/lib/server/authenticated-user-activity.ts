// apps/web/src/lib/server/authenticated-user-activity.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';

// Engagement backoff only needs a coarse signal. Keeping the database write
// sparse avoids turning normal navigation into a write-heavy code path.
export const AUTHENTICATED_ACTIVITY_WRITE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AUTHENTICATED_ACTIVITY_CHECK_CACHE_MS = 30 * 60 * 1000;
const AUTHENTICATED_ACTIVITY_CACHE_MAX_USERS = 5_000;

const nextActivityCheckByUser = new Map<string, number>();

interface RecordAuthenticatedUserActivityOptions {
	now?: Date;
}

function pruneActivityCheckCache(nowMs: number): void {
	if (nextActivityCheckByUser.size < AUTHENTICATED_ACTIVITY_CACHE_MAX_USERS) return;

	for (const [cachedUserId, expiresAt] of nextActivityCheckByUser) {
		if (expiresAt <= nowMs) {
			nextActivityCheckByUser.delete(cachedUserId);
		}
	}

	while (nextActivityCheckByUser.size >= AUTHENTICATED_ACTIVITY_CACHE_MAX_USERS) {
		const oldestUserId = nextActivityCheckByUser.keys().next().value;
		if (typeof oldestUserId !== 'string') break;
		nextActivityCheckByUser.delete(oldestUserId);
	}
}

/**
 * Records product activity for an authenticated user independently of
 * analytics consent. This is an operational signal used by engagement
 * backoff, not an analytics event.
 *
 * Failures never block page rendering. The process-local cache reduces repeat
 * checks while the conditional database update limits writes across replicas.
 */
export async function recordAuthenticatedUserActivity(
	supabase: TypedSupabaseClient,
	userId: string,
	options: RecordAuthenticatedUserActivityOptions = {}
): Promise<void> {
	const now = options.now ?? new Date();
	const nowMs = now.getTime();
	const nextCheckAt = nextActivityCheckByUser.get(userId);

	if (nextCheckAt && nextCheckAt > nowMs) {
		return;
	}

	// Set this before awaiting so concurrent layout loads in one process coalesce.
	pruneActivityCheckCache(nowMs);
	nextActivityCheckByUser.set(userId, nowMs + AUTHENTICATED_ACTIVITY_CHECK_CACHE_MS);

	const cutoff = new Date(nowMs - AUTHENTICATED_ACTIVITY_WRITE_INTERVAL_MS).toISOString();

	try {
		const { error } = await supabase
			.from('users')
			.update({ last_visit: now.toISOString() })
			.eq('id', userId)
			.or(`last_visit.is.null,last_visit.lt.${cutoff}`);

		if (error) {
			nextActivityCheckByUser.delete(userId);
			console.warn('[AuthenticatedActivity] Failed to record user activity:', error);
		}
	} catch (error) {
		nextActivityCheckByUser.delete(userId);
		console.warn('[AuthenticatedActivity] Failed to record user activity:', error);
	}
}

export function clearAuthenticatedUserActivityCacheForTests(): void {
	nextActivityCheckByUser.clear();
}
