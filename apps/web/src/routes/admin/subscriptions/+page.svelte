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
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { FormConfig } from '$lib/types/form';

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

	// Input-collecting action prompts (replaces native prompt() dialogs).
	type ActionPromptKind = 'cancel' | 'add_discount' | 'manual_unfreeze';
	let actionPrompt = $state<{
		kind: ActionPromptKind;
		userId: string;
		subscriptionId?: string;
	} | null>(null);

	const ACTION_PROMPTS: Record<
		ActionPromptKind,
		{ title: string; submitText: string; loadingText: string; config: FormConfig }
	> = {
		cancel: {
			title: 'Cancel Subscription',
			submitText: 'Cancel Subscription',
			loadingText: 'Cancelling…',
			config: {
				reason: {
					type: 'textarea',
					label: 'Cancellation reason',
					required: true,
					rows: 3,
					placeholder: 'Why is this subscription being cancelled?'
				}
			}
		},
		add_discount: {
			title: 'Apply Discount',
			submitText: 'Apply Discount',
			loadingText: 'Applying…',
			config: {
				discountCode: {
					type: 'text',
					label: 'Discount code',
					required: true,
					placeholder: 'e.g. WELCOME20'
				}
			}
		},
		manual_unfreeze: {
			title: 'Manual Unfreeze',
			submitText: 'Unfreeze Account',
			loadingText: 'Unfreezing…',
			config: {
				note: {
					type: 'textarea',
					label: 'Audit note (optional)',
					required: false,
					rows: 2,
					placeholder: 'Optional note for the billing audit timeline'
				}
			}
		}
	};
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
				return 'bg-info/10 border-info/40 text-info';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active':
				return 'bg-success/10 text-success';
			case 'trialing':
				return 'bg-info/10 text-info';
			case 'canceled':
				return 'bg-destructive/10 text-destructive';
			case 'past_due':
				return 'bg-accent/10 text-accent';
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
				return 'bg-info/10 text-info';
			case 'power_active':
				return 'bg-accent/10 text-accent';
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

	// Actions that need extra input (cancel reason, discount code, unfreeze note)
	// open a FormModal instead of a native prompt(). The rest run immediately.
	function openActionPrompt(kind: ActionPromptKind, userId: string, subscriptionId?: string) {
		showActionMenu = null;
		actionPrompt = { kind, userId, subscriptionId };
	}

	async function submitActionPrompt(data: Record<string, any>) {
		if (!actionPrompt) return;
		const { kind, userId, subscriptionId } = actionPrompt;

		if (kind === 'manual_unfreeze') {
			await runManualUnfreeze(userId, data.note?.trim() || undefined);
		} else {
			const body: any = { action: kind, userId, subscriptionId };
			if (kind === 'cancel') body.reason = data.reason?.trim();
			if (kind === 'add_discount') body.discountCode = data.discountCode?.trim();

			const response = await fetch('/api/admin/subscriptions/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || result?.success === false) {
				// Thrown errors are surfaced inline by FormModal; the modal stays open.
				throw new Error(result?.error || 'Action failed. Please try again.');
			}
			await loadUsers();
			toastService.success(kind === 'cancel' ? 'Subscription cancelled' : 'Discount applied');
		}

		actionPrompt = null;
	}

	async function performAction(action: string, userId: string, subscriptionId: string) {
		if (processingAction) return;
		processingAction = true;
		showActionMenu = null;

		try {
			const response = await fetch('/api/admin/subscriptions/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, userId, subscriptionId })
			});

			if (!response.ok) throw new Error('Action failed');

			// Reload users after action
			await loadUsers();
			toastService.success('Action completed');
		} catch (err) {
			console.error('Error performing action:', err);
			toastService.error('Failed to perform action. Please try again.');
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

	async function runManualUnfreeze(userId: string, note?: string) {
		const response = await fetch('/api/admin/subscriptions/billing', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'manual_unfreeze',
				userId,
				note
			})
		});

		const result = await response.json().catch(() => null);
		if (!response.ok || result?.success === false) {
			// Surfaced inline by FormModal; the modal stays open for a retry.
			throw new Error(result?.error || 'Failed to unfreeze billing account');
		}

		await loadUsers();
		await loadOpsMetrics();
		if (selectedUser?.id === userId) {
			await loadBillingTimeline(userId);
		}
		toastService.success('Billing account unfrozen');
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
					Auto Pro→Power Rate ({opsMetrics.windowDays}d)
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
		<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
			<div class="flex items-center">
				<AlertCircle class="h-5 w-5 text-destructive mr-2" />
				<p class="text-destructive">{opsMetricsError}</p>
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
			<!-- Mobile card list -->
			<ul class="space-y-2 lg:hidden">
				{#each opsTrends as trend}
					<li class="rounded-md border border-border bg-card px-3 py-2">
						<p class="text-sm font-medium text-foreground">
							{new Date(`${trend.snapshot_date}T00:00:00Z`).toLocaleDateString()}
						</p>
						<dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
							<dt class="text-muted-foreground">Frozen</dt>
							<dd class="text-right text-foreground">{trend.frozen_active_count}</dd>
							<dt class="text-muted-foreground">Manual Unfreeze</dt>
							<dd class="text-right text-foreground">
								{formatPercent(trend.manual_unfreeze_rate)}
							</dd>
							<dt class="text-muted-foreground">Auto Pro→Power</dt>
							<dd class="text-right text-foreground">
								{formatPercent(trend.auto_pro_to_power_escalation_rate)}
							</dd>
							<dt class="text-muted-foreground">Power Share</dt>
							<dd class="text-right text-foreground">
								{formatPercent(trend.current_power_share)}
							</dd>
							<dt class="text-muted-foreground">Anomalies</dt>
							<dd class="text-right text-foreground">{trend.anomaly_count}</dd>
						</dl>
					</li>
				{/each}
			</ul>
			<div class="hidden lg:block overflow-x-auto">
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
								>Auto Pro→Power</th
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
			<Select bind:value={statusFilter} size="md" placeholder="All Statuses">
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
				class={isLoading || opsMetricsLoading
					? 'animate-spin motion-reduce:animate-none'
					: ''}
			/>
		</div>
	</div>

	{#if error}
		<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
			<div class="flex items-center">
				<AlertCircle class="h-5 w-5 text-destructive mr-2" />
				<p class="text-destructive">{error}</p>
			</div>
		</div>
	{/if}

	{#snippet rowActions(user: any, subscription: any)}
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
					class="!p-2.5 min-h-11 min-w-11"
				/>

				{#if showActionMenu === user.id}
					<div
						class="absolute right-0 mt-2 w-48 bg-card rounded-md shadow-ink-strong z-10 border border-border"
					>
						<div class="py-1">
							{#if subscription?.status === 'active'}
								<Button
									onclick={() =>
										openActionPrompt('cancel', user.id, subscription.id)}
									variant="ghost"
									size="sm"
									icon={Ban}
									class="w-full justify-start text-left text-destructive"
								>
									Cancel Subscription
								</Button>
								<div class="my-1 border-t border-border"></div>
							{/if}

							{#if subscription?.status === 'trialing'}
								<Button
									onclick={() =>
										performAction('extend_trial', user.id, subscription.id)}
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
										openActionPrompt('add_discount', user.id, subscription.id)}
									variant="ghost"
									size="sm"
									icon={Gift}
									class="w-full justify-start text-left"
								>
									Apply Discount
								</Button>
							{/if}

							<Button
								onclick={() => openActionPrompt('manual_unfreeze', user.id)}
								variant="ghost"
								size="sm"
								icon={Unlock}
								class="w-full justify-start text-left"
							>
								Manual Unfreeze
							</Button>

							<Button
								onclick={() => openBillingTimeline(user)}
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
								class="flex items-center w-full px-4 py-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<User class="w-4 h-4 mr-2" />
								View User Details
							</a>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}

	<!-- Users Table -->
	<div class="admin-panel overflow-hidden">
		{#if isLoading}
			<div class="p-8 text-center">
				<RefreshCw
					class="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground mx-auto mb-4"
				/>
				<p class="text-muted-foreground">Loading users...</p>
			</div>
		{:else if users.length === 0}
			<div class="p-8 text-center">
				<User class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
				<p class="text-muted-foreground">No users found</p>
			</div>
		{:else}
			<!-- Mobile card list -->
			<ul class="divide-y divide-border lg:hidden">
				{#each users as user}
					{@const subscription = user.customer_subscriptions?.[0]}
					<li class="p-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<div class="truncate text-sm font-medium text-foreground">
									{user.name || 'Unnamed User'}
								</div>
								<div class="truncate text-xs text-muted-foreground">
									{user.email}
								</div>
							</div>
							{@render rowActions(user, subscription)}
						</div>

						<div class="mt-2 flex flex-wrap items-center gap-2">
							{#if subscription}
								{@const StatusIcon = getStatusIcon(subscription.status)}
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusColor(
										subscription.status
									)}"
								>
									<StatusIcon class="mr-1 h-3 w-3" />
									{subscription.status}
								</span>
							{:else}
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground dark:text-muted-foreground"
								>
									None
								</span>
							{/if}
							{#if user.billing_account}
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getBillingStateColor(
										user.billing_account.billing_state
									)}"
								>
									{getBillingStateLabel(user.billing_account.billing_state)}
								</span>
							{/if}
						</div>

						<div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Plan</span>
								<span class="truncate font-medium text-foreground">
									{#if subscription}
										{subscription.subscription_plans?.name || 'Unknown'}
									{:else}
										None
									{/if}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Revenue</span>
								<span class="font-medium text-foreground">
									${(
										(subscription?.subscription_plans?.price || 0) / 100
									).toFixed(2)}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Next billing</span>
								<span class="font-medium text-foreground">
									{subscription?.current_period_end
										? new Date(
												subscription.current_period_end
											).toLocaleDateString()
										: '-'}
								</span>
							</div>
						</div>
					</li>
				{/each}
			</ul>

			<div class="hidden overflow-x-auto lg:block">
				<table class="min-w-full divide-y divide-border">
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
					<tbody class="bg-card divide-y divide-border">
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
									{@render rowActions(user, subscription)}
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
					class={billingTimelineLoading ? 'animate-spin motion-reduce:animate-none' : ''}
				>
					Refresh
				</Button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
				<Select bind:value={timelineSourceFilter} size="md">
					{#each TIMELINE_SOURCE_OPTIONS as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</Select>

				<Select bind:value={timelineActorFilter} size="md">
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
	onEmailSent={() => {
		showEmailModal = false;
	}}
/>

<!-- Action input prompt (cancel reason / discount code / unfreeze note) -->
{#if actionPrompt}
	<FormModal
		isOpen={true}
		size="sm"
		title={ACTION_PROMPTS[actionPrompt.kind].title}
		submitText={ACTION_PROMPTS[actionPrompt.kind].submitText}
		loadingText={ACTION_PROMPTS[actionPrompt.kind].loadingText}
		formConfig={ACTION_PROMPTS[actionPrompt.kind].config}
		onSubmit={submitActionPrompt}
		onClose={() => (actionPrompt = null)}
	/>
{/if}
