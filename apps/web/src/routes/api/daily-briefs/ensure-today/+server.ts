// apps/web/src/routes/api/daily-briefs/ensure-today/+server.ts
import type { RequestHandler } from './$types';
import { formatInTimeZone } from 'date-fns-tz';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import {
	PRIVATE_RAILWAY_WORKER_TOKEN,
	PUBLIC_RAILWAY_WORKER_URL
} from '$lib/server/railway-worker-env';
import { mapOntologyDailyBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

type EnsureTodayState =
	| 'completed'
	| 'in_flight'
	| 'queued'
	| 'skipped_no_actor'
	| 'skipped_no_projects'
	| 'skipped_recent_failure';

type QueueJobSummary = {
	id: string;
	queue_job_id: string;
	status: string;
	scheduled_for: string;
	created_at: string;
	processed_at?: string | null;
};

const FRESH_PROCESSING_MS = 10 * 60 * 1000;
// Don't auto-retry a failed generation on every app open — a deterministic failure
// would otherwise burn a full LLM generation attempt per page load.
const FAILED_RETRY_COOLDOWN_MS = 30 * 60 * 1000;

// The generator only loads projects in these states and throws
// 'No ontology projects found for user' otherwise (job then retries max_attempts).
// The gate must match, or users with only done/archived projects churn failed jobs.
const BRIEFABLE_PROJECT_STATES = ['planning', 'active'];

function getTodayForTimezone(timezone: string): string {
	try {
		return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
	} catch {
		return formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd');
	}
}

function isFreshProcessingBrief(
	brief: { generation_status?: string; updated_at?: string | null } | null | undefined
) {
	if (!brief) return false;
	if (brief.generation_status !== 'processing' || !brief.updated_at) return false;
	const updatedAtMs = Date.parse(brief.updated_at);
	return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < FRESH_PROCESSING_MS;
}

function summarizeJob(job: Record<string, any> | null | undefined): QueueJobSummary | null {
	if (!job) return null;
	return {
		id: String(job.id),
		queue_job_id: String(job.queue_job_id),
		status: String(job.status),
		scheduled_for: String(job.scheduled_for),
		created_at: String(job.created_at),
		processed_at: job.processed_at ?? null
	};
}

async function getExistingActorId(supabase: any, userId: string): Promise<string | null> {
	const { data, error } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.eq('kind', 'human')
		.maybeSingle();

	if (error && error.code !== 'PGRST116') {
		throw error;
	}

	return data?.id ?? null;
}

async function hasBriefableProjects(
	supabase: any,
	userId: string,
	actorId: string
): Promise<boolean> {
	// Mirrors the worker loader's access filter (loadUserOntologyData):
	// created_by = actorId OR created_by = userId (legacy rows) OR membership,
	// restricted to planning|active, not deleted/archived.
	const { data: memberships, error: memberError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (memberError) {
		console.warn(
			'[daily-briefs/ensure-today] Failed to load project memberships:',
			memberError
		);
	}

	const memberProjectIds = Array.from(
		new Set(
			((memberships ?? []) as Array<{ project_id: string | null }>)
				.map((m) => m.project_id)
				.filter((id): id is string => Boolean(id))
		)
	);

	const accessFilters = [`created_by.eq.${actorId}`, `created_by.eq.${userId}`];
	if (memberProjectIds.length > 0) {
		accessFilters.push(`id.in.(${memberProjectIds.join(',')})`);
	}

	const { count, error } = await supabase
		.from('onto_projects')
		.select('id', { count: 'exact', head: true })
		.in('state_key', BRIEFABLE_PROJECT_STATES)
		.is('deleted_at', null)
		.is('archived_at', null)
		.or(accessFilters.join(','));

	if (error) {
		console.warn('[daily-briefs/ensure-today] Failed to count briefable projects:', error);
		// Fail closed: skipping the implicit trigger is cheap (manual Generate still
		// works); queueing a job the generator will fail max_attempts times is not.
		return false;
	}

	return (count ?? 0) > 0;
}

async function findActiveBriefJob(supabase: any, userId: string, briefDate: string) {
	const { data, error } = await supabase
		.from('queue_jobs')
		.select(
			'id, queue_job_id, status, scheduled_for, created_at, processed_at, metadata, error_message'
		)
		.eq('user_id', userId)
		.eq('job_type', 'generate_daily_brief')
		.in('status', ['pending', 'processing'])
		.contains('metadata', { briefDate })
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error && error.code !== 'PGRST116') {
		throw error;
	}

	return data ?? null;
}

async function queueTodayBrief(params: { userId: string; briefDate: string; timezone: string }) {
	if (!PUBLIC_RAILWAY_WORKER_URL) {
		return {
			error: ApiResponse.error('Worker URL not configured', HttpStatus.SERVICE_UNAVAILABLE)
		};
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (PRIVATE_RAILWAY_WORKER_TOKEN) {
		headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
	}

	const response = await fetch(`${PUBLIC_RAILWAY_WORKER_URL}/queue/brief`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			userId: params.userId,
			scheduledFor: new Date().toISOString(),
			briefDate: params.briefDate,
			timezone: params.timezone,
			forceRegenerate: false,
			forceImmediate: true,
			options: {
				useOntology: true
			}
		})
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message = payload?.error || 'Failed to queue brief generation';
		return {
			error: ApiResponse.error(message, response.status, undefined, payload)
		};
	}

	const result = payload?.data ?? payload;
	if (!result?.success || !result?.jobId) {
		return {
			error: ApiResponse.error(
				'Invalid response format from worker',
				HttpStatus.SERVICE_UNAVAILABLE,
				undefined,
				payload
			)
		};
	}

	return {
		result: {
			jobId: String(result?.jobId ?? ''),
			scheduledFor: String(result?.scheduledFor ?? ''),
			message: String(result?.message ?? 'Brief generation queued')
		}
	};
}

