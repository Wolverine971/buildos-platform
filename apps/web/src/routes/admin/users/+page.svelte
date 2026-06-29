<!-- apps/web/src/routes/admin/users/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		Users,
		Shield,
		ShieldOff,
		Eye,
		ChevronLeft,
		ChevronRight,
		RefreshCw,
		CheckCircle,
		XCircle,
		Clock,
		Activity,
		MessageSquare,
		Calendar,
		ChevronUp,
		ChevronDown,
		Mail,
		SlidersHorizontal,
		X
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import UserActivityModal from '$lib/components/admin/UserActivityModal.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { slide } from 'svelte/transition';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';

	let users = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalUsers = $state(0);
	let selectedUser = $state<any>(null);
	let showUserModal = $state(false);
	let showActivityModal = $state(false);
	let showEmailModal = $state(false);
	let emailUserId = $state('');
	let emailUserName = $state('');
	let emailUserEmail = $state('');
	let emailInitialTemplate = $state<string | null>(null);
	let emailInitialInstructions = $state('');
	let emailInitialAutoGenerate = $state(false);
	let emailInitialComposeKey = $state(0);

	// Filters
	let filterByAdmin = $state('all'); // 'all', 'admin', 'regular'
	let filterByOnboarding = $state('all'); // 'all', 'completed', 'pending'
	let sortBy = $state('last_visit');
	let sortOrder = $state('desc');
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let rawUsers = $state<any[]>([]); // Store raw data for client-side sorting
	let initialFiltersReady = $state(false);

	// Collapsible filter panel + admin-toggle confirmation
	let showFilters = $state(false);
	let adminConfirm = $state<{ userId: string; currentStatus: boolean; label: string } | null>(
		null
	);
	let adminConfirmLoading = $state(false);

	const SORT_LABELS: Record<string, string> = {
		last_visit: 'Last Visit',
		created_at: 'Join Date',
		project_count: 'Projects',
		agentic_session_count: 'Agentic Sessions',
		agentic_message_count: 'Agentic Messages',
		daily_brief_count: 'Daily Briefs',
		daily_brief_opt_in: 'Daily Brief Opt-in',
		calendar_connected: 'Calendar Connected',
		ontology_entity_total: 'Ontology Entities',
		email: 'Email',
		name: 'Name',
		onboarding_completed_at: 'Onboarding Status',
		is_admin: 'Admin Status'
	};

	const ADMIN_LABELS: Record<string, string> = {
		admin: 'Admins only',
		regular: 'Regular users'
	};
	const ONBOARDING_LABELS: Record<string, string> = {
		completed: 'Onboarding: Complete',
		pending: 'Onboarding: Pending'
	};

	// Count only the true filters (not sort) for the toggle badge.
	let activeFilterCount = $derived(
		(filterByAdmin !== 'all' ? 1 : 0) + (filterByOnboarding !== 'all' ? 1 : 0)
	);
	let isDefaultSort = $derived(sortBy === 'last_visit' && sortOrder === 'desc');

	function clearFilters() {
		filterByAdmin = 'all';
		filterByOnboarding = 'all';
	}

	function toggleSortOrder() {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	}

	const clientSortableFields = [
		'project_count',
		'agentic_session_count',
		'agentic_message_count',
		'daily_brief_count',
		'daily_brief_opt_in',
		'calendar_connected',
		'ontology_entity_total'
	];

	function handleSort(column: string) {
		if (sortBy === column) {
			// Toggle sort order if clicking same column
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			// New column, default to descending
			sortBy = column;
			sortOrder = 'desc';
		}
		currentPage = 1;

		// Check if we need client-side sorting for computed fields
		if (clientSortableFields.includes(column)) {
			sortUsersClientSide();
		} else {
			loadUsers();
		}
	}

	function sortUsersClientSide() {
		if (!rawUsers.length) return;

		const sorted = [...rawUsers].sort((a, b) => {
			let aVal = a[sortBy] || 0;
			let bVal = b[sortBy] || 0;

			// Handle boolean values for derived flags
			if (
				['onboarding_completed_at', 'daily_brief_opt_in', 'calendar_connected'].includes(
					sortBy
				)
			) {
				aVal = aVal ? 1 : 0;
				bVal = bVal ? 1 : 0;
			}

			if (sortOrder === 'asc') {
				return aVal - bVal;
			} else {
				return bVal - aVal;
			}
		});

		// Apply pagination to sorted data
		const start = (currentPage - 1) * 20;
		const end = start + 20;
		users = sorted.slice(start, end);
		totalPages = Math.ceil(sorted.length / 20);
		totalUsers = sorted.length;
	}

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		searchQuery = $page.url.searchParams.get('search')?.trim() || '';
		initialFiltersReady = true;
	});

	// Load users on mount and when filters change
	$effect(() => {
		if (!browser || !initialFiltersReady) return;
		// Track all filter dependencies
		searchQuery;
		filterByAdmin;
		filterByOnboarding;
		sortBy;
		sortOrder;

		currentPage = 1;
		loadUsers();
	});

	async function loadUsers() {
		if (!browser) {
			return;
		}
		isLoading = true;
		error = null;

		try {
			// For client-side sortable fields, we need to fetch all users
			const isClientSort = clientSortableFields.includes(sortBy);

			const params = new URLSearchParams({
				page: isClientSort ? '1' : currentPage.toString(),
				limit: isClientSort ? '1000' : '20', // Fetch all for client-side sorting
				search: searchQuery,
				sort_by: isClientSort ? 'created_at' : sortBy,
				sort_order: sortOrder
			});

			if (filterByAdmin !== 'all') {
				params.set('admin_filter', filterByAdmin);
			}

			if (filterByOnboarding !== 'all') {
				params.set('onboarding_filter', filterByOnboarding);
			}

			const response = await fetch(`/api/admin/users?${params}`);

			const result = await response.json();
			if (result.success) {
				if (isClientSort) {
					// Store all data for client-side sorting
					rawUsers = result.data.users;
					sortUsersClientSide();
				} else {
					users = result.data.users;
					rawUsers = [];
					totalPages = result.data.pagination.totalPages;
					totalUsers = result.data.pagination.total;
				}
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

	async function loadUserActivity(userId: string) {
		try {
			const response = await fetch(`/api/admin/users/${userId}/activity`);
			if (!response.ok) throw new Error('Failed to load user activity');

			const result = await response.json();
			if (result.success) {
				selectedUser = result.data;
				showActivityModal = true;
			} else {
				throw new Error(result.error || 'Failed to load user activity');
			}
		} catch (err) {
			console.error('Error loading user activity:', err);
			error = err instanceof Error ? err.message : 'Failed to load user activity';
		}
	}

	function openEmailComposer(
		user: { id?: string; name?: string | null; email: string },
		intent?: { template?: string; instructions?: string; autoGenerate?: boolean }
	) {
		emailUserId = user.id || '';
		emailUserName = user.name || '';
		emailUserEmail = user.email;
		emailInitialTemplate = intent?.template ?? null;
		emailInitialInstructions = intent?.instructions ?? '';
		emailInitialAutoGenerate = Boolean(intent?.autoGenerate);
		emailInitialComposeKey += 1;
		showEmailModal = true;
	}

	function requestToggleAdmin(user: {
		id: string;
		is_admin: boolean;
		name?: string;
		email: string;
	}) {
		adminConfirm = {
			userId: user.id,
			currentStatus: user.is_admin,
			label: user.name || user.email
		};
	}

	async function confirmToggleAdmin() {
		if (!adminConfirm) return;
		const { userId, currentStatus } = adminConfirm;
		adminConfirmLoading = true;

		try {
			const response = await fetch('/api/admin/users', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					updates: { is_admin: !currentStatus }
				})
			});

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || 'Failed to update user');
			}
			await loadUsers();
			toastService.success(currentStatus ? 'Admin access removed' : 'Admin access granted');
			adminConfirm = null;
		} catch (err) {
			console.error('Error updating user:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to update user');
		} finally {
			adminConfirmLoading = false;
		}
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Never';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone
		});
	}

	function formatLastVisit(dateString: string | null): string {
		if (!dateString) return 'Never';

		const date = new Date(dateString);
		const now = new Date();
		const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

		if (diffHours < 24) {
			return `${diffHours}h ago`;
		} else if (diffHours < 24 * 7) {
			return `${Math.floor(diffHours / 24)}d ago`;
		} else {
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
		}
	}

	function getLastVisitColor(dateString: string | null): string {
		// Recency is informational, not a good/bad state — keep it neutral.
		if (!dateString) return 'text-muted-foreground/50';
		return 'text-muted-foreground';
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			if (rawUsers.length > 0) {
				sortUsersClientSide();
			} else {
				loadUsers();
			}
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			if (rawUsers.length > 0) {
				sortUsersClientSide();
			} else {
				loadUsers();
			}
		}
	}
