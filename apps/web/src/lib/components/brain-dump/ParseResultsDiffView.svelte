<!-- apps/web/src/lib/components/brain-dump/ParseResultsDiffView.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		AlertTriangle,
		XCircle,
		Eye,
		Edit3,
		Trash2,
		X,
		Calendar,
		Clock,
		Tag,
		FileText,
		Folder,
		CheckSquare,
		ArrowRight,
		Plus,
		Sparkles,
		Loader2
	} from 'lucide-svelte';
	import type { ParsedOperation, BrainDumpParseResult } from '$lib/types/brain-dump';
	import type { FieldDiff } from '$lib/utils/diff';
	import { createFieldDiff } from '$lib/utils/diff';
	import Button from '$lib/components/ui/Button.svelte';
	import DiffView from '$lib/components/ui/DiffView.svelte';
	import { getSupabase } from '$lib/supabase-helpers';

	export let parseResults: BrainDumpParseResult;
	export let disabledOperations: Set<string>;
	export let enabledOperationsCount: number;
	export let isProcessing: boolean;
	export let projectId: string | null = null;
	export let isApplying: boolean = false; // Parent-controlled loading state

	// NEW: Auto-accept props
	export let showAutoAcceptToggle = false;
	export let autoAcceptEnabled = false;
	export let canAutoAcceptCurrent = false;

	const dispatch = createEventDispatcher();

	// State management
	let expandedOperations = new Set<string>();
	let applyingChanges = false;
	let loadingExistingData = false; // Start as false to avoid showing loading overlay immediately

	// Individual action loading states
	let actionLoadingStates = new Map<string, Set<string>>(); // operationId -> Set of action types

	// Use arrays instead of Maps for better reactivity
	interface LoadingItem {
		key: string;
		loading: boolean;
		data?: any;
		error?: string;
	}
	let itemStates: LoadingItem[] = [];

	// Group operations by type
	$: updateOperations = parseResults.operations.filter(
		(op) => op.operation === 'update' && !op.error && !disabledOperations.has(op.id)
	);
	$: createOperations = parseResults.operations.filter(
		(op) => op.operation === 'create' && !op.error && !disabledOperations.has(op.id)
	);
	$: errorOperations = parseResults.operations.filter((op) => op.error || !op.enabled);
	$: hasErrors = errorOperations.length > 0;
	$: criticalErrors = errorOperations.filter(
		(op) => op.table === 'projects' || (op.error && op.error.includes('Critical'))
	);
	$: enabledValidOperations = parseResults.operations.filter(
		(op) => op.enabled && !op.error && !disabledOperations.has(op.id)
	);

	let acceptLoading = false;

	// Fetch existing data for comparison
	onMount(async () => {
		await fetchExistingData();
	});

	async function fetchExistingData() {
		// Only show loading if we actually have update operations to fetch
		const hasUpdateOps = parseResults.operations.some(
			(op) => op.operation === 'update' && op.data.id
		);

		if (!hasUpdateOps) {
			// No update operations, nothing to fetch
			return;
		}

		loadingExistingData = true;
		try {
			const supabase = await getSupabase();

			// Initialize item states for all update operations
			const initialStates: LoadingItem[] = [];
			const projectIds = new Set<string>();
			const taskIds = new Set<string>();
			const noteIds = new Set<string>();

			parseResults.operations.forEach((op) => {
				if (op.operation === 'update' && op.data.id) {
					const key = `${op.table}-${op.data.id}`;
					initialStates.push({
						key,
						loading: true
					});

					switch (op.table) {
						case 'projects':
							projectIds.add(op.data.id);
							break;
						case 'tasks':
							taskIds.add(op.data.id);
							break;
						case 'notes':
							noteIds.add(op.data.id);
							break;
					}
				}
			});

			// Set initial loading states
			itemStates = initialStates;
			// Fetch projects
			if (projectIds.size > 0) {
				try {
					const { data: projects, error } = await supabase
						.from('projects')
						.select('*')
						.in('id', Array.from(projectIds));

					if (error) throw error;

					// Update item states with fetched data
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('projects-')) {
							const id = item.key.replace('projects-', '');
							const project = projects?.find((p) => p.id === id);

							if (project) {
								return { ...item, loading: false, data: project };
							} else {
								return { ...item, loading: false, error: 'Project not found' };
							}
						}
						return item;
					});
				} catch (error) {
					console.error('Failed to fetch projects:', error);
					// Mark all project loads as failed
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('projects-')) {
							return { ...item, loading: false, error: 'Failed to load project' };
						}
						return item;
					});
				}
			}

			// Fetch tasks
			if (taskIds.size > 0) {
				try {
					const { data: tasks, error } = await supabase
						.from('tasks')
						.select('*')
						.in('id', Array.from(taskIds));

					if (error) throw error;

					// Update item states with fetched data
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('tasks-')) {
							const id = item.key.replace('tasks-', '');
							const task = tasks?.find((t) => t.id === id);

							if (task) {
								return { ...item, loading: false, data: task };
							} else {
								return { ...item, loading: false, error: 'Task not found' };
							}
						}
						return item;
					});
				} catch (error) {
					console.error('Failed to fetch tasks:', error);
					// Mark all task loads as failed
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('tasks-')) {
							return { ...item, loading: false, error: 'Failed to load task' };
						}
						return item;
					});
				}
			}

			// Fetch notes
			if (noteIds.size > 0) {
				try {
					const { data: notes, error } = await supabase
						.from('notes')
						.select('*')
						.in('id', Array.from(noteIds));

					if (error) throw error;

					// Update item states with fetched data
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('notes-')) {
							const id = item.key.replace('notes-', '');
							const note = notes?.find((n) => n.id === id);

							if (note) {
								return { ...item, loading: false, data: note };
							} else {
								return { ...item, loading: false, error: 'Note not found' };
							}
						}
						return item;
					});
				} catch (error) {
					console.error('Failed to fetch notes:', error);
					// Mark all note loads as failed
					itemStates = itemStates.map((item) => {
						if (item.key.startsWith('notes-')) {
							return { ...item, loading: false, error: 'Failed to load note' };
						}
						return item;
					});
				}
			}
		} catch (error) {
			console.error('Failed to fetch existing data for comparison:', error);
		} finally {
			loadingExistingData = false;
		}
	}

	// Helper functions for action loading states
	function setActionLoading(operationId: string, action: string, loading: boolean) {
		if (!actionLoadingStates.has(operationId)) {
			actionLoadingStates.set(operationId, new Set());
		}
		const actionSet = actionLoadingStates.get(operationId)!;
		if (loading) {
			actionSet.add(action);
		} else {
			actionSet.delete(action);
		}
		actionLoadingStates = actionLoadingStates; // Trigger reactivity
	}

	function isActionLoading(operationId: string, action: string): boolean {
		return actionLoadingStates.get(operationId)?.has(action) || false;
	}

	function toggleOperationExpansion(operationId: string, event?: Event) {
		if (expandedOperations.has(operationId)) {
			expandedOperations.delete(operationId);
		} else {
			expandedOperations.add(operationId);
		}
		expandedOperations = expandedOperations;
	}

	function getOperationIcon(table: string) {
		switch (table) {
			case 'projects':
				return Folder;
			case 'tasks':
				return CheckSquare;
			case 'notes':
				return FileText;
			default:
				return FileText;
		}
	}

	function getOperationColor(table: string) {
		switch (table) {
			case 'projects':
				return 'primary';
			case 'tasks':
				return 'emerald';
			case 'notes':
				return 'violet';
			default:
				return 'gray';
		}
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		try {
			return new Date(dateStr).toLocaleDateString();
		} catch {
			return dateStr;
		}
	}

	function getItemState(operation: ParsedOperation): LoadingItem | null {
		if (operation.operation !== 'update' || !operation.data.id) return null;
		const key = `${operation.table}-${operation.data.id}`;
		return itemStates.find((item) => item.key === key) || null;
	}

	function getExistingItem(operation: ParsedOperation): any | null {
		const state = getItemState(operation);
		return state?.data || null;
	}

	function isLoadingItem(operation: ParsedOperation): boolean {
		const state = getItemState(operation);
		return state?.loading || false;
	}

	function getLoadError(operation: ParsedOperation): string | null {
		const state = getItemState(operation);
		return state?.error || null;
	}

	function createDiff(operation: ParsedOperation): FieldDiff[] {
		const existing = getExistingItem(operation);
		if (!existing) return [];

		const fields = getFieldsForTable(operation.table);
		const diffs = fields
			.map((field) => {
				// Only include fields that are present in the update operation
				// This avoids showing unchanged fields as being updated
				if (operation.data[field.key] !== undefined) {
					return createFieldDiff(
						field.key,
						field.label,
						existing[field.key],
						operation.data[field.key]
					);
				}
				return null;
			})
			.filter((diff): diff is FieldDiff => diff !== null && diff.hasChanges);

		// Sort diffs to show most important fields first
		return diffs.sort((a, b) => {
			const priorityFields = ['title', 'name', 'status', 'priority', 'description'];
			const aIndex = priorityFields.indexOf(a.field);
			const bIndex = priorityFields.indexOf(b.field);

			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;

			return a.label.localeCompare(b.label);
		});
	}

	function getFieldsForTable(table: string): Array<{ key: string; label: string }> {
		switch (table) {
			case 'projects':
				return [
					{ key: 'name', label: 'Project Name' },
					{ key: 'description', label: 'Description' },
					{ key: 'executive_summary', label: 'Executive Summary' },
					{ key: 'status', label: 'Status' },
					{ key: 'priority', label: 'Priority' },
					{ key: 'context', label: 'Project Context' },
					{ key: 'tags', label: 'Tags' },
					{ key: 'start_date', label: 'Start Date' },
					{ key: 'end_date', label: 'End Date' }
				];
			case 'tasks':
				return [
					{ key: 'title', label: 'Task Title' },
					{ key: 'description', label: 'Description' },
					{ key: 'details', label: 'Task Details' },
					{ key: 'status', label: 'Status' },
					{ key: 'priority', label: 'Priority' },
					{ key: 'task_type', label: 'Task Type' },
					{ key: 'duration_minutes', label: 'Duration (minutes)' },
					{ key: 'start_date', label: 'Start Date' },
					{ key: 'recurrence_pattern', label: 'Recurrence Pattern' },
					{ key: 'recurrence_ends', label: 'Recurrence Ends' }
				];
			case 'notes':
				return [
					{ key: 'title', label: 'Note Title' },
					{ key: 'content', label: 'Content' },
					{ key: 'tags', label: 'Tags' },
					{ key: 'category', label: 'Category' }
				];
			default:
				return [];
		}
	}

	// Event handlers
	function handleToggleOperation(operationId: string, event?: Event) {
		// Add brief loading state for visual feedback
		setActionLoading(operationId, 'toggle', true);
		dispatch('toggleOperation', operationId);

		// Reset loading state after brief delay
		setTimeout(() => {
			setActionLoading(operationId, 'toggle', false);
		}, 200);
	}

	function handleEditOperation(operation: ParsedOperation, event?: Event) {
		// Add loading state for visual feedback
		setActionLoading(operation.id, 'edit', true);
		dispatch('editOperation', operation);

		// Reset loading state after delay (edit modal will handle its own state)
		setTimeout(() => {
			setActionLoading(operation.id, 'edit', false);
		}, 500);
	}

	function handleRemoveOperation(operationId: string, event?: Event) {
		// Add loading state for visual feedback
		setActionLoading(operationId, 'remove', true);
		dispatch('removeOperation', operationId);

		// Reset loading state after delay
		setTimeout(() => {
			setActionLoading(operationId, 'remove', false);
		}, 300);
	}

	function handleApply(event?: Event) {
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}

		if (isProcessing || applyingChanges || isApplying) {
			return;
		}

		applyingChanges = true;
		dispatch('apply');

		// Add timeout to prevent infinite loading state
		setTimeout(() => {
			if (applyingChanges) {
				console.warn('Apply operation timed out, resetting state');
				applyingChanges = false;
			}
		}, 30000); // 30 second timeout
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// NEW: Auto-accept handlers
	function handleAutoAcceptToggle() {
		dispatch('toggleAutoAccept');
	}

	function handleApplyAutoAccept() {
		acceptLoading = true;
		dispatch('applyAutoAccept');
		// Reset loading after timeout to prevent stuck state
		setTimeout(() => {
			acceptLoading = false;
		}, 30000);
	}

	// Reset applyingChanges when isProcessing or isApplying changes to false
	$: if (!isProcessing && !isApplying && applyingChanges) {
		applyingChanges = false;
	}

	// Reset acceptLoading when processing completes or errors
	$: if (!isProcessing && !isApplying) {
		acceptLoading = false;
	}
