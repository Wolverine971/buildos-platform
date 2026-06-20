// apps/web/src/routes/api/agent-runs/[id]/answer/+server.ts
//
// Answer/continue a run that stopped with status='needs_input' or 'partial'
// (UI-P3). The answer is
// injected as a steer-style message and the run is re-enqueued; the worker
// detects the prior status, reconstructs the transcript, drains the answer at
// the first loop boundary, and continues (01 §10).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { validateAgentRunMetadata } from '@buildos/shared-types';

type ContinuableAnswerStatus = 'needs_input' | 'partial';

function isContinuableAnswerStatus(status: unknown): status is ContinuableAnswerStatus {
	return status === 'needs_input' || status === 'partial';
}

async function rollbackAnsweredRun(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	runId: string,
	status: ContinuableAnswerStatus,
	completedAt: string | null,
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
		.update({ status, completed_at: completedAt })
		.eq('id', runId)
		.eq('status', 'queued');
}

export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	const answer = typeof payload?.answer === 'string' ? payload.answer.trim() : '';
	if (!answer) return ApiResponse.badRequest('A non-empty `answer` is required');

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
	if (!isContinuableAnswerStatus(run.status)) {
		return ApiResponse.badRequest(`Run is ${run.status} and cannot be continued with an answer`);
	}
	const continuationFrom = run.status;

	const { data: claimedRun, error: claimError } = await admin
		.from('agent_runs')
		.update({ status: 'queued', completed_at: null })
		.eq('id', params.id)
		.eq('user_id', user.id)
		.eq('status', continuationFrom)
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

	// Inject the answer as a steer message (drained into the transcript on the
	// first loop iteration after the run resumes).
	const { data: signal, error: signalError } = await admin
		.from('agent_run_signals')
		.insert({
			run_id: params.id,
			kind: 'steer',
			source: 'user',
			payload: { message: `USER ANSWER: ${answer}` }
		})
		.select('id')
		.single();
	if (signalError) {
		await rollbackAnsweredRun(admin, params.id, continuationFrom, run.completed_at);
		return ApiResponse.error(
			'Failed to queue answer',
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
		continuation_from: continuationFrom,
		scope_mode: claimedRun.scope_mode,
		allowed_ops: claimedRun.allowed_ops,
		review_required: claimedRun.review_required,
		budgets: claimedRun.budgets
	};
	try {
		validateAgentRunMetadata(metadata);
	} catch (e) {
		await rollbackAnsweredRun(admin, params.id, continuationFrom, run.completed_at, signalId);
		return ApiResponse.badRequest(e instanceof Error ? e.message : 'Invalid job metadata');
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'agent_run',
		p_metadata: metadata as never,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `agent-run-answer:${claimedRun.id}:${Date.now()}`
	});

	if (jobError) {
		await rollbackAnsweredRun(admin, params.id, continuationFrom, run.completed_at, signalId);
		return ApiResponse.error(
			'Failed to re-enqueue agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run_id: params.id, signalled: 'answer' });
};
