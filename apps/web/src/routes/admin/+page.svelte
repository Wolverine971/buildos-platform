<!-- apps/web/src/routes/admin/+page.svelte -->
<script lang="ts">
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
		XCircle,
		Bell,
		Workflow,
		GitBranch
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminStatCard from '$lib/components/admin/AdminStatCard.svelte';
	import AdminNavCard from '$lib/components/admin/AdminNavCard.svelte';
	import AdminCollapsibleSection from '$lib/components/admin/AdminCollapsibleSection.svelte';
	import VisitorContributionChart from '$lib/components/analytics/VisitorContributionChart.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ComponentType } from 'svelte';

	import { browser } from '$app/environment';
	import type { DashboardAnalyticsPayload } from '$lib/services/admin/dashboard-analytics.service';
	import { onDestroy } from 'svelte';

	// Type definitions for better type safety
	type Tone = 'success' | 'info' | 'brand' | 'muted' | 'warning' | 'danger' | 'default';
	type MetricCard = {
		label: string;
		value: number | string;
		icon: ComponentType;
		tone: Tone;
		footnote?: string;
		suffix?: string;
		change?: number;
		changeDirection?: string;
		changeLabel?: string;
	};
	type NavCard = {
		title: string;
		description: string;
		href: string;
		icon: ComponentType;
		stat?: string | null;
		badge?: string | null;
		meta?: string;
		compact?: boolean;
	};
	type LeaderboardEntry = { email: string; count: number };
	type BetaActivityItem = {
		type: 'signup' | 'feedback';
		user?: string | null;
		status?: string | null;
		created_at: string | null;
		feedback_type?: string | null;
	};
	type FeedbackItem = {
		id: string;
		category: string;
		feedback_text: string | null;
		rating: number | null;
		status: string | null;
		user_email: string | null;
		created_at: string;
	};
	type SubscriptionChange = {
		id: string;
		status: string;
		users?: { email: string } | null;
		subscription_plans?: {
			name: string;
			price_cents: number;
			billing_interval: string | null;
		} | null;
		updated_at: string | null;
	};
	type TopActiveUser = { email: string; last_brief?: string | null; brief_count: number };

	let { data } = $props();
	const initialDashboard = (data?.initialDashboard ?? null) as DashboardAnalyticsPayload | null;
	const defaultTimeframe = (data?.defaultTimeframe ?? '30d') as '7d' | '30d' | '90d';
	const loadErrorFromServer = data?.loadError as string | undefined;

	let isLoading = $state(initialDashboard ? false : true);
	let error = $state<string | null>(loadErrorFromServer ?? null);
	type Timeframe = '7d' | '30d' | '90d';

	let selectedTimeframe = $state<Timeframe>(defaultTimeframe);
	let autoRefresh = $state(false);

	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	let currentRequest: AbortController | null = null;

	// Analytics data
	let systemOverview = $state({
		total_users: 0,
		active_users_7d: 0,
		active_users_30d: 0,
		total_briefs: 0,
		avg_brief_length: 0,
		top_active_users: []
	});

	// Comprehensive analytics data
	let comprehensiveAnalytics = $state<{
		userMetrics: {
			totalUsers: number;
			totalBetaUsers: number;
			newUsersLast24h: number;
			newBetaSignupsLast24h: number;
		};
		brainDumpMetrics: { total: number; averageLength: number; uniqueUsers: number };
		projectMetrics: { newProjects: number; updatedProjects: number; uniqueUsers: number };
		calendarConnections: number;
		leaderboards: {
			brainDumps: LeaderboardEntry[];
			projectUpdates: LeaderboardEntry[];
			tasksCreated: LeaderboardEntry[];
			tasksScheduled: LeaderboardEntry[];
			phasesCreated: LeaderboardEntry[];
		};
	}>({
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
	});

	let dailyActiveUsers = $state<Array<{ date: string; active_users: number }>>([]);
	let briefGenerationStats = $state<
		Array<{
			date: string;
			total_briefs: number;
			unique_users: number;
			avg_briefs_per_user: number;
		}>
	>([]);
	let systemMetrics = $state<
		Array<{
			metric_name: string;
			metric_value: number;
			metric_unit: string | null;
			metric_description: string | null;
			recorded_at: string | null;
		}>
	>([]);
	let recentActivity = $state<
		Array<{
			entity_type: string;
			action: string;
			source: 'ontology' | 'user_activity';
			user_email: string;
			created_at: string;
			project_name?: string | null;
			entity_name?: string | null;
		}>
	>([]);
	let agentChatUsage = $state({
		totalSessions: 0,
		totalMessages: 0,
		totalTokens: 0,
		avgMessagesPerSession: 0,
		avgTokensPerSession: 0,
		plannerSessions: 0,
		executorSessions: 0,
		failedSessions: 0,
		failureRate: 0
	});
	let briefDelivery = $state({
		briefsGenerated: 0,
		ontologyBriefs: 0,
		legacyBriefs: 0,
		emailOptIn: 0,
		smsOptIn: 0,
		emailSent: 0,
		emailDelivered: 0,
		smsSent: 0,
		smsDelivered: 0
	});
	let systemHealth = $state({
		llmLatencyMs: {} as Record<string, number>,
		queueDepth: 0,
		oldestJobSeconds: 0,
		failedJobs24h: 0,
		agentFailureRate: 0,
		errorCount24h: 0,
		lastUpdated: null as string | null
	});

	// Feedback data
	let feedbackOverview = $state<{
		overview: {
			total_feedback: number;
			recent_24h: number;
			unresolved_count: number;
			average_rating: number;
		};
		category_breakdown: Record<string, number>;
		status_breakdown: Record<string, number>;
		recent_feedback: FeedbackItem[];
	}>({
		overview: {
			total_feedback: 0,
			recent_24h: 0,
			unresolved_count: 0,
			average_rating: 0
		},
		category_breakdown: {},
		status_breakdown: {},
		recent_feedback: []
	});

	// Beta program data
	let betaOverview = $state<{
		signups: {
			total: number;
			pending: number;
			approved: number;
			declined: number;
			waitlist: number;
			recent_24h: number;
		};
		members: {
			total: number;
			active_30d: number;
			tier_breakdown: Record<string, number>;
			total_feedback: number;
		};
		recent_activity: BetaActivityItem[];
	}>({
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
	});

	// Errors data
	let errorsData = $state({
		total_errors: 0,
		unresolved_errors: 0,
		critical_errors: 0,
		recent_errors_24h: 0,
		error_trend: 0
	});

	// Subscription data
	let subscriptionData = $state<{
		overview: {
			total_subscribers: number;
			active_subscriptions: number;
			trial_subscriptions: number;
			canceled_subscriptions: number;
			paused_subscriptions: number;
			mrr: number;
			arr: number;
		};
		revenue: {
			current_mrr: number;
			previous_mrr: number;
			mrr_growth: number;
			total_revenue: number;
			average_revenue_per_user: number;
			churn_rate: number;
			lifetime_value: number;
		};
		recentChanges: SubscriptionChange[];
		failedPayments: unknown[];
		discountUsage: unknown[];
		stripeEnabled: boolean;
	}>({
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
	});

	let visitorOverview = $state({
		total_visitors: 0,
		visitors_7d: 0,
		visitors_30d: 0,
		unique_visitors_today: 0
	});

	let dailyVisitors = $state<Array<{ date: string; visitor_count: number }>>([]);
	let dailySignups = $state<Array<{ date: string; signup_count: number }>>([]);

	const timeframeDisplayMap: Record<Timeframe, string> = {
		'7d': 'Last 7 Days',
		'30d': 'Last 30 Days',
		'90d': 'Last 90 Days'
	};

	const timeframeRelativeMap: Record<Timeframe, string> = {
		'7d': 'Past 7 days',
		'30d': 'Past 30 days',
		'90d': 'Past 90 days'
	};

	let timeframeRangeLabel = $derived(timeframeDisplayMap[selectedTimeframe]);
	let timeframeRelativeLabel = $derived(timeframeRelativeMap[selectedTimeframe]);

	let navCards = $derived.by(() => {
		const cards = [
			{
				title: 'Users',
				description: 'Manage user accounts',
				href: '/admin/users',
				icon: Users,
				stat:
					comprehensiveAnalytics.userMetrics.totalUsers > 0
						? formatNumber(comprehensiveAnalytics.userMetrics.totalUsers)
						: null,
				badge:
					comprehensiveAnalytics.userMetrics.newUsersLast24h > 0
						? `+${comprehensiveAnalytics.userMetrics.newUsersLast24h} new`
						: null
			},
			{
				title: 'Notifications',
				description: 'Analytics & testing',
				href: '/admin/notifications',
				icon: Bell
			},
			{
				title: 'Ontology Graph',
				description: 'Visualize relationships',
				href: '/admin/ontology/graph',
				icon: Workflow
			},
			{
				title: 'Ontology Migration',
				description: 'Project/task migrations',
				href: '/admin/migration',
				icon: GitBranch
			},
			{
				title: 'Chat Monitoring',
				description: 'AI chat analytics',
				href: '/admin/chat',
				icon: MessageSquare
			},
			{
				title: 'Beta Program',
				description: 'Manage beta members',
				href: '/admin/beta',
				icon: UserCheck,
				stat:
					comprehensiveAnalytics.userMetrics.totalBetaUsers > 0
						? formatNumber(comprehensiveAnalytics.userMetrics.totalBetaUsers)
						: null,
				badge:
					comprehensiveAnalytics.userMetrics.newBetaSignupsLast24h > 0
						? `+${comprehensiveAnalytics.userMetrics.newBetaSignupsLast24h} new`
						: null
			},
			{
				title: 'Feedback',
				description: 'Review user feedback',
				href: '/admin/feedback',
				icon: MessageSquare,
				badge:
					feedbackOverview.overview.recent_24h > 0
						? `+${feedbackOverview.overview.recent_24h} new`
						: null
			},
			{
				title: 'LLM Usage',
				description: 'AI costs & performance',
				href: '/admin/llm-usage',
				icon: Zap
			},
			{
				title: 'Errors',
				description: 'System error logs',
				href: '/admin/errors',
				icon: XCircle,
				stat:
					errorsData.unresolved_errors > 0
						? formatNumber(errorsData.unresolved_errors)
						: null
			}
		];

		if (subscriptionData.stripeEnabled) {
			cards.push(
				{
					title: 'Subscriptions',
					description: 'Manage billing',
					href: '/admin/subscriptions',
					icon: CreditCard,
					stat:
						subscriptionData.overview.active_subscriptions > 0
							? formatNumber(subscriptionData.overview.active_subscriptions)
							: null
				},
				{
					title: 'Revenue',
					description: 'Financial metrics',
					href: '/admin/revenue',
					icon: DollarSign
				}
			);
		}

		return cards;
	});

	let primaryMetrics = $derived.by(() => {
		const cards: any[] = [
			{
				label: 'Active Users · 7d',
				value: systemOverview.active_users_7d,
				icon: Activity,
				tone: 'success' as const,
				footnote:
					systemOverview.total_users > 0
						? `${formatPercentage(
								(systemOverview.active_users_7d / systemOverview.total_users) * 100
							)} of total`
						: '0% of total'
			},
			{
				label: `Agent Conversations · ${timeframeRangeLabel}`,
				value: agentChatUsage.totalSessions,
				icon: MessageSquare,
				tone: 'info' as const,
				footnote: `Avg ${formatNumber(agentChatUsage.avgMessagesPerSession)} msgs/session`
			},
			{
				label: `Tokens · ${timeframeRangeLabel}`,
				value: agentChatUsage.totalTokens,
				icon: Zap,
				tone: 'brand' as const,
				footnote: `Avg ${formatNumber(agentChatUsage.avgTokensPerSession)} per session`
			},
			{
				label: `Briefs Generated · ${timeframeRangeLabel}`,
				value: briefDelivery.briefsGenerated,
				icon: BarChart3,
				tone: 'warning' as const,
				footnote: `${formatNumber(briefDelivery.emailSent)} email / ${formatNumber(briefDelivery.smsSent)} sms`
			},
			{
				label: 'System Health',
				value: systemHealth.queueDepth,
				icon: Activity,
				tone: 'muted' as const,
				footnote: `Queue depth • ${formatNumber(systemHealth.failedJobs24h)} failed (24h)`
			}
		];
		return cards;
	});

	let agentUsageCards = $derived.by(() => {
		const cards: any[] = [
			{
				label: `Agent Conversations · ${timeframeRangeLabel}`,
				value: agentChatUsage.totalSessions,
				icon: MessageSquare,
				tone: 'info' as const,
				footnote: timeframeRelativeLabel
			},
			{
				label: `Messages · ${timeframeRangeLabel}`,
				value: agentChatUsage.totalMessages,
				icon: Eye,
				tone: 'muted' as const,
				footnote: `Avg ${formatNumber(agentChatUsage.avgMessagesPerSession)} per session`
			},
			{
				label: `Tokens · ${timeframeRangeLabel}`,
				value: agentChatUsage.totalTokens,
				icon: Zap,
				tone: 'brand' as const,
				footnote: `Avg ${formatNumber(agentChatUsage.avgTokensPerSession)} per session`
			},
			{
				label: `Planner / Executor`,
				value: `${formatNumber(agentChatUsage.plannerSessions)} / ${formatNumber(agentChatUsage.executorSessions)}`,
				icon: Workflow,
				tone: 'success' as const,
				footnote: `${formatPercentage(agentChatUsage.failureRate)} failure rate`
			}
		];
		return cards;
	});

	type LeaderboardKey =
		| 'brainDumps'
		| 'projectUpdates'
		| 'tasksCreated'
		| 'tasksScheduled'
		| 'phasesCreated';

	const leaderboardConfigs: Array<{
		key: LeaderboardKey;
		title: string;
		icon: ComponentType;
		accent: string;
	}> = [
		{
			key: 'brainDumps',
			title: 'Top Brain Dumpers',
			icon: FileText,
			accent: 'text-indigo-600'
		},
		{
			key: 'projectUpdates',
			title: 'Top Project Updaters',
			icon: RefreshCw,
			accent: 'text-accent'
		},
		{
			key: 'tasksCreated',
			title: 'Top Task Creators',
			icon: Activity,
			accent: 'text-green-600'
		},
		{
			key: 'tasksScheduled',
			title: 'Top Task Schedulers',
			icon: Globe,
			accent: 'text-orange-600'
		},
		{
			key: 'phasesCreated',
			title: 'Top Phase Creators',
			icon: TrendingUp,
			accent: 'text-purple-600'
		}
	];

	let subscriptionMetricCards = $derived.by(() => {
		const cards: any[] = [
			{
				label: 'Monthly Recurring Revenue',
				value: formatCurrency(subscriptionData.revenue.current_mrr),
				icon: DollarSign,
				tone: 'success' as const,
				change: Math.abs(subscriptionData.revenue.mrr_growth),
				changeDirection:
					subscriptionData.revenue.mrr_growth > 0
						? 'up'
						: subscriptionData.revenue.mrr_growth < 0
							? 'down'
							: 'neutral',
				changeLabel: 'vs last month'
			},
			{
				label: 'Active Subscriptions',
				value: subscriptionData.overview.active_subscriptions,
				icon: CreditCard,
				tone: 'brand' as const,
				footnote: `${formatNumber(subscriptionData.overview.trial_subscriptions)} in trial`
			},
			{
				label: 'Churn Rate',
				value: Number(subscriptionData.revenue.churn_rate.toFixed(1)),
				icon: TrendingDown,
				tone: 'warning' as const,
				suffix: '%',
				footnote: 'Last 30 days'
			},
			{
				label: 'Average Revenue / User',
				value: formatCurrency(subscriptionData.revenue.average_revenue_per_user),
				icon: DollarSign,
				tone: 'muted' as const,
				footnote: 'Trailing 30 days'
			}
		];
		return cards;
	});

	let feedbackMetricCards = $derived.by(() => {
		const cards: any[] = [
			{
				label: 'Total Feedback',
				value: feedbackOverview.overview.total_feedback,
				icon: MessageSquare,
				tone: 'info' as const,
				footnote: `${feedbackOverview.overview.recent_24h} in last 24h`
			},
			{
				label: 'Unresolved Feedback',
				value: feedbackOverview.overview.unresolved_count,
				icon: AlertCircle,
				tone: 'danger' as const,
				footnote: 'Need attention'
			},
			{
				label: 'Average Rating',
				value: feedbackOverview.overview.average_rating,
				icon: Star,
				tone: 'warning' as const,
				suffix: ' /5',
				footnote: 'User satisfaction'
			}
		];
		return cards;
	});

	function applyDashboardPayload(payload: DashboardAnalyticsPayload) {
		systemOverview = payload.systemOverview;
		visitorOverview = payload.visitorOverview;
		dailyVisitors = payload.dailyVisitors ?? [];
		dailySignups = payload.dailySignups ?? [];
		dailyActiveUsers = payload.dailyActiveUsers ?? [];
		briefGenerationStats = payload.briefGenerationStats ?? [];
		systemMetrics = payload.systemMetrics ?? [];
		recentActivity = payload.recentActivity ?? [];
		feedbackOverview = payload.feedbackOverview;
		betaOverview = payload.betaOverview;
		comprehensiveAnalytics = payload.comprehensiveAnalytics;
		errorsData = payload.errorsData;
		agentChatUsage = payload.agentChatUsage ?? agentChatUsage;
		briefDelivery = payload.briefDelivery ?? briefDelivery;
		systemHealth = payload.systemHealth ?? systemHealth;
		if (payload.subscriptionData) {
			subscriptionData = payload.subscriptionData;
		} else {
			subscriptionData = {
				...subscriptionData,
				stripeEnabled: false
			};
		}
	}

	if (initialDashboard) {
		applyDashboardPayload(initialDashboard);
	}

	let skipNextLoad = Boolean(initialDashboard);

	// Load data on mount and when timeframe changes
	$effect(() => {
		if (!browser) return;
		selectedTimeframe; // Track this dependency
		if (skipNextLoad) {
			skipNextLoad = false;
			return;
		}
		loadAnalytics();
	});

	// Set up auto-refresh interval when enabled
	$effect(() => {
		if (!browser) return;
		if (autoRefresh) {
			if (refreshTimer) {
				clearInterval(refreshTimer);
			}
			refreshTimer = setInterval(() => loadAnalytics(true), 30000);
			return () => {
				if (refreshTimer) {
					clearInterval(refreshTimer);
					refreshTimer = null;
				}
			}; // Cleanup on unmount or when autoRefresh changes
		}
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
	});

	async function loadAnalytics(skipSpinner = false) {
		if (!browser) return;
		if (currentRequest) {
			currentRequest.abort();
		}
		const controller = new AbortController();
		currentRequest = controller;
		if (!skipSpinner) {
			isLoading = true;
		}
		error = null;

		try {
			const response = await fetch(
				`/api/admin/analytics/dashboard?timeframe=${selectedTimeframe}`,
				{
					signal: controller.signal
				}
			);

			if (!response.ok) throw new Error('Failed to load analytics dashboard');

			const json = await response.json();
			if (!json.success || !json.data) {
				throw new Error(json.error || 'Failed to load analytics dashboard');
			}

			applyDashboardPayload(json.data as DashboardAnalyticsPayload);
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') {
				return;
			}
			console.error('Error loading analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			if (currentRequest === controller) {
				currentRequest = null;
			}
			if (!controller.signal.aborted) {
				isLoading = false;
			}
		}
	}

	onDestroy(() => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
		if (currentRequest) {
			currentRequest.abort();
			currentRequest = null;
		}
	});

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 2
		}).format(value);
	}

	function formatPercentage(num: number): string {
		return `${Math.round(num)}%`;
	}

	function getSystemHealthColor(value: number, unit: string | null): string {
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
		return 'text-muted-foreground';
	}

	function formatMilliseconds(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		}

		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const remainingMs = Math.floor(ms % 1000);

		const parts: string[] = [];

		if (minutes > 0) {
			parts.push(`${minutes} min`);
		}

		if (seconds > 0) {
			parts.push(`${seconds} sec`);
		}

		if (remainingMs > 0 || parts.length === 0) {
			parts.push(`${remainingMs}ms`);
		}

		return parts.join(' ');
	}

	function getActivityIcon(entityType: string, action: string) {
		switch (entityType) {
			case 'brief':
				return FileText;
			case 'session':
				return Users;
			case 'template':
				return Settings;
			case 'task':
				return Workflow;
			case 'project':
				return GitBranch;
			case 'note':
			case 'document':
				return FileText;
			case 'brain_dump':
				return MessageSquare;
			default:
				return Activity;
		}
	}

	function formatActivityLabel(entityType: string, action: string) {
		const typeLabel = entityType.replace(/_/g, ' ');
		const actionLabel = action.replace(/_/g, ' ');
		return `${typeLabel} ${actionLabel}`.trim();
	}

	function getCategoryColor(category: string): string {
		const colors = {
			feature: 'text-accent',
			bug: 'text-red-600 dark:text-red-400',
			improvement: 'text-emerald-600 dark:text-emerald-400',
			general: 'text-muted-foreground'
		};
		return colors[category as keyof typeof colors] || 'text-muted-foreground';
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

<div class="admin-page">
	<AdminPageHeader
		title="Admin Dashboard"
		description="System overview and user analytics"
		icon={BarChart3}
		showBack={false}
	>
		{#snippet actions()}
			<div class="flex w-full flex-wrap items-center gap-3 sm:gap-4 sm:justify-end">
				<label class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						class="h-4 w-4 rounded border-border text-accent focus:ring-ring cursor-pointer bg-background"
					/>
					<span>Auto Refresh</span>
				</label>

				<Select
					bind:value={selectedTimeframe}
					size="md"
					placeholder="Last 30 Days"
					class="w-full sm:w-44"
				>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
					<option value="90d">Last 90 Days</option>
				</Select>

				<Button
					onclick={exportAnalytics}
					variant="primary"
					size="sm"
					icon={Download}
					class="w-full sm:w-auto"
				>
					Export
				</Button>

				<Button
					onclick={() => loadAnalytics()}
					disabled={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
					class="w-full sm:w-auto"
				>
					Refresh
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	<div class="admin-page">
		<!-- Navigation Cards - Ultra-compact grid on mobile -->
		<div
			class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 mb-4 sm:mb-6"
		>
			{#each navCards as card (card.href)}
				<!-- Ultra-compact on mobile, compact on sm+ -->
				<div class="sm:hidden">
					<AdminNavCard {...card} ultraCompact />
				</div>
				<div class="hidden sm:block">
					<AdminNavCard {...card} meta="View module" compact />
				</div>
			{/each}
		</div>

		{#if error}
			<AdminCard tone="danger" padding="md" class="mb-4">
				<div class="flex items-center gap-3 text-sm">
					<AlertCircle class="h-5 w-5" />
					<p class="text-red-900 dark:text-red-100">{error}</p>
				</div>
			</AdminCard>
		{/if}

		{#if isLoading}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-4 sm:mb-6">
				{#each Array(12) as _}
					<AdminCard padding="lg" class="animate-pulse space-y-3" aria-hidden="true">
						<div class="h-4 bg-muted rounded w-3/4"></div>
						<div class="h-6 sm:h-8 bg-muted rounded w-1/2"></div>
					</AdminCard>
				{/each}
			</div>
		{:else}
			<!-- Errors Alert (if there are critical/unresolved errors) -->
			{#if errorsData.critical_errors > 0 || errorsData.unresolved_errors > 10}
				<AdminCard tone="danger" padding="md" class="mb-4">
					<div class="flex items-start gap-4">
						<span
							class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/40 text-rose-600 dark:bg-slate-900/30 dark:text-rose-200"
						>
							<AlertTriangle class="h-5 w-5" />
						</span>
						<div class="flex-1">
							<h3 class="text-base font-semibold text-rose-900 dark:text-rose-100">
								System Errors Need Attention
							</h3>
							<div class="mt-2 text-sm text-rose-800 dark:text-rose-200 space-y-1">
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
								class="mt-3 inline-flex items-center text-sm font-semibold text-rose-800 underline-offset-4 hover:underline dark:text-rose-200"
							>
								View error logs
								<ExternalLink class="w-3.5 h-3.5 ml-1" />
							</a>
						</div>
					</div>
				</AdminCard>
			{/if}

			<!-- Key Metrics Cards - Ultra-compact 2-col grid on mobile -->
			<div class="grid grid-cols-2 gap-1.5 sm:hidden mb-3">
				{#each primaryMetrics as metric (metric.label)}
					<AdminStatCard
						label={metric.label}
						value={metric.value}
						icon={metric.icon}
						tone={metric.tone}
						footnote={metric.footnote}
						ultraCompact
					/>
				{/each}
			</div>
			<div class="hidden sm:grid sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 mb-5">
				{#each primaryMetrics as metric (metric.label)}
					<AdminStatCard
						label={metric.label}
						value={metric.value}
						icon={metric.icon}
						tone={metric.tone}
						footnote={metric.footnote}
						compact
					/>
				{/each}
			</div>

			<!-- Daily Visitors Chart -->
			<div class="mb-4 sm:mb-6">
				<VisitorContributionChart
					visitors={dailyVisitors}
					signups={dailySignups}
					{isLoading}
				/>
			</div>

			<!-- Agent Chat Analytics Section - Collapsible on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Collapsible -->
				<div class="sm:hidden">
					<AdminCollapsibleSection
						title="Agent Chat"
						subtitle={timeframeRangeLabel}
						icon={MessageSquare}
						iconColor="text-sky-500"
						badge={agentChatUsage.totalSessions}
					>
						<div class="grid grid-cols-2 gap-1.5 p-2">
							{#each agentUsageCards as card (card.label)}
								<AdminStatCard {...card} ultraCompact />
							{/each}
						</div>
					</AdminCollapsibleSection>
				</div>
				<!-- Desktop: Always expanded -->
				<div class="hidden sm:block">
					<h2 class="text-lg sm:text-xl font-bold text-foreground mb-4">
						Agent Chat Analytics
						<span class="text-sm font-normal text-muted-foreground">
							({timeframeRangeLabel})
						</span>
					</h2>
					<div class="admin-stat-grid grid sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
						{#each agentUsageCards as card (card.label)}
							<AdminStatCard {...card} compact />
						{/each}
					</div>
				</div>
			</div>

			<!-- User Leaderboards - Compact collapsible on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Compact collapsible leaderboards -->
				<div class="sm:hidden space-y-1.5">
					{#each leaderboardConfigs as board (board.key)}
						{@const rows = (comprehensiveAnalytics.leaderboards[board.key] ?? []) as LeaderboardEntry[]}
						{@const Icon = board.icon}
						<AdminCollapsibleSection
							title={board.title.replace('Top ', '')}
							icon={Icon}
							iconColor={board.accent}
							badge={rows.length > 0 ? rows[0]?.count : 0}
						>
							{#if rows.length > 0}
								<div class="divide-y divide-border/50">
									{#each rows.slice(0, 5) as user, index}
										<div class="flex items-center justify-between px-2.5 py-1.5">
											<div class="flex items-center gap-2 min-w-0">
												<span class="text-[10px] font-bold text-muted-foreground w-4">
													{index + 1}
												</span>
												<span class="text-xs text-foreground truncate">
													{user.email.split('@')[0]}
												</span>
											</div>
											<span class={`text-xs font-bold ${board.accent}`}>
												{user.count}
											</span>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-muted-foreground text-center py-3 text-xs">No data</p>
							{/if}
						</AdminCollapsibleSection>
					{/each}
				</div>
				<!-- Desktop: Full leaderboard cards -->
				<div class="hidden sm:block">
					<h2 class="text-lg sm:text-xl font-bold text-foreground mb-4">
						User Activity Leaderboards
						<span class="text-sm font-normal text-muted-foreground">
							({timeframeRangeLabel})
						</span>
					</h2>
					<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
						{#each leaderboardConfigs as board (board.key)}
							{@const rows = (comprehensiveAnalytics.leaderboards[board.key] ??
								[]) as LeaderboardEntry[]}
							{@const Icon = board.icon}
							<AdminCard padding="lg" class="space-y-4">
								<div class="flex items-center justify-between">
									<h3 class="text-base font-semibold text-foreground">
										{board.title}
									</h3>
									<Icon class={`h-5 w-5 ${board.accent}`} />
								</div>

								{#if rows.length > 0}
									<div class="space-y-2">
										{#each rows as user, index}
											<div
												class="flex items-center justify-between py-2 border-b border-border last:border-0"
											>
												<div class="flex items-center space-x-3">
													<span
														class="text-xs font-semibold text-muted-foreground w-6"
													>
														#{index + 1}
													</span>
													<span
														class="text-sm text-foreground truncate max-w-[150px]"
													>
														{user.email}
													</span>
												</div>
												<span class={`text-sm font-bold ${board.accent}`}>
													{user.count}
												</span>
											</div>
										{/each}
									</div>
								{:else}
									<p class="text-muted-foreground text-center py-4 text-sm">
										No data available
									</p>
								{/if}
							</AdminCard>
						{/each}
					</div>
				</div>
			</div>

			<!-- Subscription Overview (if Stripe is enabled) -->
			{#if subscriptionData.stripeEnabled}
				<div class="mb-3 sm:mb-6">
					<!-- Mobile: Collapsible -->
					<div class="sm:hidden">
						<AdminCollapsibleSection
							title="Subscriptions"
							icon={CreditCard}
							iconColor="text-emerald-500"
							badge={formatCurrency(subscriptionData.revenue.current_mrr)}
							badgeColor="success"
						>
							<div class="grid grid-cols-2 gap-1.5 p-2">
								{#each subscriptionMetricCards as card (card.label)}
									<AdminStatCard {...card} ultraCompact />
								{/each}
							</div>
						</AdminCollapsibleSection>
					</div>
					<!-- Desktop -->
					<div class="hidden sm:block space-y-4 sm:space-y-6">
						<h2 class="text-lg sm:text-xl font-bold text-foreground">
							Subscription Analytics
						</h2>
						<div class="admin-stat-grid grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
							{#each subscriptionMetricCards as card (card.label)}
								<AdminStatCard {...card} compact />
							{/each}
						</div>
					</div>

					{#if subscriptionData.failedPayments.length > 0}
						<AdminCard tone="danger" padding="md">
							<div class="flex items-start gap-3">
								<AlertTriangle class="h-5 w-5 flex-shrink-0" />
								<div>
									<h3
										class="text-sm font-semibold text-red-900 dark:text-red-100"
									>
										Failed Payments Require Attention
									</h3>
									<p class="text-sm text-red-800 dark:text-red-200 mt-1">
										{subscriptionData.failedPayments.length} payment{subscriptionData
											.failedPayments.length > 1
											? 's'
											: ''} failed in the last 30 days
									</p>
									<a
										href="/admin/subscriptions"
										class="inline-flex items-center text-sm font-medium text-red-800 hover:text-red-600 dark:text-red-200 mt-2"
									>
										View details
										<ExternalLink class="w-3 h-3 ml-1" />
									</a>
								</div>
							</div>
						</AdminCard>
					{/if}

					{#if subscriptionData.recentChanges.length > 0}
						<AdminCard padding="lg">
							<h3 class="text-base font-semibold text-foreground mb-4">
								Recent Subscription Activity
							</h3>
							<div class="space-y-3">
								{#each subscriptionData.recentChanges.slice(0, 5) as change, idx (idx)}
									{@const typedChange = change as any}
									<div
										class="flex items-center justify-between py-2 border-b border-border last:border-0"
									>
										<div class="flex items-center space-x-3">
											<div class="flex-shrink-0">
												{#if typedChange.status === 'active'}
													<div
														class="w-2 h-2 bg-green-500 rounded-full"
													></div>
												{:else if typedChange.status === 'canceled'}
													<div
														class="w-2 h-2 bg-red-500 rounded-full"
													></div>
												{:else if typedChange.status === 'trialing'}
													<div
														class="w-2 h-2 bg-sky-500 rounded-full"
													></div>
												{:else}
													<div
														class="w-2 h-2 bg-muted-foreground rounded-full"
													></div>
												{/if}
											</div>
											<div>
												<p class="text-sm font-medium text-foreground">
													{typedChange.users?.email || 'Unknown User'}
												</p>
												<p class="text-xs text-muted-foreground">
													{typedChange.subscription_plans?.name} · {typedChange.status}
												</p>
											</div>
										</div>
										<div class="text-right">
											<p class="text-sm text-muted-foreground">
												${(
													(typedChange.subscription_plans?.price_cents ??
														0) / 100
												).toFixed(2)}/{typedChange.subscription_plans
													?.billing_interval ?? 'N/A'}
											</p>
											<p class="text-xs text-muted-foreground">
												{typedChange.updated_at
													? new Date(
															typedChange.updated_at
														).toLocaleDateString()
													: 'N/A'}
											</p>
										</div>
									</div>
								{/each}
							</div>
							<div class="mt-4">
								<a
									href="/admin/subscriptions"
									class="text-sm text-accent hover:text-accent/80"
								>
									View all subscription activity →
								</a>
							</div>
						</AdminCard>
					{/if}
				</div>
			{/if}
			<!-- Feedback Overview - Compact on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Compact stats row -->
				<div class="sm:hidden">
					<AdminCollapsibleSection
						title="Feedback"
						icon={Star}
						iconColor="text-amber-500"
						badge={feedbackOverview.overview.unresolved_count}
						badgeColor={feedbackOverview.overview.unresolved_count > 0 ? 'warning' : 'default'}
					>
						<div class="grid grid-cols-3 gap-1.5 p-2">
							{#each feedbackMetricCards as card (card.label)}
								<AdminStatCard {...card} ultraCompact />
							{/each}
						</div>
					</AdminCollapsibleSection>
				</div>
				<!-- Desktop -->
				<div class="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
					{#each feedbackMetricCards as card (card.label)}
						<AdminStatCard {...card} compact />
					{/each}
				</div>
			</div>

			<!-- Charts and Analytics - Collapsible on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Collapsible charts -->
				<div class="sm:hidden space-y-1.5">
					<AdminCollapsibleSection
						title="Daily Active Users"
						icon={Activity}
						iconColor="text-accent"
						badge={dailyActiveUsers.length > 0 ? dailyActiveUsers[dailyActiveUsers.length - 1]?.active_users : 0}
					>
						{#if dailyActiveUsers.length > 0}
							<div class="divide-y divide-border/50">
								{#each dailyActiveUsers.slice(-7) as day}
									<div class="flex items-center justify-between px-2.5 py-1.5">
										<span class="text-[10px] text-muted-foreground">
											{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
										</span>
										<div class="flex items-center gap-1.5">
											<div class="w-12 bg-muted rounded-full h-1.5">
												<div
													class="bg-accent h-1.5 rounded-full"
													style="width: {Math.min((day.active_users / Math.max(...dailyActiveUsers.map((d) => d.active_users))) * 100, 100)}%"
												></div>
											</div>
											<span class="text-[10px] font-bold text-foreground w-5 text-right">
												{day.active_users}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-3 text-xs">No data</p>
						{/if}
					</AdminCollapsibleSection>

					<AdminCollapsibleSection
						title="Feedback Categories"
						icon={MessageSquare}
						iconColor="text-purple-500"
						badge={Object.keys(feedbackOverview.category_breakdown).length}
					>
						{#if Object.keys(feedbackOverview.category_breakdown).length > 0}
							<div class="divide-y divide-border/50">
								{#each Object.entries(feedbackOverview.category_breakdown) as [category, count]}
									{@const typedCount = Number(count)}
									<div class="flex items-center justify-between px-2.5 py-1.5">
										<span class="text-xs text-foreground capitalize truncate">
											{category}
										</span>
										<span class="text-xs font-bold text-accent">{typedCount}</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-3 text-xs">No data</p>
						{/if}
					</AdminCollapsibleSection>
				</div>

				<!-- Desktop: Full charts side by side -->
				<div class="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
					<!-- Daily Active Users Chart -->
					<div class="admin-panel p-4 sm:p-6">
						<h3 class="text-lg font-semibold text-foreground mb-4">
							Daily Active Users
							<span class="text-sm font-normal text-muted-foreground">
								({timeframeRangeLabel})
							</span>
						</h3>
						{#if dailyActiveUsers.length > 0}
							<div class="space-y-2">
								{#each dailyActiveUsers.slice(-10) as day}
									<div class="flex items-center justify-between">
										<span class="text-sm text-muted-foreground truncate">
											{new Date(day.date).toLocaleDateString()}
										</span>
										<div class="flex items-center ml-2">
											<div class="w-32 bg-muted rounded-full h-2 mr-3">
												<div
													class="bg-accent h-2 rounded-full transition-all duration-300"
													style="width: {Math.min((day.active_users / Math.max(...dailyActiveUsers.map((d) => d.active_users))) * 100, 100)}%"
												></div>
											</div>
											<span class="text-sm font-medium text-foreground">
												{day.active_users}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-8">No data available</p>
						{/if}
					</div>

					<!-- Feedback Category Breakdown -->
					<div class="admin-panel p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-lg font-semibold text-foreground">Feedback Categories</h3>
							<a
								href="/admin/feedback"
								class="text-accent hover:text-accent/80 text-sm flex items-center"
							>
								View All
								<ExternalLink class="ml-1 h-4 w-4" />
							</a>
						</div>
						{#if Object.keys(feedbackOverview.category_breakdown).length > 0}
							<div class="space-y-3">
								{#each Object.entries(feedbackOverview.category_breakdown) as [category, count]}
									{@const typedCount = Number(count)}
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium text-foreground capitalize truncate">
											{category}
										</span>
										<div class="flex items-center ml-2">
											<div class="w-20 bg-muted rounded-full h-2 mr-2">
												<div
													class="bg-accent h-2 rounded-full transition-all duration-300"
													style="width: {Math.min((typedCount / Math.max(...Object.values(feedbackOverview.category_breakdown))) * 100, 100)}%"
												></div>
											</div>
											<span class="text-sm font-medium text-foreground w-8 text-right">
												{typedCount}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-8">No feedback data</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Recent Content - Collapsible on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Collapsible panels -->
				<div class="sm:hidden space-y-1.5">
					<AdminCollapsibleSection
						title="Recent Feedback"
						icon={MessageSquare}
						iconColor="text-purple-500"
						badge={feedbackOverview.recent_feedback.length}
					>
						{#if feedbackOverview.recent_feedback.length > 0}
							<div class="divide-y divide-border/50">
								{#each feedbackOverview.recent_feedback.slice(0, 5) as feedback, idx (idx)}
									{@const typedFeedback = feedback as any}
									<div class="px-2.5 py-1.5">
										<div class="flex items-center justify-between">
											<span class="text-[10px] font-medium {getCategoryColor(typedFeedback.category)} capitalize">
												{typedFeedback.category}
											</span>
											{#if typedFeedback.rating}
												<span class="text-[10px] text-amber-500">{typedFeedback.rating}/5</span>
											{/if}
										</div>
										<p class="text-xs text-foreground line-clamp-1 mt-0.5">
											{typedFeedback.feedback_text.substring(0, 60)}...
										</p>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-3 text-xs">No feedback</p>
						{/if}
					</AdminCollapsibleSection>

					<AdminCollapsibleSection
						title="Beta Activity"
						icon={UserPlus}
						iconColor="text-sky-500"
						badge={betaOverview.recent_activity.length}
					>
						{#if betaOverview.recent_activity.length > 0}
							<div class="divide-y divide-border/50">
								{#each betaOverview.recent_activity.slice(0, 5) as activity, idx (idx)}
									{@const typedActivity = activity as any}
									<div class="flex items-center justify-between px-2.5 py-1.5">
										<div class="flex items-center gap-1.5 min-w-0">
											{#if typedActivity.type === 'signup'}
												<UserPlus class="h-3 w-3 text-accent shrink-0" />
											{:else}
												<MessageSquare class="h-3 w-3 text-green-500 shrink-0" />
											{/if}
											<span class="text-xs text-foreground truncate">
												{typedActivity.type === 'signup' ? typedActivity.user?.split('@')[0] : typedActivity.feedback_type}
											</span>
										</div>
										<span class="text-[10px] text-muted-foreground capitalize shrink-0">
											{typedActivity.status}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-3 text-xs">No activity</p>
						{/if}
					</AdminCollapsibleSection>
				</div>

				<!-- Desktop: Full panels side by side -->
				<div class="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
					<!-- Recent Feedback -->
					<div class="admin-panel p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-lg font-semibold text-foreground">Recent Feedback</h3>
							<a href="/admin/feedback" class="text-accent hover:text-accent/80 text-sm flex items-center">
								View All <ExternalLink class="ml-1 h-4 w-4" />
							</a>
						</div>
						{#if feedbackOverview.recent_feedback.length > 0}
							<div class="space-y-3">
								{#each feedbackOverview.recent_feedback as feedback, idx (idx)}
									{@const typedFeedback = feedback as any}
									<div class="border-l-4 border-accent/30 pl-4 py-2">
										<div class="flex items-center justify-between mb-1">
											<span class="text-sm font-medium {getCategoryColor(typedFeedback.category)} capitalize">
												{typedFeedback.category}
											</span>
											<span class="text-xs text-muted-foreground">
												{new Date(typedFeedback.created_at).toLocaleDateString()}
											</span>
										</div>
										<p class="text-sm text-foreground line-clamp-2">
											{typedFeedback.feedback_text.substring(0, 100)}...
										</p>
										<div class="flex items-center justify-between mt-1">
											<span class="text-xs text-muted-foreground truncate">
												{typedFeedback.user_email || 'Anonymous'}
											</span>
											{#if typedFeedback.rating}
												<div class="flex items-center ml-2">
													<Star class="h-3 w-3 text-yellow-500 mr-1" />
													<span class="text-xs text-muted-foreground">{typedFeedback.rating}/5</span>
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-8">No recent feedback</p>
						{/if}
					</div>

					<!-- Beta Program Activity -->
					<div class="admin-panel p-4 sm:p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-lg font-semibold text-foreground">Beta Program Activity</h3>
							<a href="/admin/beta" class="text-accent hover:text-accent/80 text-sm flex items-center">
								Manage <ExternalLink class="ml-1 h-4 w-4" />
							</a>
						</div>
						{#if betaOverview.recent_activity.length > 0}
							<div class="space-y-3">
								{#each betaOverview.recent_activity as activity, idx (idx)}
									{@const typedActivity = activity as any}
									<div class="flex items-start space-x-3">
										{#if typedActivity.type === 'signup'}
											<UserPlus class="h-4 w-4 text-accent flex-shrink-0 mt-1" />
										{:else}
											<MessageSquare class="h-4 w-4 text-green-500 flex-shrink-0 mt-1" />
										{/if}
										<div class="flex-1 min-w-0">
											{#if typedActivity.type === 'signup'}
												<div class="text-sm text-foreground">
													<span class="font-medium truncate">{typedActivity.user}</span> signed up for beta
												</div>
												<div class="text-xs text-muted-foreground capitalize">Status: {typedActivity.status}</div>
											{:else}
												<div class="text-sm text-foreground">New {typedActivity.feedback_type} feedback</div>
												<div class="text-xs text-muted-foreground capitalize">Status: {typedActivity.status}</div>
											{/if}
										</div>
										<div class="text-xs text-muted-foreground flex-shrink-0">
											{new Date(typedActivity.created_at).toLocaleDateString()}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-8">No recent beta activity</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- System Health Metrics - Collapsible on mobile -->
			<div class="mb-3 sm:mb-6">
				<!-- Mobile: Collapsible -->
				<div class="sm:hidden">
					<AdminCollapsibleSection
						title="System Health"
						icon={Zap}
						iconColor="text-yellow-500"
						badge={systemMetrics.length}
					>
						{#if systemMetrics.length > 0}
							<div class="divide-y divide-border/50">
								{#each systemMetrics as metric}
									<div class="flex items-center justify-between px-2.5 py-1.5">
										<span class="text-xs text-foreground truncate">
											{metric.metric_description || metric.metric_name}
										</span>
										<span class="text-xs font-bold shrink-0 {getSystemHealthColor(metric.metric_value, metric.metric_unit)}">
											{#if metric.metric_unit === 'percentage'}
												{metric.metric_value}%
											{:else if metric.metric_unit === 'milliseconds'}
												{formatMilliseconds(metric.metric_value)}
											{:else}
												{metric.metric_value}
											{/if}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-3 text-xs">No metrics</p>
						{/if}
					</AdminCollapsibleSection>
				</div>
				<!-- Desktop: Full panel -->
				<div class="hidden sm:block admin-panel p-4 sm:p-6">
					<h3 class="text-lg font-semibold text-foreground mb-4 flex items-center">
						<Zap class="mr-2 h-5 w-5 text-yellow-600" />
						System Health
					</h3>
					{#if systemMetrics.length > 0}
						<div class="space-y-4">
							{#each systemMetrics as metric}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div class="text-sm font-medium text-foreground truncate">
											{metric.metric_description || metric.metric_name}
										</div>
										<div class="text-xs text-muted-foreground">
											Last updated: {metric.recorded_at ? new Date(metric.recorded_at).toLocaleString() : 'N/A'}
										</div>
									</div>
									<div class="text-right ml-2">
										<div class="text-lg font-bold {getSystemHealthColor(metric.metric_value, metric.metric_unit)}">
											{#if metric.metric_unit === 'percentage'}
												{metric.metric_value}%
											{:else if metric.metric_unit === 'milliseconds'}
												{formatMilliseconds(metric.metric_value)}
											{:else}
												{metric.metric_value}
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground text-center py-8">No metrics available</p>
					{/if}
				</div>
			</div>

			<!-- Top Active Users and Recent Activity -->
			<!-- Mobile: Collapsible sections in single column -->
			<div class="sm:hidden space-y-2">
				<AdminCollapsibleSection
					title="Top Users"
					subtitle={timeframeRangeLabel}
					icon={Users}
					badge={systemOverview.top_active_users?.length || 0}
				>
					<div class="p-2">
						{#if systemOverview.top_active_users && systemOverview.top_active_users.length > 0}
							<div class="space-y-1.5">
								{#each systemOverview.top_active_users.slice(0, 6) as user, idx (idx)}
									{@const typedUser = user as any}
									<div class="flex items-center justify-between py-1 px-1.5 rounded bg-muted/30">
										<div class="flex-1 min-w-0">
											<div class="text-[11px] font-medium text-foreground truncate">
												{typedUser.email}
											</div>
											<div class="text-[10px] text-muted-foreground">
												{typedUser.last_activity
													? new Date(typedUser.last_activity).toLocaleDateString()
													: 'Never'}
											</div>
										</div>
										<div class="text-[10px] font-bold text-accent ml-2 shrink-0">
											{typedUser.activity_count}
										</div>
									</div>
								{/each}
							</div>
							<a
								href="/admin/users"
								class="mt-2 text-[10px] text-accent hover:text-accent/80 flex items-center justify-center gap-1"
							>
								View All <ExternalLink class="h-2.5 w-2.5" />
							</a>
						{:else}
							<p class="text-muted-foreground text-center py-4 text-xs">No active users</p>
						{/if}
					</div>
				</AdminCollapsibleSection>

				<AdminCollapsibleSection
					title="Recent Activity"
					icon={Activity}
					badge={recentActivity.length}
				>
					<div class="p-2">
						{#if recentActivity.length > 0}
							<div class="space-y-1.5">
								{#each recentActivity.slice(0, 6) as activity}
									{@const ActivityIcon = getActivityIcon(
										activity.entity_type,
										activity.action
									)}
									<div class="flex items-start gap-1.5 py-1 px-1.5 rounded bg-muted/30">
										<ActivityIcon class="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
										<div class="flex-1 min-w-0">
											<div class="text-[10px] text-foreground">
												<span class="font-medium">{activity.user_email?.split('@')[0]}</span>
												<span class="text-muted-foreground ml-1">
													{formatActivityLabel(activity.entity_type, activity.action)}
												</span>
											</div>
											<div class="text-[9px] text-muted-foreground">
												{new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-center py-4 text-xs">No recent activity</p>
						{/if}
					</div>
				</AdminCollapsibleSection>
			</div>

			<!-- Desktop: Original side-by-side layout -->
			<div class="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
				<!-- Top Active Users -->
				<div class="admin-panel p-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold text-foreground">
							Top Active Users
							<span class="text-sm font-normal text-muted-foreground">
								({timeframeRangeLabel})
							</span>
						</h3>
						<a
							href="/admin/users"
							class="text-accent hover:text-accent/80 text-sm flex items-center"
						>
							<span class="hidden sm:inline">View All</span>
							<ExternalLink class="ml-1 h-4 w-4" />
						</a>
					</div>
					{#if systemOverview.top_active_users && systemOverview.top_active_users.length > 0}
						<div class="space-y-3">
							{#each systemOverview.top_active_users.slice(0, 8) as user, idx (idx)}
								{@const typedUser = user as any}
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="text-xs sm:text-sm font-medium text-foreground truncate"
										>
											{typedUser.email}
										</div>
										<div class="text-xs text-muted-foreground">
											Last activity: {typedUser.last_activity
												? new Date(
														typedUser.last_activity
													).toLocaleDateString()
												: 'Never'}
										</div>
									</div>
									<div class="text-xs sm:text-sm font-medium text-accent ml-2">
										{typedUser.activity_count} events
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground text-center py-8">No active users data</p>
					{/if}
				</div>

				<!-- Recent Activity -->
				<div class="admin-panel p-4 sm:p-6">
					<h3 class="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
					{#if recentActivity.length > 0}
						<div class="space-y-3">
							{#each recentActivity.slice(0, 8) as activity}
								{@const ActivityIcon = getActivityIcon(
									activity.entity_type,
									activity.action
								)}
								<div class="flex items-start space-x-3">
									<ActivityIcon
										class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1"
									/>
									<div class="flex-1 min-w-0">
										<div class="text-xs sm:text-sm text-foreground">
											<span class="font-medium truncate"
												>{activity.user_email}</span
											>
											{formatActivityLabel(
												activity.entity_type,
												activity.action
											)}
											{#if activity.entity_name}
												<span class="text-muted-foreground">
													• {activity.entity_name}
												</span>
											{:else if activity.project_name}
												<span class="text-muted-foreground">
													• {activity.project_name}
												</span>
											{/if}
										</div>
										<div class="text-xs text-muted-foreground">
											{new Date(activity.created_at).toLocaleString()}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground text-center py-8">No recent activity</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
