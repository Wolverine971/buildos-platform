// apps/web/src/routes/api/admin/jobs/requeue/+server.ts
//
// "Run again" for failed background jobs (/admin/jobs). The body names job ids;
// the server re-reads each row and applies the same allow-list the page uses,
// so a job the page shows without a button is refused here too.
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { getFailedJobsByIds, requeueFailedJobs } from '$lib/server/failed-jobs';
import {
	MAX_REQUEUE_JOB_IDS,
	parseRequeueJobIds,
	partitionRequeueRows
} from '$lib/services/admin/failed-jobs/failed-jobs';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	// Check admin role
	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = await parseRequestBody(request);
	const jobIds = parseRequeueJobIds(body?.jobIds);
	if (!jobIds || jobIds.length === 0) {
		return ApiResponse.badRequest('jobIds must be a list of job ids');
	}
	if (jobIds.length > MAX_REQUEUE_JOB_IDS) {
		return ApiResponse.badRequest(
			`Run at most ${MAX_REQUEUE_JOB_IDS} jobs again in one request`
		);
	}

	try {
		// Only rows that are still failed come back; the rest already moved on.
		const rows = await getFailedJobsByIds(jobIds);
		const { allowedIds, blocked } = partitionRequeueRows(rows);

		if (allowedIds.length === 0 && blocked.length > 0) {
			return ApiResponse.badRequest(
				'These jobs cannot be run again: they could send something twice or repeat a change.',
				{ notAllowed: blocked.length }
			);
		}

		const requeued = await requeueFailedJobs(allowedIds);

		console.info('[admin/jobs] requeued failed jobs', {
			adminUserId: user.id,
			requested: jobIds.length,
			requeued,
			notAllowed: blocked.length
		});

		return ApiResponse.success({
			requested: jobIds.length,
			requeued,
			// Named, but not on the allow-list (or an old daily brief).
			notAllowed: blocked.length,
			// No longer failed when we looked, or the same work was already queued again.
			alreadyMovedOn: jobIds.length - blocked.length - requeued
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not run these jobs again');
	}
};
