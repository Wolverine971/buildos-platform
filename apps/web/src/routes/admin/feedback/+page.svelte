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
		X,
		Mail
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import EmailComposerModal from '$lib/components/admin/EmailComposerModal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let feedback: any[] = [];
	let isLoading = true;
	let error: string | null = null;
	let searchQuery = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalItems = 0;
	let selectedFeedback: any = null;
	let showFeedbackModal = false;
	let showMobileFilters = false;
	let showEmailModal = false;
	let emailUserId = '';
	let emailUserName = '';
	let emailUserEmail = '';

	// Filters
	let filterByStatus = 'all';
	let filterByCategory = 'all';
	let sortBy = 'created_at';
	let sortOrder = 'desc';

	// Status update
	let isUpdating = false;

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	onMount(() => {
		loadFeedback();
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	$: if (searchQuery || filterByStatus || filterByCategory || sortBy || sortOrder) {
		currentPage = 1;
		loadFeedback();
	}

	async function loadFeedback() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: '20',
				search: searchQuery,
				sort_by: sortBy,
				sort_order: sortOrder
			});

			if (filterByStatus !== 'all') {
				params.set('status', filterByStatus);
			}

			if (filterByCategory !== 'all') {
				params.set('category', filterByCategory);
			}

			const response = await fetch(`/api/admin/feedback?${params}`);
			if (!response.ok) throw new Error('Failed to load feedback');

			const result = await response.json();
			if (result.success) {
				feedback = result.data.feedback;
				totalPages = result.data.pagination.total_pages;
				totalItems = result.data.pagination.total_items;
			} else {
				throw new Error(result.error || 'Failed to load feedback');
			}
		} catch (err) {
			console.error('Error loading feedback:', err);
			error = err instanceof Error ? err.message : 'Failed to load feedback';
		} finally {
			isLoading = false;
		}
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
				await loadFeedback();
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
			new: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
			reviewed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
			in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
			resolved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
			closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
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

	function getCategoryColor(category: string): string {
		const colors = {
			feature: 'text-blue-600',
			bug: 'text-red-600',
			improvement: 'text-green-600',
			general: 'text-gray-600'
		};
		return colors[category as keyof typeof colors] || 'text-gray-600';
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			loadFeedback();
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			loadFeedback();
		}
	}
</script>

