<!-- apps/web/src/routes/admin/chat/+page.svelte -->
<script lang="ts">
	import {
		MessageSquare,
		Bot,
		Users,
		DollarSign,
		Zap,
		TrendingUp,
		AlertCircle,
		RefreshCw,
		Download,
		Activity,
		Clock,
		CheckCircle,
		XCircle,
		Sparkles
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { browser } from '$app/environment';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<'24h' | '7d' | '30d'>('7d');
	let autoRefresh = $state(false);

	// Dashboard KPIs
	let dashboardKPIs = $state({
		// User Engagement
		totalSessions: 0,
		activeSessions: 0,
		totalMessages: 0,
		avgMessagesPerSession: 0,
		uniqueUsers: 0,

		// Agent Performance
		totalAgents: 0,
		activePlans: 0,
		agentSuccessRate: 0,
		avgPlanComplexity: 0,

		// Cost & Usage
		totalTokensUsed: 0,
		estimatedCost: 0,
		avgTokensPerSession: 0,
		tokenTrend: { direction: 'up' as 'up' | 'down', value: 0 },

		// Quality Metrics
		compressionEffectiveness: 0,
		toolSuccessRate: 0,
		avgResponseTime: 0,
		errorRate: 0,

		// Time series data
		sessionsOverTime: [] as Array<{ date: string; count: number }>,
		tokensOverTime: [] as Array<{ date: string; tokens: number }>
	});

	// Activity feed
	let activityFeed = $state<
		Array<{
			timestamp: Date;
			type: string;
			user_email: string;
			session_id: string;
			details: string;
			tokens_used?: number;
		}>
	>([]);

	// Strategy distribution
	let strategyDistribution = $state({
		direct: 0,
		complex: 0
	});

	// Top users by activity
	let topUsers = $state<
		Array<{
			user_id: string;
			email: string;
			session_count: number;
			message_count: number;
			tokens_used: number;
		}>
	>([]);

	// Load data on mount and when timeframe changes
	$effect(() => {
		selectedTimeframe;
		loadDashboard();
	});

	// Auto-refresh
	$effect(() => {
		if (autoRefresh) {
			const interval = setInterval(loadDashboard, 30000); // 30 seconds
			return () => clearInterval(interval);
		}
	});

	async function loadDashboard() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const response = await fetch(
				`/api/admin/chat/dashboard?timeframe=${selectedTimeframe}`
			);

			if (!response.ok) {
				throw new Error('Failed to load dashboard data');
			}

			const data = await response.json();

			if (data.success) {
				dashboardKPIs = data.data.kpis;
				activityFeed = data.data.activity_feed.map((event: any) => ({
					...event,
					timestamp: new Date(event.timestamp)
				}));
				strategyDistribution = data.data.strategy_distribution;
				topUsers = data.data.top_users;
			} else {
				throw new Error(data.message || 'Failed to load dashboard');
			}
		} catch (err) {
			console.error('Error loading chat dashboard:', err);
			error = err instanceof Error ? err.message : 'Failed to load dashboard';
		} finally {
			isLoading = false;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatCurrency(num: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(num);
	}

	function formatPercentage(num: number): string {
		return `${num.toFixed(1)}%`;
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function getActivityIcon(type: string) {
		switch (type) {
			case 'session_start':
				return MessageSquare;
			case 'message':
				return MessageSquare;
			case 'plan_created':
				return Bot;
			case 'agent_spawned':
				return Sparkles;
			case 'compression':
				return Zap;
			case 'error':
				return XCircle;
			default:
				return Activity;
		}
	}

	async function exportData() {
		if (!browser) return;
		try {
			const response = await fetch(
				`/api/admin/chat/export?timeframe=${selectedTimeframe}&format=json`
			);

			if (!response.ok) throw new Error('Failed to export data');

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `chat-analytics-${selectedTimeframe}-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export failed:', err);
			error = 'Failed to export data';
		}
	}
</script>

<svelte:head>
	<title>Chat Monitoring - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="Chat Monitoring"
			description="AI Chat System Analytics & Performance"
			icon={MessageSquare}
			showBack={true}
		>
			<div slot="actions" class="flex items-center space-x-4">
				<!-- Auto Refresh -->
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-blue-600"
					/>
					<span class="text-sm text-gray-600 dark:text-gray-400">Auto Refresh</span>
				</label>

				<!-- Timeframe -->
				<Select
					bind:value={selectedTimeframe}
					on:change={(e) => (selectedTimeframe = e.detail)}
					size="md"
					placeholder="Last 7 Days"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
				</Select>

				<!-- Export -->
				<Button on:click={exportData} variant="primary" size="sm" icon={Download}>
					Export
				</Button>

				<!-- Refresh -->
				<Button
					on:click={loadDashboard}
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

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<a
				href="/admin/chat/sessions"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<MessageSquare class="h-8 w-8 text-blue-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Sessions
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">View all chats</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/chat/agents"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Bot class="h-8 w-8 text-purple-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Agents</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Agent analytics</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/chat/costs"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<DollarSign class="h-8 w-8 text-green-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Costs</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Token analytics</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/chat/tools"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Zap class="h-8 w-8 text-yellow-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tools</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Tool usage</p>
					</div>
				</div>
			</a>
		</div>

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
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-pulse">
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
						<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Key Metrics Grid -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
				<!-- Total Sessions -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Sessions
							</p>
							<p class="text-3xl font-bold text-blue-600 mt-1">
								{formatNumber(dashboardKPIs.totalSessions)}
							</p>
						</div>
						<MessageSquare class="h-8 w-8 text-blue-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{dashboardKPIs.activeSessions} active now
					</div>
				</div>

				<!-- Total Messages -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Messages
							</p>
							<p class="text-3xl font-bold text-indigo-600 mt-1">
								{formatNumber(dashboardKPIs.totalMessages)}
							</p>
						</div>
						<Activity class="h-8 w-8 text-indigo-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						Avg {dashboardKPIs.avgMessagesPerSession.toFixed(1)} per session
					</div>
				</div>

				<!-- Token Usage -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Token Usage
							</p>
							<p class="text-3xl font-bold text-green-600 mt-1">
								{formatNumber(dashboardKPIs.totalTokensUsed)}
							</p>
						</div>
						<Zap class="h-8 w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 flex items-center text-sm">
						{#if dashboardKPIs.tokenTrend.direction === 'up'}
							<TrendingUp class="w-4 h-4 text-red-500 mr-1" />
							<span class="text-red-600">+{dashboardKPIs.tokenTrend.value}%</span>
						{:else}
							<TrendingUp class="w-4 h-4 text-green-500 mr-1 transform rotate-180" />
							<span class="text-green-600">-{dashboardKPIs.tokenTrend.value}%</span>
						{/if}
					</div>
				</div>

				<!-- Estimated Cost -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Estimated Cost
							</p>
							<p class="text-3xl font-bold text-orange-600 mt-1">
								{formatCurrency(dashboardKPIs.estimatedCost)}
							</p>
						</div>
						<DollarSign class="h-8 w-8 text-orange-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatCurrency(
							dashboardKPIs.estimatedCost / dashboardKPIs.totalSessions || 0
						)} per session
					</div>
				</div>

				<!-- Agent Success Rate -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Agent Success Rate
							</p>
							<p class="text-3xl font-bold text-purple-600 mt-1">
								{formatPercentage(dashboardKPIs.agentSuccessRate)}
							</p>
						</div>
						<CheckCircle class="h-8 w-8 text-purple-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(dashboardKPIs.totalAgents)} agents total
					</div>
				</div>

				<!-- Tool Success Rate -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Tool Success Rate
							</p>
							<p class="text-3xl font-bold text-cyan-600 mt-1">
								{formatPercentage(dashboardKPIs.toolSuccessRate)}
							</p>
						</div>
						<Zap class="h-8 w-8 text-cyan-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						Tool reliability
					</div>
				</div>

				<!-- Avg Response Time -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Avg Response Time
							</p>
							<p class="text-3xl font-bold text-blue-600 mt-1">
								{formatDuration(dashboardKPIs.avgResponseTime)}
							</p>
						</div>
						<Clock class="h-8 w-8 text-blue-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">Performance</div>
				</div>

				<!-- Compression Effectiveness -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Compression
							</p>
							<p class="text-3xl font-bold text-green-600 mt-1">
								{formatPercentage(dashboardKPIs.compressionEffectiveness)}
							</p>
						</div>
						<Sparkles class="h-8 w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-sm text-gray-600 dark:text-gray-400">Tokens saved</div>
				</div>
			</div>

			<!-- Strategy Distribution & Activity Feed -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Strategy Distribution -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Planning Strategies
					</h3>
					<div class="space-y-4">
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Direct</span
								>
								<span class="text-sm font-bold text-blue-600"
									>{strategyDistribution.direct}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-blue-600 h-3 rounded-full transition-all duration-300"
									style="width: {(strategyDistribution.direct /
										(strategyDistribution.direct +
											strategyDistribution.complex)) *
										100}%"
								></div>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between mb-2">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
									>Complex</span
								>
								<span class="text-sm font-bold text-purple-600"
									>{strategyDistribution.complex}</span
								>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
								<div
									class="bg-purple-600 h-3 rounded-full transition-all duration-300"
									style="width: {(strategyDistribution.complex /
										(strategyDistribution.direct +
											strategyDistribution.complex)) *
										100}%"
								></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Top Users -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Top Users
					</h3>
					{#if topUsers.length > 0}
						<div class="space-y-3">
							{#each topUsers.slice(0, 5) as user}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{user.email}
										</div>
										<div class="text-xs text-gray-500">
											{formatNumber(user.tokens_used)} tokens
										</div>
									</div>
									<div class="text-sm font-bold text-blue-600 ml-2">
										{user.session_count} sessions
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-4">No data available</p>
					{/if}
				</div>
			</div>

			<!-- Real-time Activity Feed -->
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Recent Activity
				</h3>
				{#if activityFeed.length > 0}
					<div class="space-y-3 max-h-96 overflow-y-auto">
						{#each activityFeed as event}
							<div class="flex items-start space-x-3 text-sm">
								<svelte:component
									this={getActivityIcon(event.type)}
									class="h-4 w-4 text-gray-400 flex-shrink-0 mt-1"
								/>
								<div class="flex-1 min-w-0">
									<div class="text-gray-900 dark:text-white">
										<span class="font-medium">{event.user_email}</span>
										{event.details}
									</div>
									<div class="text-xs text-gray-500">
										{event.timestamp.toLocaleString()}
										{#if event.tokens_used}
											· {formatNumber(event.tokens_used)} tokens
										{/if}
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
