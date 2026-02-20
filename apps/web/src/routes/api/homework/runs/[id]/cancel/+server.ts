// apps/web/src/routes/api/homework/runs/[id]/cancel/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { createTrackedInAppNotification } from '$lib/server/tracked-in-app-notification.service';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const runId = params.id;
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

	const stopReason = { type: 'canceled', detail: 'Canceled by user' };
	const now = new Date().toISOString();

	const { error: updateError } = await admin
		.from('homework_runs')
		.update({ status: 'canceled', completed_at: now, stop_reason: stopReason, updated_at: now })
		.eq('id', runId);

	if (updateError) {
		return ApiResponse.error(
			'Failed to cancel run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			updateError.message
		);
	}

	await admin.rpc('cancel_jobs_atomic', {
		p_user_id: user.id,
		p_job_type: 'buildos_homework',
		p_metadata_filter: { run_id: runId }
	});

	const notificationResult = await createTrackedInAppNotification({
		supabase: admin,
		recipientUserId: user.id,
		eventType: 'homework.run_canceled',
		eventSource: 'api_action',
		actorUserId: user.id,
		type: 'homework',
		title: 'Homework canceled',
		message: 'Your homework run was canceled.',
		actionUrl: `/homework/runs/${runId}`,
		payload: { run_id: runId, status: 'canceled' },
		data: { run_id: runId, status: 'canceled' }
	});
	if (!notificationResult.success) {
		console.error('[Homework API] Failed to create cancel notification', {
			runId,
			userId: user.id,
			error: notificationResult.error
		});
	}

	return ApiResponse.success({ run_id: runId, status: 'canceled' }, 'Run canceled');
};
