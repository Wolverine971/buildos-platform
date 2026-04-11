<!-- apps/web/src/lib/components/admin/chat/LlmUsageStatsPanel.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { format } from 'date-fns';
	import {
		Activity,
		AlertCircle,
		BarChart3,
		Bot,
		Database,
		DollarSign,
		Gauge,
		Timer,
		TrendingDown,
		TrendingUp,
		Wrench,
		Zap
	} from 'lucide-svelte';

	type Trend = {
		direction: 'up' | 'down';
		value: number;
	};

	type DailyDataPoint = {
		summary_date: string;
		total_requests: number;
		total_cost_usd: number;
		total_tokens: number;
		prompt_tokens: number;
		completion_tokens: number;
		successful_requests: number;
		failed_requests: number;
		success_rate: number;
		agentic_turns: number;
		agentic_llm_passes: number;
		agentic_tokens: number;
		tool_calls: number;
	};

	type ModelBreakdown = {
		model: string;
		provider: string;
		requests: number;
		successful_requests: number;
		failed_requests: number;
		streaming_requests: number;
		cache_hits: number;
		cache_hit_rate: number;
		total_cost: number;
		input_cost: number;
		output_cost: number;
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		agentic_passes: number;
		agentic_turns: number;
		agentic_tokens: number;
		reasoning_tokens: number;
		avg_response_time: number;
		p95_response_time: number;
		success_rate: number;
		cost_per_1m_tokens: number;
		cost_share: number;
		token_share: number;
	};

	type AgenticModelBreakdown = {
		model: string;
		provider: string;
		passes: number;
		turns: number;
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		reasoning_tokens: number;
		estimated_cost: number;
		cache_hits: number;
		cache_hit_rate: number;
		share: number;
		finished_reasons: Array<{ reason: string; count: number }>;
	};

	type OperationBreakdown = {
		operation: string;
		requests: number;
		successful_requests: number;
		failed_requests: number;
		total_cost: number;
		total_tokens: number;
		avg_response_time: number;
		p95_response_time: number;
		success_rate: number;
	};

	type AgenticOperationBreakdown = {
		operation: string;
		turns: number;
		completed_turns: number;
		failed_turns: number;
		tool_calls: number;
		validation_failures: number;
		avg_duration_ms: number;
		p95_duration_ms: number;
		success_rate: number;
	};

	type TopTool = {
		tool: string;
		calls: number;
		successful_calls: number;
		failed_calls: number;
		success_rate: number;
		tokens_consumed: number;
		avg_duration_ms: number;
		p95_duration_ms: number;
	};

	type TopUser = {
		user_id: string;
		email: string;
		name: string | null;
		requests: number;
		turns: number;
		tool_calls: number;
		total_cost: number;
		total_tokens: number;
		last_usage: string;
	};

	type RecentLog = {
		id: string;
		created_at: string;
		operation_type: string;
		model_used: string;
		total_cost_usd: number;
		total_tokens: number;
		response_time_ms: number;
		status: string;
		streaming: boolean | null;
		users: { email?: string | null; name?: string | null } | null;
	};

	type RecentAgenticTurn = {
		id: string;
		started_at: string;
		status: string;
		context_type: string;
		first_lane: string | null;
		first_canonical_op: string | null;
		first_help_path: string | null;
		tool_call_count: number;
		llm_pass_count: number;
		validation_failure_count: number;
		gateway_enabled: boolean;
		duration_ms: number | null;
		models: string[];
		user: { email?: string | null; name?: string | null } | null;
	};

	type LlmUsageStats = {
		overview: {
			totalCost: number;
			totalRequests: number;
			totalTokens: number;
			promptTokens: number;
			completionTokens: number;
			inputCost: number;
			outputCost: number;
			avgCostPerRequest: number;
			costPer1MTokens: number;
			successRate: number;
			failureCount: number;
			timeoutCount: number;
			avgResponseTime: number;
			p95ResponseTime: number;
			streamingRequests: number;
			cacheHitRate: number;
			activeModels: number;
			costTrend: Trend;
			tokenTrend: Trend;
		};
		agenticOverview: {
			totalTurns: number;
			completedTurns: number;
			failedTurns: number;
			cancelledTurns: number;
			successRate: number;
			turnTrend: Trend;
			gatewayEnabledRate: number;
			historyCompressionRate: number;
			prewarmedContextRate: number;
			totalToolCalls: number;
			toolSuccessRate: number;
			avgToolsPerTurn: number;
			validationFailureCount: number;
			llmPasses: number;
			avgLlmPassesPerTurn: number;
			totalTokens: number;
			promptTokens: number;
			completionTokens: number;
			reasoningTokens: number;
			estimatedCost: number;
			cacheHitRate: number;
			avgTurnDurationMs: number;
			p95TurnDurationMs: number;
		};
		dailyData: DailyDataPoint[];
		modelBreakdown: ModelBreakdown[];
		agenticModelBreakdown: AgenticModelBreakdown[];
		operationBreakdown: OperationBreakdown[];
		agenticOperationBreakdown: AgenticOperationBreakdown[];
		turnDistributions: {
			status: Array<{ label: string; count: number }>;
			context: Array<{ label: string; count: number }>;
			lane: Array<{ label: string; count: number }>;
			cacheSource: Array<{ label: string; count: number }>;
		};
		topTools: TopTool[];
		topUsers: TopUser[];
		recentLogs: RecentLog[];
		recentAgenticTurns: RecentAgenticTurn[];
		dateRange: {
			start: string;
			end: string;
			days: number;
		};
		dataHealth: {
			rows: {
				llmUsageLogs: number;
				chatTurnRuns: number;
				chatTurnEvents: number;
				chatToolExecutions: number;
			};
			truncated: Record<string, boolean>;
			hasBillableUsage: boolean;
			hasAgenticTelemetry: boolean;
		};
	};

	let {
		days = '30',
		refreshKey = 0,
		headingId = 'llm-usage'
	}: {
		days?: string;
		refreshKey?: number;
		headingId?: string;
	} = $props();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let stats = $state<LlmUsageStats | null>(null);
	let requestSequence = 0;

	let visibleDailyData = $derived(
		(stats?.dailyData ?? [])
			.slice()
			.sort((a, b) => b.summary_date.localeCompare(a.summary_date))
			.slice(0, 30)
	);
	let topCostModels = $derived(
		(stats?.modelBreakdown ?? []).filter((model) => model.requests > 0).slice(0, 8)
	);
	let topAgenticModels = $derived((stats?.agenticModelBreakdown ?? []).slice(0, 8));
	let topOperations = $derived((stats?.operationBreakdown ?? []).slice(0, 10));
	let topAgenticOperations = $derived((stats?.agenticOperationBreakdown ?? []).slice(0, 10));
	let hasTruncatedData = $derived(
		stats ? Object.values(stats.dataHealth.truncated).some(Boolean) : false
	);
	let maxDailyCost = $derived(maxOf(visibleDailyData, (day) => day.total_cost_usd));
	let maxDailyTokens = $derived(maxOf(visibleDailyData, (day) => day.total_tokens));
	let maxDailyAgenticTurns = $derived(maxOf(visibleDailyData, (day) => day.agentic_turns));
	let maxModelCost = $derived(maxOf(topCostModels, (model) => model.total_cost));
	let maxAgenticPasses = $derived(maxOf(topAgenticModels, (model) => model.passes));
	let maxOperationCost = $derived(maxOf(topOperations, (operation) => operation.total_cost));
	let maxAgenticOperationTurns = $derived(
		maxOf(topAgenticOperations, (operation) => operation.turns)
	);

	async function fetchStats() {
		if (!browser) return;
		const requestId = ++requestSequence;
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/llm-usage/stats?days=${days}`);
			const result = await response.json();

			if (requestId !== requestSequence) return;

			if (!response.ok || !result.success) {
				throw new Error(result.error || result.message || 'Failed to fetch stats');
			}

			stats = result.data;
		} catch (err) {
			if (requestId !== requestSequence) return;
			error = err instanceof Error ? err.message : 'Failed to load stats';
			console.error('Error fetching LLM stats:', err);
		} finally {
			if (requestId === requestSequence) {
				loading = false;
			}
		}
	}

	$effect(() => {
		if (!browser) return;
		days;
		refreshKey;
		void fetchStats();
	});

	function maxOf<T>(items: T[], selector: (item: T) => number): number {
		const values = items.map(selector).filter((value) => Number.isFinite(value));
		return Math.max(1, ...values);
	}

	function barWidth(value: number, max: number, minimum = 2): string {
		if (!Number.isFinite(value) || value <= 0 || max <= 0) return '0%';
		return `${Math.max(minimum, Math.min(100, (value / max) * 100))}%`;
	}

	function formatCurrency(amount: number): string {
		const value = Number.isFinite(amount) ? amount : 0;
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
			maximumFractionDigits: 4
		}).format(value);
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat('en-US').format(Math.round(Number.isFinite(num) ? num : 0));
	}

	function formatCompact(num: number): string {
		return new Intl.NumberFormat('en-US', {
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(Number.isFinite(num) ? num : 0);
	}

	function formatPercent(num: number): string {
		return `${(Number.isFinite(num) ? num : 0).toFixed(1)}%`;
	}

	function formatDuration(ms: number | null | undefined): string {
		if (!ms || !Number.isFinite(ms)) return '0ms';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60_000).toFixed(1)}m`;
	}

	function formatDateTime(dateString: string | null | undefined): string {
		if (!dateString) return 'Unknown';
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		return format(date, 'MMM d, HH:mm');
	}

	function formatDay(dateString: string): string {
		const date = new Date(`${dateString}T00:00:00`);
		if (Number.isNaN(date.getTime())) return dateString;
		return format(date, 'MMM d');
	}

	function labelText(value: string | null | undefined): string {
		return value && value.trim().length > 0 ? value : 'unknown';
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
			case 'completed':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'failure':
			case 'failed':
				return 'bg-red-500/10 text-red-600 dark:text-red-400';
			case 'timeout':
			case 'cancelled':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'running':
				return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}
