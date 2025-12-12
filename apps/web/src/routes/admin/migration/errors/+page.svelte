<!-- apps/web/src/routes/admin/migration/errors/+page.svelte -->
<!-- Error browser page with filtering and retry actions -->
<script lang="ts">
	import { AlertTriangle, ArrowLeft, Download, RotateCcw, Trash2 } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ErrorBrowser from '$lib/components/admin/migration/ErrorBrowser.svelte';
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import type {
		ErrorCategory,
		EntityType,
		MigrationError
	} from '$lib/components/admin/migration/ErrorBrowser.svelte';

	let { data }: { data: PageData } = $props();

	// State
	let isLoading = $state(false);
	let retryLoading = $state(false);
	let deleteLoading = $state(false);
	let successMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let selectedError = $state<MigrationError | null>(null);
	let showDetailModal = $state(false);
	let showDeleteConfirmModal = $state(false);
	let pendingDeleteIds = $state<number[]>([]);

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

	async function apiDelete<T>(url: string, payload: unknown): Promise<T> {
		const response = await fetch(url, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok || !body?.success) {
			throw new Error(body?.error ?? body?.message ?? 'Request failed');
		}
		return body.data as T;
	}

	// URL helpers
	function updateUrl(params: Record<string, string | null>) {
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === '') {
				url.searchParams.delete(key);
			} else {
				url.searchParams.set(key, value);
			}
		}
		goto(url.toString(), { replaceState: true, invalidateAll: true });
	}

	// Handlers
	function handlePageChange(offset: number) {
		updateUrl({ offset: String(offset) });
	}

	function handleCategoryFilter(category: ErrorCategory | null) {
		updateUrl({ errorCategory: category, offset: '0' });
	}

	function handleEntityTypeFilter(entityType: EntityType | null) {
		updateUrl({ entityType: entityType, offset: '0' });
	}

	function handleSearch(query: string) {
		updateUrl({ search: query || null, offset: '0' });
	}

	async function handleRetry(errorIds: number[]) {
		if (errorIds.length === 0) return;
		retryLoading = true;
		try {
			const result = await apiPost<{
				retrying: number;
				successful?: number;
				failed?: number;
			}>('/api/admin/migration/retry', { errorIds });
			setSuccess(`Retry initiated for ${result.retrying} errors`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry');
		} finally {
			retryLoading = false;
		}
	}

	async function handleRetryAllRecoverable() {
		retryLoading = true;
		try {
			const result = await apiPost<{
				retrying: number;
				successful?: number;
				failed?: number;
			}>('/api/admin/migration/retry', { errorCategory: 'recoverable' });
			setSuccess(`Retry initiated for ${result.retrying} recoverable errors`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry recoverable errors');
		} finally {
			retryLoading = false;
		}
	}

	function handleViewDetails(error: MigrationError) {
		selectedError = error;
		showDetailModal = true;
	}

	function handleDelete(errorIds: number[]) {
		if (errorIds.length === 0) return;
		pendingDeleteIds = errorIds;
		showDeleteConfirmModal = true;
	}

	async function confirmDelete() {
		if (pendingDeleteIds.length === 0) return;
		deleteLoading = true;
		try {
			const result = await apiDelete<{ deleted: number }>('/api/admin/migration/errors', {
				errorIds: pendingDeleteIds
			});
			setSuccess(`Deleted ${result.deleted} error${result.deleted === 1 ? '' : 's'}`);
			showDeleteConfirmModal = false;
			pendingDeleteIds = [];
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete errors');
		} finally {
			deleteLoading = false;
		}
	}

	function cancelDelete() {
		showDeleteConfirmModal = false;
		pendingDeleteIds = [];
	}

	function handleExportCSV() {
		// Create CSV content
		const headers = [
			'Entity',
			'Type',
			'Category',
			'Error',
			'User',
			'Project',
			'Retries',
			'Created'
		];
		const rows = data.errors.map((e) => [
			e.entityName,
			e.entityType,
			e.errorCategory ?? 'unknown',
			e.errorMessage.replace(/"/g, '""'),
			e.userEmail,
			e.projectName,
			e.retryCount,
			e.createdAt
		]);

		const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join(
			'\n'
		);

		// Download
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `migration-errors-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<AdminPageHeader
		title="Migration Errors"
		description="View and manage migration errors with retry capabilities."
		icon={AlertTriangle}
		backHref="/admin/migration"
		backLabel="Migration Dashboard"
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={handleExportCSV}>
				<Download class="h-4 w-4" />
				<span class="hidden sm:inline">Export CSV</span>
			</Button>
			{#if data.categoryCounts.recoverable > 0}
				<Button
					variant="primary"
					size="sm"
					onclick={handleRetryAllRecoverable}
					loading={retryLoading}
				>
					<RotateCcw class="h-4 w-4" />
					<span class="hidden sm:inline"
						>Retry All Recoverable ({data.categoryCounts.recoverable})</span
					>
					<span class="sm:hidden">Retry ({data.categoryCounts.recoverable})</span>
				</Button>
			{/if}
		{/snippet}
	</AdminPageHeader>

	<!-- Messages -->
	{#if successMessage}
		<AdminCard tone="success" padding="sm">{successMessage}</AdminCard>
	{/if}
	{#if errorMessage}
		<AdminCard tone="danger" padding="sm">{errorMessage}</AdminCard>
	{/if}

	<!-- Summary Stats -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<AdminCard padding="md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Recoverable</p>
					<p class="text-2xl font-bold text-amber-600 dark:text-amber-400">
						{data.categoryCounts.recoverable}
					</p>
				</div>
				<div
					class="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center dark:bg-amber-900/30"
				>
					<RotateCcw class="h-5 w-5 text-amber-600 dark:text-amber-400" />
				</div>
			</div>
		</AdminCard>
		<AdminCard padding="md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Data Issues</p>
					<p class="text-2xl font-bold text-orange-600 dark:text-orange-400">
						{data.categoryCounts.data}
					</p>
				</div>
				<div
					class="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center dark:bg-orange-900/30"
				>
					<AlertTriangle class="h-5 w-5 text-orange-600 dark:text-orange-400" />
				</div>
			</div>
		</AdminCard>
		<AdminCard padding="md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-gray-500 dark:text-gray-400">Fatal</p>
					<p class="text-2xl font-bold text-rose-600 dark:text-rose-400">
						{data.categoryCounts.fatal}
					</p>
				</div>
				<div
					class="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center dark:bg-rose-900/30"
				>
					<AlertTriangle class="h-5 w-5 text-rose-600 dark:text-rose-400" />
				</div>
			</div>
		</AdminCard>
	</div>

	<!-- Error Browser -->
	<AdminCard padding="lg">
		<ErrorBrowser
			errors={data.errors as MigrationError[]}
			categoryCounts={data.categoryCounts}
			pagination={data.pagination}
			{isLoading}
			onPageChange={handlePageChange}
			onCategoryFilter={handleCategoryFilter}
			onEntityTypeFilter={handleEntityTypeFilter}
			onSearch={handleSearch}
			onRetry={handleRetry}
			onRetryWithFallback={handleRetryWithFallback}
			onViewDetails={handleViewDetails}
			onDelete={handleDelete}
		/>
	</AdminCard>
</div>

<!-- Error Detail Modal -->
<Modal
	bind:isOpen={showDetailModal}
	title="Error Details"
	size="lg"
	onClose={() => (showDetailModal = false)}
>
	{#if selectedError}
		<div class="space-y-4 p-4">
			<!-- Entity Info -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						Entity
					</p>
					<p class="font-medium text-gray-900 dark:text-gray-100">
						{selectedError.entityName}
					</p>
				</div>
				<div>
					<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						Type
					</p>
					<p class="font-medium capitalize text-gray-900 dark:text-gray-100">
						{selectedError.entityType}
					</p>
				</div>
				<div>
					<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						Project
					</p>
					<p class="font-medium text-gray-900 dark:text-gray-100">
						{selectedError.projectName}
					</p>
				</div>
				<div>
					<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						User
					</p>
					<p class="font-medium text-gray-900 dark:text-gray-100">
						{selectedError.userName ?? selectedError.userEmail}
					</p>
				</div>
			</div>

			<!-- IDs -->
			<div class="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800">
				<div>
					<p class="text-gray-500 dark:text-gray-400">Legacy ID</p>
					<p class="font-mono text-gray-900 dark:text-gray-100">
						{selectedError.legacyId}
					</p>
				</div>
				<div>
					<p class="text-gray-500 dark:text-gray-400">Run ID</p>
					<p class="font-mono text-gray-900 dark:text-gray-100">{selectedError.runId}</p>
				</div>
			</div>

			<!-- Error Details -->
			<div>
				<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
					Error Message
				</p>
				<div
					class="mt-1 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20"
				>
					<p class="text-sm text-rose-800 dark:text-rose-200">
						{selectedError.errorMessage}
					</p>
				</div>
			</div>

			<!-- Suggested Action -->
			<div>
				<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
					Suggested Action
				</p>
				<div
					class="mt-1 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<p class="text-sm font-medium capitalize text-blue-800 dark:text-blue-200">
						{selectedError.suggestedAction.replace(/_/g, ' ')}
					</p>
					<p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
						{selectedError.suggestedActionDescription}
					</p>
				</div>
			</div>

			<!-- Retry Info -->
			<div
				class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
			>
				<div class="text-sm">
					<span class="text-gray-500 dark:text-gray-400">Retry Count:</span>
					<span class="ml-2 font-medium text-gray-900 dark:text-gray-100"
						>{selectedError.retryCount} / 3</span
					>
				</div>
				{#if selectedError.lastRetryAt}
					<div class="text-sm">
						<span class="text-gray-500 dark:text-gray-400">Last Retry:</span>
						<span class="ml-2 font-medium text-gray-900 dark:text-gray-100">
							{new Date(selectedError.lastRetryAt).toLocaleString()}
						</span>
					</div>
				{/if}
			</div>

			<!-- Metadata -->
			{#if Object.keys(selectedError.metadata).length > 0}
				<div>
					<p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
						Metadata
					</p>
					<pre
						class="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100 dark:bg-gray-950">{JSON.stringify(
							selectedError.metadata,
							null,
							2
						)}</pre>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
				<Button
					variant="destructive"
					onclick={() => {
						handleDelete([selectedError!.id]);
						showDetailModal = false;
					}}
				>
					<Trash2 class="h-4 w-4" />
					Delete
				</Button>
				<div class="flex-1"></div>
				<Button variant="outline" onclick={() => (showDetailModal = false)}>Close</Button>
				{#if selectedError.canRetry}
					<Button
						variant="outline"
						onclick={() => {
							handleRetry([selectedError!.id]);
							showDetailModal = false;
						}}
					>
						<RotateCcw class="h-4 w-4" />
						Retry
					</Button>
					<Button
						variant="primary"
						onclick={() => {
							handleRetryWithFallback([selectedError!.id]);
							showDetailModal = false;
						}}
					>
						Retry with Fallback
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</Modal>

<!-- Delete Confirmation Modal -->
<Modal bind:isOpen={showDeleteConfirmModal} title="Delete Errors" size="sm" onClose={cancelDelete}>
	<div class="space-y-4 p-4">
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30"
			>
				<Trash2 class="h-5 w-5 text-rose-600 dark:text-rose-400" />
			</div>
			<div>
				<p class="font-medium text-gray-900 dark:text-gray-100">
					Delete {pendingDeleteIds.length} error{pendingDeleteIds.length === 1
						? ''
						: 's'}?
				</p>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					This action cannot be undone.
				</p>
			</div>
		</div>
		<div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
			<Button variant="outline" onclick={cancelDelete} disabled={deleteLoading}>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} loading={deleteLoading}>
				Delete
			</Button>
		</div>
	</div>
</Modal>
