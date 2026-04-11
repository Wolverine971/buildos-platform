<!-- apps/web/src/routes/admin/chat/costs/+page.svelte -->
<script lang="ts">
	import {
		DollarSign,
		RefreshCw,
		TrendingUp,
		TrendingDown,
		Zap,
		MessageSquare,
		Bot,
		AlertCircle,
		ArrowRight,
		BarChart3
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { browser } from '$app/environment';

	type Timeframe = '24h' | '7d' | '30d';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<Timeframe>('7d');

	// Dashboard data
	let dashboardData = $state<any>({
		overview: {},
		by_model: [],
		top_sessions: [],
		top_turns: [],
		top_users: [],
		cost_trends: [],
		cost_by_turn_index: [],
		growth_summary: {},
		data_quality: {},
		compression_savings: {},
		pricing: {}
	});

	// Load data on mount and when timeframe changes
	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		loadDashboard();
	});

	async function loadDashboard() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/chat/costs?timeframe=${selectedTimeframe}`);

			if (!response.ok) {
				throw new Error('Failed to load cost analytics');
			}

			const data = await response.json();

			if (data.success) {
				dashboardData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load analytics');
			}
		} catch (err) {
			console.error('Error loading cost analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(Math.round(num));
	}

	function formatCurrency(num: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		}).format(num);
	}

	function formatPreciseCurrency(num: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 4,
			maximumFractionDigits: 6
		}).format(num || 0);
	}

	function formatDate(dateString: string): string {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleDateString();
	}

	function formatPercentage(num: number): string {
		return `${num.toFixed(1)}%`;
	}

	function formatRatio(num: number | null | undefined): string {
		if (!num || !Number.isFinite(num)) return '-';
		return `${num.toFixed(2)}x`;
	}

	function truncateText(value: string | null | undefined, max = 180): string {
		const normalized = (value || '').replace(/\s+/g, ' ').trim();
		if (!normalized) return 'No prompt captured';
		if (normalized.length <= max) return normalized;
		return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
	}

	function sessionHref(sessionId: string): string {
		return `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId)}`;
	}

	function growthLabel(shape: string | null | undefined): string {
		switch (shape) {
			case 'compounding':
				return 'Costs are compounding across turns';
			case 'rising':
				return 'Costs rise as sessions get longer';
			case 'stable':
				return 'Costs are mostly stable by turn';
			default:
				return 'Need more turn data';
		}
	}

	function attributionLabel(value: string | null | undefined): string {
		return value === 'inferred' ? 'inferred' : 'exact';
	}

	function handleTimeframeChange(value: string | number) {
		if (value === '24h' || value === '7d' || value === '30d') {
			selectedTimeframe = value;
		}
	}

	function maxTurnAverageCost(): number {
		const rows = Array.isArray(dashboardData.cost_by_turn_index)
			? dashboardData.cost_by_turn_index
			: [];
		return Math.max(
			...rows.map((turnData: { avg_cost?: number }) => turnData.avg_cost || 0),
			0.000001
		);
	}

	function getCostTrend(): { direction: 'up' | 'down'; value: number } {
		if (dashboardData.cost_trends.length < 2) {
			return { direction: 'up', value: 0 };
		}

		const trends = dashboardData.cost_trends;
		const latest = trends[trends.length - 1];
		const previous = trends[trends.length - 2];

		if (previous.total_cost === 0) {
			return { direction: 'up', value: 0 };
		}

		const change = ((latest.total_cost - previous.total_cost) / previous.total_cost) * 100;
		return {
			direction: change >= 0 ? 'up' : 'down',
			value: Math.abs(change)
		};
	}
</script>

<svelte:head>
	<title>Cost Analytics - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Cost Analytics"
		description="Token Usage & Cost Breakdown"
		icon={DollarSign}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<!-- Timeframe -->
				<Select
					bind:value={selectedTimeframe}
					onchange={handleTimeframeChange}
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
	{:else}
		<!-- Cost Overview Metrics -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<!-- Total Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Total Cost
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatCurrency(dashboardData.overview.total_cost || 0)}
						</p>
					</div>
					<DollarSign class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				{#if dashboardData.cost_trends.length >= 2}
					{@const trend = getCostTrend()}
					<div class="mt-2 flex items-center text-xs">
						{#if trend.direction === 'up'}
							<TrendingUp class="w-3.5 h-3.5 text-red-500 mr-1" />
							<span class="text-red-500">+{formatPercentage(trend.value)}</span>
						{:else}
							<TrendingDown class="w-3.5 h-3.5 text-emerald-500 mr-1" />
							<span class="text-emerald-500">-{formatPercentage(trend.value)}</span>
						{/if}
						<span class="text-muted-foreground ml-1">from previous</span>
					</div>
				{/if}
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.session_count || 0)} sessions • avg/session
					{formatPreciseCurrency(dashboardData.overview.avg_cost_per_session || 0)}
				</div>
			</div>

			<!-- Total Tokens -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Total Tokens
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatNumber(dashboardData.overview.total_tokens || 0)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.prompt_tokens || 0)} in,
					{formatNumber(dashboardData.overview.completion_tokens || 0)} out
				</div>
			</div>

			<!-- Chat Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Avg Cost / Turn
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{formatPreciseCurrency(dashboardData.overview.avg_cost_per_turn || 0)}
						</p>
					</div>
					<MessageSquare class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.turn_count || 0)} attributed turns
				</div>
			</div>

			<!-- P95 Turn Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							P95 Turn Cost
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatPreciseCurrency(dashboardData.overview.p95_turn_cost || 0)}
						</p>
					</div>
					<Bot class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					Max {formatPreciseCurrency(dashboardData.overview.max_turn_cost || 0)}
				</div>
			</div>
		</div>

		{#if dashboardData.data_quality}
			<div
				class="mb-6 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-ink"
			>
				<span class="font-medium text-foreground">Attribution:</span>
				exact {formatPreciseCurrency(
					dashboardData.data_quality.exact_attribution_cost || 0
				)}
				• inferred {formatPreciseCurrency(
					dashboardData.data_quality.inferred_attribution_cost || 0
				)}
				• unattributed {formatPreciseCurrency(
					dashboardData.data_quality.unattributed_cost || 0
				)}
				{#if dashboardData.data_quality.is_truncated}
					• limited to {formatNumber(dashboardData.data_quality.usage_row_limit || 0)}
					usage rows
				{/if}
			</div>
		{/if}

		<!-- Input vs Output Costs -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- Cost Breakdown -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Input vs Output Costs</h3>
				<div class="space-y-4">
					<div>
						<div class="flex items-center justify-between mb-2">
							<div>
								<span class="text-sm font-medium text-foreground">Input Tokens</span
								>
								<span class="text-xs text-muted-foreground ml-2">
									(${dashboardData.pricing.INPUT_COST_PER_M || 0}/1M)
								</span>
							</div>
							<span class="text-sm font-bold text-blue-500">
								{formatCurrency(dashboardData.overview.input_cost || 0)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2.5">
							<div
								class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
								style="width: {dashboardData.overview.total_cost > 0
									? ((dashboardData.overview.input_cost || 0) /
											dashboardData.overview.total_cost) *
										100
									: 0}%"
							></div>
						</div>
						<div class="text-xs text-muted-foreground mt-1">
							{formatNumber(dashboardData.overview.prompt_tokens || 0)} tokens
						</div>
					</div>
					<div>
						<div class="flex items-center justify-between mb-2">
							<div>
								<span class="text-sm font-medium text-foreground"
									>Output Tokens</span
								>
								<span class="text-xs text-muted-foreground ml-2">
									(${dashboardData.pricing.OUTPUT_COST_PER_M || 0}/1M)
								</span>
							</div>
							<span class="text-sm font-bold text-purple-500">
								{formatCurrency(dashboardData.overview.output_cost || 0)}
							</span>
						</div>
						<div class="w-full bg-muted rounded-full h-2.5">
							<div
								class="bg-purple-500 h-2.5 rounded-full transition-all duration-300"
								style="width: {dashboardData.overview.total_cost > 0
									? ((dashboardData.overview.output_cost || 0) /
											dashboardData.overview.total_cost) *
										100
									: 0}%"
							></div>
						</div>
						<div class="text-xs text-muted-foreground mt-1">
							{formatNumber(dashboardData.overview.completion_tokens || 0)} tokens
						</div>
					</div>
				</div>
			</div>

			<!-- Turn Growth Summary -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-grain tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Turn Cost Growth</h3>
				<div class="flex items-center justify-center py-6">
					<BarChart3 class="h-12 w-12 text-emerald-500 mr-4 shrink-0" />
					<div>
						<div class="text-lg font-bold text-foreground">
							{growthLabel(dashboardData.growth_summary.shape)}
						</div>
						<div class="text-sm text-muted-foreground mt-1">
							First turn avg {formatPreciseCurrency(
								dashboardData.growth_summary.first_turn_avg_cost || 0
							)}
							• latest avg {formatPreciseCurrency(
								dashboardData.growth_summary.last_turn_avg_cost || 0
							)}
						</div>
						<div class="text-xs text-muted-foreground mt-1">
							Avg turn-to-turn ratio {formatRatio(
								dashboardData.growth_summary.average_growth_ratio
							)}
							• max ratio {formatRatio(dashboardData.growth_summary.max_growth_ratio)}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Cost by Turn Index -->
		{#if dashboardData.cost_by_turn_index && dashboardData.cost_by_turn_index.length > 0}
			<div
				class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
			>
				<h3 class="text-sm font-semibold text-foreground mb-4">Cost by Turn Number</h3>
				<div class="space-y-3">
					{#each dashboardData.cost_by_turn_index.slice(0, 20) as turnData}
						<div class="grid grid-cols-[4rem_1fr_auto] items-center gap-3">
							<div class="text-sm font-semibold text-foreground">
								Turn {turnData.turn_index}
							</div>
							<div class="min-w-0">
								<div class="h-3 rounded bg-muted overflow-hidden">
									<div
										class="h-3 rounded bg-emerald-500"
										style="width: {Math.max(
											4,
											((turnData.avg_cost || 0) / maxTurnAverageCost()) * 100
										)}%"
									></div>
								</div>
								<div class="mt-1 text-xs text-muted-foreground">
									{formatNumber(turnData.turn_count || 0)} turns • median {formatPreciseCurrency(
										turnData.median_cost || 0
									)}
									• p90 {formatPreciseCurrency(turnData.p90_cost || 0)}
								</div>
							</div>
							<div class="text-right">
								<div class="text-sm font-bold text-emerald-500">
									{formatPreciseCurrency(turnData.avg_cost || 0)}
								</div>
								<div class="text-xs text-muted-foreground">avg</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Cost by Model -->
		{#if dashboardData.by_model && dashboardData.by_model.length > 0}
			<div
				class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
			>
				<h3 class="text-sm font-semibold text-foreground mb-4">Cost by Model</h3>
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.by_model as modelData}
						<div class="grid grid-cols-[1fr_auto] gap-3">
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground truncate">
									{modelData.model || 'unknown'}
								</div>
								<div class="text-xs text-muted-foreground">
									{formatNumber(modelData.turn_count || 0)} turns •
									{formatNumber(modelData.requests || 0)} calls •
									{formatNumber(modelData.tokens || 0)} tokens
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									Avg/turn {formatPreciseCurrency(
										modelData.avg_cost_per_turn || 0
									)}
									• p95/turn {formatPreciseCurrency(
										modelData.p95_cost_per_turn || 0
									)}
								</div>
								{#if modelData.unattributed_cost}
									<div class="text-xs text-muted-foreground mt-1">
										Unattributed {formatPreciseCurrency(
											modelData.unattributed_cost || 0
										)}
									</div>
								{/if}
							</div>
							<div class="text-right text-sm font-bold text-blue-500 shrink-0">
								{formatCurrency(modelData.cost || 0)}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Most Expensive Turns -->
		<div
			class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
		>
			<h3 class="text-sm font-semibold text-foreground mb-4">
				Most Expensive Turns & Prompts
			</h3>
			{#if dashboardData.top_turns && dashboardData.top_turns.length > 0}
				<div class="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
					{#each dashboardData.top_turns as turn}
						<a
							href={turn.details_url || sessionHref(turn.session_id)}
							class="block rounded-lg bg-muted/50 p-3 transition hover:bg-muted"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-sm font-semibold text-foreground">
											Turn {turn.turn_index}
										</span>
										<span
											class="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground"
										>
											{attributionLabel(turn.attribution)}
										</span>
										<span class="text-xs text-muted-foreground truncate">
											{turn.primary_model || 'unknown model'}
										</span>
									</div>
									<div class="mt-1 text-sm text-foreground">
										{truncateText(
											turn.prompt_preview || turn.request_message,
											240
										)}
									</div>
									<div class="mt-2 text-xs text-muted-foreground">
										{turn.user_email} • {turn.session_title} •
										{formatNumber(turn.prompt_tokens || 0)} prompt tokens •
										{formatNumber(turn.completion_tokens || 0)} output tokens •
										{formatNumber(turn.llm_calls || 0)} LLM calls
									</div>
								</div>
								<div class="shrink-0 text-right">
									<div class="text-sm font-bold text-emerald-500">
										{formatPreciseCurrency(turn.cost || 0)}
									</div>
									<div
										class="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"
									>
										Drill in <ArrowRight class="h-3 w-3" />
									</div>
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-center py-8 text-sm">No turn data found</p>
			{/if}
		</div>

		<!-- Top Sessions by Cost -->
		<div
			class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
		>
			<h3 class="text-sm font-semibold text-foreground mb-4">Top Sessions by Cost</h3>
			{#if dashboardData.top_sessions && dashboardData.top_sessions.length > 0}
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.top_sessions as session}
						<a
							href={session.details_url || sessionHref(session.id)}
							class="flex items-start justify-between p-3 bg-muted/50 rounded-lg transition hover:bg-muted"
						>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground truncate">
									{session.title}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									{session.user_email} • {formatDate(session.created_at)} •
									{session.primary_model || 'unknown model'}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									{formatNumber(session.turn_count || 0)} turns • avg/turn {formatPreciseCurrency(
										session.avg_cost_per_turn || 0
									)}
									• max turn {formatPreciseCurrency(session.max_turn_cost || 0)}
								</div>
								{#if session.max_turn_prompt_preview}
									<div class="text-xs text-muted-foreground mt-2">
										Expensive prompt: {truncateText(
											session.max_turn_prompt_preview,
											140
										)}
									</div>
								{/if}
							</div>
							<div class="text-right ml-4 shrink-0">
								<div class="text-sm font-bold text-emerald-500">
									{formatCurrency(session.cost)}
								</div>
								<div class="text-xs text-muted-foreground">
									{formatNumber(session.tokens)} tokens
								</div>
								<div
									class="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"
								>
									Open <ArrowRight class="h-3 w-3" />
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-center py-8 text-sm">No sessions found</p>
			{/if}
		</div>

		<!-- Top Users by Cost -->
		<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
			<h3 class="text-sm font-semibold text-foreground mb-4">Top Users by Cost</h3>
			{#if dashboardData.top_users && dashboardData.top_users.length > 0}
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.top_users as userData}
						<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground truncate">
									{userData.email}
								</div>
								<div class="text-xs text-muted-foreground">
									{formatNumber(userData.session_count)} sessions •
									{formatNumber(userData.total_tokens)} tokens
								</div>
							</div>
							<div class="text-sm font-bold text-emerald-500 shrink-0">
								{formatCurrency(userData.total_cost)}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-center py-8 text-sm">No users found</p>
			{/if}
		</div>
	{/if}
</div>
