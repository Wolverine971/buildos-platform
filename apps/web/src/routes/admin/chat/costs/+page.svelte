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
	<div class="admin-page">
		<!-- Header -->
		<AdminPageHeader
			title="Cost Analytics"
			description="Token Usage & Cost Breakdown"
			icon={DollarSign}
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
					<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
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
			<!-- Cost Overview Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				<!-- Total Cost -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Cost
							</p>
							<p class="text-3xl font-bold text-green-600 mt-1">
								{formatCurrency(dashboardData.overview.total_cost || 0)}
							</p>
						</div>
						<DollarSign class="h-8 w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					{#if dashboardData.cost_trends.length >= 2}
						{@const trend = getCostTrend()}
						<div class="mt-2 flex items-center text-sm">
							{#if trend.direction === 'up'}
								<TrendingUp class="w-4 h-4 text-red-500 mr-1" />
								<span class="text-red-600">+{formatPercentage(trend.value)}</span>
							{:else}
								<TrendingDown class="w-4 h-4 text-green-500 mr-1" />
								<span class="text-green-600">-{formatPercentage(trend.value)}</span>
							{/if}
							<span class="text-gray-500 ml-1">from previous period</span>
						</div>
					{/if}
				</div>

				<!-- Total Tokens -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Tokens
							</p>
							<p class="text-3xl font-bold text-blue-600 mt-1">
								{formatNumber(dashboardData.overview.total_tokens || 0)}
							</p>
						</div>
						<Zap class="h-8 w-8 text-blue-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.prompt_tokens || 0)} input,
						{formatNumber(dashboardData.overview.completion_tokens || 0)} output
					</div>
				</div>

				<!-- Chat Cost -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Chat Cost
							</p>
							<p class="text-3xl font-bold text-purple-600 mt-1">
								{formatCurrency(dashboardData.overview.chat_cost || 0)}
							</p>
						</div>
						<MessageSquare class="h-8 w-8 text-purple-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.chat_tokens || 0)} tokens
					</div>
				</div>

				<!-- Agent Cost -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Agent Cost
							</p>
							<p class="text-3xl font-bold text-indigo-600 mt-1">
								{formatCurrency(dashboardData.overview.agent_cost || 0)}
							</p>
						</div>
						<Bot class="h-8 w-8 text-indigo-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.agent_tokens || 0)} tokens
					</div>
				</div>
			</div>

			<!-- Input vs Output Costs -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Cost Breakdown -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Input vs Output Costs
					</h3>
					<div class="space-y-4">
						<div>
							<div class="flex items-center justify-between mb-2">
								<div>
									<span
										class="text-sm font-medium text-gray-700 dark:text-gray-300"
										>Input Tokens</span
									>
									<span class="text-xs text-gray-500 ml-2"
										>(${dashboardData.pricing.INPUT_COST_PER_M || 0}/1M)</span
									>
								</div>
								<span class="text-sm font-bold text-blue-600"
									>{formatCurrency(dashboardData.overview.input_cost || 0)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-blue-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.overview.total_cost > 0
										? ((dashboardData.overview.input_cost || 0) /
												dashboardData.overview.total_cost) *
											100
										: 0}%"
								></div>
							</div>
							<div class="text-xs text-gray-500 mt-1">
								{formatNumber(dashboardData.overview.prompt_tokens || 0)} tokens
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between mb-2">
								<div>
									<span
										class="text-sm font-medium text-gray-700 dark:text-gray-300"
										>Output Tokens</span
									>
									<span class="text-xs text-gray-500 ml-2"
										>(${dashboardData.pricing.OUTPUT_COST_PER_M || 0}/1M)</span
									>
								</div>
								<span class="text-sm font-bold text-purple-600"
									>{formatCurrency(dashboardData.overview.output_cost || 0)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-purple-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.overview.total_cost > 0
										? ((dashboardData.overview.output_cost || 0) /
												dashboardData.overview.total_cost) *
											100
										: 0}%"
								></div>
							</div>
							<div class="text-xs text-gray-500 mt-1">
								{formatNumber(dashboardData.overview.completion_tokens || 0)} tokens
							</div>
						</div>
					</div>
				</div>

				<!-- Compression Savings -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Compression Savings
					</h3>
					<div class="flex items-center justify-center py-8">
						<Sparkles class="h-16 w-16 text-green-600 mr-6" />
						<div>
							<div class="text-3xl font-bold text-green-600">
								{formatCurrency(dashboardData.compression_savings.cost_saved || 0)}
							</div>
							<div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
								Saved by compression
							</div>
							<div class="text-xs text-gray-500 mt-1">
								{formatNumber(dashboardData.compression_savings.tokens_saved || 0)} tokens
								saved
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Cost by Model -->
			{#if dashboardData.by_model && dashboardData.by_model.length > 0}
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Cost by Model
					</h3>
					<div class="space-y-3">
						{#each dashboardData.by_model as modelData}
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<div class="text-sm font-medium text-gray-900 dark:text-white">
										{modelData.model || 'unknown'}
									</div>
									<div class="text-xs text-gray-500">
										{formatNumber(modelData.tokens)} tokens
									</div>
								</div>
								<div class="text-sm font-bold text-blue-600">
									{formatCurrency(modelData.cost)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Top Sessions by Cost -->
			<div class="admin-panel p-6">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Top Sessions by Cost
				</h3>
				{#if dashboardData.top_sessions && dashboardData.top_sessions.length > 0}
					<div class="space-y-3">
						{#each dashboardData.top_sessions as session}
							<div
								class="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
							>
								<div class="flex-1 min-w-0">
									<div
										class="text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{session.title}
									</div>
									<div class="text-xs text-gray-500 mt-1">
										{session.user_email} • {formatDate(session.created_at)}
									</div>
								</div>
								<div class="text-right ml-4">
									<div class="text-sm font-bold text-green-600">
										{formatCurrency(session.cost)}
									</div>
									<div class="text-xs text-gray-500">
										{formatNumber(session.tokens)} tokens
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 text-center py-8">No sessions found</p>
				{/if}
			</div>

			<!-- Top Users by Cost -->
			<div class="admin-panel p-6">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Top Users by Cost
				</h3>
				{#if dashboardData.top_users && dashboardData.top_users.length > 0}
					<div class="space-y-3">
						{#each dashboardData.top_users as userData}
							<div
								class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
							>
								<div class="flex-1">
									<div class="text-sm font-medium text-gray-900 dark:text-white">
										{userData.email}
									</div>
									<div class="text-xs text-gray-500">
										{formatNumber(userData.session_count)} sessions •
										{formatNumber(userData.total_tokens)} tokens
									</div>
								</div>
								<div class="text-sm font-bold text-green-600">
									{formatCurrency(userData.total_cost)}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 text-center py-8">No users found</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
