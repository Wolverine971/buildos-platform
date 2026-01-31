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
import { ApiResponse } from '$lib/utils/api-response';

interface TimingMetricsRow {
	id: string;
	session_id: string | null;
	user_id: string;
	context_type: string | null;
	message_received_at: string;
	first_event_at: string | null;
	first_response_at: string | null;
	time_to_first_event_ms: number | null;
	time_to_first_response_ms: number | null;
	context_build_ms: number | null;
	tool_selection_ms: number | null;
	clarification_ms: number | null;
	plan_created_at: string | null;
	plan_creation_ms: number | null;
	plan_execution_started_at: string | null;
	plan_completed_at: string | null;
	plan_execution_ms: number | null;
	plan_step_count: number | null;
	plan_status: string | null;
	agent_plan_id: string | null;
	message_length: number | null;
	created_at: string;
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
	if (sortedValues.length === 0) return 0;
	const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
	return sortedValues[Math.max(0, index)] ?? 0;
}

function calculateMedian(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getValidValues(
	rows: TimingMetricsRow[],
	getter: (row: TimingMetricsRow) => number | null | undefined
): number[] {
	return rows.map(getter).filter((v): v is number => v !== null && v !== undefined && v >= 0);
}

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
		// Build the query
		let query = supabase
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

		const rows = (timingRows || []) as TimingMetricsRow[];

		// ============================================
		// Calculate Percentile Statistics
		// ============================================
		const ttfrValues = getValidValues(rows, (r) => r.time_to_first_response_ms).sort(
			(a, b) => a - b
		);
		const ttfeValues = getValidValues(rows, (r) => r.time_to_first_event_ms).sort(
			(a, b) => a - b
		);
		const contextBuildValues = getValidValues(rows, (r) => r.context_build_ms).sort(
			(a, b) => a - b
		);
		const toolSelectionValues = getValidValues(rows, (r) => r.tool_selection_ms).sort(
			(a, b) => a - b
		);
		const planCreationValues = getValidValues(rows, (r) => r.plan_creation_ms).sort(
			(a, b) => a - b
		);
		const planExecutionValues = getValidValues(rows, (r) => r.plan_execution_ms).sort(
			(a, b) => a - b
		);

		const percentiles = {
			ttfr: {
				p50: calculatePercentile(ttfrValues, 50),
				p95: calculatePercentile(ttfrValues, 95),
				p99: calculatePercentile(ttfrValues, 99),
				count: ttfrValues.length
			},
			ttfe: {
				p50: calculatePercentile(ttfeValues, 50),
				p95: calculatePercentile(ttfeValues, 95),
				p99: calculatePercentile(ttfeValues, 99),
				count: ttfeValues.length
			},
			context_build: {
				p50: calculatePercentile(contextBuildValues, 50),
				p95: calculatePercentile(contextBuildValues, 95),
				p99: calculatePercentile(contextBuildValues, 99),
				count: contextBuildValues.length
			},
			tool_selection: {
				p50: calculatePercentile(toolSelectionValues, 50),
				p95: calculatePercentile(toolSelectionValues, 95),
				p99: calculatePercentile(toolSelectionValues, 99),
				count: toolSelectionValues.length
			},
			plan_creation: {
				p50: calculatePercentile(planCreationValues, 50),
				p95: calculatePercentile(planCreationValues, 95),
				p99: calculatePercentile(planCreationValues, 99),
				count: planCreationValues.length
			},
			plan_execution: {
				p50: calculatePercentile(planExecutionValues, 50),
				p95: calculatePercentile(planExecutionValues, 95),
				p99: calculatePercentile(planExecutionValues, 99),
				count: planExecutionValues.length
			}
		};

		// ============================================
		// Calculate Derived KPIs
		// ============================================
		const totalRequests = rows.length;
		const requestsWithPlan = rows.filter((r) => r.agent_plan_id !== null).length;
		const requestsWithClarification = rows.filter(
			(r) => r.clarification_ms !== null && r.clarification_ms > 0
		).length;

		const percentPlanInvoked = totalRequests > 0 ? (requestsWithPlan / totalRequests) * 100 : 0;
		const percentClarification =
			totalRequests > 0 ? (requestsWithClarification / totalRequests) * 100 : 0;

		// ============================================
		// Latency Breakdown (median values for waterfall)
		// ============================================
		const latencyBreakdown = {
			context_build_ms: calculateMedian(contextBuildValues),
			tool_selection_ms: calculateMedian(toolSelectionValues),
			clarification_ms: calculateMedian(
				getValidValues(rows, (r) => r.clarification_ms).filter((v) => v > 0)
			),
			plan_creation_ms: calculateMedian(planCreationValues),
			plan_execution_ms: calculateMedian(planExecutionValues)
		};

		// ============================================
		// Distribution Data (for histograms)
		// ============================================
		const createHistogram = (values: number[], bucketCount: number = 10) => {
			if (values.length === 0) return [];
			const min = Math.min(...values);
			const max = Math.max(...values);
			const bucketSize = (max - min) / bucketCount || 1;

			const buckets = Array(bucketCount)
				.fill(0)
				.map((_, i) => ({
					min: Math.round(min + i * bucketSize),
					max: Math.round(min + (i + 1) * bucketSize),
					count: 0
				}));

			values.forEach((v) => {
				const bucketIndex = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
				if (buckets[bucketIndex]) {
					buckets[bucketIndex].count++;
				}
			});

			return buckets;
		};

		const distributions = {
			ttfr: createHistogram(ttfrValues),
			ttfe: createHistogram(ttfeValues)
		};

		// ============================================
		// Slow Sessions (top 10 by TTFR)
		// ============================================
		const slowSessions = rows
			.filter((r) => r.time_to_first_response_ms !== null)
			.sort((a, b) => (b.time_to_first_response_ms || 0) - (a.time_to_first_response_ms || 0))
			.slice(0, 10)
			.map((r) => ({
				session_id: r.session_id,
				user_id: r.user_id,
				context_type: r.context_type,
				ttfr_ms: r.time_to_first_response_ms,
				ttfe_ms: r.time_to_first_event_ms,
				plan_status: r.plan_status,
				plan_steps: r.plan_step_count,
				created_at: r.created_at
			}));

		// ============================================
		// Context Type Performance
		// ============================================
		const contextTypeGroups = new Map<string, number[]>();
		rows.forEach((r) => {
			const ctx = r.context_type || 'unknown';
			if (!contextTypeGroups.has(ctx)) {
				contextTypeGroups.set(ctx, []);
			}
			if (r.time_to_first_response_ms !== null) {
				contextTypeGroups.get(ctx)!.push(r.time_to_first_response_ms);
			}
		});

		const contextTypePerformance = Array.from(contextTypeGroups.entries())
			.map(([context_type, values]) => ({
				context_type,
				median_ttfr_ms: calculateMedian(values),
				count: values.length
			}))
			.sort((a, b) => b.median_ttfr_ms - a.median_ttfr_ms);

		// ============================================
		// Trend Data (daily aggregates)
		// ============================================
		const dailyGroups = new Map<string, TimingMetricsRow[]>();
		rows.forEach((r) => {
			const date = r.created_at.split('T')[0];
			if (!dailyGroups.has(date)) {
				dailyGroups.set(date, []);
			}
			dailyGroups.get(date)!.push(r);
		});

		const trends = Array.from(dailyGroups.entries())
			.map(([date, dayRows]) => {
				const dayTtfr = getValidValues(dayRows, (r) => r.time_to_first_response_ms).sort(
					(a, b) => a - b
				);
				const dayTtfe = getValidValues(dayRows, (r) => r.time_to_first_event_ms).sort(
					(a, b) => a - b
				);

				return {
					date,
					count: dayRows.length,
					ttfr_p50: calculatePercentile(dayTtfr, 50),
					ttfr_p95: calculatePercentile(dayTtfr, 95),
					ttfe_p50: calculatePercentile(dayTtfe, 50),
					ttfe_p95: calculatePercentile(dayTtfe, 95)
				};
			})
			.sort((a, b) => a.date.localeCompare(b.date));

		return ApiResponse.success({
			summary: {
				total_requests: totalRequests,
				percent_plan_invoked: percentPlanInvoked,
				percent_clarification: percentClarification,
				timeframe,
				start_date: startDate.toISOString(),
				end_date: now.toISOString()
			},
			percentiles,
			latency_breakdown: latencyBreakdown,
			distributions,
			slow_sessions: slowSessions,
			context_type_performance: contextTypePerformance,
			trends
		});
	} catch (err) {
		console.error('Timing metrics error:', err);
		return ApiResponse.internalError(err, 'Failed to load timing metrics');
	}
};
