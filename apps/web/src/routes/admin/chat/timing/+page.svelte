<!-- apps/web/src/routes/admin/chat/timing/+page.svelte -->
<script lang="ts">
	import {
		Clock,
		RefreshCw,
		AlertCircle,
		Filter,
		ChevronDown,
		ChevronUp,
		TrendingUp,
		Activity,
		Zap,
		Target,
		BarChart3
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { browser } from '$app/environment';

	// Types
	interface PercentileStats {
		p50: number;
		p95: number;
		p99: number;
		count: number;
	}

	interface HistogramBucket {
		min: number;
		max: number;
		count: number;
	}

	interface SlowSession {
		session_id: string;
		user_id: string;
		context_type: string | null;
		ttfr_ms: number | null;
		ttfe_ms: number | null;
		plan_status: string | null;
		plan_steps: number | null;
		created_at: string;
	}

	interface ContextPerformance {
		context_type: string;
		median_ttfr_ms: number;
		count: number;
	}

	interface DailyTrend {
		date: string;
		count: number;
		ttfr_p50: number;
		ttfr_p95: number;
		ttfe_p50: number;
		ttfe_p95: number;
	}

	interface TimingData {
		summary: {
			total_requests: number;
			percent_plan_invoked: number;
			percent_clarification: number;
			timeframe: string;
			start_date: string;
			end_date: string;
		};
		percentiles: {
			ttfr: PercentileStats;
			ttfe: PercentileStats;
			context_build: PercentileStats;
			tool_selection: PercentileStats;
			plan_creation: PercentileStats;
			plan_execution: PercentileStats;
		};
		latency_breakdown: {
			context_build_ms: number;
			tool_selection_ms: number;
			clarification_ms: number;
			plan_creation_ms: number;
			plan_execution_ms: number;
		};
		distributions: {
			ttfr: HistogramBucket[];
			ttfe: HistogramBucket[];
		};
		slow_sessions: SlowSession[];
		context_type_performance: ContextPerformance[];
		trends: DailyTrend[];
	}

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let timingData = $state<TimingData | null>(null);

	// Filters
	let selectedTimeframe = $state<'24h' | '7d' | '30d'>('7d');
	let selectedContextType = $state<string>('all');
	let selectedPlanStatus = $state<string>('all');
	let hasClarification = $state<string>('all');
	let showFilters = $state(false);

	// Load data on mount and when filters change
	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		selectedContextType;
		selectedPlanStatus;
		hasClarification;
		loadTimingData();
	});

	async function loadTimingData() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe
			});

			if (selectedContextType !== 'all') {
				params.append('context_type', selectedContextType);
			}
			if (selectedPlanStatus !== 'all') {
				params.append('plan_status', selectedPlanStatus);
			}
			if (hasClarification !== 'all') {
				params.append('has_clarification', hasClarification);
			}

			const response = await fetch(`/api/admin/chat/timing?${params}`);

			if (!response.ok) {
				throw new Error('Failed to load timing data');
			}

			const data = await response.json();

			if (data.success) {
				timingData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load timing data');
			}
		} catch (err) {
			console.error('Error loading timing data:', err);
			error = err instanceof Error ? err.message : 'Failed to load timing data';
		} finally {
			isLoading = false;
		}
	}

	// Formatting helpers
	function formatMs(ms: number | null | undefined): string {
		if (ms === null || ms === undefined) return '-';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function formatPercent(value: number): string {
		return `${value.toFixed(1)}%`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function formatShortDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Warning thresholds
	function getTtfrWarning(ms: number | null): 'normal' | 'warning' | 'critical' {
		if (ms === null) return 'normal';
		if (ms > 10000) return 'critical';
		if (ms > 5000) return 'warning';
		return 'normal';
	}

	function getToolSelectionWarning(ms: number | null): 'normal' | 'warning' | 'critical' {
		if (ms === null) return 'normal';
		if (ms > 2000) return 'critical';
		if (ms > 1000) return 'warning';
		return 'normal';
	}

	function getPlanExecutionWarning(ms: number | null): 'normal' | 'warning' | 'critical' {
		if (ms === null) return 'normal';
		if (ms > 10000) return 'critical';
		if (ms > 5000) return 'warning';
		return 'normal';
	}

	// Calculate latency breakdown total and percentages
	function getLatencyBreakdownTotal(): number {
		if (!timingData) return 0;
		const lb = timingData.latency_breakdown;
		return (
			(lb.context_build_ms || 0) +
			(lb.tool_selection_ms || 0) +
			(lb.clarification_ms || 0) +
			(lb.plan_creation_ms || 0) +
			(lb.plan_execution_ms || 0)
		);
	}

	function getLatencyPercent(ms: number): string {
		const total = getLatencyBreakdownTotal();
		if (total === 0) return '0%';
		return `${((ms / total) * 100).toFixed(0)}%`;
	}

	// Calculate histogram max for normalization
	function getHistogramMax(buckets: HistogramBucket[]): number {
		return Math.max(...buckets.map((b) => b.count), 1);
	}
</script>

<svelte:head>
	<title>Timing Metrics - Chat Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Timing Metrics"
		description="End-to-end latency analysis for agentic chat"
		icon={Clock}
		showBack={true}
	>
		<div slot="actions" class="flex flex-wrap items-center gap-3">
			<!-- Timeframe -->
			<Select
				bind:value={selectedTimeframe}
				onchange={(value) => (selectedTimeframe = String(value))}
				size="md"
				placeholder="Last 7 Days"
				aria-label="Select time range"
			>
				<option value="24h">Last 24 Hours</option>
				<option value="7d">Last 7 Days</option>
				<option value="30d">Last 30 Days</option>
			</Select>

			<!-- Refresh -->
			<Button
				onclick={loadTimingData}
				disabled={isLoading}
				variant="secondary"
				size="sm"
				icon={RefreshCw}
				loading={isLoading}
				class="pressable"
			>
				Refresh
			</Button>
		</div>
	</AdminPageHeader>

	<!-- Filters -->
	<div class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6">
		<button
			onclick={() => (showFilters = !showFilters)}
			class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded"
			aria-expanded={showFilters}
		>
			<Filter class="h-4 w-4" />
			<span>Filters</span>
			{#if showFilters}
				<ChevronUp class="h-4 w-4" />
			{:else}
				<ChevronDown class="h-4 w-4" />
			{/if}
		</button>

		{#if showFilters}
			<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<!-- Context Type -->
				<div>
					<label
						for="timing-context-filter"
						class="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
					>
						Context Type
					</label>
					<Select
						id="timing-context-filter"
						bind:value={selectedContextType}
						onchange={(value) => (selectedContextType = String(value))}
						size="md"
					>
						<option value="all">All Contexts</option>
						<option value="global">Global</option>
						<option value="general">General</option>
						<option value="project">Project</option>
						<option value="calendar">Calendar</option>
						<option value="brain_dump">Brain Dump</option>
						<option value="ontology">Ontology</option>
					</Select>
				</div>

				<!-- Plan Status -->
				<div>
					<label
						for="timing-plan-filter"
						class="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
					>
						Plan Status
					</label>
					<Select
						id="timing-plan-filter"
						bind:value={selectedPlanStatus}
						onchange={(value) => (selectedPlanStatus = String(value))}
						size="md"
					>
						<option value="all">All</option>
						<option value="none">No Plan</option>
						<option value="completed">Completed</option>
						<option value="failed">Failed</option>
						<option value="in_progress">In Progress</option>
					</Select>
				</div>

				<!-- Clarification -->
				<div>
					<label
						for="timing-clarification-filter"
						class="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1"
					>
						Clarification
					</label>
					<Select
						id="timing-clarification-filter"
						bind:value={hasClarification}
						onchange={(value) => (hasClarification = String(value))}
						size="md"
					>
						<option value="all">All</option>
						<option value="yes">With Clarification</option>
						<option value="no">No Clarification</option>
					</Select>
				</div>
			</div>
		{/if}
	</div>

	{#if error}
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-red-500 shrink-0" />
				<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			{#each Array(8) as _}
				<div class="bg-card border border-border rounded-lg p-4 shadow-ink animate-pulse">
					<div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
					<div class="h-8 bg-muted rounded w-1/2"></div>
				</div>
			{/each}
		</div>
	{:else if timingData}
		<!-- Summary KPIs -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<!-- TTFR p50 -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							TTFR p50
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatMs(timingData.percentiles.ttfr.p50)}
						</p>
					</div>
					<Clock class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					p95: {formatMs(timingData.percentiles.ttfr.p95)}
				</div>
			</div>

			<!-- TTFE p50 -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							TTFE p50
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatMs(timingData.percentiles.ttfe.p50)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					p95: {formatMs(timingData.percentiles.ttfe.p95)}
				</div>
			</div>

			<!-- % Plan Invoked -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Plan Invoked
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{formatPercent(timingData.summary.percent_plan_invoked)}
						</p>
					</div>
					<Target class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{timingData.summary.total_requests} total requests
				</div>
			</div>

			<!-- % Clarification -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Clarification
						</p>
						<p class="text-2xl font-bold text-amber-500 mt-1">
							{formatPercent(timingData.summary.percent_clarification)}
						</p>
					</div>
					<Activity class="h-7 w-7 text-amber-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">Required clarifying questions</div>
			</div>
		</div>

		<!-- Latency Breakdown & Trends -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- Latency Breakdown (Stacked Bar) -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
					<BarChart3 class="h-4 w-4" />
					Latency Breakdown (Median)
				</h3>

				<div class="space-y-3">
					<!-- Context Build -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-muted-foreground">Context Build</span>
							<span class="text-xs font-medium text-foreground">
								{formatMs(timingData.latency_breakdown.context_build_ms)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-blue-500 h-2 rounded-full transition-all duration-300"
								style="width: {getLatencyPercent(
									timingData.latency_breakdown.context_build_ms
								)}"
							></div>
						</div>
					</div>

					<!-- Tool Selection -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-muted-foreground">Tool Selection</span>
							<span
								class="text-xs font-medium {getToolSelectionWarning(
									timingData.latency_breakdown.tool_selection_ms
								) === 'critical'
									? 'text-red-500'
									: getToolSelectionWarning(
												timingData.latency_breakdown.tool_selection_ms
										  ) === 'warning'
										? 'text-amber-500'
										: 'text-foreground'}"
							>
								{formatMs(timingData.latency_breakdown.tool_selection_ms)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-indigo-500 h-2 rounded-full transition-all duration-300"
								style="width: {getLatencyPercent(
									timingData.latency_breakdown.tool_selection_ms
								)}"
							></div>
						</div>
					</div>

					<!-- Clarification -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-muted-foreground">Clarification</span>
							<span class="text-xs font-medium text-foreground">
								{formatMs(timingData.latency_breakdown.clarification_ms)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-amber-500 h-2 rounded-full transition-all duration-300"
								style="width: {getLatencyPercent(
									timingData.latency_breakdown.clarification_ms
								)}"
							></div>
						</div>
					</div>

					<!-- Plan Creation -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-muted-foreground">Plan Creation</span>
							<span class="text-xs font-medium text-foreground">
								{formatMs(timingData.latency_breakdown.plan_creation_ms)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-purple-500 h-2 rounded-full transition-all duration-300"
								style="width: {getLatencyPercent(
									timingData.latency_breakdown.plan_creation_ms
								)}"
							></div>
						</div>
					</div>

					<!-- Plan Execution -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-muted-foreground">Plan Execution</span>
							<span
								class="text-xs font-medium {getPlanExecutionWarning(
									timingData.latency_breakdown.plan_execution_ms
								) === 'critical'
									? 'text-red-500'
									: getPlanExecutionWarning(
												timingData.latency_breakdown.plan_execution_ms
										  ) === 'warning'
										? 'text-amber-500'
										: 'text-foreground'}"
							>
								{formatMs(timingData.latency_breakdown.plan_execution_ms)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-emerald-500 h-2 rounded-full transition-all duration-300"
								style="width: {getLatencyPercent(
									timingData.latency_breakdown.plan_execution_ms
								)}"
							></div>
						</div>
					</div>
				</div>

				<div class="mt-4 pt-3 border-t border-border">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Total (median)</span>
						<span class="font-semibold text-foreground">
							{formatMs(getLatencyBreakdownTotal())}
						</span>
					</div>
				</div>
			</div>

			<!-- Daily Trends -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
					<TrendingUp class="h-4 w-4" />
					TTFR Trend (p50 / p95)
				</h3>

				{#if timingData.trends.length > 0}
					<div class="space-y-2 max-h-64 overflow-y-auto">
						{#each timingData.trends as day}
							<div
								class="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
							>
								<span class="text-muted-foreground"
									>{formatShortDate(day.date)}</span
								>
								<div class="flex items-center gap-4">
									<span class="text-foreground">
										<span class="text-blue-500">{formatMs(day.ttfr_p50)}</span>
										<span class="text-muted-foreground mx-1">/</span>
										<span
											class={day.ttfr_p95 > 10000
												? 'text-red-500'
												: day.ttfr_p95 > 5000
													? 'text-amber-500'
													: 'text-foreground'}
										>
											{formatMs(day.ttfr_p95)}
										</span>
									</span>
									<span
										class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
									>
										{day.count} req
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-8 text-sm">
						No trend data available
					</p>
				{/if}
			</div>
		</div>

		<!-- TTFR Distribution & Context Performance -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- TTFR Distribution Histogram -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">TTFR Distribution</h3>

				{#if timingData.distributions.ttfr.length > 0}
					<div class="flex items-end justify-between gap-1 h-32">
						{#each timingData.distributions.ttfr as bucket, _i}
							{@const maxCount = getHistogramMax(timingData.distributions.ttfr)}
							{@const height = (bucket.count / maxCount) * 100}
							<div
								class="flex-1 flex flex-col items-center justify-end"
								title="{bucket.min}-{bucket.max}ms: {bucket.count} requests"
							>
								<div
									class="w-full bg-blue-500 rounded-t transition-all duration-300"
									style="height: {height}%"
								></div>
							</div>
						{/each}
					</div>
					<div class="flex justify-between text-xs text-muted-foreground mt-2">
						<span>{formatMs(timingData.distributions.ttfr[0]?.min ?? 0)}</span>
						<span
							>{formatMs(
								timingData.distributions.ttfr[
									timingData.distributions.ttfr.length - 1
								]?.max ?? 0
							)}</span
						>
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-8 text-sm">
						No distribution data
					</p>
				{/if}
			</div>

			<!-- Context Type Performance -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Performance by Context</h3>

				{#if timingData.context_type_performance.length > 0}
					<div class="space-y-2 max-h-48 overflow-y-auto">
						{#each timingData.context_type_performance as ctx}
							<div
								class="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
							>
								<span class="text-foreground capitalize">{ctx.context_type}</span>
								<div class="flex items-center gap-3">
									<span
										class="font-medium {ctx.median_ttfr_ms > 5000
											? 'text-red-500'
											: ctx.median_ttfr_ms > 3000
												? 'text-amber-500'
												: 'text-foreground'}"
									>
										{formatMs(ctx.median_ttfr_ms)}
									</span>
									<span
										class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
									>
										{ctx.count}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-8 text-sm">No context data</p>
				{/if}
			</div>
		</div>

		<!-- Slow Sessions Table -->
		<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
			<div class="p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
					<AlertCircle class="h-4 w-4 text-red-500" />
					Slowest Sessions (by TTFR)
				</h3>
			</div>

			{#if timingData.slow_sessions.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/50">
							<tr>
								<th
									class="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>Session</th
								>
								<th
									class="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>Context</th
								>
								<th
									class="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>TTFR</th
								>
								<th
									class="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>TTFE</th
								>
								<th
									class="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>Plan</th
								>
								<th
									class="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
									>Created</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each timingData.slow_sessions as session}
								<tr class="hover:bg-muted/30 transition-colors">
									<td class="px-4 py-2">
										<a
											href="/admin/chat/sessions?search={session.session_id}"
											class="text-blue-500 hover:underline font-mono text-xs"
										>
											{session.session_id?.slice(0, 8)}...
										</a>
									</td>
									<td class="px-4 py-2 text-foreground capitalize">
										{session.context_type || '-'}
									</td>
									<td class="px-4 py-2 text-right">
										<span
											class="font-medium {getTtfrWarning(session.ttfr_ms) ===
											'critical'
												? 'text-red-500'
												: getTtfrWarning(session.ttfr_ms) === 'warning'
													? 'text-amber-500'
													: 'text-foreground'}"
										>
											{formatMs(session.ttfr_ms)}
										</span>
									</td>
									<td class="px-4 py-2 text-right text-foreground">
										{formatMs(session.ttfe_ms)}
									</td>
									<td class="px-4 py-2">
										{#if session.plan_status}
											<span
												class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
												{session.plan_status === 'completed'
													? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
													: session.plan_status === 'failed'
														? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
														: 'bg-muted text-foreground/30 dark:text-muted-foreground'}"
											>
												{session.plan_status}
												{#if session.plan_steps}
													({session.plan_steps})
												{/if}
											</span>
										{:else}
											<span class="text-muted-foreground">-</span>
										{/if}
									</td>
									<td class="px-4 py-2 text-muted-foreground text-xs">
										{formatDate(session.created_at)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-8 text-center">
					<p class="text-muted-foreground text-sm">No slow sessions found</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
