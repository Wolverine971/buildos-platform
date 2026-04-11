// apps/web/src/routes/api/admin/llm-usage/stats/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import { getAdminLlmUsageStats } from '$lib/server/admin-llm-usage-analytics';

/**
 * GET /api/admin/llm-usage/stats
 * Returns comprehensive LLM usage statistics for admin dashboard
 * Query params:
 *   - days: number of days to look back (default: 30)
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	try {
		// Double-check admin membership to enforce strict access
		const {
			data: { user: authUser },
			error: authError
		} = await supabase.auth.getUser();

		if (authError || !authUser) {
			return ApiResponse.unauthorized();
		}

		const { data: adminCheck, error: adminError } = await supabase
			.from('admin_users')
			.select('user_id')
			.eq('user_id', authUser.id)
			.single();

		if (adminError) {
			return ApiResponse.databaseError(adminError);
		}
		if (!adminCheck) {
			return ApiResponse.forbidden('Admin access required');
		}

		const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
		const lookbackDays =
			Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

		return ApiResponse.success(await getAdminLlmUsageStats(supabase, lookbackDays));
	} catch (error) {
		console.error('Error fetching admin LLM stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch stats');
	}
};
