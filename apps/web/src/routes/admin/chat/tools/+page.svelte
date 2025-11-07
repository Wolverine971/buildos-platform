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

<div class="space-y-12">
	<div class="space-y-10">
		<!-- Header -->
		<AdminPageHeader
			title="Tool Analytics"
			description="Tool Usage & Performance Metrics"
			icon={Wrench}
			showBack={true}
		>
			<div slot="actions" class="flex items-center space-x-4">
				<!-- Timeframe -->
				<Select
					bind:value={selectedTimeframe}
					onchange={(e) => (selectedTimeframe = e.detail)}
					size="md"
					placeholder="Last 7 Days"
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
				>
					Refresh
				</Button>
			</div>
		</AdminPageHeader>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
			>
				<div class="flex items-center">
					<AlertTriangle class="h-5 w-5 text-red-600 mr-2" />
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			</div>
		{/if}

		{#if isLoading}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				{#each Array(8) as _}
					<div class="admin-panel p-6 animate-pulse">
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
						<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Overview Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				<!-- Total Executions -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Executions
							</p>
							<p class="text-3xl font-bold text-blue-600 mt-1">
								{formatNumber(dashboardData.overview.total_executions || 0)}
							</p>
						</div>
						<Activity class="h-8 w-8 text-blue-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.unique_tools_used || 0)} unique tools
					</div>
				</div>

				<!-- Success Rate -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Success Rate
							</p>
							<p class="text-3xl font-bold text-green-600 mt-1">
								{formatPercentage(dashboardData.overview.success_rate || 0)}
							</p>
						</div>
						<CheckCircle class="h-8 w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.successful_executions || 0)} succeeded,
						{formatNumber(dashboardData.overview.failed_executions || 0)} failed
					</div>
				</div>

				<!-- Total Tokens -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Tokens
							</p>
							<p class="text-3xl font-bold text-purple-600 mt-1">
								{formatNumber(dashboardData.overview.total_tokens || 0)}
							</p>
						</div>
						<Zap class="h-8 w-8 text-purple-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.avg_tokens_per_execution || 0)} avg per
						execution
					</div>
				</div>

				<!-- Unique Sessions -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Sessions
							</p>
							<p class="text-3xl font-bold text-indigo-600 mt-1">
								{formatNumber(dashboardData.overview.unique_sessions || 0)}
							</p>
						</div>
						<Layers class="h-8 w-8 text-indigo-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.unique_categories || 0)} categories
					</div>
				</div>
			</div>

			<!-- Tool Categories -->
			{#if dashboardData.by_category && dashboardData.by_category.length > 0}
				<div class="admin-panel p-6 mb-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Usage by Category
					</h3>
					<div class="space-y-3">
						{#each dashboardData.by_category as category}
							<div
								class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
							>
								<div class="flex-1">
									<div class="flex items-center space-x-2 mb-2">
										<span
											class="px-2 py-1 rounded-full text-xs font-medium {getCategoryColor(
												category.category
											)}"
										>
											{category.category}
										</span>
										<span
											class="text-sm font-medium text-gray-900 dark:text-white"
										>
											{formatNumber(category.total_executions)} executions
										</span>
									</div>
									<div
										class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600"
									>
										<div
											class="bg-blue-600 h-2 rounded-full transition-all duration-300"
											style="width: {category.total_executions > 0 &&
											dashboardData.overview.total_executions > 0
												? (category.total_executions /
														dashboardData.overview.total_executions) *
													100
												: 0}%"
										></div>
									</div>
								</div>
								<div class="text-right ml-4">
									<div class="text-sm font-bold text-green-600">
										{formatPercentage(category.success_rate)}
									</div>
									<div class="text-xs text-gray-500">success rate</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Top Tools by Usage -->
			{#if dashboardData.top_tools && dashboardData.top_tools.length > 0}
				<div class="admin-panel p-6 mb-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Top 10 Tools by Usage
					</h3>
					<div class="space-y-3">
						{#each dashboardData.top_tools as tool}
							<div
								class="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
							>
								<div class="flex-1 min-w-0">
									<div class="flex items-center space-x-2 mb-1">
										<span
											class="text-sm font-medium text-gray-900 dark:text-white truncate"
										>
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
									<div
										class="flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400"
									>
										<span>{formatNumber(tool.total_executions)} calls</span>
										<span>•</span>
										<span>{formatPercentage(tool.success_rate)} success</span>
										<span>•</span>
										<span>{formatDuration(tool.avg_execution_time_ms)} avg</span
										>
									</div>
								</div>
								<div class="text-right ml-4">
									<div class="text-sm font-bold text-purple-600">
										{formatNumber(tool.total_tokens)}
									</div>
									<div class="text-xs text-gray-500">tokens</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Two Column Layout for Additional Metrics -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Most Problematic Tools -->
				{#if dashboardData.most_problematic_tools && dashboardData.most_problematic_tools.length > 0}
					<div class="admin-panel p-6">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
							Most Problematic Tools
						</h3>
						<div class="space-y-2">
							{#each dashboardData.most_problematic_tools as tool}
								<div
									class="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded"
								>
									<div class="flex-1 min-w-0">
										<div
											class="text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{tool.tool_name}
										</div>
										<div class="text-xs text-gray-500">
											{formatNumber(tool.total_executions)} calls
										</div>
									</div>
									<div class="text-right ml-4">
										<div class="text-sm font-bold text-red-600">
											{formatPercentage(tool.success_rate)}
										</div>
										<div class="text-xs text-gray-500">success</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Slowest Tools -->
				{#if dashboardData.slowest_tools && dashboardData.slowest_tools.length > 0}
					<div class="admin-panel p-6">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
							Slowest Tools
						</h3>
						<div class="space-y-2">
							{#each dashboardData.slowest_tools as tool}
								<div
									class="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-900/20 rounded"
								>
									<div class="flex-1 min-w-0">
										<div
											class="text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{tool.tool_name}
										</div>
										<div class="text-xs text-gray-500">
											{formatNumber(tool.total_executions)} calls
										</div>
									</div>
									<div class="text-right ml-4">
										<div class="text-sm font-bold text-orange-600">
											{formatDuration(tool.avg_execution_time_ms)}
										</div>
										<div class="text-xs text-gray-500">avg time</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Top Errors -->
			{#if dashboardData.errors && dashboardData.errors.top_errors && dashboardData.errors.top_errors.length > 0}
				<div class="admin-panel p-6 mb-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Top Errors ({formatNumber(dashboardData.errors.total_errors)} total)
					</h3>
					<div class="space-y-3">
						{#each dashboardData.errors.top_errors as errorData}
							<div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
								<div class="flex items-start justify-between mb-2">
									<div class="flex-1 min-w-0">
										<div
											class="text-sm font-medium text-gray-900 dark:text-white break-words"
										>
											{errorData.error_message}
										</div>
									</div>
									<div class="text-sm font-bold text-red-600 ml-4">
										{formatNumber(errorData.count)} occurrences
									</div>
								</div>
								<div class="flex flex-wrap gap-1 mt-2">
									{#each errorData.affected_tools as toolName}
										<span
											class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
										>
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
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						All Tools ({dashboardData.by_tool.length})
					</h3>
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
							<thead>
								<tr>
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Tool Name
									</th>
									<th
										class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Category
									</th>
									<th
										class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Executions
									</th>
									<th
										class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Success Rate
									</th>
									<th
										class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Avg Time
									</th>
									<th
										class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
									>
										Tokens
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
								{#each dashboardData.by_tool as tool}
									<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
										<td
											class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white"
										>
											{tool.tool_name}
										</td>
										<td class="px-4 py-3">
											<span
												class="px-2 py-1 rounded-full text-xs font-medium {getCategoryColor(
													tool.tool_category
												)}"
											>
												{tool.tool_category}
											</span>
										</td>
										<td
											class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white"
										>
											{formatNumber(tool.total_executions)}
										</td>
										<td class="px-4 py-3 text-sm text-right">
											<span
												class={tool.success_rate >= 90
													? 'text-green-600'
													: tool.success_rate >= 70
														? 'text-yellow-600'
														: 'text-red-600'}
											>
												{formatPercentage(tool.success_rate)}
											</span>
										</td>
										<td
											class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white"
										>
											{formatDuration(tool.avg_execution_time_ms)}
										</td>
										<td
											class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white"
										>
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
</div>
