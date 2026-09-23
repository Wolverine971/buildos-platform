// apps/web/src/routes/api/agent-runs/[id]/cancel/+server.ts
//
// Request cancellation of an Agent Run by writing a control signal the worker
// drains at its next loop boundary (steering/interruption, 01 §9).
//
// A paused or needs_input run is parked on the user and has no queue job, so a
// signal alone would never be read. Those runs are re-queued as a continuation:
// the worker drains the cancel signal before any model call and finalizes the run
// through its normal path (completion message, events, inbox sync).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { validateAgentRunMetadata } from '@buildos/shared-types';

const CANCELLABLE_STATUSES = ['queued', 'running', 'paused', 'needs_input'];
type ParkedStatus = 'paused' | 'needs_input';

function isParkedStatus(status: string): status is ParkedStatus {
	return status === 'paused' || status === 'needs_input';
}

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const { data: run, error: runError } = await supabase
		.from('agent_runs')
		.select('id, status, completed_at')
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
	if (!CANCELLABLE_STATUSES.includes(run.status)) {
		return ApiResponse.badRequest(`Run is ${run.status} and cannot be cancelled`);
	}

	if (isParkedStatus(run.status)) {
		return cancelParkedRun(params.id, user.id, run.status, run.completed_at);
	}

	// RLS allows a user to insert a source='user' signal for a run they own.
	const { error: signalError } = await supabase
		.from('agent_run_signals')
		.insert({ run_id: params.id, kind: 'cancel', source: 'user' });

	if (signalError) {
		return ApiResponse.error(
			'Failed to queue cancel signal',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			signalError.message
		);
	}

	return ApiResponse.success({ run_id: params.id, signalled: 'cancel' });
};

async function cancelParkedRun(
	runId: string,
	userId: string,
	parkedStatus: ParkedStatus,
	parkedCompletedAt: string | null
) {
	const admin = createAdminSupabaseClient();

	const { data: claimedRun, error: claimError } = await admin
		.from('agent_runs')
		.update({ status: 'queued', completed_at: null })
		.eq('id', runId)
		.eq('user_id', userId)
		.eq('status', parkedStatus)
		.select('*')
		.maybeSingle();

	if (claimError) {
		return ApiResponse.error(
			'Failed to cancel agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			claimError.message
		);
	}
	if (!claimedRun) {
		return ApiResponse.conflict('Run changed state while cancelling; refresh and try again');
	}

	const rollback = async (signalId?: string) => {
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
			.update({ status: parkedStatus, completed_at: parkedCompletedAt })
			.eq('id', runId)
			.eq('status', 'queued');
	};

	const { data: signal, error: signalError } = await admin
		.from('agent_run_signals')
		.insert({ run_id: runId, kind: 'cancel', source: 'user' })
		.select('id')
		.single();
	if (signalError) {
		await rollback();
		return ApiResponse.error(
			'Failed to queue cancel signal',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			signalError.message
		);
	}

	const metadata = {
		run_id: claimedRun.id,
		trigger: claimedRun.trigger,
		context_type: claimedRun.context_type,
		project_id: claimedRun.project_id,
		continuation_from: parkedStatus,
		scope_mode: claimedRun.scope_mode,
		allowed_ops: claimedRun.allowed_ops,
		review_required: claimedRun.review_required,
		budgets: claimedRun.budgets
	};
	try {
		validateAgentRunMetadata(metadata);
	} catch (e) {
		await rollback(signal.id);
		return ApiResponse.badRequest(e instanceof Error ? e.message : 'Invalid job metadata');
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'agent_run',
		p_metadata: metadata as never,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `agent-run-cancel:${runId}`
	});

	if (jobError) {
		await rollback(signal.id);
		return ApiResponse.error(
			'Failed to schedule cancellation',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run_id: runId, signalled: 'cancel' });
}
