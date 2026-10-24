// apps/worker/src/workers/about-you/aboutYouSweep.ts
//
// Queues about_you_refresh for people in the cohort who chatted recently. Runs a
// few times a day from the scheduler; the job itself decides whether there's
// enough new to read (and caps model runs at about one a day), so a queued job
// that finds nothing costs one or two indexed reads.
import type { AboutYouRefreshJobMetadata } from '@buildos/shared-types';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { aboutYouCohort, type AboutYouCohort } from './about-you-cohort';

export const ABOUT_YOU_REFRESH_JOB = 'about_you_refresh' as const;
const ACTIVE_WINDOW_HOURS = 30;
const MAX_USERS_PER_SWEEP = 500;

export function aboutYouRefreshDedupKey(userId: string): string {
	return `about_you_refresh:${userId}`;
}

export async function enqueueAboutYouRefresh(
	userId: string,
	options: {
		reason?: AboutYouRefreshJobMetadata['reason'];
		supabase?: typeof defaultSupabase;
	} = {}
): Promise<string | null> {
	const db = options.supabase ?? defaultSupabase;
	const metadata: AboutYouRefreshJobMetadata = {
		userId,
		reason: options.reason ?? 'activity'
	};
	const { data, error } = await db.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: ABOUT_YOU_REFRESH_JOB,
		p_metadata: metadata as never,
		p_priority: 20,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: aboutYouRefreshDedupKey(userId)
	});
	if (error) throw error;
	return typeof data === 'string' ? data : null;
}

/** People in the cohort with a chat message in the last ACTIVE_WINDOW_HOURS. */
export async function sweepAboutYouRefreshes(
	options: { cohort?: AboutYouCohort; supabase?: typeof defaultSupabase; now?: Date } = {}
): Promise<{ scanned: number; enqueued: number }> {
	const cohort = options.cohort ?? aboutYouCohort();
	if (cohort !== 'all' && cohort.length === 0) return { scanned: 0, enqueued: 0 };
	const db = options.supabase ?? defaultSupabase;
	const since = new Date(
		(options.now ?? new Date()).getTime() - ACTIVE_WINDOW_HOURS * 3600_000
	).toISOString();
	let query = db
		.from('chat_sessions')
		.select('user_id')
		.gt('last_message_at', since)
		.order('last_message_at', { ascending: false })
		.limit(MAX_USERS_PER_SWEEP * 4);
	if (cohort !== 'all') query = query.in('user_id', [...cohort]);
	const { data, error } = await query;
	if (error) throw error;
	const userIds = [
		...new Set((data ?? []).map((row) => row.user_id).filter((id): id is string => !!id))
	].slice(0, MAX_USERS_PER_SWEEP);
	let enqueued = 0;
	for (const userId of userIds) {
		try {
			if (await enqueueAboutYouRefresh(userId, { supabase: db })) enqueued += 1;
		} catch (error) {
			console.error('About you: could not queue a refresh', { userId, error });
		}
	}
	return { scanned: userIds.length, enqueued };
}
