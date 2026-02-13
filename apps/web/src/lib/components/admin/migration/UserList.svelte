<!-- apps/web/src/lib/components/admin/migration/UserList.svelte -->
<!-- Paginated, filterable list of users with migration statistics -->
<script lang="ts">
	import { Search, ChevronLeft, ChevronRight, ExternalLink, Filter } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	export type MigrationUserStatus =
		| 'not_started'
		| 'partial'
		| 'complete'
		| 'has_errors'
		| 'no_projects';

	export interface UserMigrationStats {
		userId: string;
		email: string;
		name: string | null;
		avatarUrl: string | null;
		stats: {
			totalProjects: number;
			migratedProjects: number;
			pendingProjects: number;
			failedProjects: number;
			totalTasks: number;
			migratedTasks: number;
			percentComplete: number;
			lastMigrationAt: string | null;
		};
		migrationStatus: MigrationUserStatus;
	}

	interface Pagination {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	}

	interface Aggregates {
		totalUsers: number;
		usersWithProjects: number;
		usersFullyMigrated: number;
		usersPartiallyMigrated: number;
		usersNotStarted: number;
		usersWithErrors: number;
	}

	let {
		users,
		pagination,
		aggregates,
		isLoading = false,
		onPageChange,
		onStatusFilter,
		onSearch,
		onUserClick
	}: {
		users: UserMigrationStats[];
		pagination: Pagination;
		aggregates: Aggregates;
		isLoading?: boolean;
		onPageChange: (offset: number) => void;
		onStatusFilter: (status: MigrationUserStatus | null) => void;
		onSearch: (query: string) => void;
		onUserClick: (userId: string) => void;
	} = $props();

	let searchQuery = $state('');
	let selectedStatus = $state<MigrationUserStatus | null>(null);
	let showFilters = $state(false);

	const statusOptions: { value: MigrationUserStatus | null; label: string; count: number }[] =
		$derived([
			{ value: null, label: 'All', count: aggregates.totalUsers },
			{ value: 'complete', label: 'Complete', count: aggregates.usersFullyMigrated },
			{ value: 'partial', label: 'Partial', count: aggregates.usersPartiallyMigrated },
			{ value: 'not_started', label: 'Not Started', count: aggregates.usersNotStarted },
			{ value: 'has_errors', label: 'Has Errors', count: aggregates.usersWithErrors }
		]);

	const currentPage = $derived(Math.floor(pagination.offset / pagination.limit) + 1);
	const totalPages = $derived(Math.ceil(pagination.total / pagination.limit));

	function handleSearch() {
		onSearch(searchQuery);
	}

	function handleStatusFilter(status: MigrationUserStatus | null) {
		selectedStatus = status;
		onStatusFilter(status);
	}

	function getStatusBadgeVariant(
		status: MigrationUserStatus
	): 'success' | 'warning' | 'error' | 'info' | 'default' {
		switch (status) {
			case 'complete':
				return 'success';
			case 'partial':
				return 'warning';
			case 'has_errors':
				return 'error';
			case 'not_started':
				return 'info';
			default:
				return 'default';
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'Never';
		return new Date(dateStr).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<!-- Search and Filter Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 items-center gap-2">
			<div class="relative flex-1 max-w-md">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search users by email or name..."
					class="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-purple-500 dark:focus:ring-purple-900"
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && handleSearch()}
				/>
			</div>
			<Button variant="secondary" size="sm" onclick={handleSearch}>Search</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => (showFilters = !showFilters)}
				class="sm:hidden"
			>
				<Filter class="h-4 w-4" />
			</Button>
		</div>

		<!-- Status filter pills (desktop) -->
		<div class="hidden flex-wrap gap-2 sm:flex">
			{#each statusOptions as option}
				<button
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors {selectedStatus ===
					option.value
						? 'bg-purple-600 text-white'
						: 'bg-muted text-foreground hover:bg-muted dark:text-muted-foreground'}"
					onclick={() => handleStatusFilter(option.value)}
				>
					{option.label}
					<span class="ml-1 opacity-70">({option.count})</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Mobile filter pills -->
	{#if showFilters}
		<div class="flex flex-wrap gap-2 sm:hidden">
			{#each statusOptions as option}
				<button
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors {selectedStatus ===
					option.value
						? 'bg-purple-600 text-white'
						: 'bg-muted text-foreground hover:bg-muted dark:text-muted-foreground'}"
					onclick={() => handleStatusFilter(option.value)}
				>
					{option.label} ({option.count})
				</button>
			{/each}
		</div>
	{/if}

	<!-- User List -->
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
			></div>
		</div>
	{:else if users.length === 0}
		<div
			class="rounded-lg border border-border bg-muted p-8 text-center"
		>
			<p class="text-muted-foreground">No users found matching your criteria.</p>
		</div>
	{:else}
		<!-- Mobile Card View -->
		<div class="block max-h-[60vh] space-y-3 overflow-y-auto sm:hidden">
			{#each users as user}
				<button
					class="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
					onclick={() => onUserClick(user.userId)}
				>
					<div class="flex items-start justify-between">
						<div class="flex items-center gap-3">
							{#if user.avatarUrl}
								<img src={user.avatarUrl} alt="" class="h-10 w-10 rounded-full" />
							{:else}
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
								>
									{(user.name?.[0] ?? user.email[0] ?? '?').toUpperCase()}
								</div>
							{/if}
							<div>
								<p class="font-medium text-foreground">
									{user.name ?? user.email}
								</p>
								{#if user.name}
									<p class="text-xs text-muted-foreground">
										{user.email}
									</p>
								{/if}
							</div>
						</div>
						<Badge size="sm" variant={getStatusBadgeVariant(user.migrationStatus)}>
							{user.migrationStatus.replace('_', ' ')}
						</Badge>
					</div>
					<div class="mt-3 grid grid-cols-3 gap-2 text-xs">
						<div>
							<p class="text-muted-foreground">Projects</p>
							<p class="font-medium text-foreground">
								{user.stats.migratedProjects}/{user.stats.totalProjects}
							</p>
						</div>
						<div>
							<p class="text-muted-foreground">Progress</p>
							<p class="font-medium text-foreground">
								{user.stats.percentComplete.toFixed(0)}%
							</p>
						</div>
						<div>
							<p class="text-muted-foreground">Last Run</p>
							<p class="font-medium text-foreground">
								{formatDate(user.stats.lastMigrationAt)}
							</p>
						</div>
					</div>
				</button>
			{/each}
		</div>

		<!-- Desktop Table View -->
		<div
			class="hidden max-h-[60vh] overflow-auto rounded-lg border border-border sm:block"
		>
			<table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
				<thead class="sticky top-0 bg-muted/50">
					<tr
						class="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<th class="px-4 py-3">User</th>
						<th class="px-4 py-3">Status</th>
						<th class="px-4 py-3">Projects</th>
						<th class="px-4 py-3">Tasks</th>
						<th class="px-4 py-3">Progress</th>
						<th class="px-4 py-3">Last Migration</th>
						<th class="px-4 py-3 text-right">Action</th>
					</tr>
				</thead>
				<tbody
					class="divide-y divide-gray-200 bg-card dark:divide-gray-700"
				>
					{#each users as user}
						<tr class="transition-colors hover:bg-muted/30">
							<td class="px-4 py-3">
								<div class="flex items-center gap-3">
									{#if user.avatarUrl}
										<img
											src={user.avatarUrl}
											alt=""
											class="h-8 w-8 rounded-full"
										/>
									{:else}
										<div
											class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
										>
											{(user.name?.[0] ?? user.email[0] ?? '?').toUpperCase()}
										</div>
									{/if}
									<div>
										<p class="font-medium text-foreground">
											{user.name ?? user.email}
										</p>
										{#if user.name}
											<p class="text-xs text-muted-foreground">
												{user.email}
											</p>
										{/if}
									</div>
								</div>
							</td>
							<td class="px-4 py-3">
								<Badge
									size="sm"
									variant={getStatusBadgeVariant(user.migrationStatus)}
								>
									{user.migrationStatus.replace('_', ' ')}
								</Badge>
							</td>
							<td class="px-4 py-3 text-foreground">
								<span class="text-emerald-600 dark:text-emerald-400">
									{user.stats.migratedProjects}
								</span>
								<span class="text-muted-foreground"> / </span>
								{user.stats.totalProjects}
								{#if user.stats.failedProjects > 0}
									<span class="text-rose-600 dark:text-rose-400">
										({user.stats.failedProjects} failed)
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-foreground">
								<span class="text-emerald-600 dark:text-emerald-400">
									{user.stats.migratedTasks}
								</span>
								<span class="text-muted-foreground"> / </span>
								{user.stats.totalTasks}
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center gap-2">
									<div
										class="h-2 w-16 overflow-hidden rounded-full bg-muted"
									>
										<div
											class="h-full bg-emerald-500 transition-all"
											style="width: {user.stats.percentComplete}%"
										></div>
									</div>
									<span
										class="text-xs font-medium text-foreground"
									>
										{user.stats.percentComplete.toFixed(0)}%
									</span>
								</div>
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								{formatDate(user.stats.lastMigrationAt)}
							</td>
							<td class="px-4 py-3 text-right">
								<Button
									variant="outline"
									size="sm"
									onclick={() => onUserClick(user.userId)}
								>
									<ExternalLink class="h-3 w-3" />
									View
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Pagination -->
	{#if pagination.total > pagination.limit}
		<div
			class="flex items-center justify-between border-t border-border pt-4"
		>
			<p class="text-sm text-muted-foreground">
				Showing {pagination.offset + 1} to {Math.min(
					pagination.offset + pagination.limit,
					pagination.total
				)} of {pagination.total} users
			</p>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={pagination.offset === 0}
					onclick={() => onPageChange(pagination.offset - pagination.limit)}
				>
					<ChevronLeft class="h-4 w-4" />
					Previous
				</Button>
				<span class="px-2 text-sm text-foreground">
					Page {currentPage} of {totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={!pagination.hasMore}
					onclick={() => onPageChange(pagination.offset + pagination.limit)}
				>
					Next
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>
