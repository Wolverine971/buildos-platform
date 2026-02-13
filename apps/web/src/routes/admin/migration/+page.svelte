<!-- apps/web/src/routes/admin/migration/+page.svelte -->
<!-- Global Migration Dashboard with tabbed navigation -->
<script lang="ts">
	import { GitBranch, Globe, User, AlertTriangle, Play, RefreshCw, Users } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ProgressCards from '$lib/components/admin/migration/ProgressCards.svelte';
	import GlobalProgressBar from '$lib/components/admin/migration/GlobalProgressBar.svelte';
	import UserList from '$lib/components/admin/migration/UserList.svelte';
	import RecentRuns from '$lib/components/admin/migration/RecentRuns.svelte';
	import ConfirmationModal from '$lib/components/admin/migration/ConfirmationModal.svelte';
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { MigrationUserStatus } from '$lib/components/admin/migration/UserList.svelte';
	import type {
		GlobalProgress,
		LockStatus,
		UserMigrationStats,
		UserListResponse
	} from '$lib/services/ontology/migration-stats.service';

	let { data }: { data: PageData } = $props();

	// View state
	type ViewTab = 'overview' | 'users' | 'user-detail';
	let activeTab = $state<ViewTab>(data.viewMode === 'user' ? 'user-detail' : 'overview');

	// User list state
	let usersData = $state<UserListResponse | null>(null);
	let usersLoading = $state(false);
	let userSearchQuery = $state('');
	let userStatusFilter = $state<MigrationUserStatus | null>(null);
	let userOffset = $state(0);

	// Platform migration modal
	let showPlatformMigrationModal = $state(false);
	let platformMigrationLoading = $state(false);
	let costEstimate = $state<{
		tokens: number;
		cost: number;
		estimatedDuration: string;
		model?: string;
	} | null>(null);
	let costEstimateLoading = $state(false);

	// Refresh stats
	let refreshingStats = $state(false);

	// Message states
	let successMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	// Derived progress stats for ProgressCards
	const progressStats = $derived(
		data.globalProgress
			? {
					projects: data.globalProgress.projects,
					tasks: data.globalProgress.tasks,
					users: data.globalProgress.users,
					errors: data.globalProgress.errors
				}
			: {
					projects: { total: 0, migrated: 0, pending: 0, failed: 0, percentComplete: 0 },
					tasks: { total: 0, migrated: 0, pending: 0, percentComplete: 0 },
					users: {
						total: 0,
						withProjects: 0,
						fullyMigrated: 0,
						partiallyMigrated: 0,
						notStarted: 0
					},
					errors: { total: 0, recoverable: 0, dataErrors: 0, fatal: 0 }
				}
	);

	// Derived active run and recent runs for RecentRuns component
	const activeRun = $derived(data.globalProgress?.activeRun ?? null);
	const recentRuns = $derived(data.globalProgress?.recentRuns ?? []);

	// Message handling
	function setSuccess(msg: string) {
		successMessage = msg;
		setTimeout(() => {
			if (successMessage === msg) successMessage = null;
		}, 4000);
	}

	function setError(msg: string) {
		errorMessage = msg;
		setTimeout(() => {
			if (errorMessage === msg) errorMessage = null;
		}, 6000);
	}

	// API helpers
	async function apiPost<T>(url: string, payload: unknown): Promise<T> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok || !body?.success) {
			throw new Error(body?.error ?? body?.message ?? 'Request failed');
		}
		return body.data as T;
	}

	async function apiGet<T>(url: string): Promise<T> {
		const response = await fetch(url);
		const body = await response.json().catch(() => ({}));
		if (!response.ok || !body?.success) {
			throw new Error(body?.error ?? body?.message ?? 'Request failed');
		}
		return body.data as T;
	}

	// Tab switching
	async function switchTab(tab: ViewTab) {
		activeTab = tab;
		if (tab === 'users' && !usersData) {
			await loadUsers();
		}
	}

	// Load users
	async function loadUsers() {
		usersLoading = true;
		try {
			const params = new URLSearchParams();
			params.set('limit', '25');
			params.set('offset', String(userOffset));
			if (userStatusFilter) params.set('status', userStatusFilter);
			if (userSearchQuery) params.set('search', userSearchQuery);

			const result = await apiGet<UserListResponse>(`/api/admin/migration/users?${params}`);
			usersData = result;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load users');
		} finally {
			usersLoading = false;
		}
	}

	// User list handlers
	function handleUserPageChange(offset: number) {
		userOffset = offset;
		loadUsers();
	}

	function handleUserStatusFilter(status: MigrationUserStatus | null) {
		userStatusFilter = status;
		userOffset = 0;
		loadUsers();
	}

	function handleUserSearch(query: string) {
		userSearchQuery = query;
		userOffset = 0;
		loadUsers();
	}

	function handleUserClick(userId: string) {
		goto(`/admin/migration/users/${userId}`);
	}

	// Refresh stats
	async function handleRefreshStats() {
		refreshingStats = true;
		try {
			await apiPost('/api/admin/migration/refresh-stats', {});
			await invalidateAll();
			setSuccess('Stats refreshed successfully');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh stats');
		} finally {
			refreshingStats = false;
		}
	}

	// Fetch cost estimate
	async function fetchCostEstimate() {
		costEstimateLoading = true;
		try {
			const result = await apiGet<{
				estimate: {
					tokens: number;
					cost: number;
					estimatedDuration: string;
					model: string;
				};
			}>('/api/admin/migration/estimate');
			costEstimate = result.estimate;
		} catch (err) {
			console.error('Failed to fetch cost estimate:', err);
			costEstimate = null;
		} finally {
			costEstimateLoading = false;
		}
	}

	// Open platform migration modal
	async function openPlatformMigrationModal() {
		showPlatformMigrationModal = true;
		fetchCostEstimate(); // Fetch cost estimate in background
	}

	// Platform-wide migration
	async function handleStartPlatformMigration() {
		platformMigrationLoading = true;
		try {
			const result = await apiPost<{ runId: string; totalProjects: number }>(
				'/api/admin/migration/start',
				{
					skipAlreadyMigrated: true,
					skipCompletedTasks: true,
					includeArchived: false,
					dryRun: false
				}
			);

			showPlatformMigrationModal = false;
			costEstimate = null;
			setSuccess(`Platform migration started: ${result.totalProjects} projects queued`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start platform migration');
		} finally {
			platformMigrationLoading = false;
		}
	}

	// Run actions
	function handleViewRun(runId: string) {
		// No dedicated run detail route; route to errors filtered by runId
		goto(`/admin/migration/errors?runId=${runId}`);
	}

	async function handleRetryRun(runId: string) {
		try {
			await apiPost('/api/admin/migration/retry', { runId });
			setSuccess('Retry started');
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry run');
		}
	}

	async function handlePauseRun(runId: string) {
		try {
			await apiPost('/api/admin/migration/pause', { runId, reason: 'Paused by admin' });
			setSuccess('Run paused');
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to pause run');
		}
	}

	async function handleResumeRun(runId: string) {
		try {
			await apiPost('/api/admin/migration/resume', { runId });
			setSuccess('Run resumed');
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to resume run');
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<AdminPageHeader
		title="Ontology Migration"
		description="Monitor and manage the platform-wide migration from legacy schema to ontology."
		icon={GitBranch}
		backHref="/admin"
		backLabel="Dashboard"
	>
		{#snippet actions()}
			<Button
				variant="outline"
				size="sm"
				onclick={handleRefreshStats}
				loading={refreshingStats}
			>
				<RefreshCw class="h-4 w-4" />
				<span class="hidden sm:inline">Refresh Stats</span>
			</Button>
			<Button
				variant="primary"
				size="sm"
				onclick={openPlatformMigrationModal}
				disabled={data.lockStatus?.isLocked ?? false}
			>
				<Play class="h-4 w-4" />
				<span class="sm:inline">Migrate All</span>
			</Button>
		{/snippet}
	</AdminPageHeader>

	<!-- Messages -->
	{#if successMessage}
		<AdminCard tone="success" padding="sm">{successMessage}</AdminCard>
	{/if}
	{#if errorMessage}
		<AdminCard tone="danger" padding="sm">{errorMessage}</AdminCard>
	{/if}

	<!-- Lock Status Warning -->
	{#if data.lockStatus?.isLocked}
		<AdminCard tone="warning" padding="md">
			<div class="flex items-center gap-3">
				<AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400" />
				<div>
					<p class="font-medium text-amber-900 dark:text-amber-100">
						Platform Migration In Progress
					</p>
					<p class="text-sm text-amber-700 dark:text-amber-300">
						Locked by {data.lockStatus.lockedByEmail ?? data.lockStatus.lockedBy}
						until {data.lockStatus.expiresAt
							? new Date(data.lockStatus.expiresAt).toLocaleString()
							: 'unknown'}
					</p>
				</div>
			</div>
		</AdminCard>
	{/if}

	<!-- Tab Navigation -->
	<div class="flex border-b border-border">
		<button
			class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'overview'
				? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
				: 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'}"
			onclick={() => switchTab('overview')}
		>
			<Globe class="mr-2 inline h-4 w-4" />
			Overview
		</button>
		<button
			class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'users'
				? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
				: 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'}"
			onclick={() => switchTab('users')}
		>
			<Users class="mr-2 inline h-4 w-4" />
			Users
		</button>
		<a
			href="/admin/migration/errors"
			class="px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground dark:hover:text-foreground"
		>
			<AlertTriangle class="mr-2 inline h-4 w-4" />
			Errors
			{#if progressStats.errors.total > 0}
				<Badge size="sm" variant="error" class="ml-1">{progressStats.errors.total}</Badge>
			{/if}
		</a>
	</div>

	<!-- Overview Tab -->
	{#if activeTab === 'overview'}
		<div class="space-y-6">
			<!-- Progress Cards -->
			<ProgressCards stats={progressStats} />

			<!-- Global Progress Bar -->
			<AdminCard>
				<GlobalProgressBar
					progress={{
						migrated: progressStats.projects.migrated,
						pending: progressStats.projects.pending,
						failed: progressStats.projects.failed,
						total: progressStats.projects.total,
						percentComplete: progressStats.projects.percentComplete
					}}
				/>
			</AdminCard>

			<!-- Recent Runs -->
			<div class="grid gap-6 lg:grid-cols-2">
				<AdminCard>
					<h3 class="mb-4 text-lg font-semibold text-foreground">Migration Runs</h3>
					<RecentRuns
						{activeRun}
						{recentRuns}
						onViewRun={handleViewRun}
						onRetryRun={handleRetryRun}
						onPauseRun={handlePauseRun}
						onResumeRun={handleResumeRun}
					/>
				</AdminCard>

				<AdminCard>
					<h3 class="mb-4 text-lg font-semibold text-foreground">Quick Stats</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Total Users</span>
							<span class="font-semibold text-foreground">
								{progressStats.users.total.toLocaleString()}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Users with Projects</span>
							<span class="font-semibold text-foreground">
								{progressStats.users.withProjects.toLocaleString()}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Fully Migrated Users</span>
							<span class="font-semibold text-emerald-600 dark:text-emerald-400">
								{progressStats.users.fullyMigrated.toLocaleString()}
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Errors Pending</span>
							<span
								class="font-semibold {progressStats.errors.total > 0
									? 'text-rose-600 dark:text-rose-400'
									: 'text-foreground'}"
							>
								{progressStats.errors.total.toLocaleString()}
							</span>
						</div>
						{#if data.globalProgress?.lastRefreshed}
							<div class="border-t border-border pt-4">
								<p class="text-xs text-muted-foreground">
									Last updated: {new Date(
										data.globalProgress.lastRefreshed
									).toLocaleString()}
								</p>
							</div>
						{/if}
					</div>
				</AdminCard>
			</div>
		</div>
	{/if}

	<!-- Users Tab -->
	{#if activeTab === 'users'}
		<AdminCard>
			{#if usersData}
				<UserList
					users={usersData.users}
					pagination={usersData.pagination}
					aggregates={usersData.aggregates}
					isLoading={usersLoading}
					onPageChange={handleUserPageChange}
					onStatusFilter={handleUserStatusFilter}
					onSearch={handleUserSearch}
					onUserClick={handleUserClick}
				/>
			{:else if usersLoading}
				<div class="flex items-center justify-center py-12">
					<div
						class="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
					></div>
				</div>
			{:else}
				<p class="py-8 text-center text-muted-foreground">Click to load user list...</p>
			{/if}
		</AdminCard>
	{/if}
</div>

<!-- Platform Migration Confirmation Modal -->
<ConfirmationModal
	bind:isOpen={showPlatformMigrationModal}
	type="warning"
	title="Start Platform-Wide Migration"
	message="This will migrate all unmigrated projects for all users. This operation may take several hours."
	confirmLabel="Start Migration"
	cancelLabel="Cancel"
	isLoading={platformMigrationLoading}
	details={[
		{ label: 'Pending Projects', value: progressStats.projects.pending },
		{ label: 'Pending Tasks', value: progressStats.tasks.pending },
		{
			label: 'Users to Process',
			value: progressStats.users.withProjects - progressStats.users.fullyMigrated
		}
	]}
	showCostEstimate={true}
	{costEstimate}
	onConfirm={handleStartPlatformMigration}
/>
