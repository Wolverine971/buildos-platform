// apps/web/src/routes/api/daily-briefs/cancel/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const cancelDailyBriefSchema = z
	.object({
		briefDate: z.string().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseJsonRequest(request, cancelDailyBriefSchema);
	if (!parsed.ok) return parsed.response;
	const { briefDate } = parsed.data;
	const userId = user.id;
	const targetDate = briefDate || new Date().toISOString().slice(0, 10);

	try {
		const { data: processingBrief } = await supabase
			.from('ontology_daily_briefs')
			.select('id')
			.eq('user_id', userId)
			.eq('brief_date', targetDate)
			.eq('generation_status', 'processing')
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (!processingBrief?.id) {
			return ApiResponse.success(
				{
					brief_id: null
				},
				'No in-progress brief generation found for this date'
			);
		}

		const { error: updateError } = await supabase
			.from('ontology_daily_briefs')
			.update({
				generation_status: 'failed',
				generation_error: 'Cancelled by user',
				generation_completed_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', processingBrief.id)
			.eq('user_id', userId);

		if (updateError) {
			throw updateError;
		}

		return ApiResponse.success(
			{
				brief_id: processingBrief.id
			},
			'Brief generation cancelled successfully'
		);
	} catch (err) {
		console.error('Error cancelling brief generation:', err);
		return ApiResponse.internalError(err, 'Failed to cancel brief generation');
	}
};
