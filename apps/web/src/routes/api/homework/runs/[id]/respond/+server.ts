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

	if (run.status === 'queued' || run.status === 'running') {
		return ApiResponse.error(
			'Homework run is already active.',
			HttpStatus.CONFLICT,
			'RUN_ALREADY_ACTIVE'
		);
	}
	if (run.status !== 'waiting_on_user' && run.status !== 'stopped') {
		return ApiResponse.error(
			`Homework run cannot be continued from status "${run.status}".`,
			HttpStatus.BAD_REQUEST,
			'INVALID_STATUS'
		);
	}

	const answers = payload?.answers ?? payload?.response ?? null;
	const nextIteration = (run.iteration ?? 0) + 1;
	const seq = nextIteration * 1000 + 900;

	if (answers) {
		const { error: answerError } = await admin.from('homework_run_events').insert({
			run_id: runId,
			iteration: nextIteration,
			seq,
			event: { type: 'run_user_response', runId, answers }
		});
		if (answerError) {
			return ApiResponse.error(
				'Failed to persist response',
				HttpStatus.INTERNAL_SERVER_ERROR,
				'DATABASE_ERROR',
				answerError.message
			);
		}
	}

	const { error: updateError } = await admin
		.from('homework_runs')
		.update({
			status: 'queued',
			completed_at: null,
			stop_reason: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', runId)
		.eq('user_id', user.id);

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
		await admin
			.from('homework_runs')
			.update({
				status: run.status,
				completed_at: run.completed_at,
				stop_reason: run.stop_reason,
				updated_at: new Date().toISOString()
			})
			.eq('id', runId)
			.eq('user_id', user.id)
			.neq('status', 'canceled');

		return ApiResponse.error(
			'Failed to queue run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run_id: runId, status: 'queued' }, 'Run queued');
};
