// apps/web/src/routes/api/admin/chat/timing/timing-analytics.ts
export interface TimingMetricsRow {
	id: string;
	turn_run_id?: string | null;
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
	metadata?: Record<string, unknown> | null;
}

export interface ChatTurnRunTimingRow {
	id: string;
	cache_source: string | null;
	request_prewarmed_context?: boolean | null;
	prepared_prompt_hit?: boolean | null;
	prepared_prompt_miss_reason?: string | null;
	prepared_surface_profile?: string | null;
	created_at?: string | null;
}

interface MetricStats {
	p50: number;
	p95: number;
	p99: number;
	count: number;
}

interface BuildTimingAnalyticsOptions {
	rows: TimingMetricsRow[];
	turnRuns: Map<string, ChatTurnRunTimingRow>;
	timeframe: string;
	startDate: Date;
	endDate: Date;
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
	return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function getValidValues(
	rows: TimingMetricsRow[],
	getter: (row: TimingMetricsRow) => number | null | undefined
): number[] {
	return rows.map(getter).filter((v): v is number => v !== null && v !== undefined && v >= 0);
}

function buildStats(values: number[]): MetricStats {
	const sorted = values.filter((value) => value >= 0).sort((a, b) => a - b);
	return {
		p50: calculatePercentile(sorted, 50),
		p95: calculatePercentile(sorted, 95),
		p99: calculatePercentile(sorted, 99),
		count: sorted.length
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getTimingMetadata(row: TimingMetricsRow): Record<string, unknown> {
	return isRecord(row.metadata) ? row.metadata : {};
}

function getTimingSummary(row: TimingMetricsRow): Record<string, unknown> {
	const metadata = getTimingMetadata(row);
	return isRecord(metadata.timing_summary) ? metadata.timing_summary : {};
}

function resolveCacheSource(row: TimingMetricsRow, turnRun?: ChatTurnRunTimingRow): string {
	const summary = getTimingSummary(row);
	if (typeof summary.cache_source === 'string' && summary.cache_source.trim()) {
		return summary.cache_source.trim();
	}
	const metadata = getTimingMetadata(row);
	if (typeof metadata.cache_source === 'string' && metadata.cache_source.trim()) {
		return metadata.cache_source.trim();
	}
	if (typeof turnRun?.cache_source === 'string' && turnRun.cache_source.trim()) {
		return turnRun.cache_source.trim();
	}
	return 'unknown';
}

function resolvePreparedPromptRequested(
	row: TimingMetricsRow,
	turnRun?: ChatTurnRunTimingRow
): boolean {
	const metadata = getTimingMetadata(row);
	if (metadata.prepared_prompt_requested === true) return true;
	if (metadata.prepared_prompt_hit === true) return true;
	if (turnRun?.prepared_prompt_hit === true) return true;
	return resolveCacheSource(row, turnRun) === 'prepared_prompt';
}

function resolvePreparedPromptHit(row: TimingMetricsRow, turnRun?: ChatTurnRunTimingRow): boolean {
	const metadata = getTimingMetadata(row);
	if (metadata.prepared_prompt_hit === true) return true;
	if (turnRun?.prepared_prompt_hit === true) return true;
	return resolveCacheSource(row, turnRun) === 'prepared_prompt';
}

function resolvePreparedPromptMissReason(
	row: TimingMetricsRow,
	turnRun?: ChatTurnRunTimingRow
): string | null {
	const metadata = getTimingMetadata(row);
	if (typeof metadata.prepared_prompt_miss_reason === 'string') {
		return metadata.prepared_prompt_miss_reason;
	}
	if (typeof turnRun?.prepared_prompt_miss_reason === 'string') {
		return turnRun.prepared_prompt_miss_reason;
	}
	return null;
}

function resolvePreparedSurfaceProfile(
	row: TimingMetricsRow,
	turnRun?: ChatTurnRunTimingRow
): string | null {
	const metadata = getTimingMetadata(row);
	if (typeof metadata.prepared_prompt_surface_profile === 'string') {
		return metadata.prepared_prompt_surface_profile;
	}
	if (typeof turnRun?.prepared_surface_profile === 'string') {
		return turnRun.prepared_surface_profile;
	}
	return null;
}

function buildDistribution<T>(
	rows: T[],
	getter: (row: T) => string | null | undefined
): Array<{ value: string; count: number; percent: number }> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const value = getter(row)?.trim() || 'unknown';
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	const total = rows.length;
	return Array.from(counts.entries())
		.map(([value, count]) => ({
			value,
			count,
			percent: total > 0 ? (count / total) * 100 : 0
		}))
		.sort((a, b) => b.count - a.count);
}

function createHistogram(values: number[], bucketCount: number = 10) {
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
}

export function filterTimingRowsByCacheSource(
	rows: TimingMetricsRow[],
	turnRuns: Map<string, ChatTurnRunTimingRow>,
	cacheSourceFilter: string | null
): TimingMetricsRow[] {
	if (!cacheSourceFilter || cacheSourceFilter === 'all') return rows;
	return rows.filter((row) => {
		const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
		return resolveCacheSource(row, turnRun) === cacheSourceFilter;
	});
}

export function buildTimingAnalytics({
	rows,
	turnRuns,
	timeframe,
	startDate,
	endDate
}: BuildTimingAnalyticsOptions) {
	const ttfrValues = getValidValues(rows, (r) => r.time_to_first_response_ms).sort(
		(a, b) => a - b
	);
	const ttfeValues = getValidValues(rows, (r) => r.time_to_first_event_ms).sort((a, b) => a - b);
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

	const totalRequests = rows.length;
	const requestsWithPlan = rows.filter((r) => r.agent_plan_id !== null).length;
	const requestsWithClarification = rows.filter(
		(r) => r.clarification_ms !== null && r.clarification_ms > 0
	).length;

	const latencyBreakdown = {
		context_build_ms: calculateMedian(contextBuildValues),
		tool_selection_ms: calculateMedian(toolSelectionValues),
		clarification_ms: calculateMedian(
			getValidValues(rows, (r) => r.clarification_ms).filter((v) => v > 0)
		),
		plan_creation_ms: calculateMedian(planCreationValues),
		plan_execution_ms: calculateMedian(planExecutionValues)
	};

	const cacheSourceGroups = new Map<string, TimingMetricsRow[]>();
	rows.forEach((row) => {
		const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
		const cacheSource = resolveCacheSource(row, turnRun);
		if (!cacheSourceGroups.has(cacheSource)) {
			cacheSourceGroups.set(cacheSource, []);
		}
		cacheSourceGroups.get(cacheSource)!.push(row);
	});

	const freshLoadRows = cacheSourceGroups.get('fresh_load') ?? [];
	const freshLoadTtfrP50 = buildStats(
		getValidValues(freshLoadRows, (row) => row.time_to_first_response_ms)
	).p50;
	const freshLoadContextP50 = buildStats(
		getValidValues(freshLoadRows, (row) => row.context_build_ms)
	).p50;
	const hasFreshLoadBaseline = freshLoadRows.length > 0;

	const cacheSourcePerformance = Array.from(cacheSourceGroups.entries())
		.map(([cache_source, sourceRows]) => {
			const ttfr = buildStats(
				getValidValues(sourceRows, (row) => row.time_to_first_response_ms)
			);
			const ttfe = buildStats(
				getValidValues(sourceRows, (row) => row.time_to_first_event_ms)
			);
			const contextBuild = buildStats(
				getValidValues(sourceRows, (row) => row.context_build_ms)
			);
			const toolSelection = buildStats(
				getValidValues(sourceRows, (row) => row.tool_selection_ms)
			);
			return {
				cache_source,
				count: sourceRows.length,
				share_percent: totalRequests > 0 ? (sourceRows.length / totalRequests) * 100 : 0,
				ttfr,
				ttfe,
				context_build: contextBuild,
				tool_selection: toolSelection,
				ttfr_gain_vs_fresh_load_ms: hasFreshLoadBaseline
					? freshLoadTtfrP50 - ttfr.p50
					: null,
				context_build_gain_vs_fresh_load_ms: hasFreshLoadBaseline
					? freshLoadContextP50 - contextBuild.p50
					: null
			};
		})
		.sort((a, b) => {
			if (a.cache_source === 'prepared_prompt') return -1;
			if (b.cache_source === 'prepared_prompt') return 1;
			return b.count - a.count;
		});

	const preparedPromptRequestedRows = rows.filter((row) => {
		const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
		return resolvePreparedPromptRequested(row, turnRun);
	});
	const preparedPromptHitRows = preparedPromptRequestedRows.filter((row) => {
		const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
		return resolvePreparedPromptHit(row, turnRun);
	});
	const preparedPromptMissRows = preparedPromptRequestedRows.filter((row) => {
		const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
		return !resolvePreparedPromptHit(row, turnRun);
	});

	const slowSessions = rows
		.filter((r) => r.time_to_first_response_ms !== null)
		.sort((a, b) => (b.time_to_first_response_ms || 0) - (a.time_to_first_response_ms || 0))
		.slice(0, 10)
		.map((r) => {
			const turnRun = r.turn_run_id ? turnRuns.get(r.turn_run_id) : undefined;
			return {
				session_id: r.session_id,
				user_id: r.user_id,
				context_type: r.context_type,
				cache_source: resolveCacheSource(r, turnRun),
				prepared_prompt_hit: resolvePreparedPromptHit(r, turnRun),
				prepared_prompt_miss_reason: resolvePreparedPromptMissReason(r, turnRun),
				ttfr_ms: r.time_to_first_response_ms,
				ttfe_ms: r.time_to_first_event_ms,
				plan_status: r.plan_status,
				plan_steps: r.plan_step_count,
				created_at: r.created_at
			};
		});

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

	const dailyGroups = new Map<string, TimingMetricsRow[]>();
	rows.forEach((r) => {
		const date = r.created_at.split('T')[0]!;
		if (!dailyGroups.has(date)) {
			dailyGroups.set(date, []);
		}
		dailyGroups.get(date)!.push(r);
	});

	return {
		summary: {
			total_requests: totalRequests,
			percent_plan_invoked: totalRequests > 0 ? (requestsWithPlan / totalRequests) * 100 : 0,
			percent_clarification:
				totalRequests > 0 ? (requestsWithClarification / totalRequests) * 100 : 0,
			timeframe,
			start_date: startDate.toISOString(),
			end_date: endDate.toISOString()
		},
		percentiles: {
			ttfr: buildStats(ttfrValues),
			ttfe: buildStats(ttfeValues),
			context_build: buildStats(contextBuildValues),
			tool_selection: buildStats(toolSelectionValues),
			plan_creation: buildStats(planCreationValues),
			plan_execution: buildStats(planExecutionValues)
		},
		latency_breakdown: latencyBreakdown,
		distributions: {
			ttfr: createHistogram(ttfrValues),
			ttfe: createHistogram(ttfeValues)
		},
		cache_source_performance: cacheSourcePerformance,
		prepared_prompt: {
			requested_count: preparedPromptRequestedRows.length,
			hit_count: preparedPromptHitRows.length,
			miss_count: preparedPromptMissRows.length,
			hit_rate:
				preparedPromptRequestedRows.length > 0
					? (preparedPromptHitRows.length / preparedPromptRequestedRows.length) * 100
					: 0,
			miss_reasons: buildDistribution(preparedPromptMissRows, (row) => {
				const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
				return resolvePreparedPromptMissReason(row, turnRun) ?? 'unknown';
			}),
			surface_profiles: buildDistribution(preparedPromptHitRows, (row) => {
				const turnRun = row.turn_run_id ? turnRuns.get(row.turn_run_id) : undefined;
				return resolvePreparedSurfaceProfile(row, turnRun) ?? 'unknown';
			})
		},
		slow_sessions: slowSessions,
		context_type_performance: Array.from(contextTypeGroups.entries())
			.map(([context_type, values]) => ({
				context_type,
				median_ttfr_ms: calculateMedian(values),
				count: values.length
			}))
			.sort((a, b) => b.median_ttfr_ms - a.median_ttfr_ms),
		trends: Array.from(dailyGroups.entries())
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
			.sort((a, b) => a.date.localeCompare(b.date))
	};
}
