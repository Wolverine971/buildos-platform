// apps/web/src/routes/api/agent-runs/[id]/cancel/+server.ts
//
// Request cancellation of a running Agent Run by writing a control signal the
// worker drains at its next loop boundary (steering/interruption, 01 §9).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

const CANCELLABLE_STATUSES = ['queued', 'running', 'paused', 'needs_input'];

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
	if (!CANCELLABLE_STATUSES.includes(run.status)) {
		return ApiResponse.badRequest(`Run is ${run.status} and cannot be cancelled`);
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
