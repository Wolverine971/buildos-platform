// apps/web/src/routes/api/admin/chat/timing/+server.ts
/**
 * Chat Timing Metrics API
 *
 * Provides aggregated timing analytics for agentic chat including:
 * - Percentile statistics (p50, p95, p99) for key metrics
 * - Latency breakdowns by component
 * - Slow session identification
 * - Context type performance analysis
 */

import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildTimingAnalytics,
	filterTimingRowsByCacheSource,
	type ChatTurnRunTimingRow,
	type TimingMetricsRow
} from './timing-analytics';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	// Check admin permission
	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	// Parse query params
	const timeframe = url.searchParams.get('timeframe') || '7d';
	const contextType = url.searchParams.get('context_type') || null;
	const planStatus = url.searchParams.get('plan_status') || null;
	const hasClarification = url.searchParams.get('has_clarification') || null;
	const cacheSourceFilter = url.searchParams.get('cache_source') || null;

	// Calculate time range
	const now = new Date();
	let startDate: Date;

	switch (timeframe) {
		case '24h':
			startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '30d':
			startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case '7d':
		default:
			startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}

	try {
		const adminSupabase = createAdminSupabaseClient();
		// Build the query
		let query = adminSupabase
			.from('timing_metrics')
			.select('*')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', now.toISOString())
			.order('created_at', { ascending: false });

		// Apply filters
		if (contextType && contextType !== 'all') {
			query = query.eq('context_type', contextType);
		}

		if (planStatus) {
			if (planStatus === 'none') {
				query = query.is('agent_plan_id', null);
			} else if (planStatus !== 'all') {
				query = query.eq('plan_status', planStatus);
			}
		}

		if (hasClarification === 'yes') {
			query = query.gt('clarification_ms', 0);
		} else if (hasClarification === 'no') {
			query = query.or('clarification_ms.is.null,clarification_ms.eq.0');
		}

		const { data: timingRows, error: timingError } = await query;

		if (timingError) throw timingError;

		const timingRowsRaw = (timingRows || []) as TimingMetricsRow[];
		const turnRunIds = Array.from(
			new Set(
				timingRowsRaw
					.map((row) => row.turn_run_id)
					.filter((id): id is string => typeof id === 'string' && id.length > 0)
			)
		);
		const turnRuns = new Map<string, ChatTurnRunTimingRow>();

		if (turnRunIds.length > 0) {
			const turnQuery = (adminSupabase as any)
				.from('chat_turn_runs')
				.select(
					'id, cache_source, request_prewarmed_context, prepared_prompt_hit, prepared_prompt_miss_reason, prepared_surface_profile, created_at'
				)
				.in('id', turnRunIds);

			let { data: turnRows, error: turnError } = await turnQuery;
			if (turnError) {
				const fallback = await (adminSupabase as any)
					.from('chat_turn_runs')
					.select('id, cache_source, request_prewarmed_context, created_at')
					.in('id', turnRunIds);
				turnRows = fallback.data;
				turnError = fallback.error;
			}
			if (turnError) throw turnError;
			for (const row of (turnRows || []) as ChatTurnRunTimingRow[]) {
				turnRuns.set(row.id, row);
			}
		}

		const rows = filterTimingRowsByCacheSource(timingRowsRaw, turnRuns, cacheSourceFilter);

		return ApiResponse.success(
			buildTimingAnalytics({
				rows,
				turnRuns,
				timeframe,
				startDate,
				endDate: now
			})
		);
	} catch (err) {
		console.error('Timing metrics error:', err);
		return ApiResponse.internalError(err, 'Failed to load timing metrics');
	}
};