export const POST: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data: userRow, error: userError } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', user.id)
			.single();

		if (userError) {
			throw userError;
		}

		const timezone =
			typeof userRow?.timezone === 'string' && userRow.timezone.trim()
				? userRow.timezone
				: 'UTC';
		const briefDate = getTodayForTimezone(timezone);

		const { data: briefRow, error: briefError } = await supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', user.id)
			.eq('brief_date', briefDate)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (briefError && briefError.code !== 'PGRST116') {
			throw briefError;
		}

		if (briefRow?.generation_status === 'completed') {
			return ApiResponse.success({
				state: 'completed' satisfies EnsureTodayState,
				briefDate,
				timezone,
				queued: false,
				brief: mapOntologyDailyBriefRow(briefRow)
			});
		}

		const activeJob = await findActiveBriefJob(supabase, user.id, briefDate);
		if (isFreshProcessingBrief(briefRow) || activeJob?.status === 'processing') {
			return ApiResponse.success({
				state: 'in_flight' satisfies EnsureTodayState,
				briefDate,
				timezone,
				queued: false,
				job: summarizeJob(activeJob)
			});
		}

		if (briefRow?.generation_status === 'failed' && !activeJob) {
			const failedAtMs = Date.parse(briefRow.updated_at ?? '');
			if (Number.isFinite(failedAtMs) && Date.now() - failedAtMs < FAILED_RETRY_COOLDOWN_MS) {
				return ApiResponse.success({
					state: 'skipped_recent_failure' satisfies EnsureTodayState,
					briefDate,
					timezone,
					queued: false
				});
			}
		}

		const actorId = await getExistingActorId(supabase, user.id);
		if (!actorId) {
			return ApiResponse.success({
				state: 'skipped_no_actor' satisfies EnsureTodayState,
				briefDate,
				timezone,
				queued: false
			});
		}

		const hasProjects = await hasBriefableProjects(supabase, user.id, actorId);
		if (!hasProjects) {
			return ApiResponse.success({
				state: 'skipped_no_projects' satisfies EnsureTodayState,
				briefDate,
				timezone,
				queued: false
			});
		}

		const queued = await queueTodayBrief({
			userId: user.id,
			briefDate,
			timezone
		});

		if (queued.error) return queued.error;

		return ApiResponse.success({
			state: 'queued' satisfies EnsureTodayState,
			briefDate,
			timezone,
			queued: true,
			job: {
				queue_job_id: queued.result.jobId,
				status: 'pending',
				scheduled_for: queued.result.scheduledFor
			},
			message: queued.result.message
		});
	} catch (error) {
		console.error('[daily-briefs/ensure-today] Failed to ensure today brief:', error);
		return ApiResponse.internalError(error, 'Failed to ensure daily brief');
	}
};
