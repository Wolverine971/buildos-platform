// apps/web/src/routes/api/agent-runs/[id]/+server.ts
//
// Agent Run detail — the run row + its event log (narration/tool calls/results).
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const { data: run, error: runError } = await supabase
		.from('agent_runs')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();

	if (runError) {
		return ApiResponse.error(
			'Failed to fetch agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError.message
		);
	}
	if (!run) return ApiResponse.notFound('Agent run');

	// RLS scopes events to runs the user owns.
	const { data: events, error: eventsError } = await supabase
		.from('agent_run_events')
		.select('*')
		.eq('run_id', params.id)
		.order('seq', { ascending: true });

	if (eventsError) {
		return ApiResponse.error(
			'Failed to fetch run events',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			eventsError.message
		);
	}

	return ApiResponse.success({ run, events: events ?? [] });
};