</script>

<section id={headingId} class="space-y-6 scroll-mt-8" aria-labelledby={`${headingId}-heading`}>
	<div>
		<div class="flex items-center gap-2">
			<Zap class="h-5 w-5 text-amber-500" />
			<h2 id={`${headingId}-heading`} class="text-lg font-semibold text-foreground">
				LLM Usage
			</h2>
		</div>
		<p class="mt-1 text-sm text-muted-foreground">
			Model mix, cost, tokens, and agentic chat health
		</p>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _}
				<div class="rounded-lg border border-border bg-card p-4 shadow-ink animate-pulse">
					<div class="h-4 w-2/3 rounded bg-muted"></div>
					<div class="mt-3 h-8 w-1/2 rounded bg-muted"></div>
					<div class="mt-2 h-3 w-3/4 rounded bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div
			class="rounded-lg border border-red-500/30 bg-red-500/10 p-4 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-start gap-3">
				<AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
				<div>
					<p class="font-semibold text-red-600 dark:text-red-400">Error loading stats</p>
					<p class="mt-1 text-sm text-red-500">{error}</p>
				</div>
			</div>
		</div>
	{:else if stats}
		{#if hasTruncatedData}
			<div
				class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"
			>
				Some source tables hit the dashboard row cap. Metrics are still useful for
				direction, but the largest tables may be undercounted for this range.
			</div>
		{/if}

		{#if !stats.dataHealth.hasBillableUsage && stats.dataHealth.hasAgenticTelemetry}
			<div
				class="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-700 dark:text-sky-300"
			>
				No billable `llm_usage_logs` rows were found for this range. Agentic model charts
				are using turn telemetry and estimated prices from the local model registry.
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Billable Cost
					</p>
					<DollarSign class="h-4 w-4 text-emerald-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatCurrency(stats.overview.totalCost)}
				</p>
				<div class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
					{#if stats.overview.costTrend.direction === 'up'}
						<TrendingUp class="h-3.5 w-3.5 text-red-500" />
					{:else}
						<TrendingDown class="h-3.5 w-3.5 text-emerald-500" />
					{/if}
					<span>{formatPercent(stats.overview.costTrend.value)} vs previous</span>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Billable Requests
					</p>
					<Activity class="h-4 w-4 text-sky-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.overview.totalRequests)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(stats.overview.successRate)} success
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Billable Tokens
					</p>
					<Zap class="h-4 w-4 text-amber-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatCompact(stats.overview.totalTokens)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatCurrency(stats.overview.costPer1MTokens)} / 1M
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Models
					</p>
					<BarChart3 class="h-4 w-4 text-violet-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.overview.activeModels)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">active in this range</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Turns
					</p>
					<Bot class="h-4 w-4 text-teal-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.agenticOverview.totalTurns)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(stats.agenticOverview.successRate)} completed
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Passes
					</p>
					<Gauge class="h-4 w-4 text-fuchsia-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.agenticOverview.llmPasses)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{stats.agenticOverview.avgLlmPassesPerTurn.toFixed(2)} / turn
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Tools
					</p>
					<Wrench class="h-4 w-4 text-cyan-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.agenticOverview.totalToolCalls)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatPercent(stats.agenticOverview.toolSuccessRate)} success
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between gap-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						P95 Turn
					</p>
					<Timer class="h-4 w-4 text-rose-500" />
				</div>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatDuration(stats.agenticOverview.p95TurnDurationMs)}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatDuration(stats.overview.p95ResponseTime)} LLM p95
				</p>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
			<div
				class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak xl:col-span-2"
			>
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold text-foreground">Daily Usage</h2>
						<p class="text-xs text-muted-foreground">
							Billable cost, billable tokens, and agentic turn volume
						</p>
					</div>
					<p class="text-xs text-muted-foreground">
						Last {visibleDailyData.length} days shown
					</p>
				</div>

				{#if visibleDailyData.length > 0}
					<div class="space-y-3">
						{#each visibleDailyData as day}
							<div
								class="grid grid-cols-[4.5rem_1fr] gap-3 sm:grid-cols-[5rem_1fr_6rem] sm:items-center"
							>
								<div class="text-xs font-medium text-muted-foreground">
									{formatDay(day.summary_date)}
								</div>
								<div class="space-y-1.5">
									<div class="h-2 rounded-full bg-muted">
										<div
											class="h-2 rounded-full bg-emerald-500"
											style:width={barWidth(day.total_cost_usd, maxDailyCost)}
										></div>
									</div>
									<div class="h-2 rounded-full bg-muted">
										<div
											class="h-2 rounded-full bg-sky-500"
											style:width={barWidth(day.total_tokens, maxDailyTokens)}
										></div>
									</div>
									<div class="h-2 rounded-full bg-muted">
										<div
											class="h-2 rounded-full bg-teal-500"
											style:width={barWidth(
												day.agentic_turns,
												maxDailyAgenticTurns
											)}
										></div>
									</div>
								</div>
								<div
									class="col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:block sm:text-right"
								>
									<span>{formatCurrency(day.total_cost_usd)}</span>
									<span>{formatCompact(day.total_tokens)} tokens</span>
									<span>{formatNumber(day.agentic_turns)} turns</span>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1"
							><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Cost</span
						>
						<span class="inline-flex items-center gap-1"
							><span class="h-2 w-2 rounded-full bg-sky-500"></span>Tokens</span
						>
						<span class="inline-flex items-center gap-1"
							><span class="h-2 w-2 rounded-full bg-teal-500"></span>Agentic turns</span
						>
					</div>
				{:else}
					<p class="py-8 text-center text-sm text-muted-foreground">
						No usage data found.
					</p>
				{/if}
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<h2 class="text-sm font-semibold text-foreground">Token Mix</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Billable input/output plus reasoning from agentic telemetry
				</p>
				<div class="mt-5 space-y-4">
					<div>
						<div class="mb-2 flex items-center justify-between text-sm">
							<span class="text-foreground">Input</span>
							<span class="font-medium text-sky-500"
								>{formatCompact(stats.overview.promptTokens)}</span
							>
						</div>
						<div class="h-3 rounded-full bg-muted">
							<div
								class="h-3 rounded-full bg-sky-500"
								style:width={barWidth(
									stats.overview.promptTokens,
									stats.overview.totalTokens
								)}
							></div>
						</div>
					</div>
					<div>
						<div class="mb-2 flex items-center justify-between text-sm">
							<span class="text-foreground">Output</span>
							<span class="font-medium text-fuchsia-500"
								>{formatCompact(stats.overview.completionTokens)}</span
							>
						</div>
						<div class="h-3 rounded-full bg-muted">
							<div
								class="h-3 rounded-full bg-fuchsia-500"
								style:width={barWidth(
									stats.overview.completionTokens,
									stats.overview.totalTokens
								)}
							></div>
						</div>
					</div>
					<div>
						<div class="mb-2 flex items-center justify-between text-sm">
							<span class="text-foreground">Reasoning</span>
							<span class="font-medium text-amber-500"
								>{formatCompact(stats.agenticOverview.reasoningTokens)}</span
							>
						</div>
						<div class="h-3 rounded-full bg-muted">
							<div
								class="h-3 rounded-full bg-amber-500"
								style:width={barWidth(
									stats.agenticOverview.reasoningTokens,
									stats.agenticOverview.totalTokens
								)}
							></div>
						</div>
					</div>
				</div>
				<div class="mt-5 grid grid-cols-2 gap-3 text-xs">
					<div class="rounded-lg border border-border bg-muted/40 p-3">
						<p class="text-muted-foreground">Cache hits</p>
						<p class="mt-1 text-lg font-semibold text-foreground">
							{formatPercent(stats.overview.cacheHitRate)}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-muted/40 p-3">
						<p class="text-muted-foreground">Streaming</p>
						<p class="mt-1 text-lg font-semibold text-foreground">
							{formatNumber(stats.overview.streamingRequests)}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-muted/40 p-3">
						<p class="text-muted-foreground">Gateway</p>
						<p class="mt-1 text-lg font-semibold text-foreground">
							{formatPercent(stats.agenticOverview.gatewayEnabledRate)}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-muted/40 p-3">
						<p class="text-muted-foreground">Compressed</p>
						<p class="mt-1 text-lg font-semibold text-foreground">
							{formatPercent(stats.agenticOverview.historyCompressionRate)}
						</p>
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<h2 class="text-sm font-semibold text-foreground">Billable Model Share</h2>
				<p class="mt-1 text-xs text-muted-foreground">Cost share from `llm_usage_logs`</p>
				<div class="mt-4 space-y-4">
					{#each topCostModels as model}
						<div>
							<div class="mb-1 flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-foreground">
										{model.model}
									</p>
									<p class="text-xs text-muted-foreground">
										{model.provider} - {formatNumber(model.requests)} requests -
										{formatPercent(model.success_rate)} success
									</p>
								</div>
								<div class="shrink-0 text-right">
									<p class="text-sm font-semibold text-emerald-500">
										{formatCurrency(model.total_cost)}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatPercent(model.cost_share)}
									</p>
								</div>
							</div>
							<div class="h-2.5 rounded-full bg-muted">
								<div
									class="h-2.5 rounded-full bg-emerald-500"
									style:width={barWidth(model.total_cost, maxModelCost)}
								></div>
							</div>
						</div>
					{/each}
					{#if topCostModels.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">
							No billable model data found.
						</p>
					{/if}
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<h2 class="text-sm font-semibold text-foreground">Agentic Model Passes</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Per-pass telemetry from current agentic chat
				</p>
				<div class="mt-4 space-y-4">
					{#each topAgenticModels as model}
						<div>
							<div class="mb-1 flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-foreground">
										{model.model}
									</p>
									<p class="text-xs text-muted-foreground">
										{model.provider} - {formatNumber(model.turns)} turns - {formatCompact(
											model.total_tokens
										)} tokens
									</p>
								</div>
								<div class="shrink-0 text-right">
									<p class="text-sm font-semibold text-teal-500">
										{formatNumber(model.passes)} passes
									</p>
									<p class="text-xs text-muted-foreground">
										{formatCurrency(model.estimated_cost)} est. - {formatPercent(
											model.cache_hit_rate
										)} cache
									</p>
								</div>
							</div>
							<div class="h-2.5 rounded-full bg-muted">
								<div
									class="h-2.5 rounded-full bg-teal-500"
									style:width={barWidth(model.passes, maxAgenticPasses)}
								></div>
							</div>
						</div>
					{/each}
					{#if topAgenticModels.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">
							No agentic pass telemetry found.
						</p>
					{/if}
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<h2 class="text-sm font-semibold text-foreground">Cost By Operation</h2>
				<p class="mt-1 text-xs text-muted-foreground">Billable operation types</p>
				<div class="mt-4 space-y-3">
					{#each topOperations as operation}
						<div class="grid grid-cols-[1fr_auto] gap-3">
							<div class="min-w-0">
								<div class="flex items-center justify-between gap-3">
									<p class="truncate text-sm font-medium text-foreground">
										{operation.operation}
									</p>
									<p class="shrink-0 text-sm font-semibold text-emerald-500">
										{formatCurrency(operation.total_cost)}
									</p>
								</div>
								<div class="mt-1 h-2 rounded-full bg-muted">
									<div
										class="h-2 rounded-full bg-emerald-500"
										style:width={barWidth(
											operation.total_cost,
											maxOperationCost
										)}
									></div>
								</div>
								<p class="mt-1 text-xs text-muted-foreground">
									{formatNumber(operation.requests)} requests - {formatCompact(
										operation.total_tokens
									)} tokens - {formatPercent(operation.success_rate)} success
								</p>
							</div>
						</div>
					{/each}
					{#if topOperations.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">
							No operation data found.
						</p>
					{/if}
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<h2 class="text-sm font-semibold text-foreground">Agentic First Actions</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					First operation, help path, or skill path recorded for each turn
				</p>
				<div class="mt-4 space-y-3">
					{#each topAgenticOperations as operation}
						<div>
							<div class="mb-1 flex items-center justify-between gap-3">
								<p class="min-w-0 truncate text-sm font-medium text-foreground">
									{operation.operation}
								</p>
								<p class="shrink-0 text-sm font-semibold text-teal-500">
									{formatNumber(operation.turns)} turns
								</p>
							</div>
							<div class="h-2 rounded-full bg-muted">
								<div
									class="h-2 rounded-full bg-teal-500"
									style:width={barWidth(
										operation.turns,
										maxAgenticOperationTurns
									)}
								></div>
							</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{formatPercent(operation.success_rate)} success - {formatDuration(
									operation.p95_duration_ms
								)} p95 - {formatNumber(operation.tool_calls)} tools
							</p>
						</div>
					{/each}
					{#if topAgenticOperations.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">
							No agentic operation data found.
						</p>
					{/if}
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
			<div class="border-b border-border p-4">
				<h2 class="text-sm font-semibold text-foreground">Model Performance</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Billable usage joined with agentic pass telemetry by model
				</p>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Model</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Requests</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Cost</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Tokens</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Agentic Passes</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Cache</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>Success</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>P95</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each stats.modelBreakdown as model}
							<tr class="hover:bg-muted/30">
								<td class="max-w-[260px] px-4 py-3">
									<p class="truncate text-sm font-medium text-foreground">
										{model.model}
									</p>
									<p class="text-xs text-muted-foreground">{model.provider}</p>
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatNumber(model.requests)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
									>{formatCurrency(model.total_cost)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatCompact(model.total_tokens)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatNumber(model.agentic_passes)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatPercent(model.cache_hit_rate)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatPercent(model.success_rate)}</td
								>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>{formatDuration(model.p95_response_time)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-sm font-semibold text-foreground">Tool Health</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Top gateway ops, help paths, and tools
					</p>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted/50">
							<tr>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Tool</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Calls</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Success</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>P95</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each stats.topTools as tool}
								<tr class="hover:bg-muted/30">
									<td
										class="max-w-[280px] px-4 py-3 text-sm font-medium text-foreground"
									>
										<p class="truncate">{tool.tool}</p>
									</td>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
										>{formatNumber(tool.calls)}</td
									>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
										>{formatPercent(tool.success_rate)}</td
									>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
										>{formatDuration(tool.p95_duration_ms)}</td
									>
								</tr>
							{/each}
							{#if stats.topTools.length === 0}
								<tr>
									<td
										colspan="4"
										class="px-4 py-8 text-center text-sm text-muted-foreground"
										>No tool executions found.</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-sm font-semibold text-foreground">Top Users</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Highest cost users with agentic turn counts
					</p>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted/50">
							<tr>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>User</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Cost</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Requests</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Turns</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Last</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each stats.topUsers as user}
								<tr class="hover:bg-muted/30">
									<td class="max-w-[220px] px-4 py-3">
										<p class="truncate text-sm font-medium text-foreground">
											{user.name || user.email}
										</p>
										<p class="truncate text-xs text-muted-foreground">
											{user.email}
										</p>
									</td>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
										>{formatCurrency(user.total_cost)}</td
									>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
										>{formatNumber(user.requests)}</td
									>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
										>{formatNumber(user.turns)}</td
									>
									<td
										class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
										>{formatDateTime(user.last_usage)}</td
									>
								</tr>
							{/each}
							{#if stats.topUsers.length === 0}
								<tr>
									<td
										colspan="5"
										class="px-4 py-8 text-center text-sm text-muted-foreground"
										>No user usage found.</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-sm font-semibold text-foreground">Recent Billable Requests</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Latest rows from `llm_usage_logs`
					</p>
				</div>
				<div class="max-h-96 overflow-x-auto overflow-y-auto scrollbar-thin">
					<table class="min-w-full divide-y divide-border">
						<thead class="sticky top-0 bg-muted/95">
							<tr>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Time</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Model</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Operation</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Cost</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Status</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each stats.recentLogs as log}
								<tr class="hover:bg-muted/30">
									<td
										class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
										>{formatDateTime(log.created_at)}</td
									>
									<td class="max-w-[220px] px-4 py-3">
										<p class="truncate text-sm font-medium text-foreground">
											{log.model_used}
										</p>
										<p class="truncate text-xs text-muted-foreground">
											{log.users?.email || 'Unknown'}
										</p>
									</td>
									<td
										class="max-w-[180px] px-4 py-3 text-sm text-muted-foreground"
									>
										<p class="truncate">{log.operation_type}</p>
									</td>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
										>{formatCurrency(log.total_cost_usd)}</td
									>
									<td class="whitespace-nowrap px-4 py-3">
										<span
											class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getStatusColor(
												log.status
											)}">{log.status}</span
										>
									</td>
								</tr>
							{/each}
							{#if stats.recentLogs.length === 0}
								<tr>
									<td
										colspan="5"
										class="px-4 py-8 text-center text-sm text-muted-foreground"
										>No recent billable requests found.</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-sm font-semibold text-foreground">Recent Agentic Turns</h2>
					<p class="mt-1 text-xs text-muted-foreground">Latest current chat turn runs</p>
				</div>
				<div class="max-h-96 overflow-x-auto overflow-y-auto scrollbar-thin">
					<table class="min-w-full divide-y divide-border">
						<thead class="sticky top-0 bg-muted/95">
							<tr>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Time</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Route</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Models</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Work</th
								>
								<th
									class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>Status</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each stats.recentAgenticTurns as turn}
								<tr class="hover:bg-muted/30">
									<td
										class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
										>{formatDateTime(turn.started_at)}</td
									>
									<td class="max-w-[220px] px-4 py-3">
										<p class="truncate text-sm font-medium text-foreground">
											{labelText(
												turn.first_canonical_op ||
													turn.first_help_path ||
													turn.first_lane
											)}
										</p>
										<p class="truncate text-xs text-muted-foreground">
											{turn.context_type} - {turn.user?.email || 'Unknown'}
										</p>
									</td>
									<td
										class="max-w-[220px] px-4 py-3 text-sm text-muted-foreground"
									>
										<p class="truncate">
											{turn.models.length > 0
												? turn.models.join(', ')
												: 'unknown'}
										</p>
									</td>
									<td
										class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
									>
										{formatNumber(turn.llm_pass_count)} passes - {formatNumber(
											turn.tool_call_count
										)} tools - {formatDuration(turn.duration_ms)}
									</td>
									<td class="whitespace-nowrap px-4 py-3">
										<span
											class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getStatusColor(
												turn.status
											)}">{turn.status}</span
										>
									</td>
								</tr>
							{/each}
							{#if stats.recentAgenticTurns.length === 0}
								<tr>
									<td
										colspan="5"
										class="px-4 py-8 text-center text-sm text-muted-foreground"
										>No recent agentic turns found.</td
									>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
			<div class="mb-4 flex items-center gap-2">
				<Database class="h-4 w-4 text-muted-foreground" />
				<h2 class="text-sm font-semibold text-foreground">Data Health</h2>
			</div>
			<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
				<div class="rounded-lg border border-border bg-muted/40 p-3">
					<p class="text-xs text-muted-foreground">Usage logs</p>
					<p class="mt-1 text-lg font-semibold text-foreground">
						{formatNumber(stats.dataHealth.rows.llmUsageLogs)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-muted/40 p-3">
					<p class="text-xs text-muted-foreground">Turn runs</p>
					<p class="mt-1 text-lg font-semibold text-foreground">
						{formatNumber(stats.dataHealth.rows.chatTurnRuns)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-muted/40 p-3">
					<p class="text-xs text-muted-foreground">LLM pass events</p>
					<p class="mt-1 text-lg font-semibold text-foreground">
						{formatNumber(stats.dataHealth.rows.chatTurnEvents)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-muted/40 p-3">
					<p class="text-xs text-muted-foreground">Tool executions</p>
					<p class="mt-1 text-lg font-semibold text-foreground">
						{formatNumber(stats.dataHealth.rows.chatToolExecutions)}
					</p>
				</div>
			</div>
			<p class="mt-4 text-xs text-muted-foreground">
				Billable cost comes from usage logs. Agentic model pass, reasoning, cache, route,
				and tool metrics come from the newer chat turn observability tables.
			</p>
		</div>
	{/if}
</section>
