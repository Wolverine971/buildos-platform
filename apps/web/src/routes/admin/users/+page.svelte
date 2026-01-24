<!-- apps/web/src/routes/admin/users/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Users,
		Search,
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
		Mail
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import UserActivityModal from '$lib/components/admin/UserActivityModal.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';

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

	// Filters
	let filterByAdmin = $state('all'); // 'all', 'admin', 'regular'
	let filterByOnboarding = $state('all'); // 'all', 'completed', 'pending'
	let sortBy = $state('last_visit');
	let sortOrder = $state('desc');
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let rawUsers = $state<any[]>([]); // Store raw data for client-side sorting

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
				['completed_onboarding', 'daily_brief_opt_in', 'calendar_connected'].includes(
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
	});

	// Load users on mount and when filters change
	$effect(() => {
		if (!browser) return;
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

	async function toggleAdminStatus(userId: string, currentStatus: boolean) {
		if (
			!confirm(`${currentStatus ? 'Remove admin' : 'Grant admin'} privileges for this user?`)
		) {
			return;
		}

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
			if (result.success) {
				await loadUsers();
			} else {
				throw new Error(result.error || 'Failed to update user');
			}
		} catch (err) {
			console.error('Error updating user:', err);
			error = err instanceof Error ? err.message : 'Failed to update user';
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

	function getDailyBriefCountColor(count: number): string {
		if (count >= 50) return 'text-emerald-600 dark:text-emerald-400';
		if (count >= 20) return 'text-accent';
		if (count >= 5) return 'text-amber-600 dark:text-amber-400';
		return 'text-muted-foreground';
	}

	function getLastVisitColor(dateString: string | null): string {
		if (!dateString) return 'text-muted-foreground/50';

		const date = new Date(dateString);
		const now = new Date();
		const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays <= 1) return 'text-emerald-600 dark:text-emerald-400';
		if (diffDays <= 7) return 'text-amber-600 dark:text-amber-400';
		if (diffDays <= 30) return 'text-orange-600 dark:text-orange-400';
		return 'text-rose-600 dark:text-rose-400';
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
		<div slot="actions" class="flex items-center gap-3">
			<div class="text-sm text-muted-foreground">
				{totalUsers} total users
			</div>
			<Button
				onclick={loadUsers}
				disabled={isLoading}
				variant="primary"
				size="sm"
				icon={RefreshCw}
				class={isLoading ? '[&_svg]:animate-spin' : ''}
			>
				Refresh
			</Button>
		</div>
	</AdminPageHeader>

	<!-- Filters and Search -->
	<div class="admin-panel p-4">
		<div class="grid grid-cols-1 md:grid-cols-5 gap-4">
			<!-- Search -->
			<div class="md:col-span-2">
				<TextInput
					type="text"
					bind:value={searchQuery}
					placeholder="Search users by email or name..."
					size="md"
				/>
			</div>

			<!-- Admin Filter -->
			<div>
				<Select bind:value={filterByAdmin} size="md" placeholder="All Users">
					<option value="all">All Users</option>
					<option value="admin">Admins Only</option>
					<option value="regular">Regular Users</option>
				</Select>
			</div>

			<!-- Onboarding Filter -->
			<div>
				<Select bind:value={filterByOnboarding} size="md" placeholder="All Onboarding">
					<option value="all">All Onboarding</option>
					<option value="completed">Completed</option>
					<option value="pending">Pending</option>
				</Select>
			</div>

			<!-- Sort -->
			<div>
				<Select bind:value={sortBy} size="md" placeholder="Last Visit">
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
					<option value="completed_onboarding">Onboarding Status</option>
					<option value="is_admin">Admin Status</option>
				</Select>
			</div>
		</div>
	</div>

	{#if error}
		<AdminCard
			tone="danger"
			padding="sm"
			class="text-sm font-medium text-rose-900 dark:text-rose-100"
		>
			{error}
		</AdminCard>
	{/if}

	<!-- Users Table -->
	<div class="admin-panel overflow-hidden">
		{#if isLoading}
			<div class="p-6 text-center">
				<RefreshCw class="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
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
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('email')}
								title="Click to sort by email"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('last_visit')}
								title="Click to sort by last visit"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('created_at')}
								title="Click to sort by join date"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('project_count')}
								title="Click to sort by projects"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('agentic_session_count')}
								title="Click to sort by agentic sessions"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('agentic_message_count')}
								title="Click to sort by agentic chat messages"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('daily_brief_count')}
								title="Click to sort by daily briefs"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('calendar_connected')}
								title="Click to sort by calendar connection"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('ontology_entity_total')}
								title="Click to sort by ontology entities created"
							>
								<div class="flex items-center space-x-1">
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
								</div>
							</th>
							<th
								class="px-3 py-2 text-left text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted select-none"
								onclick={() => handleSort('completed_onboarding')}
								title="Click to sort by onboarding status"
							>
								<div class="flex items-center space-x-1">
									<span>Onboarding</span>
									{#if sortBy === 'completed_onboarding'}
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
								</div>
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
														class="h-3.5 w-3.5 text-rose-500 flex-shrink-0"
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
									<span class="font-medium text-purple-600 dark:text-purple-400">
										{user.project_count || 0}
									</span>
								</td>
								<td class="px-3 py-2 whitespace-nowrap text-xs">
									<div class="flex items-center gap-1">
										<Activity class="h-3.5 w-3.5 text-accent" />
										<span class="font-medium text-accent">
											{user.agentic_session_count || 0}
										</span>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										<MessageSquare
											class="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400"
										/>
										<span
											class="text-xs font-medium text-indigo-600 dark:text-indigo-400"
										>
											{user.agentic_message_count || 0}
										</span>
									</div>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1">
										{#if user.daily_brief_opt_in}
											<CheckCircle class="h-3.5 w-3.5 text-emerald-500" />
											<span
												class="text-xs text-emerald-600 dark:text-emerald-400"
											>
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
											<Calendar class="h-3.5 w-3.5 text-emerald-500" />
											<span
												class="text-xs text-emerald-600 dark:text-emerald-400"
												>Yes</span
											>
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
										<div
											class="font-medium text-indigo-600 dark:text-indigo-400"
										>
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
										{#if user.completed_onboarding}
											<CheckCircle class="h-3.5 w-3.5 text-emerald-500" />
											<span
												class="text-xs text-emerald-600 dark:text-emerald-400"
												>Complete</span
											>
										{:else}
											<Clock class="h-3.5 w-3.5 text-amber-500" />
											<span class="text-xs text-amber-600 dark:text-amber-400"
												>Pending</span
											>
										{/if}
									</div>
								</td>
								<td
									class="px-3 py-2 whitespace-nowrap text-right text-xs font-medium"
								>
									<div class="flex items-center justify-end gap-1">
										<!-- Send Email -->
										<Button
											onclick={() => {
												emailUserId = user.id;
												emailUserName = user.name;
												emailUserEmail = user.email;
												showEmailModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Mail}
											class="!p-1.5 text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400"
											title="Send email"
										/>
										<!-- View Activity -->
										<Button
											onclick={() => loadUserActivity(user.id)}
											variant="ghost"
											size="sm"
											icon={Activity}
											class="!p-1.5 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400"
											title="View activity details"
										/>

										<!-- Toggle Admin Status -->
										<Button
											onclick={() =>
												toggleAdminStatus(user.id, user.is_admin)}
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
											class="!p-1.5 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
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
{#if showUserModal && selectedUser}
	<div
		class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
	>
		<div
			class="bg-card border border-border rounded-lg shadow-ink-strong max-w-md w-full mx-4 tx tx-frame tx-weak"
		>
			<div class="p-4">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-sm font-semibold text-foreground">User Details</h3>
					<Button
						onclick={() => (showUserModal = false)}
						variant="ghost"
						size="sm"
						class="!p-1 text-lg leading-none text-muted-foreground hover:text-foreground"
					>
						×
					</Button>
				</div>

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
								? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
								: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}"
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
							{#if selectedUser.completed_onboarding}
								<CheckCircle class="h-3.5 w-3.5 text-emerald-500" />
								<span class="text-xs text-emerald-600 dark:text-emerald-400"
									>Completed</span
								>
							{:else}
								<XCircle class="h-3.5 w-3.5 text-rose-500" />
								<span class="text-xs text-rose-600 dark:text-rose-400"
									>Not completed</span
								>
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
								<Calendar class="h-3.5 w-3.5 text-emerald-500" />
								<span class="text-xs text-emerald-600 dark:text-emerald-400"
									>Connected</span
								>
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
						class="bg-purple-600 hover:bg-purple-700 pressable"
					>
						View Activity
					</Button>
					<div class="flex gap-2">
						<Button
							onclick={() => (showUserModal = false)}
							variant="secondary"
							size="sm"
						>
							Close
						</Button>
						<Button
							onclick={() =>
								toggleAdminStatus(selectedUser.id, selectedUser.is_admin)}
							variant="primary"
							size="sm"
							class="pressable"
						>
							{selectedUser.is_admin ? 'Remove Admin' : 'Make Admin'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- User Activity Modal -->
{#if showActivityModal && selectedUser}
	<UserActivityModal user={selectedUser} onclose={() => (showActivityModal = false)} />
{/if}

<!-- Email Composer Modal -->
<EmailComposerModal
	bind:isOpen={showEmailModal}
	userId={emailUserId}
	userName={emailUserName}
	userEmail={emailUserEmail}
	on:emailSent={() => {
		showEmailModal = false;
		// Optionally refresh user list or show success message
	}}
/>
