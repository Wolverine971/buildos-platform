<!-- apps/web/src/routes/admin/feedback/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		MessageSquare,
		Search,
		Filter,
		ChevronLeft,
		ChevronRight,
		RefreshCw,
		Star,
		Eye,
		CheckCircle,
		CheckSquare,
		Clock,
		AlertCircle,
		XCircle,
		ExternalLink,
		Mail
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface FeedbackListRequest {
		page: number;
		search: string;
		status: string;
		category: string;
		sortBy: string;
		sortOrder: string;
		refreshVersion: number;
	}

	let feedback = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalItems = $state(0);
	let selectedFeedback = $state<any>(null);
	let showFeedbackModal = $state(false);
	let showMobileFilters = $state(false);
	let showEmailModal = $state(false);
	let emailUserId = $state('');
	let emailUserName = $state('');
	let emailUserEmail = $state('');

	// Filters
	let filterByStatus = $state('all');
	let filterByCategory = $state('all');
	let sortBy = $state('created_at');
	let sortOrder = $state('desc');
	let refreshVersion = $state(0);

	// Status update
	let isUpdating = $state(false);

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let previousRequestSearch = '';
	let feedbackListRequest = $derived<FeedbackListRequest>({
		page: currentPage,
		search: searchQuery,
		status: filterByStatus,
		category: filterByCategory,
		sortBy,
		sortOrder,
		refreshVersion
	});

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// This effect is the single owner of feedback-list requests.
	$effect(() => {
		const request = feedbackListRequest;
		const controller = new AbortController();
		const debounceMs = request.search !== previousRequestSearch ? 250 : 0;
		previousRequestSearch = request.search;

		const timeoutId = window.setTimeout(() => {
			void loadFeedback(request, controller.signal);
		}, debounceMs);

		return () => {
			window.clearTimeout(timeoutId);
			controller.abort();
		};
	});

	async function loadFeedback(request: FeedbackListRequest, signal: AbortSignal) {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: request.page.toString(),
				limit: '20',
				search: request.search,
				sort_by: request.sortBy,
				sort_order: request.sortOrder
			});

			if (request.status !== 'all') {
				params.set('status', request.status);
			}

			if (request.category !== 'all') {
				params.set('category', request.category);
			}

			const response = await fetch(`/api/admin/feedback?${params}`, { signal });
			if (!response.ok) throw new Error('Failed to load feedback');

			const result = await response.json();
			if (signal.aborted) return;

			if (result.success) {
				feedback = result.data.feedback;
				totalPages = result.data.pagination.total_pages;
				totalItems = result.data.pagination.total_items;
			} else {
				throw new Error(result.error || 'Failed to load feedback');
			}
		} catch (err) {
			if (signal.aborted || isAbortError(err)) return;
			console.error('Error loading feedback:', err);
			error = err instanceof Error ? err.message : 'Failed to load feedback';
		} finally {
			if (!signal.aborted) {
				isLoading = false;
			}
		}
	}

	function isAbortError(error: unknown): boolean {
		return error instanceof Error && error.name === 'AbortError';
	}

	function resetPage() {
		currentPage = 1;
	}

	function refreshFeedback() {
		refreshVersion += 1;
	}

	async function updateFeedbackStatus(feedbackId: string, newStatus: string) {
		if (isUpdating) return;
		isUpdating = true;

		try {
			const response = await fetch('/api/admin/feedback', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					feedback_id: feedbackId,
					updates: { status: newStatus }
				})
			});

			const result = await response.json();
			if (result.success) {
				refreshFeedback();
				if (selectedFeedback && selectedFeedback.id === feedbackId) {
					selectedFeedback.status = newStatus;
				}
			} else {
				throw new Error(result.error || 'Failed to update feedback');
			}
		} catch (err) {
			console.error('Error updating feedback:', err);
			error = err instanceof Error ? err.message : 'Failed to update feedback';
		} finally {
			isUpdating = false;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		});
	}

	function getStatusColor(status: string): string {
		const colors = {
			new: 'bg-destructive/10 text-destructive',
			reviewed: 'bg-warning/10 text-warning',
			in_progress: 'bg-info/10 text-info',
			resolved: 'bg-success/10 text-success',
			closed: 'bg-muted text-foreground dark:text-muted-foreground'
		};
		return colors[status as keyof typeof colors] || colors.new;
	}

	function getStatusIcon(status: string) {
		const icons = {
			new: AlertCircle,
			reviewed: Eye,
			in_progress: Clock,
			resolved: CheckCircle,
			closed: XCircle
		};
		return icons[status as keyof typeof icons] || AlertCircle;
	}

	function getCategoryColor(_category: string): string {
		// Category is a neutral classification, not a good/bad state — keep it neutral.
		return 'text-foreground';
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
		}
	}
