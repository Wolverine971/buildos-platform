// apps/web/src/routes/api/agent-runs/[id]/steer/+server.ts
//
// Steer a running Agent Run: write a `steer` control signal carrying a message
// the worker injects into the run's transcript at its next loop boundary
// (01 §10). The run keeps working — this is unsolicited mid-run guidance.
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

const STEERABLE_STATUSES = ['queued', 'running', 'paused', 'needs_input'];

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
	if (!message) return ApiResponse.badRequest('A non-empty `message` is required to steer a run');

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
	if (!STEERABLE_STATUSES.includes(run.status)) {
		return ApiResponse.badRequest(`Run is ${run.status} and cannot be steered`);
	}

	const { error: signalError } = await supabase
		.from('agent_run_signals')
		.insert({ run_id: params.id, kind: 'steer', source: 'user', payload: { message } });

	if (signalError) {
		return ApiResponse.error(
			'Failed to queue steer signal',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			signalError.message
		);
	}

	return ApiResponse.success({ run_id: params.id, signalled: 'steer' });
};
