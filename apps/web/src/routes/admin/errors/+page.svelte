<!-- apps/web/src/routes/admin/errors/+page.svelte -->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { PageData } from './$types';
	import type {
		ErrorLogEntry,
		ErrorSeverity,
		ErrorType,
		ErrorSummary
	} from '$lib/types/error-logging';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import TextInput from '$components/ui/TextInput.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import ErrorDetailsModal from '$lib/components/admin/ErrorDetailsModal.svelte';
	import InfoModal from '$components/ui/InfoModal.svelte';
	import ConfirmationModal from '$components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Check,
		TriangleAlert,
		RefreshCw,
		ListFilter,
		ChevronLeft,
		ChevronRight,
		Eye,
		X,
		Clock,
		CircleAlert,
		CircleCheck,
		Bug,
		Zap,
		Trash2
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
	const initialData = untrack(() => data);
	const EMPTY_SUMMARY: ErrorSummary = {
		total_errors: 0,
		unresolved_errors: 0,
		critical_errors: 0,
		errors_last_24h: 0,
		error_trend: 0
	};

	let errors = $state<ErrorLogEntry[]>(initialData.errors || []);
	let summary = $state<ErrorSummary>({
		...EMPTY_SUMMARY,
		...(initialData.summary || {})
	});
	let loading = $state(false);
	let selectedError = $state<ErrorLogEntry | null>(null);
	let selectedErrorIds = $state<string[]>([]);
	let bulkProcessing = $state(false);
	let purgeProcessing = $state(false);

	// Derived state for selection
	let selectAll = $derived(
		errors.length > 0 && errors.every((e) => e.id && selectedErrorIds.includes(e.id))
	);
	let selectSome = $derived(selectedErrorIds.length > 0 && !selectAll);
	let unresolvedErrors = $derived(errors.filter((e) => !e.resolved));
	let unresolvedCount = $derived(unresolvedErrors.length);

	// Modal state
	let infoModal = $state({
		isOpen: false,
		title: '',
		message: ''
	});
	let resolutionNotes = $state('');
	let resolveModalOpen = $state(false);
	let currentErrorToResolve = $state<string | null>(null);
	let bulkResolveModalOpen = $state(false);
	let purgeConfirmOpen = $state(false);

	// Filters - Default to showing only unresolved errors
	let filterSeverity = $state<ErrorSeverity | ''>('');
	let filterType = $state<ErrorType | ''>('');
	let filterResolvedRaw = $state<string>('false'); // String for select component
	let filterUserId = $state('');
	let filterProjectId = $state('');

	// Derived computed value for actual filter
	let filterResolved = $derived<boolean | null>(
		filterResolvedRaw === 'true' ? true : filterResolvedRaw === 'false' ? false : null
	);

	// Pagination
	let currentPage = $state(1);
	let itemsPerPage = $state(50);
	let hasMore = $state(Boolean(initialData.hasMore));

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
				summary = {
					...EMPTY_SUMMARY,
					...(result.data.summary || {})
				};
				hasMore = result.data.pagination?.hasMore || false;
				// Reset selection when loading new data
				selectedErrorIds = [];
			}
		} catch (error) {
			console.error('Failed to load errors:', error);
		} finally {
			loading = false;
		}
	}

	async function reloadFromFilterChange() {
		currentPage = 1;
		// Select invokes onchange immediately after updating its internal value.
		// Wait for the parent binding so loadErrors reads the newly selected filter.
		await tick();
		await loadErrors();
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

			if (!response.ok) {
				throw new Error('Failed to resolve error');
			}

			await loadErrors();
			selectedError = null;
			toastService.success('Error resolved');
		} catch (error) {
			console.error('Failed to resolve error:', error);
			toastService.error('Failed to resolve error. Please try again.');
		}
	}

	function openBulkResolveModal() {
		if (selectedErrorIds.length === 0) {
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
		const idsToResolve = [...selectedErrorIds];
		bulkProcessing = true;
		try {
			const promises = idsToResolve.map(async (errorId) => {
				const response = await fetch(`/api/admin/errors/${errorId}/resolve`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ notes })
				});

				if (!response.ok) {
					throw new Error(`Failed to resolve error ${errorId}`);
				}

				return response;
			});

			const results = await Promise.allSettled(promises);
			const successCount = results.filter((r) => r.status === 'fulfilled').length;
			const failCount = results.filter((r) => r.status === 'rejected').length;

			if (successCount > 0) {
				await loadErrors();
			}

			if (failCount > 0) {
				toastService.warning(
					`Resolved ${successCount} error(s). Failed to resolve ${failCount} error(s).`
				);
			} else {
				toastService.success(`Resolved ${successCount} error(s).`);
			}
		} catch (error) {
			console.error('Failed to bulk resolve errors:', error);
			toastService.error('Failed to resolve errors. Please try again.');
		} finally {
			bulkProcessing = false;
		}
	}

	async function purgeScannerNoise() {
		purgeConfirmOpen = true;
	}

	async function confirmPurgeScannerNoise() {
		purgeProcessing = true;
		try {
			const response = await fetch('/api/admin/errors/purge-noise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxRows: 50000 })
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to purge scanner noise');
			}

			await loadErrors();

			purgeConfirmOpen = false;
			const { deleted = 0, scanned = 0, stoppedAtLimit = false } = result.data || {};
			infoModal = {
				isOpen: true,
				title: 'Scanner Noise Purged',
				message: stoppedAtLimit
					? `Deleted ${deleted.toLocaleString()} scanner-noise row(s) after scanning ${scanned.toLocaleString()} row(s). Run it again to continue.`
					: `Deleted ${deleted.toLocaleString()} scanner-noise row(s) after scanning ${scanned.toLocaleString()} row(s).`
			};
		} catch (error) {
			console.error('Failed to purge scanner noise:', error);
			purgeConfirmOpen = false;
			infoModal = {
				isOpen: true,
				title: 'Error',
				message: 'Failed to purge scanner noise. Please try again.'
			};
		} finally {
			purgeProcessing = false;
		}
	}

	function toggleSelectAll() {
		if (selectAll) {
			// Deselect all
			selectedErrorIds = [];
		} else {
			// Select all visible errors
			selectedErrorIds = errors.filter((e) => e.id).map((e) => e.id!);
		}
	}

	function selectAllUnresolved() {
		selectedErrorIds = unresolvedErrors.filter((e) => e.id).map((e) => e.id!);
	}

	function toggleErrorSelection(errorId: string) {
		if (selectedErrorIds.includes(errorId)) {
			selectedErrorIds = selectedErrorIds.filter((id) => id !== errorId);
		} else {
			selectedErrorIds = [...selectedErrorIds, errorId];
		}
	}

	function clearSelection() {
		selectedErrorIds = [];
	}

	function changePage(newPage: number) {
		currentPage = newPage;
		loadErrors();
	}

	function getSeverityStyles(severity: ErrorSeverity | undefined) {
		switch (severity) {
			case 'critical':
				return {
					badge: 'bg-destructive/15 text-destructive border border-destructive/30',
					icon: CircleAlert,
					dot: 'bg-destructive'
				};
			case 'error':
				return {
					badge: 'bg-warning/15 text-warning border border-warning/30',
					icon: Bug,
					dot: 'bg-warning'
				};
			case 'warning':
				return {
					badge: 'bg-warning/15 text-warning border border-warning/30',
					icon: TriangleAlert,
					dot: 'bg-warning'
				};
			case 'info':
				return {
					badge: 'bg-info/15 text-info border border-info/30',
					icon: Zap,
					dot: 'bg-info'
				};
			default:
				return {
					badge: 'bg-muted text-muted-foreground border border-border',
					icon: CircleAlert,
					dot: 'bg-muted-foreground'
				};
		}
	}

	function formatDate(date: string | undefined) {
		if (!date) return '-';
		const dateObj = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - dateObj.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		// Relative time for recent errors
		if (diffMins < 60) {
			return `${diffMins}m ago`;
		} else if (diffHours < 24) {
			return `${diffHours}h ago`;
		} else if (diffDays < 7) {
			return `${diffDays}d ago`;
		}

		// Absolute date for older errors
		return dateObj.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function truncate(str: string | undefined, length: number) {
		if (!str) return '';
		if (str.length <= length) return str;
		return str.substring(0, length) + '...';
	}

	function getProjectLabel(error: ErrorLogEntry) {
		return error.project?.name || error.project_id || '';
	}

	// Load initial data if empty
	onMount(() => {
		if (errors.length === 0 && !loading) {
			loadErrors();
		}
	});

	// Handle keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Don't handle shortcuts when typing in inputs
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			return;
		}

		if (event.key === 'Escape') {
			if (selectedError) {
				selectedError = null;
			} else if (resolveModalOpen || bulkResolveModalOpen) {
				resolveModalOpen = false;
				bulkResolveModalOpen = false;
			} else if (selectedErrorIds.length > 0) {
				clearSelection();
			}
		}

		// Ctrl/Cmd + A to select all (when not in input)
		if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
			event.preventDefault();
			if (!selectAll) {
				toggleSelectAll();
			}
		}

		// 'r' key to refresh
		if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !loading) {
			loadErrors();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Error Logs - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	{#snippet headerActions()}
		<div class="flex items-center gap-2">
			<Button
				onclick={() => {
					filterResolvedRaw = filterResolved === false ? 'null' : 'false';
					reloadFromFilterChange();
				}}
				variant="outline"
				size="sm"
			>
				{filterResolved === false ? 'All' : 'Unresolved'}
			</Button>
			<Button
				onclick={purgeScannerNoise}
				disabled={purgeProcessing}
				variant="danger"
				size="sm"
				icon={Trash2}
				loading={purgeProcessing}
			>
				<span class="hidden sm:inline">Purge noise</span>
			</Button>
			<Button
				onclick={loadErrors}
				disabled={loading}
				variant="outline"
				size="sm"
				icon={RefreshCw}
				{loading}
			>
				<span class="hidden sm:inline">Refresh</span>
			</Button>
		</div>
	{/snippet}

	<AdminPageHeader
		title="Error Logs"
		description="Monitor and resolve actionable system errors"
		icon={TriangleAlert}
		showBack={true}
		actions={headerActions}
	/>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
		<div class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak">
			<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-0.5">
				Visible Errors
			</p>
			<p class="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
				{summary.total_errors}
			</p>
			<p class="mt-1.5 text-xs text-muted-foreground">Noise-filtered actionable logs</p>
		</div>

		<div class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak">
			<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-0.5">
				Open Errors
			</p>
			<p class="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
				{summary.unresolved_errors}
			</p>
			<div class="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
				<CircleAlert class="w-3 h-3 text-destructive" />
				<span>Currently unresolved</span>
			</div>
		</div>

		<div class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak">
			<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-0.5">
				Critical Open
			</p>
			<p class="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
				{summary.critical_errors}
			</p>
			<div class="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
				<Bug class="w-3 h-3 text-accent" />
				<span>Needs immediate attention</span>
			</div>
		</div>

		<div class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak">
			<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-0.5">
				Last 24 Hours
			</p>
			<p class="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
				{summary.errors_last_24h}
			</p>
			<p class="mt-1.5 text-xs text-muted-foreground">
				{summary.error_trend > 0 ? '+' : ''}{summary.error_trend}% vs previous week avg
			</p>
		</div>
	</div>

	<!-- Filters -->
	<div class="bg-card border border-border rounded-lg shadow-ink tx tx-grain tx-weak">
		<div class="px-3 py-2 border-b border-border flex items-center gap-2">
			<ListFilter class="w-4 h-4 text-muted-foreground" />
			<span class="text-sm font-medium text-foreground">Filters</span>
		</div>
		<div class="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
			<div class="space-y-1">
				<label
					class="text-xs font-medium text-muted-foreground"
					for="errors-filter-severity">Severity</label
				>
				<Select
					id="errors-filter-severity"
					bind:value={filterSeverity}
					onchange={reloadFromFilterChange}
					size="sm"
					placeholder="All"
				>
					<option value="">All</option>
					<option value="critical">Critical</option>
					<option value="error">Error</option>
					<option value="warning">Warning</option>
					<option value="info">Info</option>
				</Select>
			</div>

			<div class="space-y-1">
				<label class="text-xs font-medium text-muted-foreground" for="errors-filter-type"
					>Type</label
				>
				<Select
					id="errors-filter-type"
					bind:value={filterType}
					onchange={reloadFromFilterChange}
					size="sm"
					placeholder="All"
				>
					<option value="">All</option>
					<option value="llm_error">LLM Error</option>
					<option value="tool_execution">Tool Execution</option>
					<option value="database_error">Database</option>
					<option value="api_error">API</option>
					<option value="validation_error">Validation</option>
				</Select>
			</div>

			<div class="space-y-1">
				<label class="text-xs font-medium text-muted-foreground" for="errors-filter-status"
					>Status</label
				>
				<Select
					id="errors-filter-status"
					bind:value={filterResolvedRaw}
					onchange={reloadFromFilterChange}
					size="sm"
				>
					<option value="false">Unresolved</option>
					<option value="true">Resolved</option>
					<option value="null">All</option>
				</Select>
			</div>

			<div class="space-y-1">
				<label class="text-xs font-medium text-muted-foreground" for="errors-filter-user"
					>User</label
				>
				<TextInput
					id="errors-filter-user"
					type="text"
					bind:value={filterUserId}
					onblur={reloadFromFilterChange}
					placeholder="Email or ID..."
					size="sm"
				/>
			</div>

			<div class="space-y-1">
				<label class="text-xs font-medium text-muted-foreground" for="errors-filter-project"
					>Project</label
				>
				<TextInput
					id="errors-filter-project"
					type="text"
					bind:value={filterProjectId}
					onblur={reloadFromFilterChange}
					placeholder="Project ID..."
					size="sm"
				/>
			</div>
		</div>
	</div>

	<!-- Selection Action Bar -->
	{#if selectedErrorIds.length > 0}
		<div
			class="bg-accent/10 border border-accent/30 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
		>
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2">
					<div class="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
						<Check class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm font-semibold text-foreground">
							{selectedErrorIds.length} error{selectedErrorIds.length === 1
								? ''
								: 's'} selected
						</p>
						<p class="text-xs text-muted-foreground">
							{#if selectAll}
								All on this page
							{:else}
								of {errors.length} visible
							{/if}
						</p>
					</div>
				</div>
			</div>

			<div class="flex items-center gap-2 w-full sm:w-auto">
				{#if unresolvedCount > 0 && selectedErrorIds.length !== unresolvedCount}
					<Button
						onclick={selectAllUnresolved}
						variant="outline"
						size="sm"
						class="flex-1 sm:flex-none"
					>
						Select all unresolved ({unresolvedCount})
					</Button>
				{/if}
				<Button
					onclick={clearSelection}
					variant="ghost"
					size="sm"
					icon={X}
					class="flex-1 sm:flex-none"
				>
					Clear
				</Button>
				<Button
					onclick={openBulkResolveModal}
					disabled={bulkProcessing}
					variant="primary"
					size="sm"
					icon={Check}
					loading={bulkProcessing}
					class="flex-1 sm:flex-none"
				>
					Resolve {selectedErrorIds.length}
				</Button>
			</div>
		</div>
	{/if}

	<!-- Error Table -->
	<div
		class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-frame tx-weak"
	>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-muted/50">
						<th class="px-3 py-2 text-left w-10">
							<div class="relative">
								<input
									type="checkbox"
									checked={selectAll}
									indeterminate={selectSome}
									onchange={toggleSelectAll}
									class="h-4 w-4 rounded-md border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 bg-background cursor-pointer"
									aria-label="Select all errors"
								/>
							</div>
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider"
						>
							Time
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider"
						>
							Severity
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell"
						>
							Type
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider"
						>
							Message
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell"
						>
							User
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell"
						>
							Project
						</th>
						<th
							class="px-3 py-2 text-left text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider w-16"
						>
							Status
						</th>
						<th
							class="px-3 py-2 text-right text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider w-20"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each errors as error}
						{@const styles = getSeverityStyles(error.severity)}
						{@const isSelected = error.id && selectedErrorIds.includes(error.id)}
						<tr
							class="transition-colors hover:bg-muted/30 {isSelected
								? 'bg-accent/10'
								: ''}"
						>
							<td class="px-3 py-2">
								<input
									type="checkbox"
									checked={!!isSelected}
									onchange={() => error.id && toggleErrorSelection(error.id)}
									class="h-4 w-4 rounded-md border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 bg-background cursor-pointer"
									aria-label="Select error {error.id}"
								/>
							</td>
							<td class="px-3 py-2 whitespace-nowrap">
								<div class="flex items-center gap-1.5 text-foreground">
									<Clock class="w-3 h-3 text-muted-foreground shrink-0" />
									<span class="text-xs tabular-nums">
										{formatDate(error.created_at)}
									</span>
								</div>
							</td>
							<td class="px-3 py-2">
								<span
									class="{styles.badge} inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium"
								>
									<span class="w-1.5 h-1.5 rounded-full {styles.dot}"></span>
									{error.severity}
								</span>
							</td>
							<td class="px-3 py-2 hidden sm:table-cell">
								<span class="text-xs text-muted-foreground">
									{error.error_type?.replace(/_/g, ' ')}
								</span>
							</td>
							<td class="px-3 py-2 max-w-[200px] sm:max-w-xs lg:max-w-md">
								<p
									class="text-xs text-foreground truncate"
									title={error.error_message}
								>
									{truncate(error.error_message, 80)}
								</p>
							</td>
							<td class="px-3 py-2 hidden md:table-cell">
								{#if error.user}
									<div class="text-xs">
										<p
											class="text-foreground font-medium truncate max-w-[120px]"
										>
											{error.user.email}
										</p>
									</div>
								{:else if error.user_id}
									<span class="font-mono text-[0.65rem] text-muted-foreground">
										{truncate(error.user_id, 8)}
									</span>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</td>
							<td class="px-3 py-2 hidden lg:table-cell">
								{#if error.project_id}
									<a
										href="/projects/{error.project_id}"
										class="text-xs text-foreground hover:text-accent transition-colors truncate max-w-[140px] inline-block"
										title={error.project?.name ?? error.project_id}
									>
										{truncate(getProjectLabel(error), 32)}
									</a>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</td>
							<td class="px-3 py-2">
								{#if error.resolved}
									<span
										class="inline-flex items-center gap-1 text-success text-xs font-medium"
									>
										<CircleCheck class="w-3 h-3" />
										<span class="hidden lg:inline">Done</span>
									</span>
								{:else}
									<span
										class="inline-flex items-center gap-1 text-destructive text-xs font-medium"
									>
										<CircleAlert class="w-3 h-3" />
										<span class="hidden lg:inline">Open</span>
									</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-right">
								<div class="flex items-center justify-end gap-1">
									<button
										onclick={() => (selectedError = error)}
										class="p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										title="View details"
									>
										<Eye class="w-3.5 h-3.5" />
									</button>
									{#if !error.resolved && error.id}
										<button
											onclick={() => openResolveModal(error.id!)}
											class="p-2.5 rounded-md text-success hover:bg-success/10 transition-colors pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											title="Resolve"
											aria-label="Resolve error"
										>
											<Check class="w-3.5 h-3.5" />
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if errors.length === 0}
			<div class="text-center py-8 px-4">
				<CircleCheck class="w-8 h-8 text-success mx-auto mb-2" />
				<p class="text-sm text-muted-foreground">No actionable errors found</p>
				<p class="text-xs text-muted-foreground mt-1">
					The visible error log is clear for this filter set.
				</p>
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if errors.length > 0 || currentPage > 1}
		<div class="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
			<div class="flex items-center gap-2">
				<Button
					onclick={() => changePage(1)}
					disabled={currentPage === 1 || loading}
					variant="outline"
					size="sm"
				>
					First
				</Button>
				<Button
					onclick={() => changePage(Math.max(1, currentPage - 1))}
					disabled={currentPage === 1 || loading}
					variant="outline"
					size="sm"
					icon={ChevronLeft}
				>
					<span class="hidden sm:inline">Prev</span>
				</Button>
			</div>

			<div class="flex items-center gap-3 text-xs text-muted-foreground">
				<span>Page <span class="font-semibold text-foreground">{currentPage}</span></span>
				{#if errors.length > 0}
					<span class="text-border">|</span>
					<span>{errors.length} error{errors.length === 1 ? '' : 's'}</span>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<Button
					onclick={() => changePage(currentPage + 1)}
					disabled={!hasMore || loading}
					variant="outline"
					size="sm"
					icon={ChevronRight}
					iconPosition="right"
				>
					<span class="hidden sm:inline">Next</span>
				</Button>
				<Select
					bind:value={itemsPerPage}
					onchange={reloadFromFilterChange}
					size="sm"
					class="w-16"
				>
					<option value={25}>25</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
				</Select>
			</div>
		</div>
	{/if}
</div>

<!-- Error Detail Modal -->
<!-- Error Detail Modal -->
<ErrorDetailsModal
	error={selectedError}
	isOpen={!!selectedError}
	onClose={() => (selectedError = null)}
	onResolve={openResolveModal}
/>

<!-- Info Modal -->
<InfoModal
	isOpen={infoModal.isOpen}
	title={infoModal.title}
	onclose={() => (infoModal.isOpen = false)}
>
	<p class="text-sm text-muted-foreground">{infoModal.message}</p>
</InfoModal>

<!-- Purge scanner-noise confirmation -->
<ConfirmationModal
	bind:isOpen={purgeConfirmOpen}
	title="Purge scanner noise?"
	confirmText="Delete noise"
	confirmVariant="danger"
	icon="danger"
	loading={purgeProcessing}
	loadingText="Purging…"
	onconfirm={confirmPurgeScannerNoise}
	oncancel={() => (purgeConfirmOpen = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This deletes stored scanner/probe noise from <code class="text-foreground"
				>error_logs</code
			> — known credential/config 404 probes — and keeps actionable errors. This can't be undone.
		</p>
	{/snippet}
</ConfirmationModal>

<!-- Resolve Error Modal -->
<InfoModal
	isOpen={resolveModalOpen}
	title="Resolve Error"
	buttonText="Resolve"
	onclose={resolveError}
	size="md"
>
	<div class="space-y-3">
		<p class="text-sm text-muted-foreground">
			Add optional notes about how this error was resolved:
		</p>
		<TextInput
			type="text"
			bind:value={resolutionNotes}
			placeholder="Resolution notes (optional)..."
			size="sm"
		/>
	</div>
</InfoModal>

<!-- Bulk Resolve Modal -->
<InfoModal
	isOpen={bulkResolveModalOpen}
	title="Bulk Resolve"
	buttonText={bulkProcessing
		? 'Resolving...'
		: `Resolve ${selectedErrorIds.length} Error${selectedErrorIds.length > 1 ? 's' : ''}`}
	onclose={bulkResolveErrors}
	size="md"
>
	<div class="space-y-3">
		<p class="text-sm text-muted-foreground">
			Resolving <span class="font-semibold text-foreground">{selectedErrorIds.length}</span>
			error{selectedErrorIds.length > 1 ? 's' : ''}. Add optional notes:
		</p>
		<TextInput
			type="text"
			bind:value={resolutionNotes}
			placeholder="Resolution notes (optional)..."
			size="sm"
		/>
	</div>
</InfoModal>
