<!-- apps/web/src/routes/admin/subscriptions/+page.svelte -->
<script lang="ts">
	import {
		Search,
		ChevronLeft,
		ChevronRight,
		User,
		AlertCircle,
		CheckCircle,
		XCircle,
		Clock,
		MoreVertical,
		RefreshCw,
		Ban,
		Gift,
		CreditCard,
		Mail,
		Unlock,
		History,
		AlertTriangle,
		Gauge,
		TrendingUp,
		TrendingDown
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type BillingActor = { id: string; email: string | null; name: string | null };
	type BillingOpsAlert = {
		id: string;
		severity: 'info' | 'warning' | 'critical';
		title: string;
		message: string;
	};
	type BillingOpsMetrics = {
		windowDays: number;
		windowStart: string;
		windowEnd: string;
		counts: {
			frozenActiveCount: number;
			totalAccountsCount: number;
			freezeTransitionsWindowCount: number;
			manualUnfreezeWindowCount: number;
			proToPowerTransitionWindowCount: number;
			autoProToPowerTransitionWindowCount: number;
			paidAccountCount: number;
			currentPowerAccountCount: number;
		};
		rates: {
			manualUnfreezeRate: number;
			autoProToPowerEscalationRate: number;
			currentPowerShare: number;
			frozenAccountShare: number;
		};
		alerts: BillingOpsAlert[];
	};
	type BillingOpsTrendPoint = {
		snapshot_date: string;
		window_days: number;
		frozen_active_count: number;
		manual_unfreeze_rate: number;
		auto_pro_to_power_escalation_rate: number;
		current_power_share: number;
		anomaly_count: number;
	};

	const EMPTY_BILLING_OPS_METRICS: BillingOpsMetrics = {
		windowDays: 30,
		windowStart: '',
		windowEnd: '',
		counts: {
			frozenActiveCount: 0,
			totalAccountsCount: 0,
			freezeTransitionsWindowCount: 0,
			manualUnfreezeWindowCount: 0,
			proToPowerTransitionWindowCount: 0,
			autoProToPowerTransitionWindowCount: 0,
			paidAccountCount: 0,
			currentPowerAccountCount: 0
		},
		rates: {
			manualUnfreezeRate: 0,
			autoProToPowerEscalationRate: 0,
			currentPowerShare: 0,
			frozenAccountShare: 0
		},
		alerts: []
	};

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let users = $state<any[]>([]);
	let searchQuery = $state('');
	let statusFilter = $state('all');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalUsers = $state(0);
	let selectedUser = $state<any>(null);
	let showActionMenu = $state<string | null>(null);
	let processingAction = $state(false);
	let showEmailModal = $state(false);
	let emailUserId = $state('');
	let emailUserName = $state('');
	let emailUserEmail = $state('');
	let billingTimeline = $state<any[]>([]);
	let billingUsersById = $state<Record<string, BillingActor>>({});
	let billingActorOptions = $state<BillingActor[]>([]);
	let billingTimelineLoading = $state(false);
	let billingTimelineError = $state<string | null>(null);
	let timelineSourceFilter = $state('all');
	let timelineActorFilter = $state('all');
	let timelineStartDate = $state('');
	let timelineEndDate = $state('');
	let opsMetrics = $state<BillingOpsMetrics>(EMPTY_BILLING_OPS_METRICS);
	let opsTrends = $state<BillingOpsTrendPoint[]>([]);
	let opsMetricsLoading = $state(false);
	let opsMetricsError = $state<string | null>(null);
	let hasLoadedOpsMetrics = $state(false);

	const ITEMS_PER_PAGE = 50;
	const OPS_METRICS_WINDOW_DAYS = 30;

	const TIMELINE_SOURCE_OPTIONS = [
		{ value: 'all', label: 'All Sources' },
		{ value: 'system', label: 'System' },
		{ value: 'admin', label: 'Admin' },
		{ value: 'user', label: 'User' },
		{ value: 'authenticated', label: 'Authenticated' },
		{ value: 'migration', label: 'Migration' }
	];

	// Load users on mount and when filters change
	$effect(() => {
		if (!browser) return;
		statusFilter; // Track dependency
		currentPage; // Track dependency
		loadUsers();
	});

	$effect(() => {
		if (!browser || hasLoadedOpsMetrics) return;
		hasLoadedOpsMetrics = true;
		loadOpsMetrics();
	});

	async function loadUsers() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: ITEMS_PER_PAGE.toString(),
				status: statusFilter,
				search: searchQuery
			});

			const response = await fetch(`/api/admin/subscriptions/users?${params}`);
			if (!response.ok) throw new Error('Failed to load users');

			const result = await response.json();
			if (result.success) {
				users = result.data.users;
				totalUsers = result.data.pagination.total;
				totalPages = result.data.pagination.totalPages;
			} else {
				throw new Error(result.error || 'Failed to load users');
			}
		} catch (err) {
			console.error('Error loading users:', err);
			error = err instanceof Error ? err.message : 'Failed to load users';
		} finally {
			isLoading = false;
		}
	}

	async function searchUsers() {
		currentPage = 1;
		await loadUsers();
	}

	async function loadOpsMetrics() {
		if (!browser) return;
		opsMetricsLoading = true;
		opsMetricsError = null;

		try {
			const params = new URLSearchParams({
				includeMetrics: 'true',
				metricsWindowDays: OPS_METRICS_WINDOW_DAYS.toString(),
				limit: '1'
			});

			const response = await fetch(`/api/admin/subscriptions/billing?${params.toString()}`);
			if (!response.ok) throw new Error('Failed to load billing metrics');
			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Failed to load billing metrics');

			opsMetrics = (result.data.opsMetrics || EMPTY_BILLING_OPS_METRICS) as BillingOpsMetrics;
			opsTrends = (result.data.opsTrends || []) as BillingOpsTrendPoint[];
		} catch (err) {
			console.error('Error loading billing metrics:', err);
			opsMetricsError = err instanceof Error ? err.message : 'Failed to load billing metrics';
		} finally {
			opsMetricsLoading = false;
		}
	}

	function formatPercent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}

	function getOpsAlertClass(severity: BillingOpsAlert['severity']): string {
		switch (severity) {
			case 'critical':
				return 'bg-destructive/10 border-destructive/40 text-destructive';
			case 'warning':
				return 'bg-warning/10 border-warning/40 text-warning-foreground';
			default:
				return 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'trialing':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'canceled':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'past_due':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
			case 'unpaid':
				return 'bg-muted text-foreground dark:text-muted-foreground';
			default:
				return 'bg-muted text-foreground dark:text-muted-foreground';
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return CheckCircle;
			case 'trialing':
				return Clock;
			case 'canceled':
				return XCircle;
			case 'past_due':
				return AlertCircle;
			default:
				return AlertCircle;
		}
	}

	function getBillingStateLabel(billingState: string | null | undefined) {
		switch (billingState) {
			case 'upgrade_required_frozen':
				return 'Frozen';
			case 'pro_active':
				return 'Pro';
			case 'power_active':
				return 'Power';
			case 'explorer_active':
				return 'Explorer';
			default:
				return 'Unknown';
		}
	}

	function getBillingStateColor(billingState: string | null | undefined) {
		switch (billingState) {
			case 'upgrade_required_frozen':
				return 'bg-warning/20 text-warning-foreground border border-warning/40';
			case 'pro_active':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'power_active':
				return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
			case 'explorer_active':
				return 'bg-muted text-foreground dark:text-muted-foreground';
			default:
				return 'bg-muted text-foreground dark:text-muted-foreground';
		}
	}

	function getActorLabel(actorId: string): string {
		const actor = billingUsersById[actorId];
		if (!actor) return actorId;
		return actor.name || actor.email || actor.id;
	}

	async function performAction(action: string, userId: string, subscriptionId: string) {
		if (processingAction) return;
		processingAction = true;
		showActionMenu = null;

		try {
			let body: any = { action, userId, subscriptionId };

			if (action === 'cancel') {
				const reason = prompt('Please provide a reason for cancellation:');
				if (!reason) {
					processingAction = false;
					return;
				}
				body.reason = reason;
			}

			if (action === 'add_discount') {
				const discountCode = prompt('Enter discount code to apply:');
				if (!discountCode) {
					processingAction = false;
					return;
				}
				body.discountCode = discountCode;
			}

			const response = await fetch('/api/admin/subscriptions/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) throw new Error('Action failed');

			// Reload users after action
			await loadUsers();
		} catch (err) {
			console.error('Error performing action:', err);
			alert('Failed to perform action. Please try again.');
		} finally {
			processingAction = false;
		}
	}

	async function loadBillingTimeline(userId: string) {
		billingTimelineLoading = true;
		billingTimelineError = null;
		try {
			const params = new URLSearchParams({
				userId,
				limit: '100'
			});
			if (timelineSourceFilter !== 'all') {
				params.set('source', timelineSourceFilter);
			}
			if (timelineActorFilter !== 'all') {
				params.set('actorUserId', timelineActorFilter);
			}
			if (timelineStartDate) {
				params.set('startDate', timelineStartDate);
			}
			if (timelineEndDate) {
				params.set('endDate', timelineEndDate);
			}
			const response = await fetch(`/api/admin/subscriptions/billing?${params.toString()}`);
			if (!response.ok) throw new Error('Failed to load billing timeline');

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || 'Failed to load billing timeline');
			}

			billingTimeline = result.data.timeline || [];
			billingUsersById = result.data.usersById || {};
			billingActorOptions = result.data.actorOptions || [];
		} catch (err) {
			console.error('Error loading billing timeline:', err);
			billingTimelineError =
				err instanceof Error ? err.message : 'Failed to load billing timeline';
		} finally {
			billingTimelineLoading = false;
		}
	}

	async function openBillingTimeline(user: any) {
		timelineSourceFilter = 'all';
		timelineActorFilter = 'all';
		timelineStartDate = '';
		timelineEndDate = '';
		selectedUser = user;
		await loadBillingTimeline(user.id);
	}

	async function applyTimelineFilters() {
		if (!selectedUser) return;
		await loadBillingTimeline(selectedUser.id);
	}

	async function clearTimelineFilters() {
		timelineSourceFilter = 'all';
		timelineActorFilter = 'all';
		timelineStartDate = '';
		timelineEndDate = '';
		if (!selectedUser) return;
		await loadBillingTimeline(selectedUser.id);
	}

	async function manualUnfreeze(userId: string) {
		if (processingAction) return;
		processingAction = true;
		showActionMenu = null;

		try {
			const note = prompt('Optional note for audit timeline (optional):') || undefined;

			const response = await fetch('/api/admin/subscriptions/billing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'manual_unfreeze',
					userId,
					note
				})
			});

			if (!response.ok) throw new Error('Manual unfreeze failed');
			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Manual unfreeze failed');

			await loadUsers();
			await loadOpsMetrics();
			if (selectedUser?.id === userId) {
				await loadBillingTimeline(userId);
			}
		} catch (err) {
			console.error('Error running manual unfreeze:', err);
			alert(err instanceof Error ? err.message : 'Failed to unfreeze billing account');
		} finally {
			processingAction = false;
		}
	}

	function toggleActionMenu(userId: string) {
		showActionMenu = showActionMenu === userId ? null : userId;
	}

	// Close action menu when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (showActionMenu && !(event.target as Element).closest('[data-action-menu]')) {
			showActionMenu = null;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<svelte:head>
	<title>Subscription Management - Admin</title>
