<!-- apps/web/src/routes/admin/chat/agents/+page.svelte -->
<script lang="ts">
	import {
		Activity,
		AlertCircle,
		CheckCircle,
		Clock,
		DollarSign,
		MessageSquare,
		RefreshCw,
		Sparkles,
		XCircle,
		Zap
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { browser } from '$app/environment';

	type DashboardTimeframe = '24h' | '7d' | '30d';
	type DistributionMetric = {
		label: string;
		count: number;
		share: number;
		success_rate: number;
		tool_calls: number;
		p95_duration_ms: number;
	};
	type ActivityEvent = {
		timestamp: string;
		type: string;
		severity: 'info' | 'success' | 'warning' | 'error';
		user_email: string;
		details: string;
		tokens_used?: number;
	};

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<DashboardTimeframe>('7d');

	let dashboardData = $state<any>({
		kpis: {},
		runtime_distribution: {
			first_actions: [],
			context_types: [],
			statuses: [],
			cache_sources: []
		},
		activity_feed: [],
		top_users: [],
		data_health: {
			truncated: {}
		}
	});
	let errorEvents = $derived(
		((dashboardData.activity_feed ?? []) as ActivityEvent[])
			.filter((event) => event.severity === 'error')
			.slice(0, 10)
	);
	let firstActions = $derived(
		(dashboardData.runtime_distribution?.first_actions ?? []) as DistributionMetric[]
	);
	let contextTypes = $derived(
		(dashboardData.runtime_distribution?.context_types ?? []) as DistributionMetric[]
	);
	let statuses = $derived(
		(dashboardData.runtime_distribution?.statuses ?? []) as DistributionMetric[]
	);
	let cacheSources = $derived(
		(dashboardData.runtime_distribution?.cache_sources ?? []) as DistributionMetric[]
	);
	let hasTruncatedData = $derived(
		Object.values(dashboardData.data_health?.truncated ?? {}).some(Boolean)
	);

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
			const response = await fetch(`/api/admin/chat/agents?timeframe=${selectedTimeframe}`);

			if (!response.ok) {
				throw new Error('Failed to load runtime analytics');
			}

			const data = await response.json();

			if (data.success) {
				dashboardData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load runtime analytics');
			}
		} catch (err) {
			console.error('Error loading runtime analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load runtime analytics';
		} finally {
			isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(Number.isFinite(num) ? Math.round(num) : 0);
	}

	function formatCompact(num: number): string {
		return new Intl.NumberFormat('en-US', {
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(Number.isFinite(num) ? num : 0);
	}

	function formatCurrency(num: number): string {
		const value = Number.isFinite(num) ? num : 0;
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
			maximumFractionDigits: 4
		}).format(value);
	}

	function formatPercentage(num: number): string {
		return `${(Number.isFinite(num) ? num : 0).toFixed(1)}%`;
	}

	function formatDuration(ms: number): string {
		if (!Number.isFinite(ms) || ms <= 0) return '0ms';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function distributionWidth(metric: DistributionMetric, rows: DistributionMetric[]): string {
		const max = Math.max(1, ...rows.map((row) => row.count));
		if (metric.count <= 0) return '0%';
		return `${Math.max(2, Math.min(100, (metric.count / max) * 100))}%`;
	}

	function getActivityIcon(type: string) {
		switch (type) {
			case 'turn_completed':
				return CheckCircle;
			case 'turn_failed':
			case 'llm_failed':
			case 'tool_failed':
				return XCircle;
			case 'turn_cancelled':
				return AlertCircle;
			case 'message':
				return MessageSquare;
			default:
				return Activity;
		}
	}
</script>

<svelte:head>
	<title>Runtime Analytics - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Runtime Analytics"
		description="FastChat turn routing, tool calls, latency, and errors"
		icon={Activity}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<Select
					bind:value={selectedTimeframe}
					onchange={(value) => {
						if (value === '24h' || value === '7d' || value === '30d') {
							selectedTimeframe = value;
						}
					}}
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
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-red-500 shrink-0" />
				<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
		</div>
	{/if}

	{#if hasTruncatedData}
		<div
			class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="status"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-amber-500 shrink-0" />
				<p class="text-sm text-amber-700 dark:text-amber-300">
					Some runtime queries hit their row limit. Large-volume totals may be
					undercounted.
				</p>
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
		{@const kpis = dashboardData.kpis ?? {}}

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Turns
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatNumber(kpis.totalTurns || 0)}
						</p>
					</div>
					<Activity class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatPercentage(kpis.turnSuccessRate || 0)} success • {formatNumber(
						kpis.failedTurns || 0
					)}
					failed
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							P95 Turn
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatDuration(kpis.p95TurnDurationMs || 0)}
						</p>
					</div>
					<Clock class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					Avg {formatDuration(kpis.avgTurnDurationMs || 0)} • LLM p95 {formatDuration(
						kpis.p95LlmResponseMs || 0
					)}
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Tool Calls
						</p>
						<p class="text-2xl font-bold text-cyan-500 mt-1">
							{formatNumber(kpis.toolCalls || 0)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-cyan-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatPercentage(kpis.toolSuccessRate || 0)} success • {formatNumber(
						kpis.toolFailures || 0
					)}
					failed
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							{kpis.isCostEstimated ? 'Estimated Cost' : 'Billable Cost'}
						</p>
						<p class="text-2xl font-bold text-amber-500 mt-1">
							{formatCurrency(kpis.estimatedCost || 0)}
						</p>
					</div>
					<DollarSign class="h-7 w-7 text-amber-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(kpis.billableRequests || 0)} billable requests
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Tokens
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatCompact(kpis.totalTokensUsed || 0)}
						</p>
					</div>
					<Sparkles class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatCompact(kpis.avgTokensPerTurn || 0)} per turn
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							LLM Passes / Turn
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{(kpis.avgLlmPassesPerTurn || 0).toFixed(2)}x
						</p>
					</div>
					<MessageSquare class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(kpis.llmPasses || 0)} total passes
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Active Users
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatNumber(kpis.uniqueUsers || 0)}
						</p>
					</div>
					<CheckCircle class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(kpis.totalSessions || 0)} sessions • {formatNumber(
						kpis.totalMessages || 0
					)}
					messages
				</div>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Runtime Signals
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatPercentage(kpis.gatewayEnabledRate || 0)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatPercentage(kpis.prewarmedContextRate || 0)} prewarmed • {formatPercentage(
						kpis.cacheHitRate || 0
					)}
					cache hits
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">First Runtime Actions</h3>
				{#if firstActions.length > 0}
					<div class="space-y-4">
						{#each firstActions.slice(0, 8) as route}
							<div>
								<div class="flex items-center justify-between gap-3 mb-2">
									<div class="min-w-0">
										<div class="text-sm font-medium text-foreground truncate">
											{route.label}
										</div>
										<div class="text-xs text-muted-foreground">
											{formatPercentage(route.share)} share • {formatPercentage(
												route.success_rate
											)}
											success • p95 {formatDuration(route.p95_duration_ms)}
										</div>
									</div>
									<span class="text-sm font-bold text-blue-500 shrink-0">
										{formatNumber(route.count)}
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2.5">
									<div
										class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
										style="width: {distributionWidth(route, firstActions)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">
						No runtime action data available
					</p>
				{/if}
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Context Types</h3>
				{#if contextTypes.length > 0}
					<div class="space-y-4">
						{#each contextTypes.slice(0, 8) as context}
							<div>
								<div class="flex items-center justify-between gap-3 mb-2">
									<div class="min-w-0">
										<div class="text-sm font-medium text-foreground truncate">
											{context.label}
										</div>
										<div class="text-xs text-muted-foreground">
											{formatPercentage(context.share)} share • {formatPercentage(
												context.success_rate
											)}
											success
										</div>
									</div>
									<span class="text-sm font-bold text-cyan-500 shrink-0">
										{formatNumber(context.count)}
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2.5">
									<div
										class="bg-cyan-500 h-2.5 rounded-full transition-all duration-300"
										style="width: {distributionWidth(context, contextTypes)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">
						No context type data available
					</p>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Turn Statuses</h3>
				{#if statuses.length > 0}
					<div class="space-y-4">
						{#each statuses as status}
							<div>
								<div class="flex items-center justify-between gap-3 mb-2">
									<span class="text-sm font-medium text-foreground truncate">
										{status.label}
									</span>
									<span class="text-sm font-bold text-emerald-500 shrink-0">
										{formatNumber(status.count)}
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2.5">
									<div
										class="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
										style="width: {distributionWidth(status, statuses)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">
						No status data available
					</p>
				{/if}
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Cache Sources</h3>
				{#if cacheSources.length > 0}
					<div class="space-y-4">
						{#each cacheSources as source}
							<div>
								<div class="flex items-center justify-between gap-3 mb-2">
									<span class="text-sm font-medium text-foreground truncate">
										{source.label}
									</span>
									<span class="text-sm font-bold text-purple-500 shrink-0">
										{formatNumber(source.count)}
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2.5">
									<div
										class="bg-purple-500 h-2.5 rounded-full transition-all duration-300"
										style="width: {distributionWidth(source, cacheSources)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">
						No cache source data available
					</p>
				{/if}
			</div>
		</div>

		{#if errorEvents.length > 0}
			<div
				class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-static tx-weak"
			>
				<h3 class="text-sm font-semibold text-foreground mb-4">
					Recent Errors ({formatNumber(errorEvents.length)})
				</h3>
				<div class="space-y-3 max-h-48 overflow-y-auto scrollbar-thin">
					{#each errorEvents as errorItem}
						<div class="flex items-start gap-3 p-3 bg-red-500/10 rounded-lg">
							<XCircle class="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<p class="text-sm text-red-600 dark:text-red-400 break-words">
									{errorItem.details}
								</p>
								<p class="text-xs text-muted-foreground mt-1">
									{errorItem.user_email} • {formatDate(errorItem.timestamp)}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
			<h3 class="text-sm font-semibold text-foreground mb-4">Recent Runtime Activity</h3>
			{#if dashboardData.activity_feed && dashboardData.activity_feed.length > 0}
				<div
					class="space-y-3 max-h-80 overflow-y-auto scrollbar-thin"
					role="log"
					aria-label="Recent runtime activity"
				>
					{#each dashboardData.activity_feed as activity}
						{@const ActivityIcon = getActivityIcon(activity.type)}
						<div class="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
							<ActivityIcon class="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground">
									{activity.user_email}
								</div>
								<p class="text-sm text-muted-foreground mb-2">
									{activity.details}
								</p>
								<div
									class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
								>
									<span>{formatDate(activity.timestamp)}</span>
									{#if activity.tokens_used}
										<span>•</span>
										<span>{formatNumber(activity.tokens_used)} tokens</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-center py-8 text-sm">No recent activity</p>
			{/if}
		</div>
	{/if}
</div>
