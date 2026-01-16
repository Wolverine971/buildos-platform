<!-- apps/web/src/routes/admin/errors/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { ErrorLogEntry, ErrorSeverity, ErrorType } from '$lib/types/error-logging';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import TextInput from '$components/ui/TextInput.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import InfoModal from '$components/ui/InfoModal.svelte';
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
		Zap
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let errors = $state<ErrorLogEntry[]>(data.errors || []);
	let summary = $state(data.summary || []);
	let loading = $state(false);
	let selectedError = $state<ErrorLogEntry | null>(null);
	let selectedErrorIds = $state<string[]>([]);
	let bulkProcessing = $state(false);

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
	let hasMore = $state(false);

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
				selectedErrorIds = [];
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
			const promises = idsToResolve.map((errorId) =>
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
					badge: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
					icon: CircleAlert,
					dot: 'bg-red-500'
				};
			case 'error':
				return {
					badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30',
					icon: Bug,
					dot: 'bg-orange-500'
				};
			case 'warning':
				return {
					badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
					icon: TriangleAlert,
					dot: 'bg-amber-500'
				};
			case 'info':
				return {
					badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
					icon: Zap,
					dot: 'bg-blue-500'
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

	function formatFullDate(date: string | undefined) {
		if (!date) return '-';
		const dateObj = new Date(date);
		return dateObj.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		});
	}

	function truncate(str: string | undefined, length: number) {
		if (!str) return '';
		if (str.length <= length) return str;
		return str.substring(0, length) + '...';
	}

	function getMetadataRecord(metadata: unknown): Record<string, any> | undefined {
		if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
			return undefined;
		}
		return metadata as Record<string, any>;
	}

	function hasMetadata(metadata: Record<string, any> | undefined): boolean {
		return Boolean(metadata && Object.keys(metadata).length > 0);
	}

	function getMetadataValue(
		metadata: Record<string, any> | undefined,
		...keys: string[]
	): unknown {
		if (!metadata) return undefined;
		for (const key of keys) {
			if (metadata[key] !== undefined && metadata[key] !== null) {
				return metadata[key];
			}
		}
		return undefined;
	}

	function formatMetadataValue(value: unknown): string {
		if (value === null || value === undefined) return '-';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return value.toLocaleString();
		return String(value);
	}

	function formatMs(value: unknown): string {
		const numeric = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(numeric)) {
			return `${numeric.toLocaleString()}ms`;
		}
		return value ? String(value) : '-';
	}

	function formatJson(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'string') return value;
		const seen = new WeakSet();
		try {
			return JSON.stringify(
				value,
				(_key, val) => {
					if (val && typeof val === 'object') {
						if (seen.has(val)) {
							return '[circular]';
						}
						seen.add(val);
					}
					return val;
				},
				2
			);
		} catch {
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		}
	}

	function isToolExecutionError(error: ErrorLogEntry): boolean {
		const operationType = error.operation_type || error.operationType;
		if (operationType === 'tool_execution') return true;
		const metadata = getMetadataRecord(error.metadata);
		return Boolean(metadata?.toolName || metadata?.tool_name);
	}

	// Reset page when filters change
	$effect(() => {
		if (
			filterSeverity ||
			filterType ||
			filterResolved !== null ||
			filterUserId ||
			filterProjectId
		) {
			currentPage = 1;
		}
	});

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