</script>

<!-- Removed Modal wrapper since this component is always used inside another modal -->
<div class="h-full flex flex-col">
	<!-- Header -->
	<div
		class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50/50 to-pink-50/50 dark:from-purple-900/20 dark:to-pink-900/20 flex-shrink-0"
	>
		<div>
			<div class="flex items-center gap-2">
				<Sparkles class="w-5 h-5 text-purple-500" />
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
					Brain Dump Results
				</h3>
			</div>
			<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
				{parseResults.operations.length} operations extracted • Review changes before applying
			</p>
		</div>
		{#if !isProcessing}
			<Button
				on:click={handleCancel}
				variant="ghost"
				size="sm"
				icon={X}
				class="!p-2 flex-shrink-0"
				aria-label="Close modal"
			/>
		{/if}
	</div>

	<!-- Content -->
	<div class="overflow-y-auto px-4 sm:px-6 py-4 flex-1">
		<!-- Summary Section -->
		{#if parseResults.summary}
			<div
				class="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700"
			>
				<h3
					class="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2"
				>
					<FileText class="w-4 h-4" />
					Summary
				</h3>
				<p class="text-sm text-purple-700 dark:text-purple-300">{parseResults.summary}</p>
			</div>
		{/if}

		<!-- Error Alert -->
		{#if hasErrors}
			<div
				class="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4"
			>
				<div class="flex items-start gap-3">
					<AlertTriangle
						class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"
					/>
					<div class="flex-1">
						<h4 class="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
							{criticalErrors.length > 0
								? 'Critical Issues Detected'
								: 'Some Operations Have Issues'}
						</h4>
						<p class="text-sm text-amber-700 dark:text-amber-300">
							{errorOperations.length} of {parseResults.operations.length} operations have
							validation errors.
							{#if criticalErrors.length > 0}
								Critical issues may prevent proper saving.
							{:else}
								These items will be skipped during save.
							{/if}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Loading State -->
		{#if loadingExistingData}
			<div class="flex items-center justify-center py-8">
				<div class="text-center">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"
					></div>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Loading existing data for comparison...
					</p>
				</div>
			</div>
		{:else}
			<!-- Update Operations Section -->
			{#if updateOperations.length > 0}
				<div class="mb-4">
					<h3
						class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2 mb-3"
					>
						<Edit3 class="w-4 h-4 text-blue-500" />
						Updates ({updateOperations.length})
					</h3>

					<div class="space-y-3">
						{#each updateOperations as operation (operation.id || `fallback-update-${updateOperations.indexOf(operation)}`)}
							{@const isExpanded = expandedOperations.has(operation.id)}
							{@const isDisabled = disabledOperations.has(operation.id)}
							{@const isLoading = isLoadingItem(operation)}
							{@const loadError = getLoadError(operation)}
							{@const existing = getExistingItem(operation)}
							{@const diffs = isExpanded ? createDiff(operation) : []}
							{@const Icon = getOperationIcon(operation.table)}
							{@const color = getOperationColor(operation.table)}

							<div
								class="group relative bg-white dark:bg-gray-800 rounded-xl border transition-colors duration-200
									{isDisabled
									? 'border-gray-200 dark:border-gray-700 opacity-60'
									: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
							>
								<!-- Header -->
								<div
									class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10 rounded-t-xl"
								>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2 flex-1 min-w-0">
											<div
												class="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0"
											>
												<Icon
													class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
												/>
											</div>
											<span class="operation-badge operation-badge-{color}">
												{operation.table}
											</span>
											<h4
												class="text-sm font-medium text-gray-900 dark:text-white truncate"
											>
												Update: {operation.data.title ||
													operation.data.name ||
													existing?.title ||
													existing?.name ||
													(operation.table === 'projects'
														? 'Project'
														: operation.table === 'tasks'
															? 'Task'
															: 'Note')}
											</h4>
										</div>
										<div class="flex items-center gap-1 flex-shrink-0">
											<button
												on:click={(e) => {
													e.stopPropagation();
													toggleOperationExpansion(operation.id, e);
												}}
												class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200"
												title={isExpanded ? 'Collapse' : 'Expand'}
											>
												<Eye class="w-3.5 h-3.5" />
											</button>
											<button
												on:click={(e) => {
													e.stopPropagation();
													handleEditOperation(operation, e);
												}}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'edit')}
												class="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
												title="Edit operation"
											>
												{#if isActionLoading(operation.id, 'edit')}
													<Loader2 class="w-3.5 h-3.5 animate-spin" />
												{:else}
													<Edit3 class="w-3.5 h-3.5" />
												{/if}
											</button>
											<button
												on:click={(e) => {
													e.stopPropagation();
													handleRemoveOperation(operation.id, e);
												}}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'remove')}
												class="p-1.5 text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
												title="Remove operation"
											>
												{#if isActionLoading(operation.id, 'remove')}
													<Loader2 class="w-3.5 h-3.5 animate-spin" />
												{:else}
													<Trash2 class="w-3.5 h-3.5" />
												{/if}
											</button>
											<input
												type="checkbox"
												checked={!isDisabled}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'toggle')}
												on:change={(e) => {
													e.stopPropagation();
													handleToggleOperation(operation.id, e);
												}}
												class="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 ml-2"
											/>
										</div>
									</div>
								</div>

								<!-- Compact View -->
								{#if !isExpanded}
									<div class="p-4">
										{#if isLoading}
											<!-- Loading state -->
											<div class="flex items-center justify-center py-4">
												<div class="flex items-center gap-3">
													<div
														class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"
													></div>
													<span
														class="text-sm text-gray-600 dark:text-gray-400"
														>Loading original data...</span
													>
												</div>
											</div>
										{:else}
											<div
												class="flex flex-col sm:flex-row items-start sm:items-center gap-3"
											>
												<!-- Original -->
												<div class="flex-1 w-full">
													{#if existing}
														<div
															class="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
														>
															<p
																class="text-xs text-gray-500 dark:text-gray-400 mb-1"
															>
																Current
															</p>
															<h5
																class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
															>
																{existing.title ||
																	existing.name ||
																	'Untitled'}
															</h5>
															{#if existing.status}
																<div
																	class="mt-2 flex flex-wrap items-center gap-2"
																>
																	{#if existing.status}
																		<span
																			class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
																			{existing.status === 'done' || existing.status === 'completed'
																				? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
																				: existing.status ===
																							'in_progress' ||
																					  existing.status ===
																							'active'
																					? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
																					: existing.status ===
																								'blocked' ||
																						  existing.status ===
																								'paused'
																						? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
																						: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'}"
																		>
																			{existing.status}
																		</span>
																	{/if}
																	{#if existing.priority}
																		<span
																			class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
																			{existing.priority === 'high'
																				? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
																				: existing.priority ===
																					  'medium'
																					? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
																					: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}"
																		>
																			{existing.priority}
																		</span>
																	{/if}
																</div>
															{/if}
														</div>
													{:else if loadError}
														<div
															class="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700"
														>
															<p
																class="text-sm text-amber-600 dark:text-amber-400"
															>
																{loadError}
															</p>
														</div>
													{:else}
														<div
															class="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
														>
															<p
																class="text-sm text-gray-500 dark:text-gray-400 italic"
															>
																Original data not found
															</p>
														</div>
													{/if}
												</div>

												<!-- Arrow -->
												<div class="flex-shrink-0 self-center">
													<ArrowRight class="w-4 h-4 text-gray-400" />
												</div>

												<!-- Updated -->
												<div class="flex-1 w-full">
													<div
														class="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
													>
														<p
															class="text-xs text-blue-600 dark:text-blue-400 mb-1"
														>
															Updated
														</p>
														<h5
															class="text-sm font-medium text-gray-900 dark:text-white truncate"
														>
															{operation.data.title ||
																operation.data.name ||
																existing?.title ||
																existing?.name ||
																'Untitled'}
														</h5>
														{#if operation.data.status || operation.data.priority}
															<div
																class="mt-2 flex flex-wrap items-center gap-2"
															>
																{#if operation.data.status}
																	<span
																		class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
																		{operation.data.status === 'done' || operation.data.status === 'completed'
																			? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
																			: operation.data
																						.status ===
																						'in_progress' ||
																				  operation.data
																						.status ===
																						'active'
																				? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
																				: operation.data
																							.status ===
																							'blocked' ||
																					  operation.data
																							.status ===
																							'paused'
																					? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
																					: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'}"
																	>
																		{operation.data.status}
																	</span>
																{/if}
																{#if operation.data.priority}
																	<span
																		class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
																		{operation.data.priority === 'high'
																			? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
																			: operation.data
																						.priority ===
																				  'medium'
																				? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
																				: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}"
																	>
																		{operation.data.priority}
																	</span>
																{/if}
															</div>
														{/if}
													</div>
												</div>
											</div>

											{#if existing && !isExpanded}
												<p
													class="text-xs text-gray-500 dark:text-gray-400 mt-2"
												>
													Click to view changes
												</p>
											{/if}
										{/if}
									</div>
								{/if}

								<!-- Expanded Diff View -->
								{#if isExpanded}
									<div class="p-4">
										{#if isLoading}
											<div class="flex items-center justify-center py-8">
												<div class="flex items-center gap-3">
													<div
														class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"
													></div>
													<span
														class="text-sm text-gray-600 dark:text-gray-400"
														>Loading original data for comparison...</span
													>
												</div>
											</div>
										{:else if existing && diffs.length > 0}
											<DiffView
												{diffs}
												fromVersionLabel="Current Version"
												toVersionLabel="After Update"
												showFieldPriority={operation.table === 'projects'}
											/>
										{:else if existing}
											<div
												class="text-center py-8 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
											>
												<p class="text-sm text-gray-500 dark:text-gray-400">
													No changes detected for this item
												</p>
												<p
													class="text-xs text-gray-400 dark:text-gray-500 mt-2"
												>
													The update contains the same values as the
													current version
												</p>
											</div>
										{:else if loadError}
											<div
												class="text-center py-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700"
											>
												<AlertTriangle
													class="w-6 h-6 text-amber-500 mx-auto mb-2"
												/>
												<p
													class="text-sm text-amber-700 dark:text-amber-300 font-medium"
												>
													{loadError}
												</p>
												<p
													class="text-xs text-amber-600 dark:text-amber-400 mt-2"
												>
													Unable to show comparison view
												</p>
											</div>
										{:else}
											<div
												class="text-center py-8 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
											>
												<p class="text-sm text-gray-500 dark:text-gray-400">
													Original data not available
												</p>
												<p
													class="text-xs text-gray-400 dark:text-gray-500 mt-2"
												>
													The item may have been deleted or does not exist
													yet
												</p>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Create Operations Section -->
			{#if createOperations.length > 0}
				<div class="mb-4">
					<h3
						class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2 mb-3"
					>
						<Plus class="w-4 h-4 text-emerald-500" />
						New Items ({createOperations.length})
					</h3>

					<div class="space-y-3">
						{#each createOperations as operation (operation.id || `fallback-create-${createOperations.indexOf(operation)}`)}
							{@const isExpanded = expandedOperations.has(operation.id)}
							{@const isDisabled = disabledOperations.has(operation.id)}
							{@const Icon = getOperationIcon(operation.table)}
							{@const color = getOperationColor(operation.table)}

							<div
								class="group relative bg-white dark:bg-gray-800 rounded-xl border transition-colors duration-200
									{isDisabled
									? 'border-gray-200 dark:border-gray-700 opacity-60'
									: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
							>
								<!-- Header -->
								<div
									class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-t-xl"
								>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2 flex-1 min-w-0">
											<div
												class="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex-shrink-0"
											>
												<Icon
													class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
												/>
											</div>
											<span class="operation-badge operation-badge-{color}">
												{operation.table}
											</span>
											<h4
												class="text-sm font-medium text-gray-900 dark:text-white truncate"
											>
												Create New {operation.table === 'projects'
													? 'Project'
													: operation.table === 'tasks'
														? 'Task'
														: 'Note'}
											</h4>
										</div>
										<div class="flex items-center gap-1 flex-shrink-0">
											<button
												on:click={(e) => {
													e.stopPropagation();
													toggleOperationExpansion(operation.id, e);
												}}
												class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200"
												title={isExpanded ? 'Collapse' : 'Expand'}
											>
												<Eye class="w-3.5 h-3.5" />
											</button>
											<button
												on:click={(e) => {
													e.stopPropagation();
													handleEditOperation(operation, e);
												}}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'edit')}
												class="p-1.5 text-gray-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
												title="Edit operation"
											>
												{#if isActionLoading(operation.id, 'edit')}
													<Loader2 class="w-3.5 h-3.5 animate-spin" />
												{:else}
													<Edit3 class="w-3.5 h-3.5" />
												{/if}
											</button>
											<button
												on:click={(e) => {
													e.stopPropagation();
													handleRemoveOperation(operation.id, e);
												}}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'remove')}
												class="p-1.5 text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
												title="Remove operation"
											>
												{#if isActionLoading(operation.id, 'remove')}
													<Loader2 class="w-3.5 h-3.5 animate-spin" />
												{:else}
													<Trash2 class="w-3.5 h-3.5" />
												{/if}
											</button>
											<input
												type="checkbox"
												checked={!isDisabled}
												disabled={isProcessing ||
													isActionLoading(operation.id, 'toggle')}
												on:change={(e) => {
													e.stopPropagation();
													handleToggleOperation(operation.id, e);
												}}
												class="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 ml-2"
											/>
										</div>
									</div>
								</div>

								<!-- Content -->
								<div class="p-4">
									<div
										class="p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700"
									>
										<h5 class="font-medium text-gray-900 dark:text-white mb-2">
											{operation.data.title || operation.data.name}
										</h5>
										{#if operation.data.description}
											<p
												class="text-sm text-gray-600 dark:text-gray-400 mb-3"
											>
												{operation.data.description}
											</p>
										{/if}

										{#if isExpanded}
											<div
												class="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-700 space-y-2"
											>
												{#if operation.data.details || operation.data.content}
													<div>
														<label
															class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
														>
															{operation.table === 'notes'
																? 'Content'
																: 'Details'}
														</label>
														<div
															class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
														>
															{operation.data.details ||
																operation.data.content ||
																''}
														</div>
													</div>
												{/if}

												{#if operation.table === 'tasks'}
													<div
														class="grid grid-cols-1 sm:grid-cols-2 gap-3"
													>
														{#if operation.data.priority}
															<div>
																<label
																	class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
																>
																	Priority
																</label>
																<span
																	class="inline-flex px-2 py-1 text-xs font-medium rounded-full
																	{operation.data.priority === 'high'
																		? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
																		: operation.data
																					.priority ===
																			  'medium'
																			? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
																			: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}"
																>
																	{operation.data.priority}
																</span>
															</div>
														{/if}

														{#if operation.data.status}
															<div>
																<label
																	class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
																>
																	Status
																</label>
																<span
																	class="text-sm text-gray-700 dark:text-gray-300"
																>
																	{operation.data.status}
																</span>
															</div>
														{/if}

														{#if operation.data.duration_minutes}
															<div>
																<label
																	class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
																>
																	Duration
																</label>
																<div
																	class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
																>
																	<Clock class="w-3 h-3" />
																	<span
																		>{operation.data
																			.duration_minutes}min</span
																	>
																</div>
															</div>
														{/if}

														{#if operation.data.start_date}
															<div>
																<label
																	class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
																>
																	Start Date
																</label>
																<div
																	class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
																>
																	<Calendar class="w-3 h-3" />
																	<span
																		>{formatDate(
																			operation.data
																				.start_date
																		)}</span
																	>
																</div>
															</div>
														{/if}
													</div>
												{/if}

												{#if operation.table === 'projects' && operation.data.tags && operation.data.tags.length > 0}
													<div>
														<label
															class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
														>
															Tags
														</label>
														<div class="flex flex-wrap gap-2">
															{#each operation.data.tags as tag}
																<span
																	class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-full"
																>
																	<Tag class="w-3 h-3" />
																	{tag}
																</span>
															{/each}
														</div>
													</div>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Error Operations (if any are still displayed) -->
			{#if errorOperations.length > 0}
				<div class="mb-4">
					<h3
						class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2 mb-3"
					>
						<AlertTriangle class="w-4 h-4 text-amber-500" />
						Operations with Issues ({errorOperations.length})
					</h3>

					<div class="space-y-3">
						{#each errorOperations as operation (operation.id || `fallback-error-${errorOperations.indexOf(operation)}`)}
							<div
								class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-lg p-4"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-2 mb-2">
											<span
												class="operation-badge operation-badge-{getOperationColor(
													operation.table
												)}"
											>
												{operation.table}
											</span>
											<span
												class="text-sm font-medium text-gray-700 dark:text-gray-300"
											>
												{operation.operation}
											</span>
										</div>
										{#if operation.data?.title || operation.data?.name}
											<p
												class="text-sm font-medium text-gray-900 dark:text-white mb-1"
											>
												{operation.data.title || operation.data.name}
											</p>
										{/if}
										{#if operation.error}
											<p class="text-sm text-red-600 dark:text-red-400">
												{operation.error}
											</p>
										{:else if !operation.enabled}
											<p class="text-sm text-amber-600 dark:text-amber-400">
												Validation failed - will be skipped
											</p>
										{/if}
									</div>
									<XCircle class="w-5 h-5 text-amber-500 flex-shrink-0 ml-3" />
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Footer -->
	<div
		class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
	>
		<div class="flex flex-col gap-4">
			<!-- Operation Summary -->
			<div class="flex items-center gap-4">
				<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
					<span class="font-medium text-gray-900 dark:text-white">
						{enabledValidOperations.length}
					</span>
					of {parseResults.operations.length} selected
					{#if hasErrors}
						<span class="text-amber-600 dark:text-amber-400 block sm:inline sm:ml-2">
							({errorOperations.length} errors)
						</span>
					{/if}
				</div>
			</div>

			<!-- NEW: Auto-accept section -->
			{#if showAutoAcceptToggle}
				<div
					class="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700"
				>
					<div class="flex items-center gap-3 flex-1">
						<input
							type="checkbox"
							id="auto-accept-next-time"
							bind:checked={autoAcceptEnabled}
							on:change={handleAutoAcceptToggle}
							class="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500 focus:ring-2"
						/>
						<label
							for="auto-accept-next-time"
							class="text-sm text-gray-700 dark:text-gray-300 select-none"
						>
							Auto-accept similar changes next time
							{#if !canAutoAcceptCurrent && autoAcceptEnabled}
								<span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
									(Auto-accept disabled: too many operations or has errors)
								</span>
							{/if}
						</label>
					</div>
					{#if autoAcceptEnabled && canAutoAcceptCurrent}
						<Button
							size="sm"
							on:click={handleApplyAutoAccept}
							disabled={isProcessing || applyingChanges || isApplying}
							class="ml-auto px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white"
							loading={acceptLoading}
						>
							Apply Now
						</Button>
					{/if}
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
				<Button
					variant="secondary"
					size="sm"
					on:click={handleCancel}
					disabled={isProcessing}
					class="px-3 sm:px-4"
				>
					Cancel
				</Button>

				<Button
					variant="primary"
					size="sm"
					disabled={isProcessing || isApplying || enabledValidOperations.length === 0}
					on:click={handleApply}
					loading={isProcessing || applyingChanges || isApplying}
					icon={criticalErrors.length > 0 ? AlertTriangle : undefined}
					class="{criticalErrors.length > 0
						? '!bg-amber-600 hover:!bg-amber-700'
						: ''} px-3 sm:px-4 flex-1 sm:flex-initial"
				>
					{#if criticalErrors.length > 0}
						Save Anyway
					{:else if isProcessing || applyingChanges || isApplying}
						Saving...
					{:else}
						Apply Changes
					{/if}
					{#if enabledValidOperations.length > 0 && !isProcessing && !applyingChanges && !isApplying}
						({enabledValidOperations.length})
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>

<style>
	/* Operation badges */
	.operation-badge {
		@apply inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium;
	}

	.operation-badge-primary {
		@apply bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300;
	}

	.operation-badge-emerald {
		@apply bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300;
	}

	.operation-badge-violet {
		@apply bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300;
	}

	.operation-badge-gray {
		@apply bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300;
	}

	/* Line clamp utilities */
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
