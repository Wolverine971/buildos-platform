// apps/web/src/routes/api/agent-runs/[id]/pause/+server.ts
//
// Pause a running Agent Run: write a `pause` control signal. The worker
// checkpoints the run (status='paused', metrics persisted) and releases its
// slot at the next loop boundary; `resume` re-enqueues it (01 §10).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

const PAUSABLE_STATUSES = ['queued', 'running'];

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const { data: run, error: runError } = await supabase
		.from('agent_runs')
		.select('id, status')
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
	if (!PAUSABLE_STATUSES.includes(run.status)) {
		return ApiResponse.badRequest(`Run is ${run.status} and cannot be paused`);
	}

	const { error: signalError } = await supabase
		.from('agent_run_signals')
		.insert({ run_id: params.id, kind: 'pause', source: 'user' });

	if (signalError) {
		return ApiResponse.error(
			'Failed to queue pause signal',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			signalError.message
		);
	}

	return ApiResponse.success({ run_id: params.id, signalled: 'pause' });
};
