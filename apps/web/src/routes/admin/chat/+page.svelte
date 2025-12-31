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
		if (!browser) return;
		selectedTimeframe;
		loadDashboard();
	});

	// Auto-refresh
	$effect(() => {
		if (!browser) return;
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
			case 'tool_execution':
				return Zap;
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

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Chat Monitoring"
		description="AI Chat System Analytics & Performance"
		icon={MessageSquare}
		showBack={true}
	>
		<div slot="actions" class="flex flex-wrap items-center gap-3">
			<!-- Auto Refresh -->
			<label class="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					bind:checked={autoRefresh}
					class="h-4 w-4 rounded border-border bg-background text-accent focus:ring-ring focus:ring-2 cursor-pointer"
					aria-label="Enable auto refresh"
				/>
				<span class="text-sm text-muted-foreground">Auto Refresh</span>
			</label>

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

			<!-- Export -->
			<Button onclick={exportData} variant="primary" size="sm" icon={Download} class="pressable">
				Export
			</Button>

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

	<!-- Navigation Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
		<a
			href="/admin/chat/sessions"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all pressable focus:outline-none focus:ring-2 focus:ring-ring"
		>
			<div class="flex items-center gap-3">
				<MessageSquare class="h-7 w-7 text-blue-500 shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Sessions</h3>
					<p class="text-sm text-muted-foreground">View all chats</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/agents"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all pressable focus:outline-none focus:ring-2 focus:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Bot class="h-7 w-7 text-purple-500 shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Agents</h3>
					<p class="text-sm text-muted-foreground">Agent analytics</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/costs"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all pressable focus:outline-none focus:ring-2 focus:ring-ring"
		>
			<div class="flex items-center gap-3">
				<DollarSign class="h-7 w-7 text-emerald-500 shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Costs</h3>
					<p class="text-sm text-muted-foreground">Token analytics</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/tools"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all pressable focus:outline-none focus:ring-2 focus:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Zap class="h-7 w-7 text-amber-500 shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Tools</h3>
					<p class="text-sm text-muted-foreground">Tool usage</p>
				</div>
			</div>
		</a>
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
	{:else}
		<!-- Key Metrics Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<!-- Total Sessions -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Total Sessions
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatNumber(dashboardKPIs.totalSessions)}
						</p>
					</div>
					<MessageSquare class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{dashboardKPIs.activeSessions} active now
				</div>
			</div>

			<!-- Total Messages -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Total Messages
						</p>
						<p class="text-2xl font-bold text-indigo-500 mt-1">
							{formatNumber(dashboardKPIs.totalMessages)}
						</p>
					</div>
					<Activity class="h-7 w-7 text-indigo-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					Avg {dashboardKPIs.avgMessagesPerSession.toFixed(1)} per session
				</div>
			</div>

			<!-- Token Usage -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Token Usage
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatNumber(dashboardKPIs.totalTokensUsed)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 flex items-center text-xs">
					{#if dashboardKPIs.tokenTrend.direction === 'up'}
						<TrendingUp class="w-3.5 h-3.5 text-red-500 mr-1" />
						<span class="text-red-500">+{dashboardKPIs.tokenTrend.value}%</span>
					{:else}
						<TrendingUp class="w-3.5 h-3.5 text-emerald-500 mr-1 rotate-180" />
						<span class="text-emerald-500">-{dashboardKPIs.tokenTrend.value}%</span>
					{/if}
				</div>
			</div>

			<!-- Estimated Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Estimated Cost
						</p>
						<p class="text-2xl font-bold text-amber-500 mt-1">
							{formatCurrency(dashboardKPIs.estimatedCost)}
						</p>
					</div>
					<DollarSign class="h-7 w-7 text-amber-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatCurrency(
						dashboardKPIs.estimatedCost / dashboardKPIs.totalSessions || 0
					)} per session
				</div>
			</div>

			<!-- Agent Success Rate -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Agent Success Rate
						</p>
						<p class="text-2xl font-bold text-purple-500 mt-1">
							{formatPercentage(dashboardKPIs.agentSuccessRate)}
						</p>
					</div>
					<CheckCircle class="h-7 w-7 text-purple-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.totalAgents)} agents total
				</div>
			</div>

			<!-- Tool Success Rate -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Tool Success Rate
						</p>
						<p class="text-2xl font-bold text-cyan-500 mt-1">
							{formatPercentage(dashboardKPIs.toolSuccessRate)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-cyan-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">Tool reliability</div>
			</div>

			<!-- Avg Response Time -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Avg Response Time
						</p>
						<p class="text-2xl font-bold text-blue-500 mt-1">
							{formatDuration(dashboardKPIs.avgResponseTime)}
						</p>
					</div>
					<Clock class="h-7 w-7 text-blue-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">Performance</div>
			</div>

			<!-- Compression Effectiveness -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Compression
						</p>
						<p class="text-2xl font-bold text-emerald-500 mt-1">
							{formatPercentage(dashboardKPIs.compressionEffectiveness)}
						</p>
					</div>
					<Sparkles class="h-7 w-7 text-emerald-500 shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">Tokens saved</div>
			</div>
		</div>

		<!-- Strategy Distribution & Activity Feed -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- Strategy Distribution -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Planning Strategies</h3>
				<div class="space-y-4">
					<div>
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-medium text-foreground">Direct</span>
							<span class="text-sm font-bold text-blue-500"
								>{strategyDistribution.direct}</span
							>
						</div>
						<div class="w-full bg-muted rounded-full h-2.5">
							<div
								class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
								style="width: {(strategyDistribution.direct /
									(strategyDistribution.direct + strategyDistribution.complex)) *
									100}%"
							></div>
						</div>
					</div>
					<div>
						<div class="flex items-center justify-between mb-2">
							<span class="text-sm font-medium text-foreground">Complex</span>
							<span class="text-sm font-bold text-purple-500"
								>{strategyDistribution.complex}</span
							>
						</div>
						<div class="w-full bg-muted rounded-full h-2.5">
							<div
								class="bg-purple-500 h-2.5 rounded-full transition-all duration-300"
								style="width: {(strategyDistribution.complex /
									(strategyDistribution.direct + strategyDistribution.complex)) *
									100}%"
							></div>
						</div>
					</div>
				</div>
			</div>

			<!-- Top Users -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Top Users</h3>
				{#if topUsers.length > 0}
					<div class="space-y-3 max-h-48 overflow-y-auto scrollbar-thin">
						{#each topUsers.slice(0, 5) as user}
							<div class="flex items-center justify-between gap-2">
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground truncate">
										{user.email}
									</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(user.tokens_used)} tokens
									</div>
								</div>
								<div class="text-sm font-bold text-blue-500 shrink-0">
									{user.session_count} sessions
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">No data available</p>
				{/if}
			</div>
		</div>

		<!-- Real-time Activity Feed -->
		<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
			<h3 class="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
			{#if activityFeed.length > 0}
				<div
					class="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-2"
					role="log"
					aria-label="Recent activity feed"
				>
					{#each activityFeed as event}
						{@const ActivityIcon = getActivityIcon(event.type)}
						<div class="flex items-start gap-3 text-sm">
							<ActivityIcon class="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<div class="text-foreground">
									<span class="font-medium">{event.user_email}</span>
									<span class="text-muted-foreground"> {event.details}</span>
								</div>
								<div class="text-xs text-muted-foreground mt-0.5">
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
				<p class="text-muted-foreground text-center py-8 text-sm">No recent activity</p>
			{/if}
		</div>
	{/if}
</div>