<div class="min-h-screen bg-background">
	<div class="max-w-[1600px] mx-auto px-3 py-3 sm:px-4 sm:py-4">
		<!-- Header -->
		{#snippet headerActions()}
			<div class="flex items-center gap-2">
				<Button
					onclick={() => {
						filterResolvedRaw = filterResolved === false ? 'null' : 'false';
						loadErrors();
					}}
					variant="outline"
					size="sm"
				>
					{filterResolved === false ? 'All' : 'Unresolved'}
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
			description="Monitor and resolve system errors"
			icon={TriangleAlert}
			showBack={true}
			actions={headerActions}
		/>

		<!-- Summary Cards -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
			{#each summary as item}
				{@const styles = getSeverityStyles(item.severity)}
				<div
					class="bg-card border border-border rounded-lg shadow-ink p-3 tx tx-frame tx-weak"
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-0.5 truncate"
							>
								{item.error_type?.replace(/_/g, ' ')}
							</p>
							<p class="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
								{item.error_count}
							</p>
						</div>
						<span
							class="{styles.badge} px-1.5 py-0.5 rounded text-[0.65rem] font-medium shrink-0"
						>
							{item.severity}
						</span>
					</div>
					<div class="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
						<CircleCheck class="w-3 h-3 text-emerald-500" />
						<span>{item.resolved_count} resolved</span>
					</div>
				</div>
			{/each}
		</div>

		<!-- Filters -->
		<div
			class="bg-card border border-border rounded-lg shadow-ink mb-3 sm:mb-4 tx tx-grain tx-weak"
		>
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
						onchange={loadErrors}
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
					<label
						class="text-xs font-medium text-muted-foreground"
						for="errors-filter-type">Type</label
					>
					<Select
						id="errors-filter-type"
						bind:value={filterType}
						onchange={loadErrors}
						size="sm"
						placeholder="All"
					>
						<option value="">All</option>
						<option value="brain_dump_processing">Brain Dump</option>
						<option value="llm_error">LLM Error</option>
						<option value="tool_execution">Tool Execution</option>
						<option value="database_error">Database</option>
						<option value="api_error">API</option>
						<option value="validation_error">Validation</option>
					</Select>
				</div>

				<div class="space-y-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="errors-filter-status">Status</label
					>
					<Select
						id="errors-filter-status"
						bind:value={filterResolvedRaw}
						onchange={loadErrors}
						size="sm"
					>
						<option value="false">Unresolved</option>
						<option value="true">Resolved</option>
						<option value="null">All</option>
					</Select>
				</div>

				<div class="space-y-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="errors-filter-user">User</label
					>
					<TextInput
						id="errors-filter-user"
						type="text"
						bind:value={filterUserId}
						onblur={loadErrors}
						placeholder="Email or ID..."
						size="sm"
					/>
				</div>

				<div class="space-y-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="errors-filter-project">Project</label
					>
					<TextInput
						id="errors-filter-project"
						type="text"
						bind:value={filterProjectId}
						onblur={loadErrors}
						placeholder="Project ID..."
						size="sm"
					/>
				</div>
			</div>
		</div>

		<!-- Selection Action Bar -->
		{#if selectedErrorIds.length > 0}
			<div
				class="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-3 sm:mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
			>
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2">
						<div
							class="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center"
						>
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
										class="h-4 w-4 rounded border-border text-accent focus:ring-ring focus:ring-offset-0 bg-background cursor-pointer"
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
										class="h-4 w-4 rounded border-border text-accent focus:ring-ring focus:ring-offset-0 bg-background cursor-pointer"
										aria-label="Select error {error.id}"
									/>
								</td>
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex items-center gap-1.5 text-foreground">
										<Clock class="w-3 h-3 text-muted-foreground shrink-0" />
										<span class="text-xs tabular-nums">
											{formatDate(error.created_at || error.createdAt)}
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
										{(error.error_type || error.errorType)?.replace(/_/g, ' ')}
									</span>
								</td>
								<td class="px-3 py-2 max-w-[200px] sm:max-w-xs lg:max-w-md">
									<p
										class="text-xs text-foreground truncate"
										title={error.error_message || error.errorMessage}
									>
										{truncate(error.error_message || error.errorMessage, 80)}
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
									{:else if error.user_id || error.userId}
										<span
											class="font-mono text-[0.65rem] text-muted-foreground"
										>
											{truncate(error.user_id || error.userId, 8)}
										</span>
									{:else}
										<span class="text-muted-foreground">-</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if error.resolved}
										<span
											class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
										>
											<CircleCheck class="w-3 h-3" />
											<span class="hidden lg:inline">Done</span>
										</span>
									{:else}
										<span
											class="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium"
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
											class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable"
											title="View details"
										>
											<Eye class="w-3.5 h-3.5" />
										</button>
										{#if !error.resolved && error.id}
											<button
												onclick={() => openResolveModal(error.id!)}
												class="p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors pressable"
												title="Resolve"
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
					<CircleCheck class="w-8 h-8 text-emerald-500 mx-auto mb-2" />
					<p class="text-sm text-muted-foreground">No errors found</p>
					<p class="text-xs text-muted-foreground mt-1">All clear!</p>
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
					<span
						>Page <span class="font-semibold text-foreground">{currentPage}</span></span
					>
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
						onchange={() => {
							currentPage = 1;
							loadErrors();
						}}
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
</div>

<!-- Error Detail Modal -->
{#if selectedError}
	{@const modalStyles = getSeverityStyles(selectedError.severity)}
	{@const metadata = getMetadataRecord(selectedError.metadata)}
	{@const isToolExecution = isToolExecutionError(selectedError)}
	{@const operationPayload = selectedError.operation_payload || selectedError.operationPayload}
	{@const toolName = getMetadataValue(metadata, 'toolName', 'tool_name')}
	{@const toolCategory = getMetadataValue(metadata, 'toolCategory', 'tool_category')}
	{@const toolCallId = getMetadataValue(metadata, 'toolCallId', 'tool_call_id')}
	{@const toolErrorType = getMetadataValue(metadata, 'errorType', 'error_type')}
	{@const toolSessionId = getMetadataValue(metadata, 'sessionId', 'session_id')}
	{@const toolContextType = getMetadataValue(metadata, 'contextType', 'context_type')}
	{@const toolEntityId = getMetadataValue(metadata, 'entityId', 'entity_id')}
	{@const toolVirtual = getMetadataValue(metadata, 'virtual')}
	{@const toolTimeoutMs = getMetadataValue(metadata, 'timeoutMs', 'timeout_ms')}
	{@const toolDurationMs = getMetadataValue(metadata, 'durationMs', 'duration_ms')}
	{@const toolArgs = getMetadataValue(metadata, 'args', 'arguments') ?? operationPayload}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 bg-black/60 flex items-center justify-center p-3 z-50"
		onclick={() => (selectedError = null)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="bg-card border border-border rounded-lg shadow-ink-strong max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col tx tx-frame tx-weak"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Modal Header -->
			<div
				class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30"
			>
				<div class="flex items-center gap-2">
					<TriangleAlert class="w-5 h-5 text-accent" />
					<h2 class="text-base font-semibold text-foreground">Error Details</h2>
				</div>
				<button
					onclick={() => (selectedError = null)}
					class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable"
					aria-label="Close modal"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Modal Content -->
			<div class="flex-1 overflow-y-auto px-4 py-3">
				<div class="space-y-3">
					<!-- Basic Info Row -->
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-0.5">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
								Error ID
							</p>
							<p class="text-xs text-foreground font-mono truncate">
								{selectedError.id}
							</p>
						</div>
						<div class="space-y-0.5">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
								Occurred
							</p>
							<p class="text-xs text-foreground">
								{formatFullDate(
									selectedError.created_at || selectedError.createdAt
								)}
							</p>
						</div>
					</div>

					<!-- Severity, Type, Code Row -->

					<div class="flex flex-wrap items-center gap-2">
						<span
							class="{modalStyles.badge} inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
						>
							<span class="w-1.5 h-1.5 rounded-full {modalStyles.dot}"></span>
							{selectedError.severity}
						</span>
						<span
							class="bg-muted text-muted-foreground px-2 py-1 rounded text-xs font-medium border border-border"
						>
							{(selectedError.error_type || selectedError.errorType)?.replace(
								/_/g,
								' '
							)}
						</span>
						{#if selectedError.error_code || selectedError.errorCode}
							<span
								class="bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded text-xs font-mono border border-red-500/20"
							>
								{selectedError.error_code || selectedError.errorCode}
							</span>
						{/if}
					</div>

					<!-- User Information -->
					{#if selectedError.user || selectedError.user_id || selectedError.userId}
						<div class="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2"
							>
								User Information
							</p>
							{#if selectedError.user}
								<div class="grid grid-cols-2 gap-2 text-xs">
									<div>
										<span class="text-muted-foreground">Email:</span>
										<p class="text-foreground font-medium">
											{selectedError.user.email}
										</p>
									</div>
									{#if selectedError.user.name}
										<div>
											<span class="text-muted-foreground">Name:</span>
											<p class="text-foreground">{selectedError.user.name}</p>
										</div>
									{/if}
								</div>
							{:else}
								<p class="text-xs text-foreground font-mono">
									{selectedError.user_id || selectedError.userId}
								</p>
							{/if}
						</div>
					{/if}

					<!-- Request Context -->
					{#if selectedError.endpoint || selectedError.http_method || selectedError.httpMethod}
						<div class="bg-muted/50 border border-border rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
							>
								Request Context
							</p>
							<div class="grid grid-cols-2 gap-2 text-xs">
								{#if selectedError.endpoint}
									<div class="col-span-2">
										<span class="text-muted-foreground">Endpoint:</span>
										<p class="text-foreground font-mono text-[0.65rem]">
											{selectedError.endpoint}
										</p>
									</div>
								{/if}
								{#if selectedError.http_method || selectedError.httpMethod}
									<div>
										<span class="text-muted-foreground">Method:</span>
										<p class="text-foreground font-medium">
											{selectedError.http_method || selectedError.httpMethod}
										</p>
									</div>
								{/if}
								{#if selectedError.ip_address || selectedError.ipAddress}
									<div>
										<span class="text-muted-foreground">IP:</span>
										<p class="text-foreground font-mono">
											{selectedError.ip_address || selectedError.ipAddress}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Error Message -->
					<div class="space-y-1">
						<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
							Error Message
						</p>
						<div
							class="bg-background border border-border rounded-lg p-3 shadow-ink-inner"
						>
							<p
								class="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed"
							>
								{selectedError.error_message || selectedError.errorMessage}
							</p>
						</div>
					</div>

					<!-- Tool Execution -->
					{#if isToolExecution}
						<div class="bg-sky-500/5 border border-sky-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2"
							>
								Tool Execution
							</p>
							<div class="grid grid-cols-2 gap-2 text-xs">
								{#if toolName}
									<div>
										<span class="text-muted-foreground">Tool:</span>
										<p class="text-foreground font-medium">{toolName}</p>
									</div>
								{/if}
								{#if toolCategory}
									<div>
										<span class="text-muted-foreground">Category:</span>
										<p class="text-foreground">
											{formatMetadataValue(toolCategory)}
										</p>
									</div>
								{/if}
								{#if toolErrorType}
									<div>
										<span class="text-muted-foreground">Failure Type:</span>
										<p class="text-foreground font-medium">
											{formatMetadataValue(toolErrorType)}
										</p>
									</div>
								{/if}
								{#if toolCallId}
									<div>
										<span class="text-muted-foreground">Tool Call ID:</span>
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(toolCallId)}
										</p>
									</div>
								{/if}
								{#if toolSessionId}
									<div>
										<span class="text-muted-foreground">Session ID:</span>
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(toolSessionId)}
										</p>
									</div>
								{/if}
								{#if toolContextType}
									<div>
										<span class="text-muted-foreground">Context Type:</span>
										<p class="text-foreground">
											{formatMetadataValue(toolContextType)}
										</p>
									</div>
								{/if}
								{#if toolEntityId}
									<div>
										<span class="text-muted-foreground">Entity ID:</span>
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(toolEntityId)}
										</p>
									</div>
								{/if}
								{#if toolVirtual !== undefined}
									<div>
										<span class="text-muted-foreground">Virtual:</span>
										<p class="text-foreground">
											{formatMetadataValue(toolVirtual)}
										</p>
									</div>
								{/if}
								{#if toolTimeoutMs !== undefined}
									<div>
										<span class="text-muted-foreground">Timeout:</span>
										<p class="text-foreground tabular-nums">
											{formatMs(toolTimeoutMs)}
										</p>
									</div>
								{/if}
								{#if toolDurationMs !== undefined}
									<div>
										<span class="text-muted-foreground">Duration:</span>
										<p class="text-foreground tabular-nums">
											{formatMs(toolDurationMs)}
										</p>
									</div>
								{/if}
							</div>
							{#if toolArgs !== undefined && toolArgs !== null}
								<div class="mt-2">
									<span class="text-muted-foreground text-xs">Arguments:</span>
									<pre
										class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{formatJson(
											toolArgs
										)}</pre>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Operation Payload -->
					{#if !isToolExecution && operationPayload}
						<div class="bg-muted/50 border border-border rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
							>
								Operation Payload
							</p>
							<pre
								class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{formatJson(
									operationPayload
								)}</pre>
						</div>
					{/if}

					<!-- Metadata -->
					{#if hasMetadata(metadata)}
						<div class="bg-muted/30 border border-border rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
							>
								Metadata
							</p>
							<pre
								class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-48 leading-relaxed">{formatJson(
									metadata
								)}</pre>
						</div>
					{/if}

					<!-- Stack Trace -->
					{#if selectedError.error_stack || selectedError.errorStack}
						<div class="space-y-1">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
								Stack Trace
							</p>
							<pre
								class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{selectedError.error_stack ||
									selectedError.errorStack}</pre>
						</div>
					{/if}

					<!-- Operation Context -->
					{#if !isToolExecution && (selectedError.operation_type || selectedError.operationType || selectedError.table_name || selectedError.tableName)}
						<div class="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2"
							>
								Operation Context
							</p>
							<div class="grid grid-cols-2 gap-2 text-xs">
								{#if selectedError.operation_type || selectedError.operationType}
									<div>
										<span class="text-muted-foreground">Operation:</span>
										<p class="text-foreground font-medium uppercase">
											{selectedError.operation_type ||
												selectedError.operationType}
										</p>
									</div>
								{/if}
								{#if selectedError.table_name || selectedError.tableName}
									<div>
										<span class="text-muted-foreground">Table:</span>
										<p class="text-foreground font-mono">
											{selectedError.table_name || selectedError.tableName}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- LLM Details -->
					{#if selectedError.llm_provider || selectedError.llmProvider}
						<div class="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2"
							>
								LLM Details
							</p>
							<div class="grid grid-cols-3 gap-2 text-xs">
								<div>
									<span class="text-muted-foreground">Provider:</span>
									<p class="text-foreground font-medium">
										{selectedError.llm_provider || selectedError.llmProvider}
									</p>
								</div>
								<div>
									<span class="text-muted-foreground">Model:</span>
									<p class="text-foreground">
										{selectedError.llm_model || selectedError.llmModel}
									</p>
								</div>
								{#if selectedError.total_tokens || selectedError.totalTokens}
									<div>
										<span class="text-muted-foreground">Tokens:</span>
										<p class="text-foreground tabular-nums">
											{(
												(selectedError.total_tokens ||
													selectedError.totalTokens) ??
												0
											).toLocaleString()}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Resolution Status -->
					{#if selectedError.resolved}
						<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
							<div class="flex items-center gap-2 mb-2">
								<CircleCheck class="w-4 h-4 text-emerald-500" />
								<p
									class="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
								>
									Resolved
								</p>
							</div>
							<div class="space-y-1 text-xs">
								<p class="text-muted-foreground">
									{formatFullDate(
										selectedError.resolved_at || selectedError.resolvedAt
									)}
								</p>
								{#if selectedError.resolution_notes || selectedError.resolutionNotes}
									<p class="text-foreground italic">
										"{selectedError.resolution_notes ||
											selectedError.resolutionNotes}"
									</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Modal Footer -->
			<div
				class="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2"
			>
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
					>
						Resolve
					</Button>
				{/if}
				<Button onclick={() => (selectedError = null)} variant="outline" size="sm">
					Close
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Info Modal -->
<InfoModal
	isOpen={infoModal.isOpen}
	title={infoModal.title}
	onclose={() => (infoModal.isOpen = false)}
>
	<p class="text-sm text-muted-foreground">{infoModal.message}</p>
</InfoModal>

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
