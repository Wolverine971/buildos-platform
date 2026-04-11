<!-- apps/web/src/routes/admin/chat/tools/+page.svelte -->
<script lang="ts">
	import {
		Wrench,
		RefreshCw,
		Activity,
		CheckCircle,
		XCircle,
		Clock,
		AlertTriangle,
		Layers,
		Search,
		Filter,
		ExternalLink,
		Database,
		ShieldAlert,
		BarChart3
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { browser } from '$app/environment';
	import type {
		ToolAnalyticsPayload,
		ToolDimensionMetric,
		ToolTrendMetric
	} from '$lib/services/admin/chat-tool-analytics';

	type Timeframe = '24h' | '7d' | '30d';
	type ToolSort = 'calls' | 'failure_rate' | 'p95_duration_ms' | 'last_used_at';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<Timeframe>('7d');
	let selectedCategory = $state('all');
	let selectedContextType = $state('all');
	let selectedOutcome = $state<'all' | 'success' | 'failed'>('all');
	let selectedGatewayOp = $state('all');
	let selectedHelpPath = $state('all');
	let minCalls = $state('1');
	let toolSearch = $state('');
	let sortBy = $state<ToolSort>('calls');
	let showFilters = $state(true);
	let loadedAt = $state<Date | null>(null);
	let toolData = $state<ToolAnalyticsPayload | null>(null);
	let loadRequestId = 0;

	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		selectedCategory;
		selectedContextType;
		selectedOutcome;
		selectedGatewayOp;
		selectedHelpPath;
		minCalls;
		toolSearch;
		loadDashboard();
	});

	let sortedTools = $derived.by(() => {
		const rows = [...(toolData?.by_tool ?? [])];
		switch (sortBy) {
			case 'failure_rate':
				return rows.sort(
					(a, b) =>
						b.failure_rate - a.failure_rate ||
						b.failed_executions - a.failed_executions ||
						b.total_executions - a.total_executions
				);
			case 'p95_duration_ms':
				return rows.sort(
					(a, b) =>
						(b.p95_execution_time_ms ?? -1) - (a.p95_execution_time_ms ?? -1) ||
						b.total_executions - a.total_executions
				);
			case 'last_used_at':
				return rows.sort((a, b) =>
					(b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')
				);
			case 'calls':
			default:
				return rows.sort((a, b) => b.total_executions - a.total_executions);
		}
	});

	let trendMax = $derived.by(() =>
		Math.max(1, ...(toolData?.trends ?? []).map((trend) => trend.total_executions))
	);

	let dimensionSections = $derived.by(
		(): Array<{ title: string; rows: ToolDimensionMetric[] }> => [
			{ title: 'Gateway Ops', rows: toolData?.gateway_usage.by_gateway_op ?? [] },
			{ title: 'Help Paths', rows: toolData?.gateway_usage.by_help_path ?? [] },
			{ title: 'First Lanes', rows: toolData?.gateway_usage.first_lanes ?? [] },
			{ title: 'First Skills', rows: toolData?.gateway_usage.first_skills ?? [] },
			{
				title: 'First Canonical Ops',
				rows: toolData?.gateway_usage.first_canonical_ops ?? []
			}
		]
	);

	async function loadDashboard() {
		if (!browser) return;
		const requestId = ++loadRequestId;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe,
				min_calls: minCalls
			});

			if (toolSearch.trim()) params.set('search', toolSearch.trim());
			if (selectedCategory !== 'all') params.set('category', selectedCategory);
			if (selectedContextType !== 'all') params.set('context_type', selectedContextType);
			if (selectedOutcome !== 'all') params.set('outcome', selectedOutcome);
			if (selectedGatewayOp !== 'all') params.set('gateway_op', selectedGatewayOp);
			if (selectedHelpPath !== 'all') params.set('help_path', selectedHelpPath);

			const response = await fetch(`/api/admin/chat/tools?${params}`);
			if (!response.ok) {
				throw new Error('Failed to load tool analytics');
			}

			const data = await response.json();
			if (data.success) {
				if (requestId !== loadRequestId) return;
				toolData = data.data;
				loadedAt = new Date();
			} else {
				throw new Error(data.message || 'Failed to load analytics');
			}
		} catch (err) {
			if (requestId !== loadRequestId) return;
			console.error('Error loading tool analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			if (requestId === loadRequestId) {
				isLoading = false;
			}
		}
	}

	function resetFilters() {
		selectedCategory = 'all';
		selectedContextType = 'all';
		selectedOutcome = 'all';
		selectedGatewayOp = 'all';
		selectedHelpPath = 'all';
		minCalls = '1';
		toolSearch = '';
		sortBy = 'calls';
	}

	function formatNumber(num: number | null | undefined): string {
		if (num === null || num === undefined || !Number.isFinite(num)) return '-';
		return new Intl.NumberFormat().format(Math.round(num));
	}

	function formatDecimal(num: number | null | undefined, digits = 1): string {
		if (num === null || num === undefined || !Number.isFinite(num)) return '-';
		return num.toFixed(digits);
	}

	function formatPercentage(num: number | null | undefined): string {
		if (num === null || num === undefined || !Number.isFinite(num)) return '-';
		return `${num.toFixed(1)}%`;
	}

	function formatDuration(ms: number | null | undefined): string {
		if (ms === null || ms === undefined || !Number.isFinite(ms)) return '-';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '-';
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function formatBucket(trend: ToolTrendMetric): string {
		if (trend.bucket.includes('T')) return formatDateTime(trend.bucket);
		const [year, month, day] = trend.bucket.split('-').map(Number);
		if (!year || !month || !day) return trend.bucket;
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric'
		}).format(new Date(Date.UTC(year, month - 1, day)));
	}

	function barWidth(value: number, max: number): string {
		if (value <= 0 || max <= 0) return '0%';
		return `${Math.max(2, Math.min(100, (value / max) * 100))}%`;
	}

	function categoryClass(category: string): string {
		switch (category) {
			case 'ontology':
				return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30';
			case 'ontology_action':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'calendar':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
			case 'utility':
				return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30';
			case 'web_research':
				return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
			case 'gateway_execution':
			case 'gateway_discovery':
			case 'gateway_skill':
				return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function successClass(rate: number): string {
		if (rate >= 95) return 'text-emerald-600 dark:text-emerald-400';
		if (rate >= 80) return 'text-amber-600 dark:text-amber-400';
		return 'text-red-600 dark:text-red-400';
	}

	function sessionHref(sessionId: string | null): string {
		return sessionId
			? `/admin/chat/sessions?chat_session_id=${sessionId}`
			: '/admin/chat/sessions';
	}
</script>

<svelte:head>
	<title>Tool Analytics - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Tool Analytics"
		description="Usage, reliability, and latency from chat tool executions"
		icon={Wrench}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<Button
					onclick={() => (showFilters = !showFilters)}
					variant="secondary"
					size="sm"
					icon={Filter}
					class="pressable"
				>
					Filters
				</Button>
				<Select
					bind:value={selectedTimeframe}
					onchange={(value) => (selectedTimeframe = String(value) as Timeframe)}
					size="md"
					placeholder="Last 7 Days"
					aria-label="Select time range"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
				</Select>
				<Button
					onclick={loadDashboard}
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
		{/snippet}
	</AdminPageHeader>

	{#if error}
		<div
			class="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<AlertTriangle class="h-5 w-5 shrink-0 text-red-500" />
				<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
		</div>
	{/if}

	{#if showFilters}
		<div class="mb-6 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grid tx-weak">
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
				<TextInput
					bind:value={toolSearch}
					icon={Search}
					type="search"
					placeholder="Search tools, ops, paths"
					aria-label="Search tools"
				/>
				<Select
					bind:value={selectedCategory}
					onchange={(value) => (selectedCategory = String(value))}
					size="sm"
					aria-label="Filter by category"
				>
					<option value="all">All Categories</option>
					{#each toolData?.filter_options.categories ?? [] as category}
						<option value={category}>{category}</option>
					{/each}
				</Select>
				<Select
					bind:value={selectedContextType}
					onchange={(value) => (selectedContextType = String(value))}
					size="sm"
					aria-label="Filter by context type"
				>
					<option value="all">All Contexts</option>
					{#each toolData?.filter_options.context_types ?? [] as contextType}
						<option value={contextType}>{contextType}</option>
					{/each}
				</Select>
				<Select
					bind:value={selectedOutcome}
					onchange={(value) =>
						(selectedOutcome = String(value) as 'all' | 'success' | 'failed')}
					size="sm"
					aria-label="Filter by outcome"
				>
					<option value="all">All Outcomes</option>
					<option value="success">Successful</option>
					<option value="failed">Failed</option>
				</Select>
				<Select
					bind:value={selectedGatewayOp}
					onchange={(value) => (selectedGatewayOp = String(value))}
					size="sm"
					aria-label="Filter by gateway op"
				>
					<option value="all">All Gateway Ops</option>
					{#each toolData?.filter_options.gateway_ops ?? [] as gatewayOp}
						<option value={gatewayOp}>{gatewayOp}</option>
					{/each}
				</Select>
				<Select
					bind:value={selectedHelpPath}
					onchange={(value) => (selectedHelpPath = String(value))}
					size="sm"
					aria-label="Filter by help path"
				>
					<option value="all">All Help Paths</option>
					{#each toolData?.filter_options.help_paths ?? [] as helpPath}
						<option value={helpPath}>{helpPath}</option>
					{/each}
				</Select>
				<Select
					bind:value={minCalls}
					onchange={(value) => (minCalls = String(value))}
					size="sm"
					aria-label="Minimum calls"
				>
					<option value="1">1+ calls</option>
					<option value="3">3+ calls</option>
					<option value="5">5+ calls</option>
					<option value="10">10+ calls</option>
					<option value="25">25+ calls</option>
				</Select>
				<Select
					bind:value={sortBy}
					onchange={(value) => (sortBy = String(value) as ToolSort)}
					size="sm"
					aria-label="Sort tools"
				>
					<option value="calls">Sort by Calls</option>
					<option value="failure_rate">Sort by Failure Rate</option>
					<option value="p95_duration_ms">Sort by P95 Latency</option>
					<option value="last_used_at">Sort by Last Used</option>
				</Select>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
				<p class="text-xs text-muted-foreground">
					Source: chat_tool_executions
					{#if loadedAt}
						<span>· Loaded {formatDateTime(loadedAt.toISOString())}</span>
					{/if}
				</p>
				<Button onclick={resetFilters} variant="secondary" size="sm" class="pressable">
					Reset Filters
				</Button>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _}
				<div class="rounded-lg border border-border bg-card p-4 shadow-ink animate-pulse">
					<div class="mb-3 h-4 w-2/3 rounded bg-muted"></div>
					<div class="mb-2 h-8 w-1/2 rounded bg-muted"></div>
					<div class="h-3 w-3/4 rounded bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else if toolData}
		{#if toolData.data_source.truncated}
			<div class="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
				<div class="flex items-start gap-2">
					<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
					<p class="text-sm text-amber-800 dark:text-amber-200">
						Showing the newest {formatNumber(toolData.data_source.row_count)} of
						{formatNumber(toolData.data_source.total_rows_available)} rows for this window.
						Narrow the timeframe or filters for exact totals.
					</p>
				</div>
			</div>
		{/if}

		<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Tool Calls</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(toolData.overview.total_executions)}
						</p>
					</div>
					<Activity class="h-7 w-7 shrink-0 text-sky-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(toolData.overview.unique_tools_used)} tools across
					{formatNumber(toolData.overview.unique_sessions)} sessions
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Success Rate</p>
						<p
							class="mt-1 text-3xl font-bold {successClass(
								toolData.overview.success_rate
							)}"
						>
							{formatPercentage(toolData.overview.success_rate)}
						</p>
					</div>
					<CheckCircle class="h-7 w-7 shrink-0 text-emerald-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(toolData.overview.successful_executions)} succeeded,
					{formatNumber(toolData.overview.failed_executions)} failed
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">P95 Latency</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatDuration(toolData.overview.p95_execution_time_ms)}
						</p>
					</div>
					<Clock class="h-7 w-7 shrink-0 text-amber-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(toolData.overview.duration_sample_count)} duration samples,
					{formatDuration(toolData.overview.avg_execution_time_ms)} avg
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Turns With Tools</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(toolData.overview.unique_turns)}
						</p>
					</div>
					<Layers class="h-7 w-7 shrink-0 text-indigo-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatDecimal(toolData.overview.avg_calls_per_turn)} calls per turn,
					{formatNumber(toolData.overview.validation_failures)} validation failures
				</p>
			</div>
		</div>

		{#if toolData.overview.total_executions === 0}
			<div class="rounded-lg border border-border bg-card p-8 text-center shadow-ink">
				<Database class="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
				<h2 class="text-lg font-semibold text-foreground">No matching tool executions</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					No rows matched the current timeframe and filters.
				</p>
				<div class="mt-4">
					<Button onclick={resetFilters} variant="secondary" size="sm"
						>Reset Filters</Button
					>
				</div>
			</div>
		{:else}
			<div class="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
				<div
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak xl:col-span-2"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">Execution Trend</h2>
							<p class="text-xs text-muted-foreground">
								Calls, failures, and p95 latency by bucket
							</p>
						</div>
						<BarChart3 class="h-5 w-5 text-muted-foreground" />
					</div>
					<div class="space-y-3">
						{#each toolData.trends as trend}
							<div
								class="grid grid-cols-[5.5rem_1fr_4rem_5rem] items-center gap-3 text-xs sm:grid-cols-[7rem_1fr_5rem_6rem]"
							>
								<div class="text-muted-foreground">{formatBucket(trend)}</div>
								<div class="h-2 rounded-full bg-muted">
									<div
										class="h-2 rounded-full bg-sky-500"
										style="width: {barWidth(trend.total_executions, trendMax)}"
									></div>
								</div>
								<div class="text-right font-medium text-foreground">
									{formatNumber(trend.total_executions)}
								</div>
								<div class="text-right text-muted-foreground">
									{trend.failed_executions > 0
										? `${formatNumber(trend.failed_executions)} failed`
										: formatDuration(trend.p95_execution_time_ms)}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">Categories</h2>
							<p class="text-xs text-muted-foreground">
								Share of tool calls by category
							</p>
						</div>
						<Activity class="h-5 w-5 text-muted-foreground" />
					</div>
					<div class="space-y-3">
						{#each toolData.by_category as category}
							<div>
								<div class="mb-1 flex items-center justify-between gap-3">
									<span
										class="rounded border px-2 py-0.5 text-xs font-medium {categoryClass(
											category.category
										)}"
									>
										{category.category}
									</span>
									<span class="text-xs text-muted-foreground">
										{formatPercentage(category.share_of_calls)}
									</span>
								</div>
								<div class="h-2 rounded-full bg-muted">
									<div
										class="h-2 rounded-full bg-emerald-500"
										style="width: {barWidth(
											category.total_executions,
											toolData.overview.total_executions
										)}"
									></div>
								</div>
								<div
									class="mt-1 flex justify-between text-xs text-muted-foreground"
								>
									<span>{formatNumber(category.total_executions)} calls</span>
									<span class={successClass(category.success_rate)}>
										{formatPercentage(category.success_rate)} success
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div
				class="mb-6 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
			>
				<div class="border-b border-border p-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">
								Tools ({formatNumber(sortedTools.length)})
							</h2>
							<p class="text-xs text-muted-foreground">
								Real execution rows, sorted by {sortBy.replaceAll('_', ' ')}
							</p>
						</div>
					</div>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted/50">
							<tr>
								<th
									class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
									>Tool</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Calls</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Share</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Success</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>P95</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Avg</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Sessions</th
								>
								<th
									class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
									>Last Used</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each sortedTools as tool}
								<tr class="hover:bg-muted/30">
									<td class="max-w-[22rem] px-4 py-3">
										<div class="min-w-0">
											<div
												class="truncate text-sm font-medium text-foreground"
											>
												{tool.tool_name}
											</div>
											<div class="mt-1 flex flex-wrap items-center gap-1.5">
												<span
													class="rounded border px-2 py-0.5 text-xs font-medium {categoryClass(
														tool.tool_category
													)}"
												>
													{tool.tool_category}
												</span>
												{#if tool.top_gateway_op}
													<span
														class="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
													>
														{tool.top_gateway_op}
													</span>
												{/if}
												{#if tool.top_help_path}
													<span
														class="max-w-[14rem] truncate rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
													>
														{tool.top_help_path}
													</span>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-4 py-3 text-right text-sm text-foreground">
										{formatNumber(tool.total_executions)}
									</td>
									<td class="px-4 py-3 text-right text-sm text-muted-foreground">
										{formatPercentage(tool.share_of_calls)}
									</td>
									<td
										class="px-4 py-3 text-right text-sm font-medium {successClass(
											tool.success_rate
										)}"
									>
										{formatPercentage(tool.success_rate)}
									</td>
									<td class="px-4 py-3 text-right text-sm text-muted-foreground">
										{formatDuration(tool.p95_execution_time_ms)}
									</td>
									<td class="px-4 py-3 text-right text-sm text-muted-foreground">
										{formatDuration(tool.avg_execution_time_ms)}
									</td>
									<td class="px-4 py-3 text-right text-sm text-muted-foreground">
										{formatNumber(tool.unique_sessions)}
									</td>
									<td class="px-4 py-3 text-right text-sm text-muted-foreground">
										{formatDateTime(tool.last_used_at)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
				<div
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">Gateway Usage</h2>
							<p class="text-xs text-muted-foreground">
								Ops, help paths, skills, and first lanes
							</p>
						</div>
						<Database class="h-5 w-5 text-muted-foreground" />
					</div>
					<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
						{#each dimensionSections as section}
							<div class="rounded-lg border border-border bg-muted/20 p-3">
								<h3 class="mb-2 text-xs font-semibold text-muted-foreground">
									{section.title}
								</h3>
								{#if section.rows.length === 0}
									<p class="text-xs text-muted-foreground">No data</p>
								{:else}
									<div class="space-y-2">
										{#each section.rows.slice(0, 6) as row}
											<div>
												<div
													class="mb-1 flex items-center justify-between gap-3"
												>
													<span
														class="truncate text-xs font-medium text-foreground"
													>
														{row.label}
													</span>
													<span class="text-xs text-muted-foreground">
														{formatNumber(row.total_executions)}
													</span>
												</div>
												<div class="h-1.5 rounded-full bg-background">
													<div
														class="h-1.5 rounded-full bg-indigo-500"
														style="width: {barWidth(
															row.total_executions,
															toolData.overview.total_executions
														)}"
													></div>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-static tx-weak"
				>
					<div class="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">Reliability</h2>
							<p class="text-xs text-muted-foreground">
								Failed tools and repeated errors
							</p>
						</div>
						<ShieldAlert class="h-5 w-5 text-muted-foreground" />
					</div>
					<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<div>
							<h3 class="mb-2 text-xs font-semibold text-muted-foreground">
								Problematic Tools
							</h3>
							{#if toolData.most_problematic_tools.length === 0}
								<p class="text-xs text-muted-foreground">
									No failures in this view
								</p>
							{:else}
								<div class="space-y-2">
									{#each toolData.most_problematic_tools.slice(0, 6) as tool}
										<div class="rounded-lg bg-red-500/10 p-2">
											<div class="flex items-center justify-between gap-3">
												<span
													class="truncate text-sm font-medium text-foreground"
												>
													{tool.tool_name}
												</span>
												<span
													class="text-sm font-semibold text-red-600 dark:text-red-400"
												>
													{formatPercentage(tool.failure_rate)}
												</span>
											</div>
											<p class="mt-1 text-xs text-muted-foreground">
												{formatNumber(tool.failed_executions)} failed of
												{formatNumber(tool.total_executions)}
											</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>
						<div>
							<h3 class="mb-2 text-xs font-semibold text-muted-foreground">
								Top Errors
							</h3>
							{#if toolData.reliability.top_errors.length === 0}
								<p class="text-xs text-muted-foreground">No error messages</p>
							{:else}
								<div class="space-y-2">
									{#each toolData.reliability.top_errors.slice(0, 5) as errorData}
										<div
											class="rounded-lg border border-red-500/20 bg-red-500/10 p-2"
										>
											<div class="flex items-start justify-between gap-3">
												<p class="line-clamp-2 text-xs text-foreground">
													{errorData.error_message}
												</p>
												<span
													class="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400"
												>
													{formatNumber(errorData.count)}
												</span>
											</div>
											<p class="mt-1 text-xs text-muted-foreground">
												{errorData.affected_tools.join(', ')}
											</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-static tx-weak">
				<div class="border-b border-border p-4">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold text-foreground">Recent Failures</h2>
							<p class="text-xs text-muted-foreground">
								Newest failed executions with session links
							</p>
						</div>
						<XCircle class="h-5 w-5 text-muted-foreground" />
					</div>
				</div>
				{#if toolData.reliability.recent_failures.length === 0}
					<div class="p-4 text-sm text-muted-foreground">
						No recent failures in this view.
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-border">
							<thead class="bg-muted/50">
								<tr>
									<th
										class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
										>Tool</th
									>
									<th
										class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
										>Context</th
									>
									<th
										class="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
										>Error</th
									>
									<th
										class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
										>Time</th
									>
									<th
										class="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
										>Session</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each toolData.reliability.recent_failures as failure}
									<tr class="hover:bg-muted/30">
										<td class="max-w-[18rem] px-4 py-3">
											<div
												class="truncate text-sm font-medium text-foreground"
											>
												{failure.tool_name}
											</div>
											<div class="mt-1 flex flex-wrap items-center gap-1.5">
												<span
													class="rounded border px-2 py-0.5 text-xs font-medium {categoryClass(
														failure.tool_category
													)}"
												>
													{failure.tool_category}
												</span>
												{#if failure.gateway_op}
													<span
														class="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
													>
														{failure.gateway_op}
													</span>
												{/if}
											</div>
										</td>
										<td class="px-4 py-3 text-sm text-muted-foreground">
											{failure.context_type ?? '-'}
										</td>
										<td class="max-w-[30rem] px-4 py-3 text-sm text-foreground">
											<p class="line-clamp-2">{failure.error_message}</p>
										</td>
										<td
											class="px-4 py-3 text-right text-sm text-muted-foreground"
										>
											{formatDateTime(failure.created_at)}
										</td>
										<td class="px-4 py-3 text-right text-sm">
											<a
												href={sessionHref(failure.session_id)}
												class="inline-flex items-center justify-end gap-1 text-accent hover:underline"
											>
												Open
												<ExternalLink class="h-3.5 w-3.5" />
											</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
