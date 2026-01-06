// apps/web/src/routes/api/onto/braindumps/[id]/process/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { queueBraindumpProcessing } from '$lib/server/braindump-processing.service';

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const braindumpId = params.id;
	if (!braindumpId) {
		return ApiResponse.badRequest('Braindump id is required');
	}

	const { data: braindump, error: braindumpError } = await supabase
		.from('onto_braindumps')
		.select('id, user_id, status')
		.eq('id', braindumpId)
		.eq('user_id', user.id)
		.single();

	if (braindumpError || !braindump) {
		return ApiResponse.notFound('Braindump');
	}

	if (braindump.status === 'processing') {
		return ApiResponse.success({ queued: false, reason: 'already_processing' });
	}

	const result = await queueBraindumpProcessing({ braindumpId, userId: user.id });

	if (!result.queued) {
		return ApiResponse.internalError(
			new Error(result.reason || 'Failed to queue braindump processing'),
			'Failed to queue braindump processing'
		);
	}

	return ApiResponse.success({ queued: true, jobId: result.jobId });
};
