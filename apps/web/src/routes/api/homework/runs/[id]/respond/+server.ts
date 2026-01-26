// apps/web/src/routes/api/homework/runs/[id]/respond/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const runId = params.id;
	const payload = await request.json().catch(() => ({}));
	const admin = createAdminSupabaseClient();

	const { data: run, error: runError } = await admin
		.from('homework_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (runError || !run) {
		return ApiResponse.error('Homework run not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
	}

	const answers = payload?.answers ?? payload?.response ?? null;
	const nextIteration = (run.iteration ?? 0) + 1;
	const seq = nextIteration * 1000 + 900;

	if (answers) {
		await admin.from('homework_run_events').insert({
			run_id: runId,
			iteration: nextIteration,
			seq,
			event: { type: 'run_user_response', runId, answers }
		});
	}

	const { error: updateError } = await admin
		.from('homework_runs')
		.update({ status: 'queued', updated_at: new Date().toISOString() })
		.eq('id', runId);

	if (updateError) {
		return ApiResponse.error(
			'Failed to update run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			updateError.message
		);
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'buildos_homework',
		p_metadata: {
			run_id: run.id,
			iteration: nextIteration,
			chat_session_id: run.chat_session_id,
			budgets: run.budgets,
			permissions: { write_mode: 'autopilot' }
		},
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `homework:${run.id}:${nextIteration}`
	});

	if (jobError) {
		return ApiResponse.error(
			'Failed to queue run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run_id: runId, status: 'queued' }, 'Run queued');
};
