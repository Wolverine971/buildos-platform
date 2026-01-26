// apps/web/src/routes/api/homework/runs/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const runId = params.id;
	const includeIterations = url.searchParams.get('include_iterations') !== 'false';
	const includeEvents = url.searchParams.get('include_events') !== 'false';

	const { data: run, error } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (error || !run) {
		return ApiResponse.error('Homework run not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
	}

	let iterations = [];
	let events = [];

	if (includeIterations) {
		const { data, error: iterError } = await supabase
			.from('homework_run_iterations')
			.select('*')
			.eq('run_id', runId)
			.order('iteration', { ascending: false })
			.limit(50);

		if (!iterError) iterations = data ?? [];
	}

	if (includeEvents) {
		const { data, error: eventError } = await supabase
			.from('homework_run_events')
			.select('*')
			.eq('run_id', runId)
			.order('seq', { ascending: false })
			.limit(200);

		if (!eventError) events = data ?? [];
	}

	return ApiResponse.success({ run, iterations, events });
};
