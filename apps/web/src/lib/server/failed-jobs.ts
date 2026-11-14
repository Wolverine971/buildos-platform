// apps/web/src/lib/server/failed-jobs.ts
//
// Admin reads of failed `queue_jobs` rows and the one write behind "Run again"
// on /admin/jobs. `queue_jobs` is worker plumbing (server-only writes since
// 20261105120000), so everything here uses the service-role client and callers
// check that the signed-in person is an admin first.
//
// Reads never select the whole `metadata` column: it can hold a person's
// content. Only the two daily-brief fields the allow-list needs are pulled out.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FailedJobRow } from '$lib/services/admin/failed-jobs/failed-jobs';

const FAILED_JOB_COLUMNS =
	'id, job_type, user_id, error_message, attempts, created_at, updated_at, completed_at, brief_date:metadata->>briefDate, brief_timezone:metadata->>timezone';

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;
/** The most failed jobs the page loads for one window. */
export const FAILED_JOB_LIST_LIMIT = 3000;

function adminClient(): SupabaseClient {
	// Untyped: the JSON-path columns and the requeue function are not in the generated types.
	return createAdminSupabaseClient() as unknown as SupabaseClient;
}

/** Failed jobs whose final failure fell inside the window, newest first. */
export async function listFailedJobs(
	days: number
): Promise<{ rows: FailedJobRow[]; truncated: boolean }> {
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const client = adminClient();
	const rows: FailedJobRow[] = [];
	while (rows.length <= FAILED_JOB_LIST_LIMIT) {
		// A failed row is not written again, so `updated_at` is when it gave up
		// (and `idx_queue_jobs_status_updated_at` serves this filter).
		const { data, error } = await client
			.from('queue_jobs')
			.select(FAILED_JOB_COLUMNS)
			.eq('status', 'failed')
			.gte('updated_at', since)
			.order('updated_at', { ascending: false })
			.order('id', { ascending: true })
			.range(rows.length, rows.length + PAGE_SIZE - 1);
		if (error) throw new Error(`Could not load failed jobs (${error.code ?? 'error'})`);
		const page = (data ?? []) as unknown as FailedJobRow[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return {
		rows: rows.slice(0, FAILED_JOB_LIST_LIMIT),
		truncated: rows.length > FAILED_JOB_LIST_LIMIT
	};
}

/** The named rows that are still failed, for the endpoint to check against the allow-list. */
export async function getFailedJobsByIds(ids: string[]): Promise<FailedJobRow[]> {
	const client = adminClient();
	const rows: FailedJobRow[] = [];
	// Ids travel in the query string, so ask in chunks that keep the URL short.
	for (let start = 0; start < ids.length; start += ID_CHUNK) {
		const { data, error } = await client
			.from('queue_jobs')
			.select(FAILED_JOB_COLUMNS)
			.eq('status', 'failed')
			.in('id', ids.slice(start, start + ID_CHUNK));
		if (error) throw new Error(`Could not load failed jobs (${error.code ?? 'error'})`);
		rows.push(...((data ?? []) as unknown as FailedJobRow[]));
	}
	return rows;
}

/** Emails for the people whose jobs these were. */
export async function failedJobUserEmails(
	userIds: Array<string | null>
): Promise<Record<string, string>> {
	const ids = [...new Set(userIds.filter((id): id is string => !!id))];
	const emails: Record<string, string> = {};
	for (let start = 0; start < ids.length; start += ID_CHUNK) {
		const { data, error } = await createAdminSupabaseClient()
			.from('users')
			.select('id, email')
			.in('id', ids.slice(start, start + ID_CHUNK));
		if (error) throw new Error(`Could not load job owners (${error.code ?? 'error'})`);
		for (const user of data ?? []) {
			if (user.email) emails[user.id] = user.email;
		}
	}
	return emails;
}

/**
 * Put failed jobs back in the queue. The database function only touches rows
 * that are still `failed` and returns how many it re-queued; a job whose work
 * is already queued again under the same dedup key stays as it is.
 */
export async function requeueFailedJobs(ids: string[]): Promise<number> {
	if (!ids.length) return 0;
	const { data, error } = await adminClient().rpc('requeue_failed_queue_jobs', {
		p_job_ids: ids
	});
	if (error) {
		throw new Error(
			`Could not re-queue jobs (${error.code ?? 'error'}): ${error.message ?? 'unknown'}`
		);
	}
	return typeof data === 'number' ? data : 0;
}
