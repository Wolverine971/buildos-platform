// apps/web/src/routes/api/agent-runs/[id]/resume/+server.ts
//
// Resume a paused Agent Run: write a `resume` marker signal and re-enqueue an
// `agent_run` job. The worker detects the 'paused' status, reconstructs the
// transcript + budget from persisted tool executions / steer events, and
// continues (01 §10).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { validateAgentRunMetadata } from '@buildos/shared-types';

async function rollbackPausedResume(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	runId: string,
	signalId?: string
) {
	if (signalId) {
		await admin
			.from('agent_run_signals')
			.delete()
			.eq('id', signalId)
			.eq('run_id', runId)
			.is('consumed_at', null);
	}
	await admin
		.from('agent_runs')
		.update({ status: 'paused' })
		.eq('id', runId)
		.eq('status', 'queued');
}

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const admin = createAdminSupabaseClient();

	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();

	if (runError) {
		return ApiResponse.error(
			'Failed to load agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError.message
		);
	}
	if (!run) return ApiResponse.notFound('Agent run');
	if (run.status !== 'paused') {
		return ApiResponse.badRequest(`Run is ${run.status} and is not paused`);
	}

	const { data: claimedRun, error: claimError } = await admin
		.from('agent_runs')
		.update({ status: 'queued', completed_at: null })
		.eq('id', params.id)
		.eq('user_id', user.id)
		.eq('status', 'paused')
		.select('*')
		.maybeSingle();

	if (claimError) {
		return ApiResponse.error(
			'Failed to resume agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			claimError.message
		);
	}
	if (!claimedRun) {
		return ApiResponse.badRequest('Run is already being resumed');
	}

	// Marker signal (consumed by the worker's drain; the resume itself is the
	// re-enqueue + the worker's paused-status detection).
	const { data: signal, error: signalError } = await admin
		.from('agent_run_signals')
		.insert({ run_id: params.id, kind: 'resume', source: 'user' })
		.select('id')
		.single();
	if (signalError) {
		await rollbackPausedResume(admin, params.id);
		return ApiResponse.error(
			'Failed to queue resume signal',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			signalError.message
		);
	}
	const signalId = signal?.id;

	const metadata = {
		run_id: claimedRun.id,
		trigger: claimedRun.trigger,
		context_type: claimedRun.context_type,
		project_id: claimedRun.project_id,
		continuation_from: 'paused' as const,
		scope_mode: claimedRun.scope_mode,
		allowed_ops: claimedRun.allowed_ops,
		review_required: claimedRun.review_required,
		budgets: claimedRun.budgets
	};
	try {
		validateAgentRunMetadata(metadata);
	} catch (e) {
		await rollbackPausedResume(admin, params.id, signalId);
		return ApiResponse.badRequest(e instanceof Error ? e.message : 'Invalid job metadata');
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'agent_run',
		p_metadata: metadata as never,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `agent-run-resume:${claimedRun.id}`
	});

	if (jobError) {
		await rollbackPausedResume(admin, params.id, signalId);
		return ApiResponse.error(
			'Failed to re-enqueue agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run_id: params.id, signalled: 'resume' });
};
