<!-- apps/web/src/routes/admin/chat/costs/+page.svelte -->
<script lang="ts">
	import {
		DollarSign,
		RefreshCw,
		TrendingUp,
		TrendingDown,
		Zap,
		Users,
		MessageSquare,
		Bot,
		AlertCircle,
		Sparkles
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { browser } from '$app/environment';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<'24h' | '7d' | '30d'>('7d');

	// Dashboard data
	let dashboardData = $state<any>({
		overview: {},
		by_model: [],
		top_sessions: [],
		top_users: [],
		cost_trends: [],
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

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	function formatPercentage(num: number): string {
		return `${num.toFixed(1)}%`;
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
		<div slot="actions" class="flex flex-wrap items-center gap-3">
			<!-- Timeframe -->
			<Select
				bind:value={selectedTimeframe}
				onchange={(e) => (selectedTimeframe = e.detail)}
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
							Chat Cost
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{formatCurrency(dashboardData.overview.chat_cost || 0)}
						</p>
					</div>
					<MessageSquare class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.chat_tokens || 0)} tokens
				</div>
			</div>

			<!-- Agent Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Agent Cost
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatCurrency(dashboardData.overview.agent_cost || 0)}
						</p>
					</div>
					<Bot class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.agent_tokens || 0)} tokens
				</div>
			</div>
		</div>

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

			<!-- Compression Savings -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-grain tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Compression Savings</h3>
				<div class="flex items-center justify-center py-6">
					<Sparkles class="h-12 w-12 text-emerald-500 mr-4 shrink-0" />
					<div>
						<div class="text-2xl font-bold text-emerald-500">
							{formatCurrency(dashboardData.compression_savings.cost_saved || 0)}
						</div>
						<div class="text-sm text-muted-foreground mt-1">Saved by compression</div>
						<div class="text-xs text-muted-foreground mt-1">
							{formatNumber(dashboardData.compression_savings.tokens_saved || 0)} tokens
							saved
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Cost by Model -->
		{#if dashboardData.by_model && dashboardData.by_model.length > 0}
			<div
				class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
			>
				<h3 class="text-sm font-semibold text-foreground mb-4">Cost by Model</h3>
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.by_model as modelData}
						<div class="flex items-center justify-between">
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground truncate">
									{modelData.model || 'unknown'}
								</div>
								<div class="text-xs text-muted-foreground">
									{formatNumber(modelData.tokens)} tokens
								</div>
							</div>
							<div class="text-sm font-bold text-blue-500 shrink-0">
								{formatCurrency(modelData.cost)}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Top Sessions by Cost -->
		<div
			class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak"
		>
			<h3 class="text-sm font-semibold text-foreground mb-4">Top Sessions by Cost</h3>
			{#if dashboardData.top_sessions && dashboardData.top_sessions.length > 0}
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.top_sessions as session}
						<div class="flex items-start justify-between p-3 bg-muted/50 rounded-lg">
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground truncate">
									{session.title}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									{session.user_email} • {formatDate(session.created_at)}
								</div>
							</div>
							<div class="text-right ml-4 shrink-0">
								<div class="text-sm font-bold text-emerald-500">
									{formatCurrency(session.cost)}
								</div>
								<div class="text-xs text-muted-foreground">
									{formatNumber(session.tokens)} tokens
								</div>
							</div>
						</div>
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