</svelte:head>

<div class="admin-page">
	<!-- Header with Back Button -->
	<AdminPageHeader
		title="Subscription Management"
		description="Manage user subscriptions and billing"
		icon={CreditCard}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	<!-- Billing Ops Snapshot -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="admin-panel p-4">
			<div class="flex items-center justify-between mb-2">
				<p class="text-sm text-muted-foreground">Frozen Accounts</p>
				<Gauge class="h-4 w-4 text-muted-foreground" />
			</div>
			<p class="text-2xl font-semibold text-foreground">
				{opsMetrics.counts.frozenActiveCount}
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				{formatPercent(opsMetrics.rates.frozenAccountShare)} of billing accounts
			</p>
		</div>
		<div class="admin-panel p-4">
			<div class="flex items-center justify-between mb-2">
				<p class="text-sm text-muted-foreground">
					Manual Unfreeze Rate ({opsMetrics.windowDays}d)
				</p>
				<AlertTriangle class="h-4 w-4 text-muted-foreground" />
			</div>
			<p class="text-2xl font-semibold text-foreground">
				{formatPercent(opsMetrics.rates.manualUnfreezeRate)}
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				{opsMetrics.counts.manualUnfreezeWindowCount} manual unfreezes /
				{opsMetrics.counts.freezeTransitionsWindowCount} freezes
			</p>
		</div>
		<div class="admin-panel p-4">
			<div class="flex items-center justify-between mb-2">
				<p class="text-sm text-muted-foreground">
					Auto Pro->Power Rate ({opsMetrics.windowDays}d)
				</p>
				<TrendingUp class="h-4 w-4 text-muted-foreground" />
			</div>
			<p class="text-2xl font-semibold text-foreground">
				{formatPercent(opsMetrics.rates.autoProToPowerEscalationRate)}
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				{opsMetrics.counts.autoProToPowerTransitionWindowCount} auto escalations
			</p>
		</div>
		<div class="admin-panel p-4">
			<div class="flex items-center justify-between mb-2">
				<p class="text-sm text-muted-foreground">Current Power Share</p>
				<TrendingDown class="h-4 w-4 text-muted-foreground" />
			</div>
			<p class="text-2xl font-semibold text-foreground">
				{formatPercent(opsMetrics.rates.currentPowerShare)}
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				{opsMetrics.counts.currentPowerAccountCount} of {opsMetrics.counts.paidAccountCount}
				paid accounts
			</p>
		</div>
	</div>

	{#if opsMetricsError}
		<div
			class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
		>
			<div class="flex items-center">
				<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
				<p class="text-red-800 dark:text-red-200">{opsMetricsError}</p>
			</div>
		</div>
	{/if}

	{#if opsMetrics.alerts.length > 0}
		<div class="admin-panel p-4 mb-6">
			<h3 class="text-sm font-semibold text-foreground mb-3">Billing Ops Alerts</h3>
			<div class="space-y-2">
				{#each opsMetrics.alerts as alert (alert.id)}
					<div class="rounded-md border px-3 py-2 {getOpsAlertClass(alert.severity)}">
						<p class="text-sm font-medium">{alert.title}</p>
						<p class="text-xs">{alert.message}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if opsTrends.length > 0}
		<div class="admin-panel p-4 mb-6">
			<h3 class="text-sm font-semibold text-foreground mb-3">
				Recent Snapshot Trend ({opsMetrics.windowDays}d Window)
			</h3>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted">
						<tr>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Date</th
							>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Frozen</th
							>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Manual Unfreeze</th
							>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Auto Pro->Power</th
							>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Power Share</th
							>
							<th
								class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
								>Anomalies</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each opsTrends as trend}
							<tr class="hover:bg-muted/40">
								<td class="px-3 py-2 text-sm text-foreground">
									{new Date(
										`${trend.snapshot_date}T00:00:00Z`
									).toLocaleDateString()}
								</td>
								<td class="px-3 py-2 text-sm text-foreground"
									>{trend.frozen_active_count}</td
								>
								<td class="px-3 py-2 text-sm text-foreground"
									>{formatPercent(trend.manual_unfreeze_rate)}</td
								>
								<td class="px-3 py-2 text-sm text-foreground"
									>{formatPercent(trend.auto_pro_to_power_escalation_rate)}</td
								>
								<td class="px-3 py-2 text-sm text-foreground"
									>{formatPercent(trend.current_power_share)}</td
								>
								<td class="px-3 py-2 text-sm text-foreground"
									>{trend.anomaly_count}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Filters and Search -->
	<div class="admin-panel p-4">
		<div class="flex flex-col sm:flex-row gap-4">
			<!-- Search -->
			<div class="flex-1">
				<TextInput
					type="text"
					bind:value={searchQuery}
					onkeyup={(e) => e.key === 'Enter' && searchUsers()}
					placeholder="Search by email or name..."
					size="md"
				/>
			</div>

			<!-- Status Filter -->
			<Select
				bind:value={statusFilter}
				onchange={(e) => (statusFilter = e.detail)}
				size="md"
				placeholder="All Statuses"
			>
				<option value="all">All Statuses</option>
				<option value="active">Active</option>
				<option value="trialing">Trial</option>
				<option value="past_due">Past Due</option>
				<option value="canceled">Canceled</option>
				<option value="none">No Subscription</option>
			</Select>

			<!-- Search Button -->
			<Button
				onclick={searchUsers}
				disabled={isLoading}
				variant="primary"
				size="md"
				icon={Search}
			>
				Search
			</Button>

			<!-- Refresh -->
			<Button
				onclick={() => {
					loadUsers();
					loadOpsMetrics();
				}}
				disabled={isLoading || opsMetricsLoading}
				variant="secondary"
				size="md"
				icon={RefreshCw}
				class={isLoading || opsMetricsLoading ? 'animate-spin' : ''}
			/>
		</div>
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

	<!-- Users Table -->
	<div class="admin-panel overflow-hidden">
		{#if isLoading}
			<div class="p-8 text-center">
				<RefreshCw class="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
				<p class="text-muted-foreground">Loading users...</p>
			</div>
		{:else if users.length === 0}
			<div class="p-8 text-center">
				<User class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
				<p class="text-muted-foreground">No users found</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
					<thead class="bg-muted">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								User
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Subscription
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Status
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Revenue
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Next Billing
							</th>
							<th class="relative px-6 py-3">
								<span class="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody class="bg-card divide-y divide-gray-200 dark:divide-gray-700">
						{#each users as user}
							{@const subscription = user.customer_subscriptions?.[0]}
							<tr class="hover:bg-muted/50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<div>
											<div class="text-sm font-medium text-foreground">
												{user.name || 'Unnamed User'}
											</div>
											<div class="text-sm text-muted-foreground">
												{user.email}
											</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if subscription}
										<div class="text-sm text-foreground">
											{subscription.subscription_plans?.name ||
												'Unknown Plan'}
										</div>
										<div class="text-sm text-muted-foreground">
											${(
												subscription.subscription_plans?.price / 100
											).toFixed(2)}/{subscription.subscription_plans
												?.interval}
										</div>
									{:else}
										<span class="text-sm text-muted-foreground">
											No subscription
										</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if subscription}
										{@const StatusIcon = getStatusIcon(subscription.status)}
										<span
											class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium {getStatusColor(
												subscription.status
											)}"
										>
											<StatusIcon class="w-3 h-3 mr-1" />
											{subscription.status}
										</span>
									{:else}
										<span
											class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium bg-muted text-foreground dark:text-muted-foreground"
										>
											None
										</span>
									{/if}
									{#if user.billing_account}
										<div class="mt-2">
											<span
												class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium {getBillingStateColor(
													user.billing_account.billing_state
												)}"
											>
												{getBillingStateLabel(
													user.billing_account.billing_state
												)}
											</span>
										</div>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
									{#if subscription}
										${(
											(subscription.subscription_plans?.price || 0) / 100
										).toFixed(2)}
									{:else}
										$0.00
									{/if}
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
								>
									{#if subscription?.current_period_end}
										{new Date(
											subscription.current_period_end
										).toLocaleDateString()}
									{:else}
										-
									{/if}
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
								>
									{#if subscription || user.billing_account}
										<div class="relative" data-action-menu>
											<Button
												onclick={(e) => {
													e.stopPropagation();
													toggleActionMenu(user.id);
												}}
												variant="ghost"
												size="sm"
												icon={MoreVertical}
												btnType="container"
												class="!p-1"
											/>

											{#if showActionMenu === user.id}
												<div
													class="absolute right-0 mt-2 w-48 bg-card rounded-md shadow-ink-strong z-10 border border-border"
												>
													<div class="py-1">
														{#if subscription?.status === 'active'}
															<Button
																onclick={() =>
																	performAction(
																		'cancel',
																		user.id,
																		subscription.id
																	)}
																variant="ghost"
																size="sm"
																icon={Ban}
																class="w-full justify-start text-left"
															>
																Cancel Subscription
															</Button>
														{/if}

														{#if subscription?.status === 'trialing'}
															<Button
																onclick={() =>
																	performAction(
																		'extend_trial',
																		user.id,
																		subscription.id
																	)}
																variant="ghost"
																size="sm"
																icon={Clock}
																class="w-full justify-start text-left"
															>
																Extend Trial
															</Button>
														{/if}

														{#if subscription}
															<Button
																onclick={() =>
																	performAction(
																		'add_discount',
																		user.id,
																		subscription.id
																	)}
																variant="ghost"
																size="sm"
																icon={Gift}
																class="w-full justify-start text-left"
															>
																Apply Discount
															</Button>
														{/if}

														<Button
															onclick={() => manualUnfreeze(user.id)}
															variant="ghost"
															size="sm"
															icon={Unlock}
															class="w-full justify-start text-left"
														>
															Manual Unfreeze
														</Button>

														<Button
															onclick={() =>
																openBillingTimeline(user)}
															variant="ghost"
															size="sm"
															icon={History}
															class="w-full justify-start text-left"
														>
															Billing Timeline
														</Button>

														<Button
															onclick={() => {
																emailUserId = user.id;
																emailUserName = user.name;
																emailUserEmail = user.email;
																showEmailModal = true;
																showActionMenu = null;
															}}
															variant="ghost"
															size="sm"
															icon={Mail}
															class="w-full justify-start text-left"
														>
															Send Email
														</Button>

														<a
															href="/admin/users/{user.id}"
															class="flex items-center w-full px-4 py-2 text-sm text-foreground hover:bg-muted"
														>
															<User class="w-4 h-4 mr-2" />
															View User Details
														</a>
													</div>
												</div>
											{/if}
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			<div
				class="bg-muted px-4 py-3 flex items-center justify-between border-t border-border sm:px-6"
			>
				<div class="flex-1 flex justify-between sm:hidden">
					<Button
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}
						variant="secondary"
						size="sm"
					>
						Previous
					</Button>
					<Button
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}
						variant="secondary"
						size="sm"
					>
						Next
					</Button>
				</div>
				<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
					<div>
						<p class="text-sm text-foreground">
							Showing page <span class="font-medium">{currentPage}</span> of
							<span class="font-medium">{totalPages}</span>
							({totalUsers} total users)
						</p>
					</div>
					<div>
						<nav class="relative z-0 inline-flex rounded-md shadow-ink -space-x-px">
							<Button
								onclick={() => (currentPage = Math.max(1, currentPage - 1))}
								disabled={currentPage === 1}
								variant="secondary"
								size="sm"
								icon={ChevronLeft}
								class="rounded-r-none"
							/>
							<Button
								onclick={() =>
									(currentPage = Math.min(totalPages, currentPage + 1))}
								disabled={currentPage === totalPages}
								variant="secondary"
								size="sm"
								icon={ChevronRight}
								class="rounded-l-none -ml-px"
							/>
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#if selectedUser}
		<div class="admin-panel mt-6 p-4">
			<div class="flex items-center justify-between mb-4">
				<div>
					<h3 class="text-lg font-semibold text-foreground">Billing Audit Timeline</h3>
					<p class="text-sm text-muted-foreground">
						{selectedUser.name || 'Unnamed User'} ({selectedUser.email})
					</p>
				</div>
				<Button
					onclick={() => loadBillingTimeline(selectedUser.id)}
					disabled={billingTimelineLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					class={billingTimelineLoading ? 'animate-spin' : ''}
				>
					Refresh
				</Button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
				<Select
					bind:value={timelineSourceFilter}
					onchange={(e) => (timelineSourceFilter = e.detail)}
					size="md"
				>
					{#each TIMELINE_SOURCE_OPTIONS as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</Select>

				<Select
					bind:value={timelineActorFilter}
					onchange={(e) => (timelineActorFilter = e.detail)}
					size="md"
				>
					<option value="all">All Actors</option>
					{#each billingActorOptions as actor}
						<option value={actor.id}>{actor.name || actor.email || actor.id}</option>
					{/each}
				</Select>

				<TextInput type="date" bind:value={timelineStartDate} size="md" />
				<TextInput type="date" bind:value={timelineEndDate} size="md" />

				<div class="flex gap-2">
					<Button
						onclick={applyTimelineFilters}
						disabled={billingTimelineLoading}
						variant="primary"
						size="md"
					>
						Apply
					</Button>
					<Button
						onclick={clearTimelineFilters}
						disabled={billingTimelineLoading}
						variant="secondary"
						size="md"
					>
						Clear
					</Button>
				</div>
			</div>

			{#if billingTimelineError}
				<p class="text-sm text-destructive mb-3">{billingTimelineError}</p>
			{/if}

			{#if billingTimelineLoading}
				<div class="py-6 text-center text-sm text-muted-foreground">
					Loading billing timeline...
				</div>
			{:else if billingTimeline.length === 0}
				<div class="py-6 text-center text-sm text-muted-foreground">
					No billing transitions found.
				</div>
			{:else}
				<div class="space-y-3">
					{#each billingTimeline as event}
						<div class="rounded-md border border-border bg-card px-4 py-3">
							<div
								class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="text-sm text-foreground">
									<span class="font-medium"
										>{event.from_billing_state || 'null'}</span
									>
									<span class="text-muted-foreground mx-1">→</span>
									<span class="font-medium">{event.to_billing_state}</span>
									<span class="text-muted-foreground ml-2">
										({event.from_billing_tier || 'null'} → {event.to_billing_tier})
									</span>
								</div>
								<div class="text-xs text-muted-foreground">
									{new Date(event.created_at).toLocaleString()}
								</div>
							</div>
							<div class="mt-1 text-xs text-muted-foreground">
								source: {event.change_source}
								{#if event.changed_by_user_id}
									• actor: {getActorLabel(event.changed_by_user_id)}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Email Composer Modal -->
<EmailComposerModal
	bind:isOpen={showEmailModal}
	userId={emailUserId}
	userName={emailUserName}
	userEmail={emailUserEmail}
	on:emailSent={() => {
		showEmailModal = false;
	}}
/>