</script>

<svelte:head>
	<title>User Management - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header with Back Button -->
	<AdminPageHeader
		title="User Management"
		description="Manage user accounts and view detailed activity"
		icon={Users}
		backHref="/admin"
		backLabel="Dashboard"
	>
		{#snippet actions()}
			<div class="flex items-center gap-3">
				<div class="text-sm text-muted-foreground">
					{totalUsers} total users
				</div>
				<Button
					onclick={loadUsers}
					disabled={isLoading}
					variant="primary"
					size="sm"
					icon={RefreshCw}
					class={isLoading
						? '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none'
						: ''}
				>
					Refresh
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	<!-- Filters and Search -->
	<div class="admin-panel p-3 sm:p-4">
		<!-- Primary row: search stays visible (thumb-reachable); filters collapse behind a toggle -->
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div class="min-w-0 flex-1">
				<TextInput
					type="text"
					bind:value={searchQuery}
					placeholder="Search by email, name, or ID..."
					size="md"
				/>
			</div>
			<Button
				onclick={() => (showFilters = !showFilters)}
				variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'outline'}
				size="md"
				icon={SlidersHorizontal}
				aria-expanded={showFilters}
				aria-controls="user-filter-panel"
				class="shrink-0 justify-center"
			>
				<span>Filters &amp; Sort</span>
				{#if activeFilterCount > 0}
					<span
						class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[0.65rem] font-semibold text-accent-foreground"
					>
						{activeFilterCount}
					</span>
				{/if}
			</Button>
		</div>

		<!-- Collapsible filter + sort panel -->
		{#if showFilters}
			<div
				id="user-filter-panel"
				class="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3"
				transition:slide={slideMotion()}
			>
				<label class="block">
					<span class="mb-1 block text-xs font-medium text-muted-foreground"
						>User type</span
					>
					<Select bind:value={filterByAdmin} size="md">
						<option value="all">All users</option>
						<option value="admin">Admins only</option>
						<option value="regular">Regular users</option>
					</Select>
				</label>

				<label class="block">
					<span class="mb-1 block text-xs font-medium text-muted-foreground"
						>Onboarding</span
					>
					<Select bind:value={filterByOnboarding} size="md">
						<option value="all">All onboarding</option>
						<option value="completed">Completed</option>
						<option value="pending">Pending</option>
					</Select>
				</label>

				<label class="block">
					<span class="mb-1 block text-xs font-medium text-muted-foreground">Sort by</span
					>
					<div class="flex items-center gap-2">
						<div class="min-w-0 flex-1">
							<Select bind:value={sortBy} size="md">
								<option value="last_visit">Last Visit</option>
								<option value="created_at">Join Date</option>
								<option value="project_count">Projects</option>
								<option value="agentic_session_count">Agentic Sessions</option>
								<option value="agentic_message_count">Agentic Messages</option>
								<option value="daily_brief_count">Daily Briefs Generated</option>
								<option value="daily_brief_opt_in">Daily Brief Opt-in</option>
								<option value="calendar_connected">Calendar Connected</option>
								<option value="ontology_entity_total">Ontology Entities</option>
								<option value="email">Email</option>
								<option value="name">Name</option>
								<option value="onboarding_completed_at">Onboarding Status</option>
								<option value="is_admin">Admin Status</option>
							</Select>
						</div>
						<Button
							onclick={toggleSortOrder}
							variant="outline"
							size="md"
							btnType="container"
							icon={sortOrder === 'asc' ? ChevronUp : ChevronDown}
							class="shrink-0"
							title={sortOrder === 'asc'
								? 'Ascending — tap for descending'
								: 'Descending — tap for ascending'}
							aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
						/>
					</div>
				</label>
			</div>
		{/if}

		<!-- Active filter chips — keep filter state visible even when the panel is collapsed -->
		{#if activeFilterCount > 0 || !isDefaultSort}
			<div class="mt-3 flex flex-wrap items-center gap-2">
				{#if filterByAdmin !== 'all'}
					<button
						type="button"
						onclick={() => (filterByAdmin = 'all')}
						class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{ADMIN_LABELS[filterByAdmin]}
						<X class="h-3 w-3" />
					</button>
				{/if}
				{#if filterByOnboarding !== 'all'}
					<button
						type="button"
						onclick={() => (filterByOnboarding = 'all')}
						class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{ONBOARDING_LABELS[filterByOnboarding]}
						<X class="h-3 w-3" />
					</button>
				{/if}
				{#if !isDefaultSort}
					<button
						type="button"
						onclick={() => {
							sortBy = 'last_visit';
							sortOrder = 'desc';
						}}
						class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Sort: {SORT_LABELS[sortBy]}
						{sortOrder === 'asc' ? '↑' : '↓'}
						<X class="h-3 w-3" />
					</button>
				{/if}
				{#if activeFilterCount > 0}
					<button
						type="button"
						onclick={clearFilters}
						class="rounded-sm px-1 text-xs font-medium text-muted-foreground transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Clear filters
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if error}
		<AdminCard tone="danger" padding="sm" class="text-sm font-medium text-destructive">
			{error}
		</AdminCard>
	{/if}

	<!-- Users Table -->
	<div class="admin-panel overflow-hidden">
		{#if isLoading}
			<div class="p-6 text-center">
				<RefreshCw
					class="h-6 w-6 animate-spin motion-reduce:animate-none text-muted-foreground mx-auto mb-3"
				/>
				<p class="text-sm text-muted-foreground">Loading users...</p>
			</div>
		{:else if users.length === 0}
			<div class="p-6 text-center">
				<Users class="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
				<h3 class="text-sm font-semibold text-foreground mb-1">No Users Found</h3>
				<p class="text-xs text-muted-foreground">
					{searchQuery
						? 'Try adjusting your search criteria.'
						: 'No users in the system yet.'}
				</p>
			</div>
		{:else}
			<!-- Mobile card list (sort via the Sort dropdown above) -->
			<ul class="divide-y divide-border lg:hidden">
				{#each users as user}
					<li class="p-3">
						<div class="flex items-start gap-3">
							<div
								class="h-9 w-9 shrink-0 rounded-full bg-accent/10 flex items-center justify-center"
							>
								<span class="text-sm font-medium text-accent">
									{(user.name || user.email).charAt(0).toUpperCase()}
								</span>
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-1.5">
									<span class="truncate text-sm font-medium text-foreground">
										{user.name || 'No name'}
									</span>
									{#if user.is_admin}
										<Shield class="h-3.5 w-3.5 shrink-0 text-accent" />
									{/if}
								</div>
								<div class="truncate text-xs text-muted-foreground">
									{user.email}
								</div>
							</div>
							<Button
								onclick={() => {
									selectedUser = user;
									showUserModal = true;
								}}
								variant="ghost"
								size="sm"
								icon={Eye}
								class="!p-2 shrink-0 text-muted-foreground"
								title="View details"
							/>
						</div>

						<div
							class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
						>
							<span
								class="inline-flex items-center gap-1 {getLastVisitColor(
									user.last_visit
								)}"
							>
								<Clock class="h-3.5 w-3.5" />
								{formatLastVisit(user.last_visit)}
							</span>
							<span>Joined {formatDate(user.created_at)}</span>
						</div>

						<div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Projects</span>
								<span class="font-medium text-foreground">
									{user.project_count || 0}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Sessions</span>
								<span class="font-medium text-foreground">
									{user.agentic_session_count || 0}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Chat msgs</span>
								<span class="font-medium text-foreground">
									{user.agentic_message_count || 0}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Briefs</span>
								<span class="font-medium text-foreground">
									{user.daily_brief_opt_in ? 'On' : 'Off'} · {user.daily_brief_count ||
										0}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Calendar</span>
								<span
									class="font-medium {user.calendar_connected
										? 'text-success'
										: 'text-muted-foreground'}"
								>
									{user.calendar_connected ? 'Yes' : 'No'}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Ontology</span>
								<span class="font-medium text-foreground">
									{user.ontology_entity_total || 0}
								</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted-foreground">Onboarding</span>
								<span
									class="font-medium {user.onboarding_completed_at
										? 'text-success'
										: 'text-warning'}"
								>
									{user.onboarding_completed_at ? 'Complete' : 'Pending'}
								</span>
							</div>
						</div>

						<div class="mt-3 flex items-center gap-1 border-t border-border pt-2">
							<Button
								onclick={() => openEmailComposer(user)}
								variant="ghost"
								size="sm"
								icon={Mail}
								class="!p-2 text-muted-foreground"
								title="Send email"
							/>
							<Button
								onclick={() => loadUserActivity(user.id)}
								variant="ghost"
								size="sm"
								icon={Activity}
								class="!p-2 text-muted-foreground"
								title="View activity details"
							/>
							<Button
								onclick={() => requestToggleAdmin(user)}
								variant="ghost"
								size="sm"
								icon={user.is_admin ? ShieldOff : Shield}
								class="!p-2 text-muted-foreground"
								title={user.is_admin ? 'Remove admin' : 'Make admin'}
							/>
						</div>
					</li>
				{/each}
			</ul>

			<div class="hidden overflow-x-auto lg:block">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('email')}
									title="Click to sort by email"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>User</span>
									{#if sortBy === 'email'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('last_visit')}
									title="Click to sort by last visit"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Last Visit</span>
									{#if sortBy === 'last_visit'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('created_at')}
									title="Click to sort by join date"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Joined</span>
									{#if sortBy === 'created_at'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('project_count')}
									title="Click to sort by projects"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Projects</span>
									{#if sortBy === 'project_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('agentic_session_count')}
									title="Click to sort by agentic sessions"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Agentic Sessions</span>
									{#if sortBy === 'agentic_session_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('agentic_message_count')}
									title="Click to sort by agentic chat messages"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Agentic Chat</span>
									{#if sortBy === 'agentic_message_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('daily_brief_count')}
									title="Click to sort by daily briefs"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Daily Briefs</span>
									{#if sortBy === 'daily_brief_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('calendar_connected')}
									title="Click to sort by calendar connection"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Calendar</span>
									{#if sortBy === 'calendar_connected'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('ontology_entity_total')}
									title="Click to sort by ontology entities created"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Ontology</span>
									{#if sortBy === 'ontology_entity_total'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider select-none"
							>
								<button
									type="button"
									onclick={() => handleSort('onboarding_completed_at')}
									title="Click to sort by onboarding status"
									class="flex w-full items-center space-x-1 cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
								>
									<span>Onboarding</span>
									{#if sortBy === 'onboarding_completed_at'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-muted-foreground/30"
										>
											<svg
												class="h-3 w-3"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path d="M5 8l5-5 5 5H5z" />
												<path d="M5 12l5 5 5-5H5z" />
											</svg>
										</span>
									{/if}
								</button>
							</th>
							<th
								class="px-3 py-2 text-right text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider"
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="bg-card divide-y divide-border">
						{#each users as user}
							<tr class="hover:bg-muted/50">
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-2">
										<div class="flex-shrink-0 h-8 w-8">
											<div
												class="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center"
											>
												<span class="text-xs font-medium text-accent">
													{(user.name || user.email)
														.charAt(0)
														.toUpperCase()}
												</span>
											</div>
										</div>
										<div class="min-w-0">
											<div
												class="text-sm font-medium text-foreground flex items-center gap-1"
											>
												<span class="truncate max-w-[120px]"
													>{user.name || 'No name'}</span
												>
												{#if user.is_admin}
													<Shield
														class="h-3.5 w-3.5 text-accent flex-shrink-0"
													/>
												{/if}
											</div>
											<div
												class="text-xs text-muted-foreground truncate max-w-[150px]"
											>
												{user.email}
											</div>
										</div>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<Clock
											class="h-3.5 w-3.5 {getLastVisitColor(user.last_visit)}"
										/>
										<span class="text-xs {getLastVisitColor(user.last_visit)}">
											{formatLastVisit(user.last_visit)}
										</span>
									</div>
								</td>
								<td
									class="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground"
								>
									{formatDate(user.created_at)}
								</td>
								<td class="px-3 py-2 whitespace-nowrap text-xs">
									<span class="font-medium text-foreground">
										{user.project_count || 0}
									</span>
								</td>
								<td class="px-3 py-2 whitespace-nowrap text-xs">
									<div class="flex items-center gap-1">
										<Activity class="h-3.5 w-3.5 text-muted-foreground" />
										<span class="font-medium text-foreground">
											{user.agentic_session_count || 0}
										</span>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<MessageSquare class="h-3.5 w-3.5 text-muted-foreground" />
										<span class="text-xs font-medium text-foreground">
											{user.agentic_message_count || 0}
										</span>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										{#if user.daily_brief_opt_in}
											<CheckCircle class="h-3.5 w-3.5 text-success" />
											<span class="text-xs text-success">
												On · {user.daily_brief_count || 0}
											</span>
										{:else}
											<XCircle class="h-3.5 w-3.5 text-muted-foreground/50" />
											<span class="text-xs text-muted-foreground">
												Off · {user.daily_brief_count || 0}
											</span>
										{/if}
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										{#if user.calendar_connected}
											<Calendar class="h-3.5 w-3.5 text-success" />
											<span class="text-xs text-success">Yes</span>
										{:else}
											<Calendar
												class="h-3.5 w-3.5 text-muted-foreground/50"
											/>
											<span class="text-xs text-muted-foreground">No</span>
										{/if}
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="text-xs">
										<div class="font-medium text-foreground">
											{user.ontology_entity_total || 0} total
										</div>
										<div class="text-[0.65rem] text-muted-foreground">
											T {user.ontology_counts?.tasks || 0} • G {user
												.ontology_counts?.goals || 0} • P {user
												.ontology_counts?.plans || 0} • D {user
												.ontology_counts?.documents || 0}
										</div>
										<div class="text-[0.65rem] text-muted-foreground">
											Mi {user.ontology_counts?.milestones || 0} • Rk {user
												.ontology_counts?.risks || 0} • Req {user
												.ontology_counts?.requirements || 0}
										</div>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										{#if user.onboarding_completed_at}
											<CheckCircle class="h-3.5 w-3.5 text-success" />
											<span class="text-xs text-success">Complete</span>
										{:else}
											<Clock class="h-3.5 w-3.5 text-warning" />
											<span class="text-xs text-warning">Pending</span>
										{/if}
									</div>
								</td>
								<td
									class="px-3 py-2 whitespace-nowrap text-right text-xs font-medium"
								>
									<div class="flex items-center justify-end gap-1">
										<!-- Send Email -->
										<Button
											onclick={() => openEmailComposer(user)}
											variant="ghost"
											size="sm"
											icon={Mail}
											class="!p-1.5 text-muted-foreground hover:text-info"
											title="Send email"
										/>
										<!-- View Activity -->
										<Button
											onclick={() => loadUserActivity(user.id)}
											variant="ghost"
											size="sm"
											icon={Activity}
											class="!p-1.5 text-muted-foreground hover:text-accent"
											title="View activity details"
										/>

										<!-- Toggle Admin Status -->
										<Button
											onclick={() => requestToggleAdmin(user)}
											variant="ghost"
											size="sm"
											icon={user.is_admin ? ShieldOff : Shield}
											class="!p-1.5 text-muted-foreground hover:text-accent"
											title={user.is_admin ? 'Remove admin' : 'Make admin'}
										/>

										<!-- View Details -->
										<Button
											onclick={() => {
												selectedUser = user;
												showUserModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Eye}
											class="!p-1.5 text-muted-foreground hover:text-success"
											title="View basic details"
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div
					class="bg-card px-3 py-2 flex items-center justify-between border-t border-border"
				>
					<div class="flex-1 flex justify-between sm:hidden">
						<Button
							onclick={prevPage}
							disabled={currentPage === 1}
							variant="secondary"
							size="sm"
						>
							Previous
						</Button>
						<Button
							onclick={nextPage}
							disabled={currentPage === totalPages}
							variant="secondary"
							size="sm"
						>
							Next
						</Button>
					</div>
					<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
						<div>
							<p class="text-xs text-muted-foreground">
								Page <span class="font-medium text-foreground">{currentPage}</span>
								of
								<span class="font-medium text-foreground">{totalPages}</span>
							</p>
						</div>
						<div>
							<nav class="relative z-0 inline-flex -space-x-px">
								<Button
									onclick={prevPage}
									disabled={currentPage === 1}
									variant="secondary"
									size="sm"
									icon={ChevronLeft}
									class="rounded-r-none border-r-0"
								/>
								<Button
									onclick={nextPage}
									disabled={currentPage === totalPages}
									variant="secondary"
									size="sm"
									icon={ChevronRight}
									class="rounded-l-none"
								/>
							</nav>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Basic User Details Modal -->
<Modal
	bind:isOpen={showUserModal}
	onClose={() => (showUserModal = false)}
	title="User Details"
	size="md"
>
	{#if selectedUser}
		<div class="p-4">
			<div class="space-y-3">
				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Email
					</div>
					<p class="text-sm text-foreground">{selectedUser.email}</p>
				</div>

				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Name
					</div>
					<p class="text-sm text-foreground">
						{selectedUser.name || 'Not provided'}
					</p>
				</div>

				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Admin Status
					</div>
					<span
						class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full {selectedUser.is_admin
							? 'bg-destructive/10 text-destructive'
							: 'bg-success/10 text-success'}"
					>
						{selectedUser.is_admin ? 'Admin' : 'Regular User'}
					</span>
				</div>

				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Onboarding
					</div>
					<div class="flex items-center gap-1.5 mt-0.5">
						{#if selectedUser.onboarding_completed_at}
							<CheckCircle class="h-3.5 w-3.5 text-success" />
							<span class="text-xs text-success">Completed</span>
						{:else}
							<XCircle class="h-3.5 w-3.5 text-destructive" />
							<span class="text-xs text-destructive">Not completed</span>
						{/if}
					</div>
				</div>

				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Activity
					</div>
					<p class="text-xs text-foreground">
						{selectedUser.project_count || 0} projects ·{' '}
						{selectedUser.agentic_session_count || 0} agentic sessions ·{' '}
						{selectedUser.daily_brief_count || 0} daily briefs
					</p>
				</div>

				<div>
					<div
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
					>
						Calendar
					</div>
					<div class="flex items-center gap-1.5 mt-0.5">
						{#if selectedUser.calendar_connected}
							<Calendar class="h-3.5 w-3.5 text-success" />
							<span class="text-xs text-success">Connected</span>
						{:else}
							<Calendar class="h-3.5 w-3.5 text-muted-foreground/50" />
							<span class="text-xs text-muted-foreground">Not connected</span>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div
							class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
						>
							Last Visit
						</div>
						<p class="text-xs text-foreground">
							{formatLastVisit(selectedUser.last_visit)}
						</p>
					</div>

					<div>
						<div
							class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
						>
							Joined
						</div>
						<p class="text-xs text-foreground">
							{formatDate(selectedUser.created_at)}
						</p>
					</div>
				</div>

				{#if selectedUser.bio}
					<div>
						<div
							class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground"
						>
							Bio
						</div>
						<p class="text-xs text-foreground">{selectedUser.bio}</p>
					</div>
				{/if}
			</div>

			<div class="mt-4 flex justify-between gap-2">
				<Button
					onclick={() => {
						showUserModal = false;
						loadUserActivity(selectedUser.id);
					}}
					variant="primary"
					size="sm"
					class="bg-accent hover:bg-accent/90 pressable"
				>
					View Activity
				</Button>
				<div class="flex gap-2">
					<Button onclick={() => (showUserModal = false)} variant="secondary" size="sm">
						Close
					</Button>
					<Button
						onclick={() => requestToggleAdmin(selectedUser)}
						variant="primary"
						size="sm"
						class="pressable"
					>
						{selectedUser.is_admin ? 'Remove Admin' : 'Make Admin'}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</Modal>

<!-- User Activity Modal -->
{#if showActivityModal && selectedUser}
	<UserActivityModal
		user={selectedUser}
		onclose={() => (showActivityModal = false)}
		onComposeEmail={(payload) => {
			openEmailComposer(payload.user, {
				template: payload.template,
				instructions: payload.instructions,
				autoGenerate: true
			});
		}}
	/>
{/if}

<!-- Email Composer Modal -->
<EmailComposerModal
	bind:isOpen={showEmailModal}
	userId={emailUserId}
	userName={emailUserName}
	userEmail={emailUserEmail}
	initialTemplate={emailInitialTemplate}
	initialInstructions={emailInitialInstructions}
	initialAutoGenerate={emailInitialAutoGenerate}
	initialComposeKey={emailInitialComposeKey}
	onEmailSent={() => {
		showEmailModal = false;
		// Optionally refresh user list or show success message
	}}
/>

<!-- Admin privilege toggle confirmation -->
<ConfirmationModal
	isOpen={adminConfirm !== null}
	title={adminConfirm?.currentStatus ? 'Remove admin access?' : 'Grant admin access?'}
	confirmText={adminConfirm?.currentStatus ? 'Remove admin' : 'Grant admin'}
	confirmVariant={adminConfirm?.currentStatus ? 'danger' : 'primary'}
	icon={adminConfirm?.currentStatus ? 'danger' : 'warning'}
	loading={adminConfirmLoading}
	loadingText="Updating…"
	onconfirm={confirmToggleAdmin}
	oncancel={() => (adminConfirm = null)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			{#if adminConfirm?.currentStatus}
				Remove admin privileges from <span class="font-medium text-foreground"
					>{adminConfirm?.label}</span
				>? They'll lose access to the admin console.
			{:else}
				Grant admin privileges to <span class="font-medium text-foreground"
					>{adminConfirm?.label}</span
				>? They'll gain full access to the admin console.
			{/if}
		</p>
	{/snippet}
</ConfirmationModal>
