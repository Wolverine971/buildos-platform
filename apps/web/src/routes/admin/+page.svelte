<!-- apps/web/src/routes/admin/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BarChart3,
		Users,
		FileText,
		Activity,
		TrendingUp,
		AlertCircle,
		Zap,
		Globe,
		RefreshCw,
		Download,
		Eye,
		Settings,
		MessageSquare,
		Star,
		UserCheck,
		UserPlus,
		ExternalLink,
		CreditCard,
		DollarSign,
		TrendingDown,
		AlertTriangle,
		XCircle
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import VisitorContributionChart from '$lib/components/analytics/VisitorContributionChart.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	import { browser } from '$app/environment';

	let isLoading = true;
	let error: string | null = null;
	let selectedTimeframe: '7d' | '30d' | '90d' = '30d';
	let autoRefresh = false;
	let refreshInterval: number;

	// Analytics data
	let systemOverview = {
		total_users: 0,
		active_users_7d: 0,
		active_users_30d: 0,
		total_briefs: 0,
		avg_brief_length: 0,
		top_active_users: []
	};

	// Comprehensive analytics data
	let comprehensiveAnalytics = {
		userMetrics: {
			totalUsers: 0,
			totalBetaUsers: 0,
			newUsersLast24h: 0,
			newBetaSignupsLast24h: 0
		},
		brainDumpMetrics: {
			total: 0,
			averageLength: 0,
			uniqueUsers: 0
		},
		projectMetrics: {
			newProjects: 0,
			updatedProjects: 0,
			uniqueUsers: 0
		},
		calendarConnections: 0,
		leaderboards: {
			brainDumps: [],
			projectUpdates: [],
			tasksCreated: [],
			tasksScheduled: [],
			phasesCreated: []
		}
	};

	let dailyActiveUsers: Array<{ date: string; active_users: number }> = [];
	let briefGenerationStats: Array<{
		date: string;
		total_briefs: number;
		unique_users: number;
		avg_briefs_per_user: number;
	}> = [];
	let systemMetrics: Array<{
		metric_name: string;
		metric_value: number;
		metric_unit: string;
		metric_description: string;
		recorded_at: string;
	}> = [];
	let recentActivity: Array<{
		activity_type: string;
		user_email: string;
		created_at: string;
		activity_data: any;
	}> = [];
	let templateUsageStats: Array<{
		template_name: string;
		usage_count: number;
		template_type: string;
	}> = [];

	// Feedback data
	let feedbackOverview = {
		overview: {
			total_feedback: 0,
			recent_24h: 0,
			unresolved_count: 0,
			average_rating: 0
		},
		category_breakdown: {},
		status_breakdown: {},
		recent_feedback: []
	};

	// Beta program data
	let betaOverview = {
		signups: {
			total: 0,
			pending: 0,
			approved: 0,
			declined: 0,
			waitlist: 0,
			recent_24h: 0
		},
		members: {
			total: 0,
			active_30d: 0,
			tier_breakdown: {},
			total_feedback: 0
		},
		recent_activity: []
	};

	// Errors data
	let errorsData = {
		total_errors: 0,
		unresolved_errors: 0,
		critical_errors: 0,
		recent_errors_24h: 0,
		error_trend: 0
	};

	// Subscription data
	let subscriptionData = {
		overview: {
			total_subscribers: 0,
			active_subscriptions: 0,
			trial_subscriptions: 0,
			canceled_subscriptions: 0,
			paused_subscriptions: 0,
			mrr: 0,
			arr: 0
		},
		revenue: {
			current_mrr: 0,
			previous_mrr: 0,
			mrr_growth: 0,
			total_revenue: 0,
			average_revenue_per_user: 0,
			churn_rate: 0,
			lifetime_value: 0
		},
		recentChanges: [],
		failedPayments: [],
		discountUsage: [],
		stripeEnabled: false
	};

	let visitorOverview = {
		total_visitors: 0,
		visitors_7d: 0,
		visitors_30d: 0,
		unique_visitors_today: 0
	};

	let dailyVisitors: Array<{ date: string; visitor_count: number }> = [];
	let dailySignups: Array<{ date: string; signup_count: number }> = [];

	onMount(async () => {
		await loadAnalytics();

		// Set up auto-refresh if enabled
		if (autoRefresh) {
			refreshInterval = setInterval(loadAnalytics, 30000);
		}

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});

	$: if (selectedTimeframe) {
		loadAnalytics();
	}

	$: if (autoRefresh) {
		refreshInterval = setInterval(loadAnalytics, 30000);
	} else if (refreshInterval) {
		clearInterval(refreshInterval);
	}

	async function loadAnalytics() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const [
				overviewRes,
				visitorOverviewRes,
				dailyVisitorsRes,
				dailySignupsRes,
				dailyUsersRes,
				briefStatsRes,
				systemMetricsRes,
				activityRes,
				templateStatsRes,
				feedbackRes,
				betaRes,
				subscriptionRes,
				comprehensiveRes,
				errorsRes
			] = await Promise.all([
				fetch('/api/admin/analytics/overview'),
				fetch('/api/admin/analytics/visitor-overview'),
				fetch(`/api/admin/analytics/daily-visitors?timeframe=${selectedTimeframe}`),
				fetch(`/api/admin/analytics/daily-signups?timeframe=${selectedTimeframe}`),
				fetch(`/api/admin/analytics/daily-users?timeframe=${selectedTimeframe}`),
				fetch(`/api/admin/analytics/brief-stats?timeframe=${selectedTimeframe}`),
				fetch('/api/admin/analytics/system-metrics'),
				fetch('/api/admin/analytics/recent-activity'),
				fetch('/api/admin/analytics/template-usage'),
				fetch('/api/admin/feedback/overview'),
				fetch('/api/admin/beta/overview'),
				fetch('/api/admin/subscriptions/overview'),
				fetch(`/api/admin/analytics/comprehensive?timeframe=${selectedTimeframe}`),
				fetch('/api/admin/errors?resolved=false&limit=10')
			]);

			if (!overviewRes.ok) throw new Error('Failed to load overview data');
			if (!visitorOverviewRes.ok) throw new Error('Failed to load visitor overview');
			if (!dailyVisitorsRes.ok) throw new Error('Failed to load daily visitors data');
			if (!dailySignupsRes.ok) throw new Error('Failed to load daily signups data');
			if (!dailyUsersRes.ok) throw new Error('Failed to load daily users data');
			if (!briefStatsRes.ok) throw new Error('Failed to load brief stats');
			if (!systemMetricsRes.ok) throw new Error('Failed to load system metrics');
			if (!activityRes.ok) throw new Error('Failed to load recent activity');
			if (!templateStatsRes.ok) throw new Error('Failed to load template usage');
			if (!feedbackRes.ok) throw new Error('Failed to load feedback data');
			if (!betaRes.ok) throw new Error('Failed to load beta data');
			// Subscription data is optional (only if Stripe is enabled)
			if (subscriptionRes.ok) {
				subscriptionData = await subscriptionRes.json();
			}
			// Errors data
			if (errorsRes.ok) {
				const errorResponse = await errorsRes.json();
				if (errorResponse.success) {
					const summary = errorResponse.data.summary;
					if (summary && summary.length > 0) {
						const summaryData = summary[0];
						errorsData = {
							total_errors: summaryData.total_errors || 0,
							unresolved_errors: summaryData.unresolved_errors || 0,
							critical_errors: summaryData.critical_errors || 0,
							recent_errors_24h: summaryData.errors_last_24h || 0,
							error_trend: summaryData.error_trend || 0
						};
					}
				}
			}
			// Comprehensive analytics
			if (comprehensiveRes.ok) {
				const comprehensiveData = await comprehensiveRes.json();
				if (comprehensiveData.success) {
					comprehensiveAnalytics = comprehensiveData.data;
				}
			}

			const overviewJson = await overviewRes.json();
			if (!overviewJson.success) throw new Error('Overview response missing success flag');
			systemOverview = overviewJson.data?.[0] ?? systemOverview;

			const visitorOverviewJson = await visitorOverviewRes.json();
			if (!visitorOverviewJson.success)
				throw new Error('Visitor overview response missing success flag');
			visitorOverview = visitorOverviewJson.data;

			const dailyVisitorsJson = await dailyVisitorsRes.json();
			if (!dailyVisitorsJson.success)
				throw new Error('Daily visitors response missing success flag');
			dailyVisitors = dailyVisitorsJson.data ?? [];

			const dailySignupsJson = await dailySignupsRes.json();
			if (!dailySignupsJson.success)
				throw new Error('Daily signups response missing success flag');
			dailySignups = dailySignupsJson.data ?? [];

			const dailyUsersJson = await dailyUsersRes.json();
			if (!dailyUsersJson.success)
				throw new Error('Daily users response missing success flag');
			dailyActiveUsers = dailyUsersJson.data ?? [];

			const briefStatsJson = await briefStatsRes.json();
			if (!briefStatsJson.success)
				throw new Error('Brief stats response missing success flag');
			briefGenerationStats = briefStatsJson.data ?? [];

			const systemMetricsJson = await systemMetricsRes.json();
			if (!systemMetricsJson.success)
				throw new Error('System metrics response missing success flag');
			systemMetrics = systemMetricsJson.data ?? [];

			const activityJson = await activityRes.json();
			if (!activityJson.success)
				throw new Error('Recent activity response missing success flag');
			recentActivity = activityJson.data ?? [];

			const templateStatsJson = await templateStatsRes.json();
			if (!templateStatsJson.success)
				throw new Error('Template usage response missing success flag');
			templateUsageStats = templateStatsJson.data ?? [];

			feedbackOverview = await feedbackRes.json();

			const betaOverviewJson = await betaRes.json();
			if (!betaOverviewJson.success)
				throw new Error('Beta overview response missing success flag');
			betaOverview = betaOverviewJson.data;
		} catch (err) {
			console.error('Error loading analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			isLoading = false;
		}
	}

	function getTimeframeDays(): number {
		switch (selectedTimeframe) {
			case '7d':
				return 7;
			case '90d':
				return 90;
			case '30d':
			default:
				return 30;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatPercentage(num: number): string {
		return `${Math.round(num)}%`;
	}

	function getSystemHealthColor(value: number, unit: string): string {
		if (unit === 'percentage') {
			if (value >= 95) return 'text-green-600';
			if (value >= 85) return 'text-yellow-600';
			return 'text-red-600';
		}
		if (unit === 'milliseconds') {
			if (value <= 200) return 'text-green-600';
			if (value <= 500) return 'text-yellow-600';
			return 'text-red-600';
		}
		return 'text-gray-600';
	}

	function getActivityIcon(activityType: string) {
		switch (activityType) {
			case 'brief_generated':
				return FileText;
			case 'login':
				return Users;
			case 'template_created':
				return Settings;
			default:
				return Activity;
		}
	}

	function getCategoryColor(category: string): string {
		const colors = {
			feature: 'text-blue-600',
			bug: 'text-red-600',
			improvement: 'text-green-600',
			general: 'text-gray-600'
		};
		return colors[category as keyof typeof colors] || 'text-gray-600';
	}

	function getStatusColor(status: string): string {
		const colors = {
			new: 'text-red-600',
			reviewed: 'text-yellow-600',
			in_progress: 'text-blue-600',
			resolved: 'text-green-600',
			closed: 'text-gray-600'
		};
		return colors[status as keyof typeof colors] || 'text-gray-600';
	}

	async function exportAnalytics() {
		if (!browser) return;
		try {
			const response = await fetch(
				`/api/admin/analytics/export?timeframe=${selectedTimeframe}`
			);
			if (!response.ok) throw new Error('Failed to export analytics');

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `life-os-analytics-${selectedTimeframe}-${new Date().toISOString().split('T')[0]}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Error exporting analytics:', err);
			error = 'Failed to export analytics';
		}
	}
</script>

<svelte:head>
	<title>Admin Analytics - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header without Back Button (this is the main admin page) -->
		<AdminPageHeader
			title="Admin Dashboard"
			description="System overview and user analytics"
			icon={BarChart3}
			showBack={false}
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
					placeholder="Last 30 Days"
				>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
					<option value="90d">Last 90 Days</option>
				</Select>

				<!-- Export -->
				<Button on:click={exportAnalytics} variant="primary" size="sm" icon={Download}>
					Export
				</Button>

				<!-- Refresh -->
				<Button
					on:click={loadAnalytics}
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
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
			
			

			<a
				href="/admin/users"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow relative"
			>
				{#if comprehensiveAnalytics.userMetrics.newUsersLast24h > 0}
					<div class="absolute top-3 right-3">
						<span
							class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
						>
							+{comprehensiveAnalytics.userMetrics.newUsersLast24h} new
						</span>
					</div>
				{/if}
				<div class="flex items-center justify-between">
					<div class="flex items-center">
						<Users class="h-8 w-8 text-blue-600 mr-3" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Users
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Manage user accounts
							</p>
						</div>
					</div>
					{#if comprehensiveAnalytics.userMetrics.totalUsers > 0}
						<span class="text-2xl font-bold text-blue-600">
							{comprehensiveAnalytics.userMetrics.totalUsers}
						</span>
					{/if}
				</div>
			</a>

		

			<a
				href="/admin/beta"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow relative"
			>
				{#if comprehensiveAnalytics.userMetrics.newBetaSignupsLast24h > 0}
					<div class="absolute top-3 right-3">
						<span
							class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
						>
							+{comprehensiveAnalytics.userMetrics.newBetaSignupsLast24h} new
						</span>
					</div>
				{/if}
				<div class="flex items-center justify-between">
					<div class="flex items-center">
						<UserCheck class="h-8 w-8 text-purple-600 mr-3" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Beta Program
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Manage beta members
							</p>
						</div>
					</div>
					{#if comprehensiveAnalytics.userMetrics.totalBetaUsers > 0}
						<span class="text-2xl font-bold text-purple-600">
							{comprehensiveAnalytics.userMetrics.totalBetaUsers}
						</span>
					{/if}
				</div>
			</a>
			<a
				href="/admin/feedback"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow relative"
			>
				{#if feedbackOverview.overview.recent_24h > 0}
					<div class="absolute top-3 right-3">
						<span
							class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
						>
							+{feedbackOverview.overview.recent_24h} new
						</span>
					</div>
				{/if}
				<div class="flex items-center">
					<MessageSquare class="h-8 w-8 text-green-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Feedback
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Review user feedback</p>
					</div>
				</div>
			</a>
			<a
				href="/admin/llm-usage"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Zap class="h-8 w-8 text-yellow-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							LLM Usage
						</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							AI costs & performance
						</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/errors"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center">
						<XCircle class="h-8 w-8 text-red-600 mr-3" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Errors
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								System error logs
							</p>
						</div>
					</div>
					{#if errorsData.unresolved_errors > 0}
						<span class="text-2xl font-bold text-red-600">
							{errorsData.unresolved_errors}
						</span>
					{/if}
				</div>
			</a>

			{#if subscriptionData.stripeEnabled}
				<a
					href="/admin/subscriptions"
					class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
				>
					<div class="flex items-center">
						<CreditCard class="h-8 w-8 text-orange-600 mr-3" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Subscriptions
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">Manage billing</p>
						</div>
					</div>
				</a>

				<a
					href="/admin/revenue"
					class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
				>
					<div class="flex items-center">
						<DollarSign class="h-8 w-8 text-green-600 mr-3" />
						<div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Revenue
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Financial metrics
							</p>
						</div>
					</div>
				</a>
			{/if}
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
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
				{#each Array(12) as _}
					<div
						class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 animate-pulse"
					>
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
						<div class="h-6 sm:h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Errors Alert (if there are critical/unresolved errors) -->
			{#if errorsData.critical_errors > 0 || errorsData.unresolved_errors > 10}
				<div
					class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6"
				>
					<div class="flex items-start">
						<AlertTriangle class="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
						<div class="flex-1">
							<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
								System Errors Need Attention
							</h3>
							<div class="text-sm text-red-700 dark:text-red-300 mt-1 space-y-1">
								{#if errorsData.critical_errors > 0}
									<p>
										{errorsData.critical_errors} critical error{errorsData.critical_errors >
										1
											? 's'
											: ''} detected
									</p>
								{/if}
								<p>
									{errorsData.unresolved_errors} unresolved error{errorsData.unresolved_errors >
									1
										? 's'
										: ''} total
								</p>
								{#if errorsData.recent_errors_24h > 0}
									<p>{errorsData.recent_errors_24h} new in last 24 hours</p>
								{/if}
							</div>
							<a
								href="/admin/errors"
								class="inline-flex items-center text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-2"
							>
								View error logs
								<ExternalLink class="w-3 h-3 ml-1" />
							</a>
						</div>
					</div>
				</div>
			{/if}

			<!-- Key Metrics Cards - Mobile Responsive -->
			

			<!-- Row 2: System Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Active Users (7d)
							</p>
							<p
								class="text-xl sm:text-2xl lg:text-3xl font-bold text-green-600 mt-1"
							>
								{formatNumber(systemOverview.active_users_7d)}
							</p>
						</div>
						<Activity class="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						{systemOverview.total_users > 0
							? formatPercentage(
									(systemOverview.active_users_7d / systemOverview.total_users) *
										100
								)
							: '0%'} of total users
					</div>
				</div>
				<!-- Brain Dumps -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Brain Dumps ({selectedTimeframe})
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-600 mt-1">
								{formatNumber(comprehensiveAnalytics.brainDumpMetrics.total)}
							</p>
						</div>
						<FileText
							class="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						Avg {formatNumber(comprehensiveAnalytics.brainDumpMetrics.averageLength)} chars
					</div>
				</div>
				<!-- New Projects -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								New Projects ({selectedTimeframe})
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-orange-600 mt-1">
								{formatNumber(comprehensiveAnalytics.projectMetrics.newProjects)}
							</p>
						</div>
						<TrendingUp
							class="h-6 w-6 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						{formatNumber(comprehensiveAnalytics.projectMetrics.updatedProjects)} updated
					</div>
				</div>
				<!-- Total Briefs -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Briefs
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-cyan-600 mt-1">
								{formatNumber(systemOverview.total_briefs)}
							</p>
						</div>
						<BarChart3
							class="h-6 w-6 sm:h-8 sm:w-8 text-cyan-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						All time
					</div>
				</div>
				<!-- Calendar Connections -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Calendar Connections
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-600 mt-1">
								{formatNumber(comprehensiveAnalytics.calendarConnections)}
							</p>
						</div>
						<Globe
							class="h-6 w-6 sm:h-8 sm:w-8 text-amber-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						Users with calendar
					</div>
				</div>
			</div>

			<!-- Daily Visitors Chart -->
			<div class="mb-6 sm:mb-8">
				<VisitorContributionChart
					visitors={dailyVisitors}
					signups={dailySignups}
					{isLoading}
				/>
			</div>

			<!-- Brain Dump Analytics Section -->
			<div class="mb-6 sm:mb-8">
				<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
					Brain Dump Analytics <span
						class="text-sm font-normal text-gray-600 dark:text-gray-400"
						>({selectedTimeframe === '7d'
							? 'Last 7 Days'
							: selectedTimeframe === '30d'
								? 'Last 30 Days'
								: 'Last 90 Days'})</span
					>
				</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
					<!-- Total Brain Dumps -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
									Brain Dumps ({selectedTimeframe})
								</p>
								<p
									class="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-600 mt-1"
								>
									{formatNumber(comprehensiveAnalytics.brainDumpMetrics.total)}
								</p>
							</div>
							<FileText
								class="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600 flex-shrink-0 ml-3"
							/>
						</div>
						<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							{selectedTimeframe === '7d'
								? 'Past week'
								: selectedTimeframe === '30d'
									? 'Past month'
									: 'Past 90 days'}
						</div>
					</div>

					<!-- Average Length -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
									Avg Length ({selectedTimeframe})
								</p>
								<p
									class="text-xl sm:text-2xl lg:text-3xl font-bold text-cyan-600 mt-1"
								>
									{formatNumber(
										comprehensiveAnalytics.brainDumpMetrics.averageLength
									)}
								</p>
							</div>
							<Eye class="h-6 w-6 sm:h-8 sm:w-8 text-cyan-600 flex-shrink-0 ml-3" />
						</div>
						<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							Characters
						</div>
					</div>

					<!-- New Projects -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
									New Projects ({selectedTimeframe})
								</p>
								<p
									class="text-xl sm:text-2xl lg:text-3xl font-bold text-green-600 mt-1"
								>
									{formatNumber(
										comprehensiveAnalytics.projectMetrics.newProjects
									)}
								</p>
							</div>
							<TrendingUp
								class="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0 ml-3"
							/>
						</div>
						<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							{selectedTimeframe === '7d'
								? 'Past 7 days'
								: selectedTimeframe === '30d'
									? 'Past 30 days'
									: 'Past 90 days'}
						</div>
					</div>

					<!-- Project Updates -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
									Project Updates ({selectedTimeframe})
								</p>
								<p
									class="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mt-1"
								>
									{formatNumber(
										comprehensiveAnalytics.projectMetrics.updatedProjects
									)}
								</p>
							</div>
							<RefreshCw
								class="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0 ml-3"
							/>
						</div>
						<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							{selectedTimeframe === '7d'
								? 'Past 7 days'
								: selectedTimeframe === '30d'
									? 'Past 30 days'
									: 'Past 90 days'}
						</div>
					</div>

					<!-- Calendar Connections -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
									Calendar Connected
								</p>
								<p
									class="text-xl sm:text-2xl lg:text-3xl font-bold text-orange-600 mt-1"
								>
									{formatNumber(comprehensiveAnalytics.calendarConnections)}
								</p>
							</div>
							<Globe
								class="h-6 w-6 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0 ml-3"
							/>
						</div>
						<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							Users
						</div>
					</div>
				</div>
			</div>

			<!-- User Leaderboards -->
			<div class="mb-6 sm:mb-8">
				<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
					User Activity Leaderboards <span
						class="text-sm font-normal text-gray-600 dark:text-gray-400"
						>({selectedTimeframe === '7d'
							? 'Last 7 Days'
							: selectedTimeframe === '30d'
								? 'Last 30 Days'
								: 'Last 90 Days'})</span
					>
				</h2>

				<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
					<!-- Brain Dumps Leaderboard -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white">
								Top Brain Dumpers
							</h3>
							<FileText class="h-5 w-5 text-indigo-600" />
						</div>
						{#if comprehensiveAnalytics.leaderboards.brainDumps.length > 0}
							<div class="space-y-2">
								{#each comprehensiveAnalytics.leaderboards.brainDumps as user, index}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<span class="text-xs font-semibold text-gray-500 w-6">
												#{index + 1}
											</span>
											<span
												class="text-sm text-gray-900 dark:text-white truncate max-w-[150px]"
											>
												{user.email}
											</span>
										</div>
										<span class="text-sm font-bold text-indigo-600">
											{user.count}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-center py-4 text-sm">No data available</p>
						{/if}
					</div>

					<!-- Project Updates Leaderboard -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white">
								Top Project Updaters
							</h3>
							<RefreshCw class="h-5 w-5 text-blue-600" />
						</div>
						{#if comprehensiveAnalytics.leaderboards.projectUpdates.length > 0}
							<div class="space-y-2">
								{#each comprehensiveAnalytics.leaderboards.projectUpdates as user, index}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<span class="text-xs font-semibold text-gray-500 w-6">
												#{index + 1}
											</span>
											<span
												class="text-sm text-gray-900 dark:text-white truncate max-w-[150px]"
											>
												{user.email}
											</span>
										</div>
										<span class="text-sm font-bold text-blue-600">
											{user.count}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-center py-4 text-sm">No data available</p>
						{/if}
					</div>

					<!-- Tasks Created Leaderboard -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white">
								Top Task Creators
							</h3>
							<Activity class="h-5 w-5 text-green-600" />
						</div>
						{#if comprehensiveAnalytics.leaderboards.tasksCreated.length > 0}
							<div class="space-y-2">
								{#each comprehensiveAnalytics.leaderboards.tasksCreated as user, index}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<span class="text-xs font-semibold text-gray-500 w-6">
												#{index + 1}
											</span>
											<span
												class="text-sm text-gray-900 dark:text-white truncate max-w-[150px]"
											>
												{user.email}
											</span>
										</div>
										<span class="text-sm font-bold text-green-600">
											{user.count}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-center py-4 text-sm">No data available</p>
						{/if}
					</div>

					<!-- Tasks Scheduled Leaderboard -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white">
								Top Task Schedulers
							</h3>
							<Globe class="h-5 w-5 text-orange-600" />
						</div>
						{#if comprehensiveAnalytics.leaderboards.tasksScheduled.length > 0}
							<div class="space-y-2">
								{#each comprehensiveAnalytics.leaderboards.tasksScheduled as user, index}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<span class="text-xs font-semibold text-gray-500 w-6">
												#{index + 1}
											</span>
											<span
												class="text-sm text-gray-900 dark:text-white truncate max-w-[150px]"
											>
												{user.email}
											</span>
										</div>
										<span class="text-sm font-bold text-orange-600">
											{user.count}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-center py-4 text-sm">No data available</p>
						{/if}
					</div>

					<!-- Phases Created Leaderboard -->
					<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white">
								Top Phase Creators
							</h3>
							<TrendingUp class="h-5 w-5 text-purple-600" />
						</div>
						{#if comprehensiveAnalytics.leaderboards.phasesCreated.length > 0}
							<div class="space-y-2">
								{#each comprehensiveAnalytics.leaderboards.phasesCreated as user, index}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<span class="text-xs font-semibold text-gray-500 w-6">
												#{index + 1}
											</span>
											<span
												class="text-sm text-gray-900 dark:text-white truncate max-w-[150px]"
											>
												{user.email}
											</span>
										</div>
										<span class="text-sm font-bold text-purple-600">
											{user.count}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-gray-500 text-center py-4 text-sm">No data available</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Subscription Overview (if Stripe is enabled) -->
			{#if subscriptionData.stripeEnabled}
				<div class="mb-6 sm:mb-8">
					<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4">
						Subscription Analytics
					</h2>

					<!-- Revenue Metrics -->
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
						<!-- MRR -->
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
										Monthly Recurring Revenue
									</p>
									<p
										class="text-xl sm:text-2xl lg:text-3xl font-bold text-green-600 mt-1"
									>
										${subscriptionData.revenue.current_mrr.toFixed(2)}
									</p>
								</div>
								<DollarSign
									class="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0 ml-3"
								/>
							</div>
							<div class="mt-2 flex items-center text-xs sm:text-sm">
								{#if subscriptionData.revenue.mrr_growth > 0}
									<TrendingUp class="w-4 h-4 text-green-500 mr-1" />
									<span class="text-green-600"
										>+{subscriptionData.revenue.mrr_growth.toFixed(1)}%</span
									>
								{:else if subscriptionData.revenue.mrr_growth < 0}
									<TrendingDown class="w-4 h-4 text-red-500 mr-1" />
									<span class="text-red-600"
										>{subscriptionData.revenue.mrr_growth.toFixed(1)}%</span
									>
								{:else}
									<span class="text-gray-500">No change</span>
								{/if}
								<span class="text-gray-500 ml-2">vs last month</span>
							</div>
						</div>

						<!-- Active Subscriptions -->
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
										Active Subscriptions
									</p>
									<p
										class="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mt-1"
									>
										{formatNumber(
											subscriptionData.overview.active_subscriptions
										)}
									</p>
								</div>
								<CreditCard
									class="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0 ml-3"
								/>
							</div>
							<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
								{subscriptionData.overview.trial_subscriptions} in trial
							</div>
						</div>

						<!-- Churn Rate -->
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
										Churn Rate
									</p>
									<p
										class="text-xl sm:text-2xl lg:text-3xl font-bold text-orange-600 mt-1"
									>
										{subscriptionData.revenue.churn_rate.toFixed(1)}%
									</p>
								</div>
								<TrendingDown
									class="h-6 w-6 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0 ml-3"
								/>
							</div>
							<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
								Last 30 days
							</div>
						</div>

						<!-- ARPU -->
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
										Avg Revenue Per User
									</p>
									<p
										class="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-600 mt-1"
									>
										${subscriptionData.revenue.average_revenue_per_user.toFixed(
											2
										)}
									</p>
								</div>
								<Users
									class="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 flex-shrink-0 ml-3"
								/>
							</div>
							<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
								Per month
							</div>
						</div>
					</div>

					<!-- Failed Payments Alert -->
					{#if subscriptionData.failedPayments.length > 0}
						<div
							class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6"
						>
							<div class="flex items-start">
								<AlertTriangle
									class="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0"
								/>
								<div class="flex-1">
									<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
										Failed Payments Require Attention
									</h3>
									<p class="text-sm text-red-700 dark:text-red-300 mt-1">
										{subscriptionData.failedPayments.length} payment{subscriptionData
											.failedPayments.length > 1
											? 's'
											: ''} failed in the last 30 days
									</p>
									<a
										href="/admin/subscriptions"
										class="inline-flex items-center text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-2"
									>
										View details
										<ExternalLink class="w-3 h-3 ml-1" />
									</a>
								</div>
							</div>
						</div>
					{/if}

					<!-- Recent Subscription Changes -->
					{#if subscriptionData.recentChanges.length > 0}
						<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
								Recent Subscription Activity
							</h3>
							<div class="space-y-3">
								{#each subscriptionData.recentChanges.slice(0, 5) as change}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
									>
										<div class="flex items-center space-x-3">
											<div class="flex-shrink-0">
												{#if change.status === 'active'}
													<div
														class="w-2 h-2 bg-green-500 rounded-full"
													></div>
												{:else if change.status === 'canceled'}
													<div
														class="w-2 h-2 bg-red-500 rounded-full"
													></div>
												{:else if change.status === 'trialing'}
													<div
														class="w-2 h-2 bg-blue-500 rounded-full"
													></div>
												{:else}
													<div
														class="w-2 h-2 bg-gray-500 rounded-full"
													></div>
												{/if}
											</div>
											<div>
												<p
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													{change.users?.email || 'Unknown User'}
												</p>
												<p class="text-xs text-gray-500 dark:text-gray-400">
													{change.subscription_plans?.name} - {change.status}
												</p>
											</div>
										</div>
										<div class="text-right">
											<p class="text-sm text-gray-600 dark:text-gray-400">
												${(change.subscription_plans?.price / 100).toFixed(
													2
												)}/{change.subscription_plans?.interval}
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												{new Date(change.updated_at).toLocaleDateString()}
											</p>
										</div>
									</div>
								{/each}
							</div>
							<div class="mt-4">
								<a
									href="/admin/subscriptions"
									class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
								>
									View all subscription activity →
								</a>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Feedback Overview -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
				<!-- Total Feedback -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Total Feedback
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 mt-1">
								{formatNumber(feedbackOverview.overview.total_feedback)}
							</p>
						</div>
						<MessageSquare
							class="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						{feedbackOverview.overview.recent_24h} in last 24h
					</div>
				</div>

				<!-- Unresolved Feedback -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Unresolved
							</p>
							<p class="text-xl sm:text-2xl lg:text-3xl font-bold text-red-600 mt-1">
								{formatNumber(feedbackOverview.overview.unresolved_count)}
							</p>
						</div>
						<AlertCircle
							class="h-6 w-6 sm:h-8 sm:w-8 text-red-600 flex-shrink-0 ml-3"
						/>
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						Need attention
					</div>
				</div>

				<!-- Average Rating -->
				<div
					class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 sm:col-span-2 lg:col-span-1"
				>
					<div class="flex items-center justify-between">
						<div class="flex-1">
							<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
								Avg Rating
							</p>
							<p
								class="text-xl sm:text-2xl lg:text-3xl font-bold text-yellow-600 mt-1"
							>
								{feedbackOverview.overview.average_rating}/5
							</p>
						</div>
						<Star class="h-6 w-6 sm:h-8 sm:w-8 text-yellow-600 flex-shrink-0 ml-3" />
					</div>
					<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
						User satisfaction
					</div>
				</div>
			</div>

			<!-- Charts and Analytics - Mobile Responsive -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
				<!-- Daily Active Users Chart -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Daily Active Users <span
							class="text-sm font-normal text-gray-600 dark:text-gray-400"
							>({selectedTimeframe === '7d'
								? 'Last 7 Days'
								: selectedTimeframe === '30d'
									? 'Last 30 Days'
									: 'Last 90 Days'})</span
						>
					</h3>
					{#if dailyActiveUsers.length > 0}
						<div class="space-y-2">
							{#each dailyActiveUsers.slice(-10) as day}
								<div class="flex items-center justify-between">
									<span
										class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate"
									>
										{new Date(day.date).toLocaleDateString()}
									</span>
									<div class="flex items-center ml-2">
										<div
											class="w-20 sm:w-32 bg-gray-200 rounded-full h-2 mr-2 sm:mr-3 dark:bg-gray-700"
										>
											<div
												class="bg-blue-600 h-2 rounded-full transition-all duration-300"
												style="width: {Math.min(
													(day.active_users /
														Math.max(
															...dailyActiveUsers.map(
																(d) => d.active_users
															)
														)) *
														100,
													100
												)}%"
											></div>
										</div>
										<span
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white"
										>
											{day.active_users}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No data available</p>
					{/if}
				</div>

				<!-- Feedback Category Breakdown -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Feedback Categories
						</h3>
						<a
							href="/admin/feedback"
							class="text-blue-600 hover:text-blue-700 text-sm flex items-center"
						>
							<span class="hidden sm:inline">View All</span>
							<ExternalLink class="ml-1 h-4 w-4" />
						</a>
					</div>
					{#if Object.keys(feedbackOverview.category_breakdown).length > 0}
						<div class="space-y-3">
							{#each Object.entries(feedbackOverview.category_breakdown) as [category, count]}
								<div class="flex items-center justify-between">
									<div class="flex items-center flex-1 min-w-0">
										<span
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white capitalize truncate"
										>
											{category}
										</span>
									</div>
									<div class="flex items-center ml-2">
										<div
											class="w-16 sm:w-20 bg-gray-200 rounded-full h-2 mr-2 dark:bg-gray-700"
										>
											<div
												class="bg-blue-600 h-2 rounded-full transition-all duration-300"
												style="width: {Math.min(
													(count /
														Math.max(
															...Object.values(
																feedbackOverview.category_breakdown
															)
														)) *
														100,
													100
												)}%"
											></div>
										</div>
										<span
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white w-6 sm:w-8 text-right"
										>
											{count}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No feedback data</p>
					{/if}
				</div>
			</div>

			<!-- Recent Content - Mobile Responsive -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
				<!-- Recent Feedback -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Recent Feedback
						</h3>
						<a
							href="/admin/feedback"
							class="text-blue-600 hover:text-blue-700 text-sm flex items-center"
						>
							<span class="hidden sm:inline">View All</span>
							<ExternalLink class="ml-1 h-4 w-4" />
						</a>
					</div>
					{#if feedbackOverview.recent_feedback.length > 0}
						<div class="space-y-3">
							{#each feedbackOverview.recent_feedback as feedback}
								<div class="border-l-4 border-blue-200 pl-3 sm:pl-4 py-2">
									<div class="flex items-center justify-between mb-1">
										<span
											class="text-xs sm:text-sm font-medium {getCategoryColor(
												feedback.category
											)} capitalize"
										>
											{feedback.category}
										</span>
										<span class="text-xs text-gray-500">
											{new Date(feedback.created_at).toLocaleDateString()}
										</span>
									</div>
									<p
										class="text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2"
									>
										{feedback.feedback_text.substring(0, 100)}...
									</p>
									<div class="flex items-center justify-between mt-1">
										<span class="text-xs text-gray-500 truncate">
											{feedback.user_email || 'Anonymous'}
										</span>
										{#if feedback.rating}
											<div class="flex items-center ml-2">
												<Star class="h-3 w-3 text-yellow-500 mr-1" />
												<span class="text-xs text-gray-600"
													>{feedback.rating}/5</span
												>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No recent feedback</p>
					{/if}
				</div>

				<!-- Beta Program Activity -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Beta Program Activity
						</h3>
						<a
							href="/admin/beta"
							class="text-blue-600 hover:text-blue-700 text-sm flex items-center"
						>
							<span class="hidden sm:inline">Manage</span>
							<ExternalLink class="ml-1 h-4 w-4" />
						</a>
					</div>
					{#if betaOverview.recent_activity.length > 0}
						<div class="space-y-3">
							{#each betaOverview.recent_activity as activity}
								<div class="flex items-start space-x-3">
									{#if activity.type === 'signup'}
										<UserPlus
											class="h-4 w-4 text-blue-500 flex-shrink-0 mt-1"
										/>
									{:else}
										<MessageSquare
											class="h-4 w-4 text-green-500 flex-shrink-0 mt-1"
										/>
									{/if}
									<div class="flex-1 min-w-0">
										{#if activity.type === 'signup'}
											<div
												class="text-xs sm:text-sm text-gray-900 dark:text-white"
											>
												<span class="font-medium truncate"
													>{activity.user}</span
												>
												signed up for beta
											</div>
											<div class="text-xs text-gray-500 capitalize">
												Status: {activity.status}
											</div>
										{:else}
											<div
												class="text-xs sm:text-sm text-gray-900 dark:text-white"
											>
												New {activity.feedback_type} feedback
											</div>
											<div class="text-xs text-gray-500 capitalize">
												Status: {activity.status}
											</div>
										{/if}
									</div>
									<div class="text-xs text-gray-500 flex-shrink-0">
										{new Date(activity.created_at).toLocaleDateString()}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No recent beta activity</p>
					{/if}
				</div>
			</div>

			<!-- System Health and Template Usage -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
				<!-- System Health Metrics -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<h3
						class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
					>
						<Zap class="mr-2 h-5 w-5 text-yellow-600" />
						System Health
					</h3>
					{#if systemMetrics.length > 0}
						<div class="space-y-4">
							{#each systemMetrics as metric}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{metric.metric_description || metric.metric_name}
										</div>
										<div class="text-xs text-gray-500">
											Last updated: {new Date(
												metric.recorded_at
											).toLocaleString()}
										</div>
									</div>
									<div class="text-right ml-2">
										<div
											class="text-sm sm:text-lg font-bold {getSystemHealthColor(
												metric.metric_value,
												metric.metric_unit
											)}"
										>
											{metric.metric_value}{metric.metric_unit ===
											'percentage'
												? '%'
												: ''}
											{metric.metric_unit === 'milliseconds' ? 'ms' : ''}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No metrics available</p>
					{/if}
				</div>

				<!-- Template Usage -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Template Usage
					</h3>
					{#if templateUsageStats.length > 0}
						<div class="space-y-3">
							{#each templateUsageStats.slice(0, 8) as template}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{template.template_name}
										</div>
										<div class="text-xs text-gray-500 capitalize">
											{template.template_type} template
										</div>
									</div>
									<div class="flex items-center ml-2">
										<div
											class="w-12 sm:w-16 bg-gray-200 rounded-full h-2 mr-2 dark:bg-gray-700"
										>
											<div
												class="bg-green-600 h-2 rounded-full transition-all duration-300"
												style="width: {Math.min(
													(template.usage_count /
														Math.max(
															...templateUsageStats.map(
																(t) => t.usage_count
															)
														)) *
														100,
													100
												)}%"
											></div>
										</div>
										<span
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white w-6 sm:w-8 text-right"
										>
											{template.usage_count}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No template usage data</p>
					{/if}
				</div>
			</div>

			<!-- Top Active Users and Recent Activity -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
				<!-- Top Active Users -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Top Active Users <span
								class="text-sm font-normal text-gray-600 dark:text-gray-400"
								>({selectedTimeframe === '7d'
									? 'Last 7 Days'
									: selectedTimeframe === '30d'
										? 'Last 30 Days'
										: 'Last 90 Days'})</span
							>
						</h3>
						<a
							href="/admin/users"
							class="text-blue-600 hover:text-blue-700 text-sm flex items-center"
						>
							<span class="hidden sm:inline">View All</span>
							<ExternalLink class="ml-1 h-4 w-4" />
						</a>
					</div>
					{#if systemOverview.top_active_users && systemOverview.top_active_users.length > 0}
						<div class="space-y-3">
							{#each systemOverview.top_active_users.slice(0, 8) as user}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{user.email}
										</div>
										<div class="text-xs text-gray-500">
											Last brief: {user.last_brief
												? new Date(user.last_brief).toLocaleDateString()
												: 'Never'}
										</div>
									</div>
									<div class="text-xs sm:text-sm font-medium text-blue-600 ml-2">
										{user.brief_count} briefs
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No active users data</p>
					{/if}
				</div>

				<!-- Recent Activity -->
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Recent Activity
					</h3>
					{#if recentActivity.length > 0}
						<div class="space-y-3">
							{#each recentActivity.slice(0, 8) as activity}
								<div class="flex items-start space-x-3">
									<svelte:component
										this={getActivityIcon(activity.activity_type)}
										class="h-4 w-4 text-gray-400 flex-shrink-0 mt-1"
									/>
									<div class="flex-1 min-w-0">
										<div
											class="text-xs sm:text-sm text-gray-900 dark:text-white"
										>
											<span class="font-medium truncate"
												>{activity.user_email}</span
											>
											{activity.activity_type.replace('_', ' ')}
										</div>
										<div class="text-xs text-gray-500">
											{new Date(activity.created_at).toLocaleString()}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-gray-500 text-center py-8">No recent activity</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
