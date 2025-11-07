// apps/web/src/routes/api/daily-briefs/cancel/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { briefDate } = await request.json();
	const userId = user.id;
	const targetDate = briefDate || new Date().toISOString().split('T')[0];

	try {
		// Update main brief status to cancelled/failed
		const { data: updatedBrief, error: updateError } = await supabase
			.from('daily_briefs')
			.update({
				generation_status: 'failed',
				generation_error: 'Cancelled by user',
				generation_completed_at: new Date().toISOString()
			})
			.eq('user_id', userId)
			.eq('brief_date', targetDate)
			.eq('generation_status', 'processing')
			.select()
			.single();

		if (updateError) {
			throw updateError;
		}

		// Also cancel any in-progress project/life goal briefs
		await Promise.all([
			supabase
				.from('project_daily_briefs')
				.update({
					generation_status: 'failed',
					generation_error: 'Cancelled by user'
				})
				.eq('user_id', userId)
				.eq('brief_date', targetDate)
				.eq('generation_status', 'processing')
		]);

		return ApiResponse.success(
			{
				brief_id: updatedBrief?.id
			},
			'Brief generation cancelled successfully'
		);
	} catch (err) {
		console.error('Error cancelling brief generation:', err);
		return ApiResponse.internalError(err, 'Failed to cancel brief generation');
	}
};