<svelte:head>
	<title>Feedback Management - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header with Back Button -->
		<AdminPageHeader
			title="Feedback Management"
			description="Review and manage user feedback submissions"
			icon={MessageSquare}
			backHref="/admin"
			backLabel="Dashboard"
		>
			<div slot="actions" class="flex items-center space-x-4">
				<div class="text-sm text-gray-600 dark:text-gray-400">
					{totalItems} total submissions
				</div>
				<Button
					on:click={loadFeedback}
					disabled={isLoading}
					variant="primary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
				>
					<span class="hidden lg:inline">Refresh</span>
				</Button>
			</div>
		</AdminPageHeader>

		<!-- Filters and Search -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-2">
			<!-- Mobile Filter Toggle -->
			<div class="sm:hidden mb-4">
				<Button
					on:click={() => (showMobileFilters = !showMobileFilters)}
					variant="ghost"
					size="md"
					class="w-full justify-between bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
					icon={Filter}
					iconPosition={'right'}
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
						placeholder="Search feedback..."
						size="md"
					/>
				</FormField>

				<!-- Status Filter -->
				<FormField label="Status" labelFor="mobile-status">
					<Select
						id="mobile-status"
						bind:value={filterByStatus}
						on:change={(e) => (filterByStatus = e.detail)}
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
						on:change={(e) => (filterByCategory = e.detail)}
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
						on:change={(e) => (sortBy = e.detail)}
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
						placeholder="Search feedback text or user email..."
						size="md"
					/>
				</div>

				<!-- Status Filter -->
				<div class="py-2">
					<Select
						bind:value={filterByStatus}
						on:change={(e) => (filterByStatus = e.detail)}
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
						on:change={(e) => (filterByCategory = e.detail)}
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
					<Select bind:value={sortBy} on:change={(e) => (sortBy = e.detail)} size="md">
						<option value="created_at">Date Created</option>
						<option value="rating">Rating</option>
						<option value="status">Status</option>
						<option value="category">Category</option>
					</Select>
				</div>
			</div>
		</div>
	</div>

	{#if error}
		<div
			class="bg-red-50 border border-red-200 rounded-lg p-4 mb-2 dark:bg-red-900/20 dark:border-red-800"
		>
			<p class="text-red-800 dark:text-red-200">{error}</p>
		</div>
	{/if}

	<!-- Feedback Content -->
	<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
		{#if isLoading}
			<div class="p-6 sm:p-8 text-center">
				<RefreshCw class="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
				<p class="text-gray-600 dark:text-gray-400">Loading feedback...</p>
			</div>
		{:else if feedback.length === 0}
			<div class="p-6 sm:p-8 text-center">
				<MessageSquare class="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-4" />
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
					No Feedback Found
				</h3>
				<p class="text-gray-600 dark:text-gray-400">
					{searchQuery
						? 'Try adjusting your search criteria.'
						: 'No feedback submissions yet.'}
				</p>
			</div>
		{:else}
			<!-- Mobile Cards View -->
			<div class="sm:hidden">
				{#each feedback as item}
					<div class="p-4 border-b border-gray-200 dark:border-gray-700">
						<div class="flex items-start justify-between mb-2">
							<div class="flex-1 min-w-0">
								<p class="text-sm text-gray-900 dark:text-white line-clamp-2 mb-1">
									{item.feedback_text}
								</p>
								<p class="text-xs text-gray-500">
									{item.user_email || 'Anonymous'}
								</p>
							</div>
							<div class="flex space-x-1">
								<Button
									on:click={() => {
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
										on:click={() => {
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
										<Star class="h-3 w-3 text-yellow-500 mr-1" />
										<span>{item.rating}/5</span>
									</div>
								{/if}
								<span class="text-gray-500">
									{formatDate(item.created_at)}
								</span>
							</div>
						</div>

						<!-- Quick Actions -->
						<div class="flex items-center justify-end space-x-2 mt-3">
							{#if item.status === 'new'}
								<Button
									on:click={() => updateFeedbackStatus(item.id, 'reviewed')}
									disabled={isUpdating}
									variant="secondary"
									size="sm"
									class="bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
								>
									Review
								</Button>
							{/if}
							{#if item.status !== 'resolved'}
								<Button
									on:click={() => updateFeedbackStatus(item.id, 'resolved')}
									disabled={isUpdating}
									variant="secondary"
									size="sm"
									class="bg-green-100 text-green-800 hover:bg-green-200"
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
				<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
					<thead class="bg-gray-50 dark:bg-gray-900">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Feedback
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Category
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Rating
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Status
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Date
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
						{#each feedback as item}
							<tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
								<td class="px-6 py-4">
									<div class="max-w-xs">
										<p
											class="text-sm text-gray-900 dark:text-white line-clamp-2"
										>
											{item.feedback_text}
										</p>
										<p class="text-xs text-gray-500 mt-1">
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
											<Star class="h-4 w-4 text-yellow-500 mr-1" />
											<span class="text-sm text-gray-900 dark:text-white">
												{item.rating}/5
											</span>
										</div>
									{:else}
										<span class="text-sm text-gray-500">No rating</span>
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
									class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
								>
									{formatDate(item.created_at)}
								</td>
								<td
									class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
								>
									<div class="flex items-center justify-end space-x-2">
										<!-- View Details -->
										<Button
											on:click={() => {
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
												on:click={() => {
													emailUserId = item.user_id || '';
													emailUserName = item.user_name || '';
													emailUserEmail = item.user_email;
													showEmailModal = true;
												}}
												variant="ghost"
												size="sm"
												title="Send email"
												class="p-2 hover:text-indigo-600"
												icon={Mail}
											></Button>
										{/if}

										<!-- Quick Status Updates -->
										{#if item.status === 'new'}
											<Button
												on:click={() =>
													updateFeedbackStatus(item.id, 'reviewed')}
												disabled={isUpdating}
												variant="ghost"
												size="sm"
												title="Mark as reviewed"
												class="p-2 hover:text-yellow-600"
												icon={CheckSquare}
											></Button>
										{/if}

										{#if item.status !== 'resolved'}
											<Button
												on:click={() =>
													updateFeedbackStatus(item.id, 'resolved')}
												disabled={isUpdating}
												variant="ghost"
												size="sm"
												title="Mark as resolved"
												class="p-2 hover:text-green-600"
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
						<span class="flex items-center text-sm text-gray-700 dark:text-gray-300">
							{currentPage} of {totalPages}
						</span>
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
							<nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
								<Button
									on:click={prevPage}
									disabled={currentPage === 1}
									variant="secondary"
									size="sm"
									class="rounded-r-none"
									icon={ChevronLeft}
								></Button>
								<Button
									on:click={nextPage}
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

<!-- Feedback Details Modal - Mobile Responsive -->
{#if showFeedbackModal && selectedFeedback}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
		>
			<div class="p-4 sm:p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						Feedback Details
					</h3>
					<Button
						on:click={() => (showFeedbackModal = false)}
						variant="ghost"
						size="sm"
						class="p-1"
						icon={X}
					></Button>
				</div>

				<div class="space-y-4">
					<!-- Category and Rating -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Category</label
							>
							<span
								class="text-sm font-medium {getCategoryColor(
									selectedFeedback.category
								)} capitalize"
							>
								{selectedFeedback.category}
							</span>
						</div>
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Rating</label
							>
							{#if selectedFeedback.rating}
								<div class="flex items-center">
									{#each Array(5) as _, i}
										<Star
											class="h-4 w-4 {i < selectedFeedback.rating
												? 'text-yellow-500'
												: 'text-gray-300'}"
										/>
									{/each}
									<span class="ml-2 text-sm text-gray-600 dark:text-gray-400">
										({selectedFeedback.rating}/5)
									</span>
								</div>
							{:else}
								<span class="text-sm text-gray-500">No rating provided</span>
							{/if}
						</div>
					</div>

					<!-- User Info -->
					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>User</label
						>
						<p class="text-sm text-gray-900 dark:text-white">
							{selectedFeedback.user_email || 'Anonymous'}
						</p>
					</div>

					<!-- Feedback Text -->
					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>Feedback</label
						>
						<div class="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
							<p class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
								{selectedFeedback.feedback_text}
							</p>
						</div>
					</div>

					<!-- Status -->
					<div>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>Current Status</label
						>
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
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Created</label
							>
							<p class="text-sm text-gray-900 dark:text-white">
								{formatDate(selectedFeedback.created_at)}
							</p>
						</div>
						{#if selectedFeedback.updated_at !== selectedFeedback.created_at}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
									>Updated</label
								>
								<p class="text-sm text-gray-900 dark:text-white">
									{formatDate(selectedFeedback.updated_at)}
								</p>
							</div>
						{/if}
					</div>

					<!-- Technical Info -->
					{#if selectedFeedback.user_agent || selectedFeedback.user_ip}
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>Technical Info</label
							>
							<div class="text-xs text-gray-500 space-y-1">
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
					<Button
						on:click={() => (showFeedbackModal = false)}
						variant="secondary"
						size="sm"
					>
						Close
					</Button>

					{#if selectedFeedback.status === 'new'}
						<Button
							on:click={() => {
								updateFeedbackStatus(selectedFeedback.id, 'reviewed');
								selectedFeedback.status = 'reviewed';
							}}
							disabled={isUpdating}
							variant="primary"
							size="sm"
							class="bg-yellow-600 hover:bg-yellow-700"
						>
							Mark as Reviewed
						</Button>
					{/if}

					{#if selectedFeedback.status === 'reviewed'}
						<Button
							on:click={() => {
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
							on:click={() => {
								updateFeedbackStatus(selectedFeedback.id, 'resolved');
								selectedFeedback.status = 'resolved';
							}}
							disabled={isUpdating}
							variant="primary"
							size="sm"
							class="bg-green-600 hover:bg-green-700"
						>
							Mark as Resolved
						</Button>
					{/if}

					{#if selectedFeedback.status !== 'closed'}
						<Button
							on:click={() => {
								updateFeedbackStatus(selectedFeedback.id, 'closed');
								selectedFeedback.status = 'closed';
							}}
							disabled={isUpdating}
							variant="secondary"
							size="sm"
							class="bg-gray-600 hover:bg-gray-700"
						>
							Close
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

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
