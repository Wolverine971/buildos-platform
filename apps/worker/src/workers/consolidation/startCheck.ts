// apps/worker/src/workers/consolidation/startCheck.ts
//
// Starts a quick duplicate check from the worker (tasker 122), so chat can run
// one before it proposes nesting one project under another or combining two.
// The web app can't be imported here, so this mirrors the web start
// (startConsolidationRun with mode 'check' in
// apps/web/src/lib/server/consolidation/consolidation.service.ts) rule for rule:
// - scope: parseConsolidationScope, 2-20 distinct projects, the first is the root;
// - every project live and writable by this user (re-checked here, per project);
// - a check of the same projects (any order) still running, or finished in the
//   last 15 minutes, is handed back instead of paying for another
//   (reusableCheckRun);
// - otherwise one check-mode run row (it never takes the project's open-run
//   slot) and one `consolidation_run` survey job; a failed enqueue marks the
//   run failed.
// It reads nothing of the user's content and writes only the run and the job.
//
// Chat calls this inside a tool, under its own short timeout, so it never
// throws: every failure comes back as `{ ok: false, code, message }`. A call
// the caller gave up on may still create its run; the next call reuses it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import {
	CONSOLIDATION_CHECK_LOOKBACK_MS,
	parseConsolidationScope,
	reusableCheckRun
} from '@buildos/shared-agent-ops/consolidation';
import { ensureActorId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { ensureQueueCorrelationMetadata } from '../../lib/queueCorrelation';

/** A check is interactive (someone is waiting in chat): ahead of full surveys (5). */
export const CONSOLIDATION_CHECK_PRIORITY = 4;

export const NEED_EDIT_ACCESS = 'You need edit access to every project in the check.';

export type ConsolidationCheckStartCode = 'invalid_scope' | 'forbidden' | 'failed';

export type ConsolidationCheckStartResult =
	| { ok: true; run_id: string; existing: boolean }
	| { ok: false; code: ConsolidationCheckStartCode; message: string };

class StartFailure extends Error {
	constructor(
		message: string,
		readonly code: ConsolidationCheckStartCode
	) {
		super(message);
	}
}

export async function startConsolidationCheck(params: {
	/** A service-role client: access is checked explicitly below. */
	admin: SupabaseClient<Database>;
	userId: string;
	/** The user's ontology actor, when the caller already has it. */
	actorId?: string | null;
	/** 2-20 project ids; the first is where things would end up. */
	projectIds: readonly string[];
	/** What to look at, in the owner's words (optional). */
	request?: string | null;
}): Promise<ConsolidationCheckStartResult> {
	try {
		return { ok: true, ...(await start(params)) };
	} catch (error) {
		if (error instanceof StartFailure)
			return { ok: false, code: error.code, message: error.message };
		console.error('[consolidation] check start failed', error);
		return { ok: false, code: 'failed', message: 'Could not start the duplicate check.' };
	}
}

async function start(
	params: Parameters<typeof startConsolidationCheck>[0]
): Promise<{ run_id: string; existing: boolean }> {
	const { admin, userId } = params;
	const scope = parseConsolidationScope(params.projectIds);
	if (!scope.ok) throw new StartFailure(scope.error, 'invalid_scope');
	const projectIds = scope.project_ids;

	const actorId = await resolveActor(admin, userId, params.actorId);
	const since = new Date(Date.now() - CONSOLIDATION_CHECK_LOOKBACK_MS).toISOString();
	// Access and the reuse lookup in parallel: one round trip. Same answer for a
	// project that is gone, never shared, or read-only, so nothing leaks about it.
	const [access, recent] = await Promise.all([
		Promise.all(
			projectIds.map(async (projectId) => {
				const { data, error } = await admin.rpc('actor_has_project_member_access', {
					p_actor_id: actorId,
					p_project_id: projectId,
					p_required_access: 'write'
				});
				if (error) throw new StartFailure('Could not check project access.', 'failed');
				return data === true;
			})
		),
		admin
			.from('consolidation_runs')
			.select('id, project_ids, status, created_at, finished_at, updated_at')
			.eq('user_id', userId)
			.eq('mode', 'check')
			.in('status', ['surveying', 'checked'])
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(25)
	]);
	if (access.some((ok) => !ok)) throw new StartFailure(NEED_EDIT_ACCESS, 'forbidden');
	// A failed lookup only costs a fresh check.
	const reuse = recent.error ? null : reusableCheckRun(recent.data ?? [], projectIds);
	if (reuse) return { run_id: reuse.id, existing: true };

	const { data: run, error } = await admin
		.from('consolidation_runs')
		.insert({
			user_id: userId,
			root_project_id: projectIds[0]!,
			project_ids: projectIds,
			mode: 'check',
			request: params.request?.trim().slice(0, 2000) || null,
			progress: { stage: 'queued' } as Json
		})
		.select('id')
		.single();
	if (error || !run) throw new StartFailure('Could not start the duplicate check.', 'failed');

	const { metadata } = ensureQueueCorrelationMetadata({
		runId: run.id,
		userId,
		action: 'survey'
	});
	const { data: queued, error: queueError } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'consolidation_run',
		p_metadata: metadata as Json,
		p_priority: CONSOLIDATION_CHECK_PRIORITY,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `consolidation:${run.id}:survey`
	});
	if (queueError || typeof queued !== 'string' || !queued) {
		const now = new Date().toISOString();
		await admin
			.from('consolidation_runs')
			.update({
				status: 'failed',
				error: 'Could not queue the check.',
				finished_at: now,
				updated_at: now
			})
			.eq('id', run.id);
		throw new StartFailure('Could not queue the duplicate check.', 'failed');
	}
	return { run_id: run.id, existing: false };
}

/** The user's actor; one handed in must be theirs, so access is never checked for someone else. */
async function resolveActor(
	admin: SupabaseClient<Database>,
	userId: string,
	actorId?: string | null
): Promise<string> {
	if (!actorId) {
		try {
			return await ensureActorId(admin as never, userId);
		} catch {
			throw new StartFailure('Could not resolve your account.', 'failed');
		}
	}
	const { data, error } = await admin
		.from('onto_actors')
		.select('id')
		.eq('id', actorId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw new StartFailure('Could not resolve your account.', 'failed');
	if (!data) throw new StartFailure(NEED_EDIT_ACCESS, 'forbidden');
	return data.id;
}
