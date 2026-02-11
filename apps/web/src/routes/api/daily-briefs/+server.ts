// apps/web/src/routes/api/daily-briefs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const briefDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0]!;

	try {
		// Check if brief already exists for this date
		const { data: existingBrief } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', briefDate)
			.single();

		if (existingBrief) {
			return ApiResponse.success({ brief: existingBrief });
		}

		return ApiResponse.success({ brief: null }, 'No brief found for this date');
	} catch (error) {
		console.error('Error fetching daily brief:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily brief');
	}
};