</script>

<svelte:head>
	<title>Feedback Management - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header with Back Button -->
	<AdminPageHeader
		title="Feedback Management"
		description="Review and manage user feedback submissions"
		icon={MessageSquare}
		backHref="/admin"
		backLabel="Dashboard"
	>
		{#snippet actions()}
			<div class="flex items-center space-x-4">
				<div class="text-sm text-muted-foreground">
					{totalItems} total submissions
				</div>
				<Button
					onclick={refreshFeedback}
					disabled={isLoading}
					variant="primary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
				>
					<span class="hidden lg:inline">Refresh</span>
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	<!-- Filters and Search -->
	<div class="admin-panel p-4 sm:p-6">
		<!-- Mobile Filter Toggle -->
		<div class="sm:hidden mb-4">
			<Button
				onclick={() => (showMobileFilters = !showMobileFilters)}
				variant="ghost"
				size="md"
				class="w-full justify-between bg-muted text-foreground"
				icon={Filter}
				iconPosition="right"
			>
				Filters & Search
			</Button>
		</div>

		<!-- Mobile Filters Collapsible -->
		<div class="sm:hidden {showMobileFilters ? 'block' : 'hidden'} space-y-4 mb-4">
			<!-- Search -->
			<FormField label="Search" labelFor="search">
				<TextInput
					id="search"
					type="text"
					bind:value={searchQuery}
					oninput={resetPage}
					placeholder="Search feedback..."
					size="md"
				/>
			</FormField>

			<!-- Status Filter -->
			<FormField label="Status" labelFor="mobile-status">
				<Select
					id="mobile-status"
					bind:value={filterByStatus}
					onchange={(value) => {
						filterByStatus = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="all">All Status</option>
					<option value="new">New</option>
					<option value="reviewed">Reviewed</option>
					<option value="in_progress">In Progress</option>
					<option value="resolved">Resolved</option>
					<option value="closed">Closed</option>
				</Select>
			</FormField>

			<!-- Category Filter -->
			<FormField label="Category" labelFor="mobile-category">
				<Select
					id="mobile-category"
					bind:value={filterByCategory}
					onchange={(value) => {
						filterByCategory = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="all">All Categories</option>
					<option value="feature">Feature Request</option>
					<option value="bug">Bug Report</option>
					<option value="improvement">Improvement</option>
					<option value="general">General</option>
				</Select>
			</FormField>

			<!-- Sort -->
			<FormField label="Sort By" labelFor="mobile-sort">
				<Select
					id="mobile-sort"
					bind:value={sortBy}
					onchange={(value) => {
						sortBy = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="created_at">Date Created</option>
					<option value="rating">Rating</option>
					<option value="status">Status</option>
					<option value="category">Category</option>
				</Select>
			</FormField>
		</div>

		<!-- Desktop Filters Grid -->
		<div class="hidden sm:grid sm:grid-cols-1 md:grid-cols-5 gap-4">
			<!-- Search -->
			<div class="md:col-span-2 py-2">
				<TextInput
					type="text"
					bind:value={searchQuery}
					oninput={resetPage}
					placeholder="Search feedback text or user email..."
					size="md"
				/>
			</div>

			<!-- Status Filter -->
			<div class="py-2">
				<Select
					bind:value={filterByStatus}
					onchange={(value) => {
						filterByStatus = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="all">All Status</option>
					<option value="new">New</option>
					<option value="reviewed">Reviewed</option>
					<option value="in_progress">In Progress</option>
					<option value="resolved">Resolved</option>
					<option value="closed">Closed</option>
				</Select>
			</div>

			<!-- Category Filter -->
			<div class="py-2">
				<Select
					bind:value={filterByCategory}
					onchange={(value) => {
						filterByCategory = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="all">All Categories</option>
					<option value="feature">Feature Request</option>
					<option value="bug">Bug Report</option>
					<option value="improvement">Improvement</option>
					<option value="general">General</option>
				</Select>
			</div>

			<!-- Sort -->
			<div class="py-2">
				<Select
					bind:value={sortBy}
					onchange={(value) => {
						sortBy = String(value);
						resetPage();
					}}
					size="md"
				>
					<option value="created_at">Date Created</option>
					<option value="rating">Rating</option>
					<option value="status">Status</option>
					<option value="category">Category</option>
				</Select>
			</div>
		</div>
	</div>

	{#if error}
		<AdminCard tone="danger" padding="sm" class="text-sm font-medium text-destructive">
			{error}
		</AdminCard>
	{/if}

	<!-- Feedback Content -->
	<div class="admin-panel overflow-hidden">
		{#if isLoading}
			<div class="p-6 sm:p-8 text-center">
				<RefreshCw
					class="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground mx-auto mb-4"
				/>
				<p class="text-muted-foreground">Loading feedback...</p>
			</div>
		{:else if feedback.length === 0}
			<div class="p-6 sm:p-8 text-center">
				<MessageSquare
					class="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-4"
				/>
				<h3 class="text-lg font-semibold text-foreground mb-2">No Feedback Found</h3>
				<p class="text-muted-foreground">
					{searchQuery
						? 'Try adjusting your search criteria.'
						: 'No feedback submissions yet.'}
				</p>
			</div>
		{:else}
			<!-- Mobile Cards View -->
			<div class="sm:hidden">
				{#each feedback as item (item.id)}
					<div class="p-4 border-b border-border">
						<div class="flex items-start justify-between mb-2">
							<div class="flex-1 min-w-0">
								<p class="text-sm text-foreground line-clamp-2 mb-1">
									{item.feedback_text}
								</p>
								<p class="text-xs text-muted-foreground truncate">
									{item.user_email || 'Anonymous'}
								</p>
							</div>
							<div class="flex space-x-1">
								<Button
									onclick={() => {
										selectedFeedback = item;
										showFeedbackModal = true;
									}}
									variant="ghost"
									size="sm"
									title="View details"
									class="p-2"
								>
									<Eye class="h-4 w-4" />
								</Button>
								{#if item.user_email}
									<Button
										onclick={() => {
											emailUserId = item.user_id || '';
											emailUserName = item.user_name || '';
											emailUserEmail = item.user_email;
											showEmailModal = true;
										}}
										variant="ghost"
										size="sm"
										title="Send email"
										class="p-2"
									>
										<Mail class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						</div>

						<div class="flex items-center justify-between text-xs">
							<div class="flex items-center space-x-2">
								<span
									class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
										item.status
									)}"
								>
									{item.status?.replace('_', ' ') || 'new'}
								</span>
								<span
									class="font-medium {getCategoryColor(item.category)} capitalize"
								>
									{item.category}
								</span>
							</div>
							<div class="flex items-center space-x-2">
								{#if item.rating}
									<div class="flex items-center">
										<Star class="h-3 w-3 text-warning mr-1" />
										<span>{item.rating}/5</span>
									</div>
								{/if}
								<span class="text-muted-foreground">
									{formatDate(item.created_at)}
								</span>
							</div>
						</div>

						<!-- Quick Actions -->
						<div class="flex items-center justify-end space-x-2 mt-3">
							{#if item.status === 'new'}
								<Button
									onclick={() => updateFeedbackStatus(item.id, 'reviewed')}
									disabled={isUpdating}
									variant="secondary"
									size="sm"
									class="bg-warning/10 text-warning hover:bg-warning/20"
								>
									Review
								</Button>
							{/if}
							{#if item.status !== 'resolved'}
								<Button
									onclick={() => updateFeedbackStatus(item.id, 'resolved')}
									disabled={isUpdating}
									variant="secondary"
									size="sm"
									class="bg-success/10 text-success hover:bg-success/20"
								>
									Resolve
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop Table View -->
			<div class="hidden sm:block overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Feedback
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Category
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Rating
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Status
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Date
							</th>
							<th
								class="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="bg-card divide-y divide-border">
						{#each feedback as item (item.id)}
							<tr class="hover:bg-muted">
								<td class="px-6 py-4">
									<div class="max-w-xs">
										<p class="text-sm text-foreground line-clamp-2">
											{item.feedback_text}
										</p>
										<p class="text-xs text-muted-foreground mt-1 truncate">
											{item.user_email || 'Anonymous'}
										</p>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span
										class="text-sm font-medium {getCategoryColor(
											item.category
										)} capitalize"
									>
										{item.category}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									{#if item.rating}
										<div class="flex items-center">
											<Star class="h-4 w-4 text-warning mr-1" />
											<span class="text-sm text-foreground">
												{item.rating}/5
											</span>
										</div>
									{:else}
										<span class="text-sm text-muted-foreground">No rating</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<span
											class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
												item.status
											)}"
										>
											{item.status?.replace('_', ' ') || 'new'}
										</span>
									</div>
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
								>
									{formatDate(item.created_at)}
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
								>
									<div class="flex items-center justify-end space-x-2">
										<!-- View Details -->
										<Button
											onclick={() => {
												selectedFeedback = item;
												showFeedbackModal = true;
											}}
											variant="ghost"
											size="sm"
											title="View details"
											class="p-2"
											icon={Eye}
										></Button>
										<!-- Send Email -->
										{#if item.user_email}
											<Button
												onclick={() => {
													emailUserId = item.user_id || '';
													emailUserName = item.user_name || '';
													emailUserEmail = item.user_email;
													showEmailModal = true;
												}}
												variant="ghost"
												size="sm"
												title="Send email"
												class="p-2 hover:text-info"
												icon={Mail}
											></Button>
										{/if}

										<!-- Quick Status Updates -->
										{#if item.status === 'new'}
											<Button
												onclick={() =>
													updateFeedbackStatus(item.id, 'reviewed')}
												disabled={isUpdating}
												variant="ghost"
												size="sm"
												title="Mark as reviewed"
												class="p-2 hover:text-warning"
												icon={CheckSquare}
											></Button>
										{/if}

										{#if item.status !== 'resolved'}
											<Button
												onclick={() =>
													updateFeedbackStatus(item.id, 'resolved')}
												disabled={isUpdating}
												variant="ghost"
												size="sm"
												title="Mark as resolved"
												class="p-2 hover:text-success"
												icon={CheckCircle}
											></Button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination - Mobile Responsive -->
			{#if totalPages > 1}
				<div
					class="bg-card px-4 py-3 flex items-center justify-between border-t border-border"
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
						<span class="flex items-center text-sm text-foreground">
							{currentPage} of {totalPages}
						</span>
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
							<p class="text-sm text-foreground">
								Showing page <span class="font-medium">{currentPage}</span> of
								<span class="font-medium">{totalPages}</span>
							</p>
						</div>
						<div>
							<nav class="relative z-0 inline-flex rounded-md shadow-ink -space-x-px">
								<Button
									onclick={prevPage}
									disabled={currentPage === 1}
									variant="secondary"
									size="sm"
									class="rounded-r-none"
									icon={ChevronLeft}
								></Button>
								<Button
									onclick={nextPage}
									disabled={currentPage === totalPages}
									variant="secondary"
									size="sm"
									class="rounded-l-none -ml-px"
									icon={ChevronRight}
								></Button>
							</nav>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Feedback Details Modal -->
<Modal
	bind:isOpen={showFeedbackModal}
	onClose={() => (showFeedbackModal = false)}
	title="Feedback Details"
	size="md"
>
	{#if selectedFeedback}
		<div class="p-4 sm:p-6">
			<div class="space-y-4">
				<!-- Category and Rating -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<div class="block text-sm font-medium text-foreground mb-1">Category</div>
						<span
							class="text-sm font-medium {getCategoryColor(
								selectedFeedback.category
							)} capitalize"
						>
							{selectedFeedback.category}
						</span>
					</div>
					<div>
						<div class="block text-sm font-medium text-foreground mb-1">Rating</div>
						{#if selectedFeedback.rating}
							<div class="flex items-center">
								{#each Array(5) as _, i (i)}
									<Star
										class="h-4 w-4 {i < selectedFeedback.rating
											? 'text-warning'
											: 'text-muted-foreground'}"
									/>
								{/each}
								<span class="ml-2 text-sm text-muted-foreground">
									({selectedFeedback.rating}/5)
								</span>
							</div>
						{:else}
							<span class="text-sm text-muted-foreground">No rating provided</span>
						{/if}
					</div>
				</div>

				<!-- User Info -->
				<div>
					<div class="block text-sm font-medium text-foreground mb-1">User</div>
					<p class="text-sm text-foreground">
						{selectedFeedback.user_email || 'Anonymous'}
					</p>
				</div>

				<!-- Feedback Text -->
				<div>
					<div class="block text-sm font-medium text-foreground mb-1">Feedback</div>
					<div class="mt-1 p-3 bg-muted rounded-lg">
						<p class="text-sm text-foreground whitespace-pre-wrap">
							{selectedFeedback.feedback_text}
						</p>
					</div>
				</div>

				<!-- Status -->
				<div>
					<div class="block text-sm font-medium text-foreground mb-1">Current Status</div>
					<span
						class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(
							selectedFeedback.status
						)}"
					>
						{selectedFeedback.status?.replace('_', ' ') || 'new'}
					</span>
				</div>

				<!-- Timestamps -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<div class="block text-sm font-medium text-foreground mb-1">Created</div>
						<p class="text-sm text-foreground">
							{formatDate(selectedFeedback.created_at)}
						</p>
					</div>
					{#if selectedFeedback.updated_at !== selectedFeedback.created_at}
						<div>
							<div class="block text-sm font-medium text-foreground mb-1">
								Updated
							</div>
							<p class="text-sm text-foreground">
								{formatDate(selectedFeedback.updated_at)}
							</p>
						</div>
					{/if}
				</div>

				<!-- Technical Info -->
				{#if selectedFeedback.user_agent || selectedFeedback.user_ip}
					<div>
						<div class="block text-sm font-medium text-foreground mb-1">
							Technical Info
						</div>
						<div class="text-xs text-muted-foreground space-y-1">
							{#if selectedFeedback.user_agent}
								<p class="break-all">
									User Agent: {selectedFeedback.user_agent}
								</p>
							{/if}
							{#if selectedFeedback.user_ip}
								<p>IP: {selectedFeedback.user_ip}</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Action Buttons - Mobile Responsive -->
			<div class="mt-6 flex flex-wrap gap-2">
				<Button onclick={() => (showFeedbackModal = false)} variant="secondary" size="sm">
					Close
				</Button>

				{#if selectedFeedback.status === 'new'}
					<Button
						onclick={() => {
							updateFeedbackStatus(selectedFeedback.id, 'reviewed');
							selectedFeedback.status = 'reviewed';
						}}
						disabled={isUpdating}
						variant="primary"
						size="sm"
						class="bg-warning hover:bg-warning/90"
					>
						Mark as Reviewed
					</Button>
				{/if}

				{#if selectedFeedback.status === 'reviewed'}
					<Button
						onclick={() => {
							updateFeedbackStatus(selectedFeedback.id, 'in_progress');
							selectedFeedback.status = 'in_progress';
						}}
						disabled={isUpdating}
						variant="primary"
						size="sm"
					>
						Start Progress
					</Button>
				{/if}

				{#if selectedFeedback.status !== 'resolved'}
					<Button
						onclick={() => {
							updateFeedbackStatus(selectedFeedback.id, 'resolved');
							selectedFeedback.status = 'resolved';
						}}
						disabled={isUpdating}
						variant="primary"
						size="sm"
						class="bg-success hover:bg-success/90"
					>
						Mark as Resolved
					</Button>
				{/if}

				{#if selectedFeedback.status !== 'closed'}
					<Button
						onclick={() => {
							updateFeedbackStatus(selectedFeedback.id, 'closed');
							selectedFeedback.status = 'closed';
						}}
						disabled={isUpdating}
						variant="secondary"
						size="sm"
					>
						Close
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</Modal>

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
