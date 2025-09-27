<!-- src/routes/admin/users/+page.svelte -->
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
		Calendar,
		ChevronUp,
		ChevronDown,
		Mail
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import UserActivityModal from '$lib/components/admin/UserActivityModal.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';

	let users: any[] = [];
	let isLoading = true;
	let error: string | null = null;
	let searchQuery = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalUsers = 0;
	let selectedUser: any = null;
	let showUserModal = false;
	let showActivityModal = false;
	let showEmailModal = false;
	let emailUserId = '';
	let emailUserName = '';
	let emailUserEmail = '';

	// Filters
	let filterByAdmin = 'all'; // 'all', 'admin', 'regular'
	let filterByOnboarding = 'all'; // 'all', 'completed', 'pending'
	let sortBy = 'last_visit';
	let sortOrder = 'desc';
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let rawUsers: any[] = []; // Store raw data for client-side sorting

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
		if (
			['brain_dump_count', 'project_count', 'brief_count', 'has_generated_phases'].includes(
				column
			)
		) {
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

			// Handle boolean values for completed_onboarding and has_generated_phases
			if (sortBy === 'completed_onboarding' || sortBy === 'has_generated_phases') {
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
		loadUsers();
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	$: if (searchQuery || filterByAdmin || filterByOnboarding || sortBy || sortOrder) {
		currentPage = 1;
		loadUsers();
	}

	async function loadUsers() {
		if (!browser) {
			return;
		}
		isLoading = true;
		error = null;

		try {
			// For client-side sortable fields, we need to fetch all users
			const isClientSort = [
				'brain_dump_count',
				'project_count',
				'brief_count',
				'completed_onboarding',
				'has_generated_phases'
			].includes(sortBy);

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

	function getBriefCountColor(count: number): string {
		if (count >= 50) return 'text-green-600';
		if (count >= 20) return 'text-blue-600';
		if (count >= 5) return 'text-yellow-600';
		return 'text-gray-600';
	}

	function getLastVisitColor(dateString: string | null): string {
		if (!dateString) return 'text-gray-400';

		const date = new Date(dateString);
		const now = new Date();
		const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays <= 1) return 'text-green-600';
		if (diffDays <= 7) return 'text-yellow-600';
		if (diffDays <= 30) return 'text-orange-600';
		return 'text-red-600';
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

<div class="container mx-auto px-4 py-4 sm:py-6 lg:py-8">
	<!-- Header with Back Button -->
	<AdminPageHeader
		title="User Management"
		description="Manage user accounts and view detailed activity"
		icon={Users}
		backHref="/admin"
		backLabel="Dashboard"
	>
		<div slot="actions" class="flex items-center space-x-4">
			<div class="text-sm text-gray-600 dark:text-gray-400">
				{totalUsers} total users
			</div>
			<Button
				on:click={loadUsers}
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
	<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
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
				<Select
					bind:value={filterByAdmin}
					on:change={(e) => (filterByAdmin = e.detail)}
					size="md"
					placeholder="All Users"
				>
					<option value="all">All Users</option>
					<option value="admin">Admins Only</option>
					<option value="regular">Regular Users</option>
				</Select>
			</div>

			<!-- Onboarding Filter -->
			<div>
				<Select
					bind:value={filterByOnboarding}
					on:change={(e) => (filterByOnboarding = e.detail)}
					size="md"
					placeholder="All Onboarding"
				>
					<option value="all">All Onboarding</option>
					<option value="completed">Completed</option>
					<option value="pending">Pending</option>
				</Select>
			</div>

			<!-- Sort -->
			<div>
				<Select
					bind:value={sortBy}
					on:change={(e) => (sortBy = e.detail)}
					size="md"
					placeholder="Last Visit"
				>
					<option value="last_visit">Last Visit</option>
					<option value="created_at">Join Date</option>
					<option value="brain_dump_count">Brain Dumps</option>
					<option value="project_count">Projects</option>
					<option value="brief_count">Briefs</option>
					<option value="has_generated_phases">Phase Generation</option>
					<option value="email">Email</option>
					<option value="name">Name</option>
					<option value="completed_onboarding">Onboarding Status</option>
					<option value="is_admin">Admin Status</option>
				</Select>
			</div>
		</div>
	</div>

	{#if error}
		<div
			class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
		>
			<p class="text-red-800 dark:text-red-200">{error}</p>
		</div>
	{/if}

	<!-- Users Table -->
	<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
		{#if isLoading}
			<div class="p-8 text-center">
				<RefreshCw class="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
				<p class="text-gray-600 dark:text-gray-400">Loading users...</p>
			</div>
		{:else if users.length === 0}
			<div class="p-8 text-center">
				<Users class="h-16 w-16 text-gray-400 mx-auto mb-4" />
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
					No Users Found
				</h3>
				<p class="text-gray-600 dark:text-gray-400">
					{searchQuery
						? 'Try adjusting your search criteria.'
						: 'No users in the system yet.'}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
					<thead class="bg-gray-50 dark:bg-gray-900">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('email')}
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
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('last_visit')}
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
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('created_at')}
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
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('brain_dump_count')}
								title="Click to sort by brain dumps"
							>
								<div class="flex items-center space-x-1">
									<span>Dumps</span>
									{#if sortBy === 'brain_dump_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('project_count')}
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
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('brief_count')}
								title="Click to sort by briefs"
							>
								<div class="flex items-center space-x-1">
									<span>Briefs</span>
									{#if sortBy === 'brief_count'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('has_generated_phases')}
								title="Click to sort by phase generation"
							>
								<div class="flex items-center space-x-1">
									<span>Phases</span>
									{#if sortBy === 'has_generated_phases'}
										{#if sortOrder === 'asc'}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									{:else}
										<span
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								title="Calendar connection status"
							>
								<span>Calendar</span>
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
								on:click={() => handleSort('completed_onboarding')}
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
											class="h-4 w-4 flex items-center justify-center text-gray-300"
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
								class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody
						class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
					>
						{#each users as user}
							<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<div class="flex-shrink-0 h-10 w-10">
											<div
												class="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
											>
												<span
													class="text-sm font-medium text-blue-800 dark:text-blue-200"
												>
													{(user.name || user.email)
														.charAt(0)
														.toUpperCase()}
												</span>
											</div>
										</div>
										<div class="ml-4">
											<div
												class="text-sm font-medium text-gray-900 dark:text-white flex items-center"
											>
												{user.name || 'No name'}
												{#if user.is_admin}
													<Shield class="ml-2 h-4 w-4 text-red-500" />
												{/if}
											</div>
											<div class="text-sm text-gray-500 dark:text-gray-400">
												{user.email}
											</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<Clock
											class="h-4 w-4 {getLastVisitColor(
												user.last_visit
											)} mr-1"
										/>
										<span class="text-sm {getLastVisitColor(user.last_visit)}">
											{formatLastVisit(user.last_visit)}
										</span>
									</div>
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
								>
									{formatDate(user.created_at)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm">
									<span class="font-medium text-indigo-600">
										{user.brain_dump_count || 0}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm">
									<span class="font-medium text-purple-600">
										{user.project_count || 0}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm">
									<span
										class="{getBriefCountColor(user.brief_count)} font-medium"
									>
										{user.brief_count || 0}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if user.has_generated_phases}
											<CheckCircle class="h-4 w-4 text-green-500 mr-1" />
											<span class="text-sm text-green-600">Yes</span>
										{:else}
											<XCircle class="h-4 w-4 text-gray-400 mr-1" />
											<span class="text-sm text-gray-500">No</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if user.calendar_connected}
											<Calendar class="h-4 w-4 text-green-500 mr-1" />
											<span class="text-sm text-green-600">Yes</span>
										{:else}
											<Calendar class="h-4 w-4 text-gray-400 mr-1" />
											<span class="text-sm text-gray-500">No</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if user.completed_onboarding}
											<CheckCircle class="h-4 w-4 text-green-500 mr-1" />
											<span class="text-sm text-green-600">Complete</span>
										{:else}
											<Clock class="h-4 w-4 text-amber-500 mr-1" />
											<span class="text-sm text-amber-600">Pending</span>
										{/if}
									</div>
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
								>
									<div class="flex items-center justify-end space-x-2">
										<!-- Send Email -->
										<Button
											on:click={() => {
												emailUserId = user.id;
												emailUserName = user.name;
												emailUserEmail = user.email;
												showEmailModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Mail}
											class="!p-2 text-gray-400 hover:text-indigo-600"
											title="Send email"
										/>
										<!-- View Activity -->
										<Button
											on:click={() => loadUserActivity(user.id)}
											variant="ghost"
											size="sm"
											icon={Activity}
											class="!p-2 text-gray-400 hover:text-purple-600"
											title="View activity details"
										/>

										<!-- Toggle Admin Status -->
										<Button
											on:click={() =>
												toggleAdminStatus(user.id, user.is_admin)}
											variant="ghost"
											size="sm"
											icon={user.is_admin ? ShieldOff : Shield}
											class="!p-2 text-gray-400 hover:text-blue-600"
											title={user.is_admin ? 'Remove admin' : 'Make admin'}
										/>

										<!-- View Details -->
										<Button
											on:click={() => {
												selectedUser = user;
												showUserModal = true;
											}}
											variant="ghost"
											size="sm"
											icon={Eye}
											class="!p-2 text-gray-400 hover:text-green-600"
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
					class="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700"
				>
					<div class="flex-1 flex justify-between sm:hidden">
						<Button
							on:click={prevPage}
							disabled={currentPage === 1}
							variant="secondary"
							size="sm"
						>
							Previous
						</Button>
						<Button
							on:click={nextPage}
							disabled={currentPage === totalPages}
							variant="secondary"
							size="sm"
						>
							Next
						</Button>
					</div>
					<div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
						<div>
							<p class="text-sm text-gray-700 dark:text-gray-300">
								Showing page <span class="font-medium">{currentPage}</span> of
								<span class="font-medium">{totalPages}</span>
							</p>
						</div>
						<div>
							<nav class="relative z-0 inline-flex -space-x-px">
								<Button
									on:click={prevPage}
									disabled={currentPage === 1}
									variant="secondary"
									size="sm"
									icon={ChevronLeft}
									class="rounded-r-none border-r-0"
								/>
								<Button
									on:click={nextPage}
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
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
			<div class="p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						User Details
					</h3>
					<Button
						on:click={() => (showUserModal = false)}
						variant="ghost"
						size="sm"
						class="!p-1 text-2xl leading-none"
					>
						×
					</Button>
				</div>

				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Email</label
						>
						<p class="text-sm text-gray-900 dark:text-white">{selectedUser.email}</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Name</label
						>
						<p class="text-sm text-gray-900 dark:text-white">
							{selectedUser.name || 'Not provided'}
						</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Admin Status</label
						>
						<span
							class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {selectedUser.is_admin
								? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
								: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'}"
						>
							{selectedUser.is_admin ? 'Admin' : 'Regular User'}
						</span>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Onboarding</label
						>
						<div class="flex items-center mt-1">
							{#if selectedUser.completed_onboarding}
								<CheckCircle class="h-4 w-4 text-green-500 mr-2" />
								<span class="text-sm text-green-600">Completed</span>
							{:else}
								<XCircle class="h-4 w-4 text-red-500 mr-2" />
								<span class="text-sm text-red-600">Not completed</span>
							{/if}
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Activity</label
						>
						<p class="text-sm text-gray-900 dark:text-white">
							{selectedUser.brain_dump_count || 0} brain dumps, {selectedUser.project_count ||
								0} projects, {selectedUser.brief_count} briefs
						</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Calendar</label
						>
						<div class="flex items-center mt-1">
							{#if selectedUser.calendar_connected}
								<Calendar class="h-4 w-4 text-green-500 mr-2" />
								<span class="text-sm text-green-600">Connected</span>
							{:else}
								<Calendar class="h-4 w-4 text-gray-400 mr-2" />
								<span class="text-sm text-gray-500">Not connected</span>
							{/if}
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Last Visit</label
						>
						<p class="text-sm text-gray-900 dark:text-white">
							{formatLastVisit(selectedUser.last_visit)}
						</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Joined</label
						>
						<p class="text-sm text-gray-900 dark:text-white">
							{formatDate(selectedUser.created_at)}
						</p>
					</div>

					{#if selectedUser.bio}
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>Bio</label
							>
							<p class="text-sm text-gray-900 dark:text-white">{selectedUser.bio}</p>
						</div>
					{/if}
				</div>

				<div class="mt-6 flex justify-between space-x-3">
					<Button
						on:click={() => {
							showUserModal = false;
							loadUserActivity(selectedUser.id);
						}}
						variant="primary"
						size="sm"
						class="bg-purple-600 hover:bg-purple-700"
					>
						View Activity
					</Button>
					<div class="flex space-x-2">
						<Button
							on:click={() => (showUserModal = false)}
							variant="secondary"
							size="sm"
						>
							Close
						</Button>
						<Button
							on:click={() =>
								toggleAdminStatus(selectedUser.id, selectedUser.is_admin)}
							variant="primary"
							size="sm"
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
	<UserActivityModal user={selectedUser} on:close={() => (showActivityModal = false)} />
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
