<!-- apps/web/src/routes/admin/errors/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ErrorLogEntry, ErrorSeverity, ErrorType } from '$lib/types/error-logging';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import TextInput from '$components/ui/TextInput.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import InfoModal from '$components/ui/InfoModal.svelte';
	import {
		Check,
		AlertTriangle,
		RefreshCw,
		Search,
		Filter,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';

	export let data: PageData;

	let errors: ErrorLogEntry[] = data.errors || [];
	let summary = data.summary || [];
	let loading = false;
	let selectedError: ErrorLogEntry | null = null;
	let selectedErrorIds: Set<string> = new Set();
	let selectAll = false;
	let bulkProcessing = false;

	// Modal state
	let infoModal = {
		isOpen: false,
		title: '',
		message: ''
	};
	let resolutionNotes = '';
	let resolveModalOpen = false;
	let currentErrorToResolve: string | null = null;
	let bulkResolveModalOpen = false;

	// Filters - Default to showing only unresolved errors
	let filterSeverity: ErrorSeverity | '' = '';
	let filterType: ErrorType | '' = '';
	let filterResolved: boolean | null = false; // Default to unresolved only
	let filterUserId = '';
	let filterProjectId = '';

	// Pagination
	let currentPage = 1;
	let itemsPerPage = 50;
	let hasMore = false;
	let totalErrors = 0;

	async function loadErrors() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (filterSeverity) params.append('severity', filterSeverity);
			if (filterType) params.append('type', filterType);
			if (filterResolved !== null) params.append('resolved', filterResolved.toString());
			if (filterUserId) params.append('userId', filterUserId);
			if (filterProjectId) params.append('projectId', filterProjectId);
			params.append('page', currentPage.toString());
			params.append('limit', itemsPerPage.toString());

			const response = await fetch(`/api/admin/errors?${params}`);
			const result = await response.json();

			if (result.success) {
				errors = result.data.errors;
				summary = result.data.summary;
				hasMore = result.data.pagination?.hasMore || false;
				// Reset selection when loading new data
				selectedErrorIds.clear();
				selectAll = false;
			}
		} catch (error) {
			console.error('Failed to load errors:', error);
		} finally {
			loading = false;
		}
	}

	function openResolveModal(errorId: string) {
		currentErrorToResolve = errorId;
		resolutionNotes = '';
		resolveModalOpen = true;
	}

	async function resolveError() {
		if (!currentErrorToResolve) return;

		resolveModalOpen = false;
		const errorId = currentErrorToResolve;
		const notes = resolutionNotes;
		currentErrorToResolve = null;

		try {
			const response = await fetch(`/api/admin/errors/${errorId}/resolve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes })
			});

			if (response.ok) {
				await loadErrors();
				selectedError = null;
			}
		} catch (error) {
			console.error('Failed to resolve error:', error);
			infoModal = {
				isOpen: true,
				title: 'Error',
				message: 'Failed to resolve error. Please try again.'
			};
		}
	}

	function openBulkResolveModal() {
		if (selectedErrorIds.size === 0) {
			infoModal = {
				isOpen: true,
				title: 'No Errors Selected',
				message: 'Please select errors to resolve.'
			};
			return;
		}
		resolutionNotes = '';
		bulkResolveModalOpen = true;
	}

	async function bulkResolveErrors() {
		bulkResolveModalOpen = false;
		const notes = resolutionNotes;
		bulkProcessing = true;
		try {
			const promises = Array.from(selectedErrorIds).map((errorId) =>
				fetch(`/api/admin/errors/${errorId}/resolve`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ notes })
				})
			);

			const results = await Promise.allSettled(promises);
			const successCount = results.filter((r) => r.status === 'fulfilled').length;
			const failCount = results.filter((r) => r.status === 'rejected').length;

			if (successCount > 0) {
				await loadErrors();
			}

			if (failCount > 0) {
				infoModal = {
					isOpen: true,
					title: 'Partial Success',
					message: `Resolved ${successCount} error(s). Failed to resolve ${failCount} error(s).`
				};
			} else {
				infoModal = {
					isOpen: true,
					title: 'Success',
					message: `Successfully resolved ${successCount} error(s).`
				};
			}
		} catch (error) {
			console.error('Failed to bulk resolve errors:', error);
			infoModal = {
				isOpen: true,
				title: 'Error',
				message: 'Failed to resolve errors. Please try again.'
			};
		} finally {
			bulkProcessing = false;
		}
	}

	function toggleSelectAll() {
		selectAll = !selectAll;
		if (selectAll) {
			// Select all visible errors
			errors.forEach((error) => {
				if (error.id) selectedErrorIds.add(error.id);
			});
		} else {
			// Deselect all
			selectedErrorIds.clear();
		}
		selectedErrorIds = selectedErrorIds; // Trigger reactivity
	}

	function toggleErrorSelection(errorId: string) {
		if (selectedErrorIds.has(errorId)) {
			selectedErrorIds.delete(errorId);
		} else {
			selectedErrorIds.add(errorId);
		}
		selectedErrorIds = selectedErrorIds; // Trigger reactivity

		// Update selectAll state
		const allSelected = errors.every((error) => error.id && selectedErrorIds.has(error.id));
		selectAll = allSelected;
	}

	function changePage(newPage: number) {
		currentPage = newPage;
		loadErrors();
	}

	function getSeverityColor(severity: ErrorSeverity) {
		switch (severity) {
			case 'critical':
				return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
			case 'error':
				return 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20';
			case 'warning':
				return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20';
			case 'info':
				return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20';
			default:
				return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20';
		}
	}

	function formatDate(date: string | undefined) {
		if (!date) return '-';

		const dateObj = new Date(date);

		// Format: "Jan 5, 2025 3:45:12 PM"
		const options: Intl.DateTimeFormatOptions = {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		};

		return dateObj.toLocaleString(undefined, options);
	}

	function truncate(str: string, length: number) {
		if (str && str?.length <= length) return str;
		return str ? str.substring(0, length) + '...' : '';
	}

	// Reset page when filters change
	$: if (
		filterSeverity ||
		filterType ||
		filterResolved !== null ||
		filterUserId ||
		filterProjectId
	) {
		currentPage = 1;
	}

	// Load initial data if empty
	onMount(() => {
		if (errors.length === 0 && !loading) {
			loadErrors();
		}
	});

	// Handle escape key for modal
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && selectedError) {
			selectedError = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Error Logs - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Header -->
		<AdminPageHeader
			title="Error Logs"
			description="Monitor and resolve system errors"
			icon={AlertTriangle}
			showBack={true}
		>
			<div slot="actions" class="flex items-center space-x-4">
				{#if selectedErrorIds.size > 0}
					<Button
						onclick={openBulkResolveModal}
						disabled={bulkProcessing}
						variant="primary"
						size="sm"
						icon={Check}
						loading={bulkProcessing}
					>
						Resolve {selectedErrorIds.size} Error{selectedErrorIds.size > 1 ? 's' : ''}
					</Button>
				{/if}
				<Button
					onclick={() => {
						filterResolved = filterResolved === false ? null : false;
						loadErrors();
					}}
					variant="secondary"
					size="sm"
				>
					{filterResolved === false ? 'Show All' : 'Show Unresolved'}
				</Button>
				<Button
					onclick={loadErrors}
					disabled={loading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					{loading}
				>
					Refresh
				</Button>
			</div>
		</AdminPageHeader>

		<!-- Summary Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-4 sm:mb-6">
			{#each summary as item}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
					<h3 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
						{item.error_type}
					</h3>
					<div class="flex items-baseline justify-between">
						<span
							class="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white"
							>{item.error_count}</span
						>
						<span class="{getSeverityColor(item.severity)} px-2 py-1 rounded text-xs">
							{item.severity}
						</span>
					</div>
					<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
						{item.resolved_count} resolved
					</div>
				</div>
			{/each}
		</div>

		<!-- Filters -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-6">
			<div class="flex items-center mb-4">
				<Filter class="h-5 w-5 text-gray-400 mr-2" />
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Filters</h2>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
				<div>
					<div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						Severity
					</div>
					<Select
						bind:value={filterSeverity}
						onchange={loadErrors}
						size="md"
						placeholder="All Severities"
					>
						<option value="">All</option>
						<option value="critical">Critical</option>
						<option value="error">Error</option>
						<option value="warning">Warning</option>
						<option value="info">Info</option>
					</Select>
				</div>

				<div>
					<div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						Type
					</div>
					<Select
						bind:value={filterType}
						onchange={loadErrors}
						size="md"
						placeholder="All Types"
					>
						<option value="">All</option>
						<option value="brain_dump_processing">Brain Dump</option>
						<option value="llm_error">LLM Error</option>
						<option value="database_error">Database</option>
						<option value="api_error">API</option>
						<option value="validation_error">Validation</option>
					</Select>
				</div>

				<div>
					<div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						Status
					</div>
					<Select
						bind:value={filterResolved}
						onchange={loadErrors}
						size="md"
						placeholder="Unresolved"
					>
						<option value={false}>Unresolved</option>
						<option value={true}>Resolved</option>
						<option value={null}>All</option>
					</Select>
				</div>

				<div>
					<div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						User
					</div>
					<TextInput
						type="text"
						bind:value={filterUserId}
						onblur={loadErrors}
						placeholder="Email or User ID..."
						size="md"
					/>
				</div>

				<div>
					<div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						Project ID
					</div>
					<TextInput
						type="text"
						bind:value={filterProjectId}
						onblur={loadErrors}
						placeholder="Filter by project..."
						size="md"
					/>
				</div>
			</div>
		</div>

		<!-- Error List -->
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead
						class="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600"
					>
						<tr>
							<th class="px-4 py-3 text-left">
								<input
									type="checkbox"
									checked={selectAll}
									onchange={toggleSelectAll}
									class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
									aria-label="Select all errors"
								/>
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Time</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Severity</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Type</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Message</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>User</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Status</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
						{#each errors as error}
							<tr
								class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors {error.id &&
								selectedErrorIds.has(error.id)
									? 'bg-blue-50 dark:bg-blue-900/20'
									: ''}"
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={error.id && selectedErrorIds.has(error.id)}
										onchange={() => error.id && toggleErrorSelection(error.id)}
										class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
										aria-label="Select error {error.id}"
									/>
								</td>
								<td
									class="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap"
									>{formatDate(error.created_at || error.createdAt)}</td
								>
								<td class="px-4 py-3">
									<span
										class="{getSeverityColor(
											error.severity
										)} px-2 py-1 rounded text-xs font-medium"
									>
										{error.severity}
									</span>
								</td>
								<td class="px-4 py-3 text-sm text-gray-900 dark:text-white"
									>{error.error_type || error.errorType}</td
								>
								<td
									class="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-md"
								>
									{truncate(error.error_message || error.errorMessage, 100)}
								</td>
								<td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
									{#if error.user}
										<div class="flex flex-col">
											<span class="text-gray-900 dark:text-white font-medium">
												{error.user.email}
											</span>
											{#if error.user.name}
												<span
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													{error.user.name}
												</span>
											{/if}
										</div>
									{:else if error.user_id || error.userId}
										<span class="font-mono text-xs">
											{truncate(error.user_id || error.userId, 8)}
										</span>
									{:else}
										-
									{/if}
								</td>
								<td class="px-4 py-3">
									{#if error.resolved}
										<span
											class="text-green-600 dark:text-green-400 text-sm font-medium"
											>Resolved</span
										>
									{:else}
										<span
											class="text-red-600 dark:text-red-400 text-sm font-medium"
											>Open</span
										>
									{/if}
								</td>
								<td class="px-4 py-3">
									<button
										onclick={() => (selectedError = error)}
										class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm mr-2 transition-colors"
									>
										View
									</button>
									{#if !error.resolved}
										<Button
											onclick={() => openResolveModal(error.id)}
											class="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm transition-colors"
										>
											Resolve
										</Button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if errors.length === 0}
				<div class="text-center py-8 text-gray-500 dark:text-gray-400">No errors found</div>
			{/if}
		</div>

		<!-- Pagination -->
		{#if errors.length > 0 || currentPage > 1}
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mt-6">
				<div
					class="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0"
				>
					<div class="flex items-center space-x-2">
						<Button
							onclick={() => changePage(1)}
							disabled={currentPage === 1 || loading}
							variant="secondary"
							size="sm"
							title="First page"
						>
							First
						</Button>
						<Button
							onclick={() => changePage(Math.max(1, currentPage - 1))}
							disabled={currentPage === 1 || loading}
							variant="secondary"
							size="sm"
							icon={ChevronLeft}
						>
							Previous
						</Button>
					</div>

					<div class="flex items-center space-x-4">
						<span class="text-sm text-gray-600 dark:text-gray-400">
							Page {currentPage}
						</span>
						{#if errors.length > 0}
							<span class="text-sm text-gray-500 dark:text-gray-400">
								Showing {errors.length} error{errors.length === 1 ? '' : 's'}
							</span>
						{/if}
					</div>

					<div class="flex items-center space-x-2">
						<Button
							onclick={() => changePage(currentPage + 1)}
							disabled={!hasMore || loading}
							variant="secondary"
							size="sm"
							icon={ChevronRight}
							iconPosition="right"
						>
							Next
						</Button>
						<Select
							bind:value={itemsPerPage}
							onchange={() => {
								currentPage = 1;
								loadErrors();
							}}
							size="sm"
							class="w-20"
						>
							<option value={25}>25</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</Select>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Error Detail Modal -->
{#if selectedError}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50"
		onclick={() => (selectedError = null)}
		onkeydown={(e) => e.key === 'Escape' && (selectedError = null)}
	>
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Modal Header -->
			<div
				class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
			>
				<h2 class="text-xl font-bold text-gray-900 dark:text-white">Error Details</h2>
				<button
					onclick={() => (selectedError = null)}
					class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
					aria-label="Close modal"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Modal Content -->
			<div class="flex-1 overflow-y-auto px-6 py-4">
				<div class="space-y-4">
					<!-- Basic Info -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
							>
								Error ID:
							</div>
							<p class="text-gray-900 dark:text-white font-mono text-sm">
								{selectedError.id}
							</p>
						</div>
						<div>
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
							>
								Occurred At:
							</div>
							<p class="text-gray-900 dark:text-white text-sm">
								{formatDate(selectedError.created_at || selectedError.createdAt)}
							</p>
						</div>
					</div>

					<!-- Severity, Type, and Error Code -->
					<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
						<div>
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
							>
								Severity:
							</div>
							<span
								class="{getSeverityColor(
									selectedError.severity
								)} px-2 py-1 rounded text-xs font-medium inline-block"
							>
								{selectedError.severity}
							</span>
						</div>
						<div>
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
							>
								Type:
							</div>
							<span
								class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs font-medium inline-block"
							>
								{selectedError.error_type || selectedError.errorType}
							</span>
						</div>
						{#if selectedError.error_code || selectedError.errorCode}
							<div>
								<div
									class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
								>
									Error Code:
								</div>
								<span
									class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded text-xs font-mono inline-block"
								>
									{selectedError.error_code || selectedError.errorCode}
								</span>
							</div>
						{/if}
					</div>

					<!-- User Information Section -->
					{#if selectedError.user || selectedError.user_id || selectedError.userId}
						<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
							>
								User Information:
							</div>
							{#if selectedError.user}
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Email:</span
										>
										<p
											class="text-sm text-gray-900 dark:text-white font-medium"
										>
											{selectedError.user.email}
										</p>
									</div>
									{#if selectedError.user.name}
										<div>
											<span class="text-xs text-gray-600 dark:text-gray-400"
												>Name:</span
											>
											<p class="text-sm text-gray-900 dark:text-white">
												{selectedError.user.name}
											</p>
										</div>
									{/if}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>User ID:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.user.id ||
												selectedError.user_id ||
												selectedError.userId}
										</p>
									</div>
								</div>
							{:else}
								<p class="text-sm text-gray-900 dark:text-white font-mono">
									User ID: {selectedError.user_id || selectedError.userId}
								</p>
							{/if}
						</div>
					{/if}

					<!-- Request Context Section -->
					{#if selectedError.endpoint || selectedError.http_method || selectedError.httpMethod || selectedError.request_id || selectedError.requestId || selectedError.ip_address || selectedError.ipAddress}
						<div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
							>
								Request Context:
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{#if selectedError.endpoint}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Endpoint:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.endpoint}
										</p>
									</div>
								{/if}
								{#if selectedError.http_method || selectedError.httpMethod}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Method:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedError.http_method || selectedError.httpMethod}
										</p>
									</div>
								{/if}
								{#if selectedError.request_id || selectedError.requestId}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Request ID:</span
										>
										<p
											class="text-sm text-gray-900 dark:text-white font-mono text-xs"
										>
											{selectedError.request_id || selectedError.requestId}
										</p>
									</div>
								{/if}
								{#if selectedError.ip_address || selectedError.ipAddress}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>IP Address:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.ip_address || selectedError.ipAddress}
										</p>
									</div>
								{/if}
							</div>
							{#if selectedError.user_agent || selectedError.userAgent}
								<div class="mt-3">
									<span class="text-xs text-gray-600 dark:text-gray-400"
										>User Agent:</span
									>
									<p
										class="text-sm text-gray-900 dark:text-white text-xs font-mono break-all"
									>
										{selectedError.user_agent || selectedError.userAgent}
									</p>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Project and Brain Dump Context -->
					{#if selectedError.project_id || selectedError.projectId || selectedError.brain_dump_id || selectedError.brainDumpId}
						<div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
							<div
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
							>
								Related Resources:
							</div>
							<div class="space-y-2">
								{#if selectedError.project_id || selectedError.projectId}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Project ID:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.project_id || selectedError.projectId}
										</p>
									</div>
								{/if}
								{#if selectedError.brain_dump_id || selectedError.brainDumpId}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Brain Dump ID:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.brain_dump_id ||
												selectedError.brainDumpId}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Error Message -->
					<div>
						<div
							class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
						>
							Error Message:
						</div>
						<p
							class="text-gray-900 dark:text-white whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-900 p-3 rounded font-mono"
						>
							{selectedError.error_message || selectedError.errorMessage}
						</p>
					</div>

					<!-- Stack Trace -->
					{#if selectedError.error_stack || selectedError.errorStack}
						<div>
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
								>Stack Trace:</label
							>
							<pre
								class="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64">{selectedError.error_stack ||
									selectedError.errorStack}</pre>
						</div>
					{/if}

					<!-- Database Operation Details -->
					{#if selectedError.operation_type || selectedError.operationType || selectedError.table_name || selectedError.tableName || selectedError.record_id || selectedError.recordId}
						<div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>Database Operation:</label
							>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{#if selectedError.operation_type || selectedError.operationType}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Operation:</span
										>
										<p
											class="text-sm text-gray-900 dark:text-white uppercase font-medium"
										>
											{selectedError.operation_type ||
												selectedError.operationType}
										</p>
									</div>
								{/if}
								{#if selectedError.table_name || selectedError.tableName}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Table:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.table_name || selectedError.tableName}
										</p>
									</div>
								{/if}
								{#if selectedError.record_id || selectedError.recordId}
									<div class="sm:col-span-2">
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Record ID:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.record_id || selectedError.recordId}
										</p>
									</div>
								{/if}
							</div>
							{#if selectedError.operation_payload || selectedError.operationPayload}
								<div class="mt-3">
									<span class="text-xs text-gray-600 dark:text-gray-400"
										>Payload:</span
									>
									<pre
										class="bg-white dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 mt-1 max-h-32">{JSON.stringify(
											selectedError.operation_payload ||
												selectedError.operationPayload,
											null,
											2
										)}</pre>
								</div>
							{/if}
						</div>
					{/if}

					<!-- LLM Details -->
					{#if selectedError.llm_provider || selectedError.llmProvider}
						<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>LLM Details:</label
							>
							<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
								<div>
									<span class="text-xs text-gray-600 dark:text-gray-400"
										>Provider:</span
									>
									<p class="text-sm text-gray-900 dark:text-white font-medium">
										{selectedError.llm_provider || selectedError.llmProvider}
									</p>
								</div>
								<div>
									<span class="text-xs text-gray-600 dark:text-gray-400"
										>Model:</span
									>
									<p class="text-sm text-gray-900 dark:text-white font-medium">
										{selectedError.llm_model || selectedError.llmModel}
									</p>
								</div>
								{#if selectedError.response_time_ms || selectedError.responseTimeMs}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Response Time:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedError.response_time_ms ||
												selectedError.responseTimeMs}ms
										</p>
									</div>
								{/if}
								{#if selectedError.prompt_tokens || selectedError.promptTokens}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Prompt Tokens:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{(
												(selectedError.prompt_tokens ||
													selectedError.promptTokens) ??
												0
											).toLocaleString()}
										</p>
									</div>
								{/if}
								{#if selectedError.completion_tokens || selectedError.completionTokens}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Completion Tokens:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{(
												(selectedError.completion_tokens ||
													selectedError.completionTokens) ??
												0
											).toLocaleString()}
										</p>
									</div>
								{/if}
								{#if selectedError.total_tokens || selectedError.totalTokens}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Total Tokens:</span
										>
										<p
											class="text-sm text-gray-900 dark:text-white font-medium"
										>
											{(
												(selectedError.total_tokens ||
													selectedError.totalTokens) ??
												0
											).toLocaleString()}
										</p>
									</div>
								{/if}
								{#if selectedError.llm_temperature || selectedError.llmTemperature}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Temperature:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{selectedError.llm_temperature ||
												selectedError.llmTemperature}
										</p>
									</div>
								{/if}
								{#if selectedError.llm_max_tokens || selectedError.llmMaxTokens}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Max Tokens:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											{(
												(selectedError.llm_max_tokens ||
													selectedError.llmMaxTokens) ??
												0
											).toLocaleString()}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Environment and App Info -->
					{#if selectedError.environment || selectedError.app_version || selectedError.appVersion}
						<div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>Environment Info:</label
							>
							<div class="grid grid-cols-2 gap-3">
								{#if selectedError.environment}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Environment:</span
										>
										<p class="text-sm text-gray-900 dark:text-white">
											<span class="capitalize"
												>{selectedError.environment}</span
											>
										</p>
									</div>
								{/if}
								{#if selectedError.app_version || selectedError.appVersion}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>App Version:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.app_version || selectedError.appVersion}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Browser Info -->
					{#if selectedError.browser_info || selectedError.browserInfo}
						<div class="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4">
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>Browser Info:</label
							>
							<pre
								class="bg-white dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200">{JSON.stringify(
									selectedError.browser_info || selectedError.browserInfo,
									null,
									2
								)}</pre>
						</div>
					{/if}

					<!-- Additional Metadata -->
					{#if selectedError.metadata && Object.keys(selectedError.metadata).length > 0}
						<div>
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
								>Additional Metadata:</label
							>
							<pre
								class="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 max-h-64">{JSON.stringify(
									selectedError.metadata,
									null,
									2
								)}</pre>
						</div>
					{/if}

					<!-- Resolution Status -->
					{#if selectedError.resolved}
						<div
							class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800"
						>
							<label
								class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
								>Resolution Details:</label
							>
							<div class="space-y-2">
								<div>
									<span class="text-xs text-gray-600 dark:text-gray-400"
										>Resolved At:</span
									>
									<p class="text-sm text-gray-900 dark:text-white">
										{formatDate(
											selectedError.resolved_at || selectedError.resolvedAt
										)}
									</p>
								</div>
								{#if selectedError.resolved_by || selectedError.resolvedBy}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Resolved By:</span
										>
										<p class="text-sm text-gray-900 dark:text-white font-mono">
											{selectedError.resolved_by || selectedError.resolvedBy}
										</p>
									</div>
								{/if}
								{#if selectedError.resolution_notes || selectedError.resolutionNotes}
									<div>
										<span class="text-xs text-gray-600 dark:text-gray-400"
											>Resolution Notes:</span
										>
										<p class="text-sm text-gray-700 dark:text-gray-300 mt-1">
											{selectedError.resolution_notes ||
												selectedError.resolutionNotes}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Timestamps -->
					<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
						<div
							class="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400"
						>
							<div>
								Created: {formatDate(
									selectedError.created_at || selectedError.createdAt
								)}
							</div>
							{#if selectedError.updated_at || selectedError.updatedAt}
								<div>
									Updated: {formatDate(
										selectedError.updated_at || selectedError.updatedAt
									)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Modal Footer -->
			<div
				class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
			>
				<div class="flex justify-end space-x-3">
					{#if selectedError && !selectedError.resolved && selectedError.id}
						<Button
							onclick={() => {
								if (selectedError?.id) {
									openResolveModal(selectedError.id);
								}
							}}
							variant="primary"
							size="sm"
							icon={Check}
							class="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
						>
							Mark as Resolved
						</Button>
					{/if}
					<Button onclick={() => (selectedError = null)} variant="secondary" size="sm">
						Close
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Info Modal -->
<InfoModal
	isOpen={infoModal.isOpen}
	title={infoModal.title}
	on:close={() => (infoModal.isOpen = false)}
>
	<p class="text-gray-600 dark:text-gray-400">{infoModal.message}</p>
</InfoModal>

<!-- Resolve Error Modal -->
<InfoModal
	isOpen={resolveModalOpen}
	title="Resolve Error"
	buttonText="Resolve"
	on:close={resolveError}
	size="md"
>
	<div class="space-y-4">
		<p class="text-gray-600 dark:text-gray-400">
			Add optional notes about how this error was resolved:
		</p>
		<TextInput
			type="text"
			bind:value={resolutionNotes}
			placeholder="Resolution notes (optional)..."
			size="md"
		/>
	</div>
</InfoModal>

<!-- Bulk Resolve Modal -->
<InfoModal
	isOpen={bulkResolveModalOpen}
	title="Bulk Resolve Errors"
	buttonText={bulkProcessing
		? 'Resolving...'
		: `Resolve ${selectedErrorIds.size} Error${selectedErrorIds.size > 1 ? 's' : ''}`}
	on:close={bulkResolveErrors}
	size="md"
>
	<div class="space-y-4">
		<p class="text-gray-600 dark:text-gray-400">
			You are about to resolve {selectedErrorIds.size} error{selectedErrorIds.size > 1
				? 's'
				: ''}. Add optional notes about how these errors were resolved:
		</p>
		<TextInput
			type="text"
			bind:value={resolutionNotes}
			placeholder="Resolution notes for all selected errors (optional)..."
			size="md"
		/>
	</div>
</InfoModal>
