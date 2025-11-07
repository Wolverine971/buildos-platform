<!-- apps/web/src/routes/admin/chat/agents/+page.svelte -->
<script lang="ts">
	import {
		Bot,
		RefreshCw,
		CheckCircle,
		XCircle,
		Clock,
		Zap,
		MessageSquare,
		AlertCircle,
		TrendingUp,
		Activity,
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
		executions: {},
		plans: {},
		conversations: {},
		errors: {},
		recent_activity: []
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
			const response = await fetch(`/api/admin/chat/agents?timeframe=${selectedTimeframe}`);

			if (!response.ok) {
				throw new Error('Failed to load agent analytics');
			}

			const data = await response.json();

			if (data.success) {
				dashboardData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load analytics');
			}
		} catch (err) {
			console.error('Error loading agent analytics:', err);
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
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}
</script>

<svelte:head>
	<title>Agent Analytics - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<div class="admin-page">
		<!-- Header -->
		<AdminPageHeader
			title="Agent Analytics"
			description="Multi-Agent System Performance & Conversations"
			icon={Bot}
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
			<!-- Agent Overview Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				<!-- Total Agents -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Agents
							</p>
							<p class="text-3xl font-bold text-blue-600 mt-1">
								{formatNumber(dashboardData.overview.total_agents || 0)}
							</p>
						</div>
						<Bot class="h-8 w-8 text-blue-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.overview.planner_agents || 0)} planners,
						{formatNumber(dashboardData.overview.executor_agents || 0)} executors
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
						{formatNumber(dashboardData.overview.completed_agents || 0)} completed,
						{formatNumber(dashboardData.overview.failed_agents || 0)} failed
					</div>
				</div>

				<!-- Total Executions -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Executions
							</p>
							<p class="text-3xl font-bold text-purple-600 mt-1">
								{formatNumber(dashboardData.executions.total || 0)}
							</p>
						</div>
						<Activity class="h-8 w-8 text-purple-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatPercentage(dashboardData.executions.success_rate || 0)} success
					</div>
				</div>

				<!-- Avg Duration -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Avg Duration
							</p>
							<p class="text-3xl font-bold text-indigo-600 mt-1">
								{formatDuration(dashboardData.overview.avg_duration_ms || 0)}
							</p>
						</div>
						<Clock class="h-8 w-8 text-indigo-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">Per agent</div>
				</div>
			</div>

			<!-- Execution Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				<!-- Total Tokens -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Tokens
							</p>
							<p class="text-3xl font-bold text-green-600 mt-1">
								{formatNumber(dashboardData.executions.total_tokens_used || 0)}
							</p>
						</div>
						<Zap class="h-8 w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.executions.avg_tokens_per_execution || 0)} avg/execution
					</div>
				</div>

				<!-- Tool Calls -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Tool Calls
							</p>
							<p class="text-3xl font-bold text-yellow-600 mt-1">
								{formatNumber(dashboardData.executions.total_tool_calls || 0)}
							</p>
						</div>
						<Sparkles class="h-8 w-8 text-yellow-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.executions.avg_tool_calls || 0)} avg/execution
					</div>
				</div>

				<!-- Conversations -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Conversations
							</p>
							<p class="text-3xl font-bold text-cyan-600 mt-1">
								{formatNumber(dashboardData.conversations.total || 0)}
							</p>
						</div>
						<MessageSquare class="h-8 w-8 text-cyan-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.conversations.avg_messages || 0)} avg messages
					</div>
				</div>

				<!-- Execution Duration -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Exec Duration
							</p>
							<p class="text-3xl font-bold text-orange-600 mt-1">
								{formatDuration(dashboardData.executions.avg_duration_ms || 0)}
							</p>
						</div>
						<Clock class="h-8 w-8 text-orange-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						Avg per execution
					</div>
				</div>
			</div>

			<!-- Plans & Conversations -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Plan Strategy Distribution -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Plan Strategies
					</h3>
					<div class="space-y-4">
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Direct</span
								>
								<span class="text-sm font-bold text-blue-600"
									>{formatNumber(dashboardData.plans.direct || 0)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-blue-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.plans.total > 0
										? ((dashboardData.plans.direct || 0) /
												dashboardData.plans.total) *
											100
										: 0}%"
								></div>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Complex</span
								>
								<span class="text-sm font-bold text-purple-600"
									>{formatNumber(dashboardData.plans.complex || 0)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-purple-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.plans.total > 0
										? ((dashboardData.plans.complex || 0) /
												dashboardData.plans.total) *
											100
										: 0}%"
								></div>
							</div>
						</div>
					</div>
					<div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.plans.active || 0)} active,
						{formatNumber(dashboardData.plans.completed || 0)} completed,
						{formatNumber(dashboardData.plans.failed || 0)} failed
					</div>
				</div>

				<!-- Conversation Types -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Conversation Types
					</h3>
					<div class="space-y-4">
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Planner Thinking</span
								>
								<span class="text-sm font-bold text-blue-600"
									>{formatNumber(
										dashboardData.conversations.planner_thinking || 0
									)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-blue-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.conversations.total > 0
										? ((dashboardData.conversations.planner_thinking || 0) /
												dashboardData.conversations.total) *
											100
										: 0}%"
								></div>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Planner-Executor</span
								>
								<span class="text-sm font-bold text-purple-600"
									>{formatNumber(
										dashboardData.conversations.planner_executor || 0
									)}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-purple-600 h-3 rounded-full transition-all duration-300"
									style="width: {dashboardData.conversations.total > 0
										? ((dashboardData.conversations.planner_executor || 0) /
												dashboardData.conversations.total) *
											100
										: 0}%"
								></div>
							</div>
						</div>
					</div>
					<div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardData.conversations.completed || 0)} completed,
						{formatNumber(dashboardData.conversations.failed || 0)} failed
					</div>
				</div>
			</div>

			<!-- Top Errors -->
			{#if dashboardData.errors.top_errors && dashboardData.errors.top_errors.length > 0}
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Top Errors ({formatNumber(dashboardData.errors.total_errors || 0)} total)
					</h3>
					<div class="space-y-3">
						{#each dashboardData.errors.top_errors as errorItem}
							<div
								class="flex items-start space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
							>
								<XCircle class="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
								<div class="flex-1 min-w-0">
									<p class="text-sm text-red-800 dark:text-red-200 break-words">
										{errorItem.error}
									</p>
								</div>
								<span
									class="text-sm font-bold text-red-600 bg-red-100 dark:bg-red-800 px-2 py-1 rounded"
								>
									{formatNumber(errorItem.count)}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Recent Activity -->
			<div class="admin-panel p-6">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Recent Agent Executions
				</h3>
				{#if dashboardData.recent_activity && dashboardData.recent_activity.length > 0}
					<div class="space-y-3">
						{#each dashboardData.recent_activity as activity}
							<div
								class="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
							>
								<Bot
									class="h-5 w-5 {activity.agent_type === 'planner'
										? 'text-blue-600'
										: 'text-purple-600'} flex-shrink-0 mt-0.5"
								/>
								<div class="flex-1 min-w-0">
									<div class="flex items-center space-x-2 mb-1">
										<span
											class="text-sm font-medium text-gray-900 dark:text-white"
										>
											{activity.agent_name}
										</span>
										<span
											class="text-xs px-2 py-0.5 rounded {activity.agent_type ===
											'planner'
												? 'bg-blue-100 text-blue-800'
												: 'bg-purple-100 text-purple-800'}"
										>
											{activity.agent_type}
										</span>
										{#if activity.success}
											<CheckCircle class="h-4 w-4 text-green-600" />
										{:else}
											<XCircle class="h-4 w-4 text-red-600" />
										{/if}
									</div>
									<p
										class="text-sm text-gray-600 dark:text-gray-400 mb-2 truncate"
									>
										{activity.user_message || 'No message'}
									</p>
									<div class="flex items-center space-x-4 text-xs text-gray-500">
										<span>{formatNumber(activity.tokens_used)} tokens</span>
										<span>•</span>
										<span>{formatNumber(activity.tool_calls)} tool calls</span>
										<span>•</span>
										<span>{formatDuration(activity.duration_ms)}</span>
										<span>•</span>
										<span>{formatDate(activity.created_at)}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 text-center py-8">No recent activity</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
