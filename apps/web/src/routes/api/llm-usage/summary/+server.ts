// src/routes/api/llm-usage/summary/+server.ts

import { json, type RequestHandler } from '@sveltejs/kit';
import { LLMUsageService } from '$lib/services/llm-usage.service';
import { ApiResponse } from '$utils/api-response';

/**
 * GET /api/llm-usage/summary
 * Returns LLM usage summary for the authenticated user
 * Query params:
 *   - period: 'today' | 'month' | 'custom' (default: 'month')
 *   - startDate: ISO date string (required if period=custom)
 *   - endDate: ISO date string (required if period=custom)
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// Get authenticated user
		const {
			data: { user },
			error: authError
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const usageService = new LLMUsageService(supabase);

		// Parse query parameters
		const period = url.searchParams.get('period') || 'month';
		let startDate: Date;
		let endDate: Date;

		if (period === 'today') {
			startDate = new Date();
			startDate.setHours(0, 0, 0, 0);
			endDate = new Date();
			endDate.setHours(23, 59, 59, 999);
		} else if (period === 'month') {
			const now = new Date();
			startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
		} else if (period === 'custom') {
			const startParam = url.searchParams.get('startDate');
			const endParam = url.searchParams.get('endDate');

			if (!startParam || !endParam) {
				return json(
					{
						success: false,
						error: 'startDate and endDate required for custom period'
					},
					{ status: 400 }
				);
			}

			startDate = new Date(startParam);
			endDate = new Date(endParam);
		} else {
			return json({ success: false, error: 'Invalid period parameter' }, { status: 400 });
		}

		// Fetch usage data
		const [summary, dailyUsage, modelBreakdown, operationBreakdown] = await Promise.all([
			usageService.getUserUsage(user.id, startDate, endDate),
			usageService.getDailyUsage(user.id, startDate, endDate),
			usageService.getModelBreakdown(user.id, startDate, endDate),
			usageService.getOperationBreakdown(user.id, startDate, endDate)
		]);

		return json({
			success: true,
			data: {
				period: {
					type: period,
					startDate: startDate.toISOString(),
					endDate: endDate.toISOString()
				},
				summary,
				dailyUsage,
				modelBreakdown,
				operationBreakdown
			}
		});
	} catch (error) {
		console.error('Error fetching LLM usage summary:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch usage summary'
			},
			{ status: 500 }
		);
	}
};
