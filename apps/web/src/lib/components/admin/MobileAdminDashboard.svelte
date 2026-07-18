<!-- apps/web/src/lib/components/admin/MobileAdminDashboard.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import {
		Activity,
		AlertCircle,
		AlertTriangle,
		ArrowUpRight,
		Bell,
		CircleCheck,
		CreditCard,
		Download,
		MessageSquare,
		RefreshCw,
		Search,
		ServerCrash,
		Star,
		Users,
		Zap
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import MobileAdminDisclosure from './MobileAdminDisclosure.svelte';

	type Timeframe = '7d' | '30d' | '90d';
	type Tone = 'danger' | 'warning' | 'success' | 'neutral';

	type NavCard = {
		title: string;
		description: string;
		href: string;
		icon: ComponentType;
		stat?: string | null;
		badge?: string | null;
	};

	type TopActiveUser = {
		email: string;
		last_activity: string | null;
		activity_count: number;
	};

	type SystemMetric = {
		metric_name: string;
		metric_value: number;
		metric_unit: string | null;
		metric_description: string | null;
		recorded_at: string | null;
	};

	type RecentActivity = {
		entity_type: string;
		action: string;
		user_email: string;
		created_at: string;
		project_name?: string | null;
		entity_name?: string | null;
	};

	type AttentionItem = {
		label: string;
		detail: string;
		count: number;
		href: string;
		icon: ComponentType;
		tone: Tone;
	};

	let {
		selectedTimeframe = $bindable<Timeframe>('30d'),
		autoRefresh = $bindable(false),
		isLoading,
		detailsLoading,
		error,
		navCards,
		systemOverview,
		comprehensiveAnalytics,
		agentChatUsage,
		briefDelivery,
		systemHealth,
		feedbackOverview,
		errorsData,
		subscriptionData,
		visitorOverview,
		dailyActiveUsers,
		recentActivity,
		systemMetrics,
		onRefresh,
		onExport
	}: {
		selectedTimeframe?: Timeframe;
		autoRefresh?: boolean;
		isLoading: boolean;
		detailsLoading: boolean;
		error: string | null;
		navCards: NavCard[];
		systemOverview: {
			total_users: number;
			active_users_7d: number;
			active_users_30d: number;
			top_active_users: TopActiveUser[];
		};
		comprehensiveAnalytics: {
			userMetrics: {
				totalUsers: number;
				totalBetaUsers: number;
				newUsersLast24h: number;
				newBetaSignupsLast24h: number;
			};
			agentChatMetrics: {
				totalSessions: number;
				totalMessages: number;
				uniqueUsers: number;
			};
			projectMetrics: {
				newProjects: number;
				updatedProjects: number;
				uniqueUsers: number;
			};
			calendarConnections: number;
		};
		agentChatUsage: {
			totalSessions: number;
			totalMessages: number;
			totalTokens: number;
			uniqueUsers: number;
			avgMessagesPerSession: number;
			avgTokensPerSession: number;
			toolSessions: number;
			failedSessions: number;
			failureRate: number;
		};
		briefDelivery: {
			briefsGenerated: number;
			ontologyBriefs: number;
			legacyBriefs: number;
			emailOptIn: number;
			smsOptIn: number;
			emailSent: number;
			emailDelivered: number;
			smsSent: number;
			smsDelivered: number;
		};
		systemHealth: {
			llmLatencyMs: Record<string, number>;
			queueDepth: number;
			oldestJobSeconds: number;
			failedJobs24h: number;
			agentFailureRate: number;
			errorCount24h: number;
			lastUpdated: string | null;
		};
		feedbackOverview: {
			overview: {
				total_feedback: number;
				recent_24h: number;
				unresolved_count: number;
				average_rating: number;
			};
		};
		errorsData: {
			total_errors: number;
			unresolved_errors: number;
			critical_errors: number;
			recent_errors_24h: number;
			error_trend: number;
		};
		subscriptionData: {
			revenue: {
				current_mrr: number;
			};
			failedPayments: unknown[];
			stripeEnabled: boolean;
		};
		visitorOverview: {
			total_visitors: number;
			visitors_7d: number;
			visitors_30d: number;
			unique_visitors_today: number;
		};
		dailyActiveUsers: Array<{ date: string; active_users: number }>;
		recentActivity: RecentActivity[];
		systemMetrics: SystemMetric[];
		onRefresh: () => void | Promise<void>;
		onExport: () => void | Promise<void>;
	} = $props();

	let navQuery = $state('');

	const compactNumberFormatter = new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 1
	});
	const numberFormatter = new Intl.NumberFormat('en-US');
	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	let timeframeLabel = $derived(
		selectedTimeframe === '7d' ? '7 days' : selectedTimeframe === '90d' ? '90 days' : '30 days'
	);

	let attentionItems = $derived.by(() => {
		const items: AttentionItem[] = [];

		if (errorsData.critical_errors > 0) {
			items.push({
				label: 'Critical errors',
				detail: `${numberFormatter.format(errorsData.unresolved_errors)} unresolved total`,
				count: errorsData.critical_errors,
				href: '/admin/errors',
				icon: AlertTriangle,
				tone: 'danger'
			});
		} else if (errorsData.unresolved_errors > 0) {
			items.push({
				label: 'Unresolved errors',
				detail: `${numberFormatter.format(errorsData.recent_errors_24h)} new in 24h`,
				count: errorsData.unresolved_errors,
				href: '/admin/errors',
				icon: AlertCircle,
				tone: 'warning'
			});
		}

		if (systemHealth.failedJobs24h > 0) {
			items.push({
				label: 'Failed jobs',
				detail: `Queue depth ${numberFormatter.format(systemHealth.queueDepth)}`,
				count: systemHealth.failedJobs24h,
				href: '/admin/notifications',
				icon: ServerCrash,
				tone: 'warning'
			});
		}

		if (feedbackOverview.overview.unresolved_count > 0) {
			items.push({
				label: 'Feedback to review',
				detail: `${numberFormatter.format(feedbackOverview.overview.recent_24h)} new in 24h`,
				count: feedbackOverview.overview.unresolved_count,
				href: '/admin/feedback',
				icon: Star,
				tone: 'neutral'
			});
		}

		if (subscriptionData.failedPayments.length > 0) {
			items.push({
				label: 'Failed payments',
				detail: 'Billing follow-up required',
				count: subscriptionData.failedPayments.length,
				href: '/admin/subscriptions',
				icon: CreditCard,
				tone: 'danger'
			});
		}

		return items;
	});

	let operationalState = $derived.by(() => {
		if (errorsData.critical_errors > 0 || subscriptionData.failedPayments.length > 0) {
			return {
				label: 'Action required',
				detail: `${attentionItems.length} priority ${attentionItems.length === 1 ? 'item' : 'items'}`,
				tone: 'danger' as Tone
			};
		}

		if (attentionItems.length > 0) {
			return {
				label: 'Needs review',
				detail: `${attentionItems.length} open ${attentionItems.length === 1 ? 'item' : 'items'}`,
				tone: 'warning' as Tone
			};
		}

		return {
			label: 'All systems steady',
			detail: 'No active incidents',
			tone: 'success' as Tone
		};
	});

	let commandMetrics = $derived([
		{
			label: 'Active users',
			value: formatCompact(systemOverview.active_users_7d),
			detail: 'Last 7 days',
			icon: Users,
			href: '/admin/users'
		},
		{
			label: 'Agent chats',
			value: formatCompact(agentChatUsage.totalSessions),
			detail: timeframeLabel,
			icon: MessageSquare,
			href: '/admin/chat'
		},
		{
			label: 'Briefs',
			value: formatCompact(briefDelivery.briefsGenerated),
			detail: timeframeLabel,
			icon: Bell,
			href: '/admin/notifications'
		},
		{
			label: 'Queue depth',
			value: formatCompact(systemHealth.queueDepth),
			detail:
				systemHealth.failedJobs24h > 0
					? `${systemHealth.failedJobs24h} failed`
					: 'Processing normally',
			icon: Activity,
			href: '/admin/notifications'
		},
		{
			label: 'New users',
			value: formatCompact(comprehensiveAnalytics.userMetrics.newUsersLast24h),
			detail: 'Last 24 hours',
			icon: Users,
			href: '/admin/users'
		},
		{
			label: 'Visitors',
			value: formatCompact(visitorOverview.unique_visitors_today),
			detail: 'Today',
			icon: Activity,
			href: '/admin'
		}
	]);

	let filteredNavCards = $derived.by(() => {
		const query = navQuery.trim().toLowerCase();
		if (!query) return navCards;

		return navCards.filter((card) =>
			`${card.title} ${card.description}`.toLowerCase().includes(query)
		);
	});

	let dailyActivePeak = $derived(Math.max(1, ...dailyActiveUsers.map((day) => day.active_users)));

	function formatCompact(value: number): string {
		return compactNumberFormatter.format(value);
	}

	function formatPercent(value: number): string {
		return `${Math.round(value)}%`;
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${Math.round(seconds)}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.round(seconds % 60);
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	function formatMetricValue(metric: SystemMetric): string {
		if (metric.metric_unit === 'percentage') return `${metric.metric_value}%`;
		if (metric.metric_unit === 'milliseconds') {
			return metric.metric_value >= 1000
				? `${(metric.metric_value / 1000).toFixed(1)}s`
				: `${metric.metric_value}ms`;
		}
		return numberFormatter.format(metric.metric_value);
	}

	function formatActivityLabel(activity: RecentActivity): string {
		const entity = activity.entity_type.replace(/_/g, ' ');
		const action = activity.action.replace(/_/g, ' ');
		return `${entity} ${action}`;
	}

	function statusClasses(tone: Tone): string {
		switch (tone) {
			case 'danger':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			case 'warning':
				return 'border-warning/40 bg-warning/10 text-warning';
			case 'success':
				return 'border-success/40 bg-success/10 text-success';
			default:
				return 'border-border bg-muted text-foreground';
		}
	}

	function statusDotClasses(tone: Tone): string {
		switch (tone) {
			case 'danger':
				return 'bg-destructive';
			case 'warning':
				return 'bg-warning';
			case 'success':
				return 'bg-success';
			default:
				return 'bg-muted-foreground';
		}
	}

	function attentionIconClasses(tone: Tone): string {
		switch (tone) {
			case 'danger':
				return 'bg-destructive/10 text-destructive';
			case 'warning':
				return 'bg-warning/10 text-warning';
			case 'success':
				return 'bg-success/10 text-success';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}
</script>

<div
	class="min-w-0 bg-background pb-[calc(1rem+env(safe-area-inset-bottom))]"
	aria-busy={isLoading || detailsLoading}
>
	<header
		class="relative overflow-hidden border-b border-border bg-card px-3 pb-3 pt-4 tx tx-static tx-weak"
	>
		<div
			class="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-accent/10 blur-3xl"
			aria-hidden="true"
		></div>

		<div class="relative">
			<div class="flex items-center justify-between gap-3">
				<p class="micro-label text-accent">ADMIN</p>
				<div
					class={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 ${statusClasses(
						operationalState.tone
					)}`}
				>
					<span
						class={`h-2 w-2 rounded-full ${statusDotClasses(operationalState.tone)}`}
						aria-hidden="true"
					></span>
					<span class="text-2xs font-semibold">{operationalState.label}</span>
				</div>
			</div>
			<h1 class="mt-1 text-2xl font-bold tracking-tight text-foreground">Command center</h1>
			<p class="mt-1 text-xs text-muted-foreground">
				Live operations, people, and system signals.
			</p>

			<div class="mt-4 grid grid-cols-[minmax(0,1fr)_44px_44px] gap-2">
				<label for="mobile-admin-timeframe" class="sr-only">Analytics timeframe</label>
				<Select
					id="mobile-admin-timeframe"
					bind:value={selectedTimeframe}
					size="sm"
					class="w-full"
				>
					<option value="7d">Last 7 days</option>
					<option value="30d">Last 30 days</option>
					<option value="90d">Last 90 days</option>
				</Select>
				<Button
					onclick={onRefresh}
					disabled={isLoading}
					loading={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					class="!px-0"
					aria-label="Refresh dashboard data"
				>
					<span class="sr-only">Refresh</span>
				</Button>
				<Button
					onclick={onExport}
					variant="outline"
					size="sm"
					icon={Download}
					class="!px-0"
					aria-label="Export dashboard data"
				>
					<span class="sr-only">Export</span>
				</Button>
			</div>

			<button
				type="button"
				onclick={() => (autoRefresh = !autoRefresh)}
				aria-pressed={autoRefresh}
				class="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground shadow-ink-inner transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
			>
				<span class="flex items-center gap-2">
					<Activity class="h-4 w-4" />
					Auto-refresh every 30 seconds
				</span>
				<span
					class={`relative h-6 w-10 rounded-full transition-colors motion-reduce:transition-none ${
						autoRefresh ? 'bg-accent' : 'bg-muted'
					}`}
					aria-hidden="true"
				>
					<span
						class={`absolute left-1 top-1 h-4 w-4 rounded-full bg-card shadow-ink transition-transform motion-reduce:transition-none ${
							autoRefresh ? 'translate-x-4' : ''
						}`}
					></span>
				</span>
			</button>
		</div>
	</header>

	<div class="space-y-3 px-3 pt-3">
		{#if error}
			<div
				class="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive"
				role="alert"
			>
				<AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
				<p class="min-w-0 text-xs leading-relaxed">{error}</p>
			</div>
		{/if}

		{#if isLoading}
			<div class="grid grid-cols-2 gap-2" aria-label="Loading dashboard signals">
				{#each Array(6) as _, index (index)}
					<div
						class="h-24 animate-pulse rounded-xl border border-border bg-card p-3 shadow-ink motion-reduce:animate-none"
						aria-hidden="true"
					>
						<div class="h-3 w-20 rounded-md bg-muted"></div>
						<div class="mt-3 h-7 w-14 rounded-md bg-muted"></div>
						<div class="mt-2 h-3 w-16 rounded-md bg-muted"></div>
					</div>
				{/each}
			</div>
		{:else}
			<section aria-labelledby="mobile-admin-signals">
				<div class="mb-2 flex items-end justify-between gap-3">
					<div>
						<p class="micro-label">AT A GLANCE</p>
						<h2
							id="mobile-admin-signals"
							class="mt-0.5 text-base font-semibold text-foreground"
						>
							Key signals
						</h2>
					</div>
					<span class="text-2xs font-medium text-muted-foreground">{timeframeLabel}</span>
				</div>

				<div class="grid grid-cols-2 gap-2">
					{#each commandMetrics as metric (metric.label)}
						{@const MetricIcon = metric.icon}
						<a
							href={metric.href}
							class="group min-w-0 rounded-xl border border-border bg-card p-3 shadow-ink transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						>
							<div class="flex items-start justify-between gap-2">
								<p class="micro-label min-w-0 truncate">{metric.label}</p>
								<MetricIcon
									class="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
								/>
							</div>
							<p
								class="mt-2 truncate text-2xl font-bold tracking-tight text-foreground"
							>
								{metric.value}
							</p>
							<p class="mt-1 truncate text-2xs text-muted-foreground">
								{metric.detail}
							</p>
						</a>
					{/each}
				</div>
			</section>

			<section
				class={`rounded-xl border p-3 shadow-ink ${statusClasses(operationalState.tone)}`}
				aria-labelledby="mobile-admin-status"
			>
				<div class="flex items-start gap-3">
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card/70"
					>
						{#if operationalState.tone === 'success'}
							<CircleCheck class="h-5 w-5" />
						{:else}
							<AlertTriangle class="h-5 w-5" />
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<p class="micro-label opacity-80">OPERATIONS</p>
						<h2 id="mobile-admin-status" class="mt-0.5 text-sm font-semibold">
							{operationalState.label}
						</h2>
						<p class="mt-1 text-xs opacity-80">{operationalState.detail}</p>
					</div>
					{#if detailsLoading}
						<span class="text-2xs font-medium">Updating…</span>
					{/if}
				</div>
			</section>

			{#if attentionItems.length > 0}
				<section
					class="overflow-hidden rounded-xl border border-border bg-card shadow-ink"
					aria-labelledby="mobile-admin-attention"
				>
					<div
						class="flex items-center justify-between border-b border-border px-3 py-2.5"
					>
						<div>
							<p class="micro-label">INBOX</p>
							<h2
								id="mobile-admin-attention"
								class="mt-0.5 text-sm font-semibold text-foreground"
							>
								Needs attention
							</h2>
						</div>
						<span
							class="rounded-md bg-muted px-2 py-1 text-2xs font-semibold text-foreground"
						>
							{attentionItems.length}
						</span>
					</div>

					<div class="divide-y divide-border">
						{#each attentionItems as item (item.label)}
							{@const ItemIcon = item.icon}
							<a
								href={item.href}
								class="flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
							>
								<span
									class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${attentionIconClasses(
										item.tone
									)}`}
								>
									<ItemIcon class="h-4 w-4" />
								</span>
								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-sm font-medium text-foreground"
									>
										{item.label}
									</span>
									<span class="block truncate text-2xs text-muted-foreground">
										{item.detail}
									</span>
								</span>
								<span class="text-sm font-bold text-foreground">{item.count}</span>
								<ArrowUpRight class="h-4 w-4 shrink-0 text-muted-foreground" />
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<section aria-labelledby="mobile-admin-jump">
				<div class="mb-2">
					<p class="micro-label">NAVIGATION</p>
					<h2
						id="mobile-admin-jump"
						class="mt-0.5 text-base font-semibold text-foreground"
					>
						Jump to
					</h2>
				</div>

				<label class="relative block">
					<span class="sr-only">Find an admin tool</span>
					<Search
						class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="search"
						bind:value={navQuery}
						placeholder="Find users, errors, billing…"
						class="min-h-11 w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring"
					/>
				</label>

				{#if filteredNavCards.length > 0}
					<div class="mt-2 grid grid-cols-2 gap-2">
						{#each filteredNavCards as card (card.href)}
							{@const NavIcon = card.icon}
							<a
								href={card.href}
								class="flex min-h-16 min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 shadow-ink transition-colors hover:border-accent/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								<span
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
								>
									<NavIcon class="h-4 w-4" />
								</span>
								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-xs font-semibold text-foreground"
									>
										{card.title}
									</span>
									<span
										class="mt-0.5 block truncate text-2xs text-muted-foreground"
									>
										{card.badge ?? card.stat ?? card.description}
									</span>
								</span>
							</a>
						{/each}
					</div>
				{:else}
					<div
						class="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center"
					>
						<p class="text-sm font-medium text-foreground">No admin tools found</p>
						<p class="mt-1 text-xs text-muted-foreground">Try a shorter search.</p>
					</div>
				{/if}
			</section>

			<section class="space-y-2" aria-labelledby="mobile-admin-operations">
				<div>
					<p class="micro-label">DETAIL</p>
					<h2
						id="mobile-admin-operations"
						class="mt-0.5 text-base font-semibold text-foreground"
					>
						Operations
					</h2>
				</div>

				<MobileAdminDisclosure
					title="Agent activity"
					subtitle={`Usage across the last ${timeframeLabel}`}
					badge={`${formatCompact(agentChatUsage.totalSessions)} chats`}
					icon={MessageSquare}
					open
				>
					<div class="grid grid-cols-2 divide-x divide-y divide-border">
						<div class="p-3">
							<p class="micro-label">MESSAGES</p>
							<p class="mt-1 text-lg font-bold text-foreground">
								{formatCompact(agentChatUsage.totalMessages)}
							</p>
						</div>
						<div class="p-3">
							<p class="micro-label">USERS</p>
							<p class="mt-1 text-lg font-bold text-foreground">
								{formatCompact(agentChatUsage.uniqueUsers)}
							</p>
						</div>
						<div class="p-3">
							<p class="micro-label">TOKENS</p>
							<p class="mt-1 text-lg font-bold text-foreground">
								{formatCompact(agentChatUsage.totalTokens)}
							</p>
						</div>
						<div class="p-3">
							<p class="micro-label">FAILURE RATE</p>
							<p class="mt-1 text-lg font-bold text-foreground">
								{formatPercent(agentChatUsage.failureRate)}
							</p>
						</div>
					</div>
					<a
						href="/admin/chat"
						class="flex min-h-11 items-center justify-between border-t border-border px-3 text-xs font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						Open chat monitoring
						<ArrowUpRight class="h-4 w-4" />
					</a>
				</MobileAdminDisclosure>

				<MobileAdminDisclosure
					title="Brief delivery"
					subtitle="Email and SMS performance"
					badge={`${formatCompact(briefDelivery.emailDelivered + briefDelivery.smsDelivered)} delivered`}
					icon={Bell}
				>
					<div class="divide-y divide-border">
						<div class="flex items-center justify-between gap-3 px-3 py-2.5">
							<span class="text-xs text-muted-foreground">Generated</span>
							<span class="text-xs font-semibold text-foreground">
								{numberFormatter.format(briefDelivery.briefsGenerated)}
							</span>
						</div>
						<div class="flex items-center justify-between gap-3 px-3 py-2.5">
							<span class="text-xs text-muted-foreground">Email sent / delivered</span
							>
							<span class="text-xs font-semibold text-foreground">
								{numberFormatter.format(briefDelivery.emailSent)} /
								{numberFormatter.format(briefDelivery.emailDelivered)}
							</span>
						</div>
						<div class="flex items-center justify-between gap-3 px-3 py-2.5">
							<span class="text-xs text-muted-foreground">SMS sent / delivered</span>
							<span class="text-xs font-semibold text-foreground">
								{numberFormatter.format(briefDelivery.smsSent)} /
								{numberFormatter.format(briefDelivery.smsDelivered)}
							</span>
						</div>
					</div>
				</MobileAdminDisclosure>

				<MobileAdminDisclosure
					title="Audience pulse"
					subtitle="Active users over the last seven days"
					badge={`${formatCompact(systemOverview.active_users_7d)} active`}
					icon={Users}
				>
					{#if dailyActiveUsers.length > 0}
						<div class="divide-y divide-border">
							{#each dailyActiveUsers.slice(-7) as day (day.date)}
								<div
									class="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 px-3 py-2"
								>
									<span class="truncate text-2xs text-muted-foreground">
										{new Date(day.date).toLocaleDateString('en-US', {
											weekday: 'short',
											month: 'short',
											day: 'numeric'
										})}
									</span>
									<span class="h-1.5 overflow-hidden rounded-full bg-muted">
										<span
											class="block h-full rounded-full bg-accent"
											style:width={`${(day.active_users / dailyActivePeak) * 100}%`}
										></span>
									</span>
									<span class="text-right text-2xs font-semibold text-foreground">
										{day.active_users}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No audience data yet.
						</p>
					{/if}
					<div class="grid grid-cols-3 divide-x divide-border border-t border-border">
						<div class="p-2.5 text-center">
							<p class="micro-label">TOTAL</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{formatCompact(systemOverview.total_users)}
							</p>
						</div>
						<div class="p-2.5 text-center">
							<p class="micro-label">NEW 24H</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{formatCompact(comprehensiveAnalytics.userMetrics.newUsersLast24h)}
							</p>
						</div>
						<div class="p-2.5 text-center">
							<p class="micro-label">CALENDAR</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{formatCompact(comprehensiveAnalytics.calendarConnections)}
							</p>
						</div>
					</div>
				</MobileAdminDisclosure>

				<MobileAdminDisclosure
					title="System health"
					subtitle="Queues, failures, and service metrics"
					badge={`${formatCompact(systemHealth.queueDepth)} queued`}
					icon={Zap}
				>
					<div class="grid grid-cols-3 divide-x divide-border border-b border-border">
						<div class="p-2.5 text-center">
							<p class="micro-label">OLDEST</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{formatDuration(systemHealth.oldestJobSeconds)}
							</p>
						</div>
						<div class="p-2.5 text-center">
							<p class="micro-label">FAILED</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{numberFormatter.format(systemHealth.failedJobs24h)}
							</p>
						</div>
						<div class="p-2.5 text-center">
							<p class="micro-label">ERRORS</p>
							<p class="mt-1 text-sm font-bold text-foreground">
								{numberFormatter.format(systemHealth.errorCount24h)}
							</p>
						</div>
					</div>

					{#if systemMetrics.length > 0}
						<div class="divide-y divide-border">
							{#each systemMetrics.slice(0, 6) as metric (metric.metric_name)}
								<div
									class="flex min-h-10 items-center justify-between gap-3 px-3 py-2"
								>
									<span class="min-w-0 truncate text-xs text-muted-foreground">
										{metric.metric_description || metric.metric_name}
									</span>
									<span class="shrink-0 text-xs font-semibold text-foreground">
										{formatMetricValue(metric)}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</MobileAdminDisclosure>

				<MobileAdminDisclosure
					title="Top active users"
					subtitle="Most activity in the selected period"
					badge={`${systemOverview.top_active_users.length} people`}
					icon={Users}
				>
					{#if systemOverview.top_active_users.length > 0}
						<div class="divide-y divide-border">
							{#each systemOverview.top_active_users.slice(0, 6) as user, index (user.email)}
								<a
									href="/admin/users"
									class="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
								>
									<span
										class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-2xs font-bold text-muted-foreground"
									>
										{index + 1}
									</span>
									<span class="min-w-0 flex-1">
										<span
											class="block truncate text-xs font-medium text-foreground"
										>
											{user.email}
										</span>
										<span class="block text-2xs text-muted-foreground">
											{user.last_activity
												? `Active ${new Date(user.last_activity).toLocaleDateString()}`
												: 'No recent activity'}
										</span>
									</span>
									<span class="text-xs font-bold text-foreground">
										{numberFormatter.format(user.activity_count)}
									</span>
								</a>
							{/each}
						</div>
					{:else}
						<p class="px-3 py-6 text-center text-xs text-muted-foreground">
							No active-user data yet.
						</p>
					{/if}
				</MobileAdminDisclosure>
			</section>

			<section
				class="overflow-hidden rounded-xl border border-border bg-card shadow-ink"
				aria-labelledby="mobile-admin-activity"
			>
				<div class="flex items-center justify-between border-b border-border px-3 py-2.5">
					<div>
						<p class="micro-label">LIVE FEED</p>
						<h2
							id="mobile-admin-activity"
							class="mt-0.5 text-sm font-semibold text-foreground"
						>
							Recent activity
						</h2>
					</div>
					<Activity class="h-4 w-4 text-muted-foreground" />
				</div>

				{#if recentActivity.length > 0}
					<div class="divide-y divide-border">
						{#each recentActivity.slice(0, 6) as activity (`${activity.created_at}-${activity.user_email}-${activity.action}`)}
							<div class="flex min-h-12 items-start gap-3 px-3 py-2">
								<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"></span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-xs font-medium text-foreground">
										{activity.user_email}
									</p>
									<p class="truncate text-2xs text-muted-foreground">
										{formatActivityLabel(activity)}
										{#if activity.entity_name || activity.project_name}
											· {activity.entity_name || activity.project_name}
										{/if}
									</p>
								</div>
								<time
									class="shrink-0 text-2xs text-muted-foreground"
									datetime={activity.created_at}
								>
									{new Date(activity.created_at).toLocaleTimeString([], {
										hour: 'numeric',
										minute: '2-digit'
									})}
								</time>
							</div>
						{/each}
					</div>
				{:else}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						No recent activity.
					</p>
				{/if}
			</section>

			{#if subscriptionData.stripeEnabled}
				<a
					href="/admin/revenue"
					class="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-ink transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
					>
						<CreditCard class="h-4 w-4" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="micro-label block">MONTHLY RECURRING REVENUE</span>
						<span class="mt-0.5 block text-lg font-bold text-foreground">
							{currencyFormatter.format(subscriptionData.revenue.current_mrr)}
						</span>
					</span>
					<ArrowUpRight class="h-4 w-4 text-muted-foreground" />
				</a>
			{/if}
		{/if}
	</div>
</div>
