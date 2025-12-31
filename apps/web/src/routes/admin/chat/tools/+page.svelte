<!-- apps/web/src/routes/admin/chat/tools/+page.svelte -->
<script lang="ts">
	import {
		Wrench,
		RefreshCw,
		TrendingUp,
		TrendingDown,
		Zap,
		CheckCircle,
		XCircle,
		Clock,
		AlertTriangle,
		Activity,
		Layers,
		BarChart3
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
		by_tool: [],
		by_category: [],
		top_tools: [],
		least_used_tools: [],
		most_problematic_tools: [],
		slowest_tools: [],
		tools_by_tokens: [],
		errors: {},
		trends: []
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
			const response = await fetch(`/api/admin/chat/tools?timeframe=${selectedTimeframe}`);

			if (!response.ok) {
				throw new Error('Failed to load tool analytics');
			}

			const data = await response.json();

			if (data.success) {
				dashboardData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load analytics');
			}
		} catch (err) {
			console.error('Error loading tool analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(Math.round(num));
	}

	function formatPercentage(num: number): string {
		return `${num.toFixed(1)}%`;
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function getCategoryColor(category: string): string {
		switch (category.toLowerCase()) {
			case 'list':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'detail':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
			case 'action':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'calendar':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
			case 'utility':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
		}
	}
</script>

<svelte:head>
	<title>Tool Analytics - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Tool Analytics"
		description="Tool Usage & Performance Metrics"
		icon={Wrench}
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
				<AlertTriangle class="h-5 w-5 text-red-500 shrink-0" />
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
		<!-- Overview Metrics -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<!-- Total Executions -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Total Executions
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatNumber(dashboardData.overview.total_executions || 0)}
						</p>
					</div>
					<Activity class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.unique_tools_used || 0)} unique tools
				</div>
			</div>

			<!-- Success Rate -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Success Rate
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatPercentage(dashboardData.overview.success_rate || 0)}
						</p>
					</div>
					<CheckCircle class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.successful_executions || 0)} succeeded,
					{formatNumber(dashboardData.overview.failed_executions || 0)} failed
				</div>
			</div>

			<!-- Total Tokens -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Total Tokens
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{formatNumber(dashboardData.overview.total_tokens || 0)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.avg_tokens_per_execution || 0)} avg per exec
				</div>
			</div>

			<!-- Unique Sessions -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Sessions
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatNumber(dashboardData.overview.unique_sessions || 0)}
						</p>
					</div>
					<Layers class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardData.overview.unique_categories || 0)} categories
				</div>
			</div>
		</div>

		<!-- Tool Categories -->
		{#if dashboardData.by_category && dashboardData.by_category.length > 0}
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Usage by Category</h3>
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.by_category as category}
						<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-2">
									<span
										class="px-2 py-0.5 rounded-full text-xs font-medium {getCategoryColor(
											category.category
										)}"
									>
										{category.category}
									</span>
									<span class="text-sm font-medium text-foreground">
										{formatNumber(category.total_executions)} executions
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2">
									<div
										class="bg-blue-500 h-2 rounded-full transition-all duration-300"
										style="width: {category.total_executions > 0 &&
										dashboardData.overview.total_executions > 0
											? (category.total_executions /
													dashboardData.overview.total_executions) *
												100
											: 0}%"
									></div>
								</div>
							</div>
							<div class="text-right ml-4 shrink-0">
								<div class="text-sm font-bold text-emerald-500">
									{formatPercentage(category.success_rate)}
								</div>
								<div class="text-xs text-muted-foreground">success</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Top Tools by Usage -->
		{#if dashboardData.top_tools && dashboardData.top_tools.length > 0}
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Top 10 Tools by Usage</h3>
				<div class="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
					{#each dashboardData.top_tools as tool}
						<div class="flex items-start justify-between p-3 bg-muted/50 rounded-lg">
							<div class="flex-1 min-w-0">
								<div class="flex flex-wrap items-center gap-2 mb-1">
									<span class="text-sm font-medium text-foreground truncate">
										{tool.tool_name}
									</span>
									<span
										class="px-2 py-0.5 rounded-full text-xs font-medium {getCategoryColor(
											tool.tool_category
										)}"
									>
										{tool.tool_category}
									</span>
								</div>
								<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span>{formatNumber(tool.total_executions)} calls</span>
									<span>•</span>
									<span>{formatPercentage(tool.success_rate)} success</span>
									<span>•</span>
									<span>{formatDuration(tool.avg_execution_time_ms)} avg</span>
								</div>
							</div>
							<div class="text-right ml-4 shrink-0">
								<div class="text-sm font-bold text-purple-500">
									{formatNumber(tool.total_tokens)}
								</div>
								<div class="text-xs text-muted-foreground">tokens</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Two Column Layout for Additional Metrics -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- Most Problematic Tools -->
			{#if dashboardData.most_problematic_tools && dashboardData.most_problematic_tools.length > 0}
				<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-static tx-weak">
					<h3 class="text-sm font-semibold text-foreground mb-4">Most Problematic Tools</h3>
					<div class="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
						{#each dashboardData.most_problematic_tools as tool}
							<div class="flex items-center justify-between p-2 bg-red-500/10 rounded">
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground truncate">
										{tool.tool_name}
									</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(tool.total_executions)} calls
									</div>
								</div>
								<div class="text-right ml-4 shrink-0">
									<div class="text-sm font-bold text-red-500">
										{formatPercentage(tool.success_rate)}
									</div>
									<div class="text-xs text-muted-foreground">success</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Slowest Tools -->
			{#if dashboardData.slowest_tools && dashboardData.slowest_tools.length > 0}
				<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
					<h3 class="text-sm font-semibold text-foreground mb-4">Slowest Tools</h3>
					<div class="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
						{#each dashboardData.slowest_tools as tool}
							<div class="flex items-center justify-between p-2 bg-amber-500/10 rounded">
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground truncate">
										{tool.tool_name}
									</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(tool.total_executions)} calls
									</div>
								</div>
								<div class="text-right ml-4 shrink-0">
									<div class="text-sm font-bold text-amber-500">
										{formatDuration(tool.avg_execution_time_ms)}
									</div>
									<div class="text-xs text-muted-foreground">avg time</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Top Errors -->
		{#if dashboardData.errors && dashboardData.errors.top_errors && dashboardData.errors.top_errors.length > 0}
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 tx tx-static tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">
					Top Errors ({formatNumber(dashboardData.errors.total_errors)} total)
				</h3>
				<div class="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
					{#each dashboardData.errors.top_errors as errorData}
						<div class="p-3 bg-red-500/10 rounded-lg">
							<div class="flex items-start justify-between mb-2">
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground break-words">
										{errorData.error_message}
									</div>
								</div>
								<div class="text-sm font-bold text-red-500 ml-4 shrink-0">
									{formatNumber(errorData.count)} occurrences
								</div>
							</div>
							<div class="flex flex-wrap gap-1 mt-2">
								{#each errorData.affected_tools as toolName}
									<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
										{toolName}
									</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- All Tools Breakdown -->
		{#if dashboardData.by_tool && dashboardData.by_tool.length > 0}
			<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
				<div class="p-4 border-b border-border">
					<h3 class="text-sm font-semibold text-foreground">
						All Tools ({dashboardData.by_tool.length})
					</h3>
				</div>
				<div class="overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-muted/50 sticky top-0">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Tool Name
								</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Category
								</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Executions
								</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Success Rate
								</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Avg Time
								</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Tokens
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border bg-card">
							{#each dashboardData.by_tool as tool}
								<tr class="hover:bg-muted/30 transition-colors">
									<td class="px-4 py-3 text-sm font-medium text-foreground">
										{tool.tool_name}
									</td>
									<td class="px-4 py-3">
										<span
											class="px-2 py-0.5 rounded-full text-xs font-medium {getCategoryColor(
												tool.tool_category
											)}"
										>
											{tool.tool_category}
										</span>
									</td>
									<td class="px-4 py-3 text-sm text-right text-foreground">
										{formatNumber(tool.total_executions)}
									</td>
									<td class="px-4 py-3 text-sm text-right">
										<span
											class={tool.success_rate >= 90
												? 'text-emerald-500'
												: tool.success_rate >= 70
													? 'text-amber-500'
													: 'text-red-500'}
										>
											{formatPercentage(tool.success_rate)}
										</span>
									</td>
									<td class="px-4 py-3 text-sm text-right text-muted-foreground">
										{formatDuration(tool.avg_execution_time_ms)}
									</td>
									<td class="px-4 py-3 text-sm text-right text-muted-foreground">
										{formatNumber(tool.total_tokens)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</div>
