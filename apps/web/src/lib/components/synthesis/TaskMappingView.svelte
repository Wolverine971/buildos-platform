<!-- apps/web/src/lib/components/synthesis/TaskMappingView.svelte -->
<script lang="ts">
	import type { ParsedOperation } from '$lib/types/brain-dump';
	import type { FieldDiff } from '$lib/utils/diff';
	import type { ManyToOneComparison } from '$lib/utils/many-to-one-diff';
	import { createFieldDiff } from '$lib/utils/diff';
	import { createManyToOneComparison } from '$lib/utils/many-to-one-diff';
	import DiffView from '$lib/components/ui/DiffView.svelte';
	import ManyToOneDiffView from '$lib/components/ui/ManyToOneDiffView.svelte';
	import SynthesisOperationModal from '$lib/components/project/SynthesisOperationModal.svelte';
	import { onDestroy } from 'svelte';
	import {
		ArrowRight,
		Archive,
		Plus,
		GitMerge,
		AlertTriangle,
		CheckCircle,
		Clock,
		Flag,
		Edit3,
		Sparkles,
		ChevronRight,
		Eye,
		Layers
	} from 'lucide-svelte';
	import { fade, fly, scale, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Button from '$lib/components/ui/Button.svelte';

	export let operations: ParsedOperation[] = [];
	export let tasks: any[] = [];
	export let comparison: any[] = [];
	export let onOperationEdit: ((operation: ParsedOperation) => void) | undefined = undefined;

	let selectedOperation: ParsedOperation | null = null;
	let isEditModalOpen = false;
	let expandedOperations: Set<string> = new Set();

	// Memoization caches
	let taskByIdCache = new Map<string, any>();
	let consolidationsCache: { key: string; value: any[] } | null = null;
	let updatesCache: { key: string; value: any[] } | null = null;

	// Create cache keys for memoization
	$: operationsKey = JSON.stringify(operations.map((op) => op.id));
	$: comparisonKey = JSON.stringify(comparison.map((c) => c.type));
	$: tasksKey = tasks.length.toString();

	// Group operations by type with memoization
	$: consolidations = getMemoizedConsolidations(operationsKey, comparisonKey, tasksKey);
	$: updates = getMemoizedUpdates(operationsKey, consolidations);
	$: creations = operations.filter((op) => op.operation === 'create');
	$: deletedOps = operations.filter((op) => op.data.deleted_at);

	function getTaskById(taskId: string) {
		// Use cache for task lookups
		if (taskByIdCache.has(taskId)) {
			return taskByIdCache.get(taskId);
		}
		const task = tasks.find((t) => t.id === taskId);
		if (task) {
			taskByIdCache.set(taskId, task);
		}
		return task;
	}

	function getMemoizedConsolidations(opsKey: string, compKey: string, tasksKey: string) {
		const cacheKey = `${opsKey}-${compKey}-${tasksKey}`;

		// Return cached value if keys haven't changed
		if (consolidationsCache && consolidationsCache.key === cacheKey) {
			return consolidationsCache.value;
		}

		// Compute new value
		const value = getConsolidationOperations();
		consolidationsCache = { key: cacheKey, value };
		return value;
	}

	function getMemoizedUpdates(opsKey: string, consolidations: any[]) {
		const cacheKey = `${opsKey}-${consolidations.length}`;

		// Return cached value if keys haven't changed
		if (updatesCache && updatesCache.key === cacheKey) {
			return updatesCache.value;
		}

		// Compute new value
		const value = getUpdateOperations(consolidations);
		updatesCache = { key: cacheKey, value };
		return value;
	}

	function getConsolidationOperations() {
		const consolidationOps = [];

		// From comparison data
		comparison.forEach((comp) => {
			if (comp.type === 'consolidated' && comp.originalTasks && comp.newTask) {
				const targetOp = operations.find(
					(op) => comp.originalTasks.includes(op.data.id) && op.operation === 'update'
				);

				if (targetOp) {
					consolidationOps.push({
						operation: targetOp,
						originalTasks: comp.originalTasks
							.map((id) => getTaskById(id))
							.filter(Boolean),
						reasoning: comp.reasoning
					});
				}
			}
		});

		return consolidationOps;
	}

	function getUpdateOperations(consolidations: any[]) {
		// Get non-consolidation updates
		const consolidationIds = new Set(consolidations.map((c) => c.operation.id));
		return operations
			.filter(
				(op) =>
					op.operation === 'update' && !op.data.deleted_at && !consolidationIds.has(op.id)
			)
			.map((op) => ({
				operation: op,
				originalTask: getTaskById(op.data.id)
			}));
	}

	function toggleExpanded(operationId: string) {
		if (expandedOperations.has(operationId)) {
			expandedOperations.delete(operationId);
		} else {
			expandedOperations.add(operationId);
		}
		expandedOperations = expandedOperations;
	}

	function handleEditClick(operation: ParsedOperation) {
		selectedOperation = operation;
		isEditModalOpen = true;
	}

	function handleSaveOperation(operation: ParsedOperation) {
		if (onOperationEdit) {
			onOperationEdit(operation);
		}
		isEditModalOpen = false;
		selectedOperation = null;
	}

	function createTaskDiff(originalTask: any, updatedData: any): FieldDiff[] {
		const fields = [
			{ key: 'title', label: 'Title' },
			{ key: 'description', label: 'Description' },
			{ key: 'details', label: 'Details' },
			{ key: 'status', label: 'Status' },
			{ key: 'priority', label: 'Priority' },
			{ key: 'duration_minutes', label: 'Duration' }
		];

		return fields
			.map((field) =>
				createFieldDiff(
					field.key,
					field.label,
					originalTask?.[field.key],
					updatedData[field.key]
				)
			)
			.filter((diff) => diff.hasChanges);
	}

	function createConsolidationComparison(
		originalTasks: any[],
		targetTask: any
	): ManyToOneComparison {
		const fieldConfigs = {
			title: { label: 'Title' },
			description: { label: 'Description' },
			details: { label: 'Details' },
			priority: { label: 'Priority' },
			status: { label: 'Status' }
		};

		return createManyToOneComparison(
			originalTasks.map((t) => ({ id: t.id, label: t.title, data: t })),
			{ id: targetTask.id || 'new', label: targetTask.title, data: targetTask },
			fieldConfigs
		);
	}

	function getOperationIcon(type: string) {
		switch (type) {
			case 'consolidation':
				return GitMerge;
			case 'update':
				return Edit3;
			case 'create':
				return Plus;
			case 'deleted':
				return Archive;
			default:
				return Layers;
		}
	}

	function getOperationColor(type: string) {
		switch (type) {
			case 'consolidation':
				return 'indigo';
			case 'update':
				return 'blue';
			case 'create':
				return 'emerald';
			case 'deleted':
				return 'red';
			default:
				return 'gray';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'done':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'in_progress':
				return 'text-blue-600 dark:text-blue-400';
			case 'blocked':
				return 'text-rose-600 dark:text-rose-400';
			default:
				return 'text-muted-foreground';
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'high':
				return 'text-rose-600 dark:text-rose-400';
			case 'medium':
				return 'text-amber-600 dark:text-amber-400';
			case 'low':
				return 'text-muted-foreground';
			default:
				return 'text-muted-foreground';
		}
	}

	// Cleanup caches on component destroy
	onDestroy(() => {
		taskByIdCache.clear();
		consolidationsCache = null;
		updatesCache = null;
	});
</script>

<div class="space-y-6">
	<!-- Compact Header -->
	<div class="text-center py-2 sm:py-3">
		<div class="inline-flex items-center gap-2 mb-1">
			<Sparkles class="w-4 h-4 text-indigo-500" />
			<h2
				class="text-lg sm:text-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent"
			>
				Synthesis Results
			</h2>
			<Sparkles class="w-4 h-4 text-purple-500" />
		</div>
		<p class="text-xs sm:text-sm text-muted-foreground">Review and edit transformations</p>
	</div>

	<!-- Compact Summary Cards -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
		{#if consolidations.length > 0}
			<div
				class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border border-indigo-200 dark:border-indigo-800 p-3 hover:shadow-ink-strong transition-all duration-300 dither-soft"
			>
				<div class="relative z-10">
					<div class="flex items-center justify-between mb-1">
						<GitMerge class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
						<div class="text-xl font-bold text-indigo-700 dark:text-indigo-300">
							{consolidations.length}
						</div>
					</div>
					<div class="text-xs font-medium text-indigo-600 dark:text-indigo-400">
						Consolidations
					</div>
				</div>
			</div>
		{/if}

		{#if updates.length > 0}
			<div
				class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 p-3 hover:shadow-ink-strong transition-all duration-300 dither-soft"
			>
				<div class="relative z-10">
					<div class="flex items-center justify-between mb-1">
						<Edit3 class="w-4 h-4 text-blue-600 dark:text-blue-400" />
						<div class="text-xl font-bold text-blue-700 dark:text-blue-300">
							{updates.length}
						</div>
					</div>
					<div class="text-xs font-medium text-blue-600 dark:text-blue-400">Updates</div>
				</div>
			</div>
		{/if}

		{#if creations.length > 0}
			<div
				class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800 p-3 hover:shadow-ink-strong transition-all duration-300 dither-soft"
			>
				<div class="relative z-10">
					<div class="flex items-center justify-between mb-1">
						<Plus class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
						<div class="text-xl font-bold text-emerald-700 dark:text-emerald-300">
							{creations.length}
						</div>
					</div>
					<div class="text-xs font-medium text-emerald-600 dark:text-emerald-400">
						New Tasks
					</div>
				</div>
			</div>
		{/if}

		{#if deletedOps.length > 0}
			<div
				class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800 p-3 hover:shadow-ink-strong transition-all duration-300 dither-soft"
			>
				<div class="relative z-10">
					<div class="flex items-center justify-between mb-1">
						<Archive class="w-4 h-4 text-red-600 dark:text-red-400" />
						<div class="text-xl font-bold text-red-700 dark:text-red-300">
							{deletedOps.length}
						</div>
					</div>
					<div class="text-xs font-medium text-red-600 dark:text-red-400">To Delete</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Consolidations Section -->
	{#if consolidations.length > 0}
		<div class="space-y-4" in:fade={{ duration: 300, delay: 100 }}>
			<h3
				class="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2"
			>
				<GitMerge class="w-4 h-4 text-indigo-500" />
				Task Consolidations
			</h3>

			{#each consolidations as consolidation, i}
				<div
					class="group relative bg-card rounded-xl border border-border shadow-ink hover:shadow-ink-strong transition-all duration-300"
					in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
				>
					<!-- Compact Operation Header -->
					<div
						class="px-4 py-3 border-b border-border bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10 rounded-t-xl relative overflow-hidden dither-soft"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<div
									class="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex-shrink-0"
								>
									<GitMerge
										class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<h4 class="text-sm font-medium text-foreground truncate">
										Consolidate {consolidation.originalTasks.length} → 1
									</h4>
									{#if !expandedOperations.has(consolidation.operation.id) && consolidation.reasoning}
										<p
											class="text-xs text-muted-foreground mt-0.5 line-clamp-1"
										>
											{consolidation.reasoning}
										</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-1 flex-shrink-0">
								<Button
									onclick={() => toggleExpanded(consolidation.operation.id)}
									class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground hover:bg-muted rounded-lg transition-all duration-200"
									variant="ghost"
									size="sm"
									btnType="container"
									title={expandedOperations.has(consolidation.operation.id)
										? 'Collapse'
										: 'Expand'}
								>
									<Eye class="w-3.5 h-3.5" />
								</Button>
								{#if onOperationEdit}
									<Button
										onclick={() => handleEditClick(consolidation.operation)}
										class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-indigo-600 dark:text-muted-foreground dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all duration-200"
										variant="ghost"
										size="sm"
										btnType="container"
										title="Edit operation"
									>
										<Edit3 class="w-3.5 h-3.5" />
									</Button>
								{/if}
							</div>
						</div>
					</div>

					<!-- Compact View -->
					{#if !expandedOperations.has(consolidation.operation.id)}
						<div class="p-4">
							<div
								class="flex flex-col sm:flex-row items-start sm:items-center gap-3"
							>
								<!-- Source Tasks -->
								<div class="flex-1 w-full">
									<div class="space-y-1">
										{#each consolidation.originalTasks as task}
											<div
												class="flex items-center gap-1.5 text-xs sm:text-sm"
											>
												<ChevronRight
													class="w-3 h-3 text-muted-foreground flex-shrink-0"
												/>
												<span
													class="text-muted-foreground line-through truncate"
												>
													{task.title}
												</span>
											</div>
										{/each}
									</div>
								</div>

								<!-- Arrow -->
								<div class="flex-shrink-0 self-center">
									<div
										class="p-1.5 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-800/30 dark:to-purple-800/30 rounded-lg relative overflow-hidden dither-subtle"
									>
										<ArrowRight
											class="w-4 h-4 text-indigo-600 dark:text-indigo-400"
										/>
									</div>
								</div>

								<!-- Target Task -->
								<div class="flex-1 w-full">
									<div
										class="p-2.5 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700 relative overflow-hidden dither-soft"
									>
										<h5 class="text-sm font-medium text-foreground truncate">
											{consolidation.operation.data.title}
										</h5>
										<div
											class="flex flex-wrap items-center gap-2 mt-1.5 text-xs"
										>
											<span
												class={getStatusColor(
													consolidation.operation.data.status
												)}
											>
												{consolidation.operation.data.status?.replace(
													'_',
													' '
												)}
											</span>
											<span
												class={getPriorityColor(
													consolidation.operation.data.priority
												)}
											>
												{consolidation.operation.data.priority}
											</span>
											{#if consolidation.operation.data.duration_minutes}
												<span class="text-muted-foreground">
													{consolidation.operation.data.duration_minutes}m
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Expanded Diff View -->
					{#if expandedOperations.has(consolidation.operation.id)}
						<div class="p-4 pt-2" transition:slide={{ duration: 300 }}>
							{#if consolidation.reasoning}
								<div
									class="mb-3 p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700"
								>
									<p class="text-xs text-indigo-700 dark:text-indigo-300">
										<span class="font-semibold">Reasoning:</span>
										{consolidation.reasoning}
									</p>
								</div>
							{/if}
							<ManyToOneDiffView
								comparison={createConsolidationComparison(
									consolidation.originalTasks,
									consolidation.operation.data
								)}
								leftLabel="Original"
								rightLabel="Consolidated"
								showOnlyDifferences={false}
							/>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Updates Section -->
	{#if updates.length > 0}
		<div class="space-y-4" in:fade={{ duration: 300, delay: 150 }}>
			<h3
				class="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2"
			>
				<Edit3 class="w-4 h-4 text-blue-500" />
				Task Updates
			</h3>

			{#each updates as update, i}
				<div
					class="group relative bg-card rounded-xl border border-border shadow-ink hover:shadow-ink-strong transition-all duration-300"
					in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
				>
					<!-- Compact Operation Header -->
					<div
						class="px-4 py-3 border-b border-border bg-gradient-to-r from-blue-50/50 to-sky-50/50 dark:from-blue-900/10 dark:to-sky-900/10 rounded-t-xl relative overflow-hidden dither-soft"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<div
									class="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0"
								>
									<Edit3 class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
								</div>
								<div class="min-w-0 flex-1">
									<h4 class="text-sm font-medium text-foreground">Update Task</h4>
									{#if !expandedOperations.has(update.operation.id) && update.operation.reasoning}
										<p
											class="text-xs text-muted-foreground mt-0.5 line-clamp-1"
										>
											{update.operation.reasoning}
										</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-1 flex-shrink-0">
								<Button
									onclick={() => toggleExpanded(update.operation.id)}
									class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground hover:bg-muted rounded-lg transition-all duration-200"
									variant="ghost"
									size="sm"
									btnType="container"
									title={expandedOperations.has(update.operation.id)
										? 'Collapse'
										: 'Expand'}
								>
									<Eye class="w-3.5 h-3.5" />
								</Button>
								{#if onOperationEdit}
									<Button
										onclick={() => handleEditClick(update.operation)}
										class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-blue-600 dark:text-muted-foreground dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all duration-200"
										variant="ghost"
										size="sm"
										btnType="container"
										title="Edit operation"
									>
										<Edit3 class="w-3.5 h-3.5" />
									</Button>
								{/if}
							</div>
						</div>
					</div>

					<!-- Compact View -->
					{#if !expandedOperations.has(update.operation.id)}
						<div class="p-4">
							<div
								class="flex flex-col sm:flex-row items-start sm:items-center gap-3"
							>
								<!-- Original Task -->
								<div class="flex-1 w-full">
									{#if update.originalTask}
										<div class="p-2.5 bg-muted/50 rounded-lg">
											<h5
												class="text-sm font-medium text-foreground line-through truncate"
											>
												{update.originalTask.title}
											</h5>
											<div
												class="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground"
											>
												<span
													>{update.originalTask.status?.replace(
														'_',
														' '
													)}</span
												>
												<span>{update.originalTask.priority}</span>
											</div>
										</div>
									{/if}
								</div>

								<!-- Arrow -->
								<div class="flex-shrink-0 self-center">
									<div
										class="p-1.5 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-800/30 dark:to-sky-800/30 rounded-lg relative overflow-hidden dither-subtle"
									>
										<ArrowRight
											class="w-4 h-4 text-blue-600 dark:text-blue-400"
										/>
									</div>
								</div>

								<!-- Updated Task -->
								<div class="flex-1 w-full">
									<div
										class="p-2.5 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-lg border border-blue-200 dark:border-blue-700 relative overflow-hidden dither-soft"
									>
										<h5 class="text-sm font-medium text-foreground truncate">
											{update.operation.data.title}
										</h5>
										<div
											class="flex flex-wrap items-center gap-2 mt-1.5 text-xs"
										>
											<span
												class={getStatusColor(update.operation.data.status)}
											>
												{update.operation.data.status?.replace('_', ' ')}
											</span>
											<span
												class={getPriorityColor(
													update.operation.data.priority
												)}
											>
												{update.operation.data.priority}
											</span>
											{#if update.operation.data.duration_minutes}
												<span class="text-muted-foreground">
													{update.operation.data.duration_minutes}m
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Expanded Diff View -->
					{#if expandedOperations.has(update.operation.id)}
						<div class="p-4 pt-2" transition:slide={{ duration: 300 }}>
							{#if update.operation.reasoning}
								<div
									class="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
								>
									<p class="text-xs text-blue-700 dark:text-blue-300">
										<span class="font-semibold">Reasoning:</span>
										{update.operation.reasoning}
									</p>
								</div>
							{/if}
							<DiffView
								diffs={createTaskDiff(update.originalTask, update.operation.data)}
								fromVersionLabel="Original"
								toVersionLabel="Updated"
								showFieldPriority={false}
							/>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- New Tasks Section -->
	{#if creations.length > 0}
		<div class="space-y-4" in:fade={{ duration: 300, delay: 200 }}>
			<h3
				class="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2"
			>
				<Plus class="w-4 h-4 text-emerald-500" />
				New Tasks
			</h3>

			{#each creations as creation, i}
				<div
					class="group relative bg-card rounded-2xl border border-border shadow-ink hover:shadow-ink-strong transition-all duration-300"
					in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
				>
					<div
						class="px-6 py-4 border-b border-border bg-gradient-to-r from-emerald-50/50 to-green-50/50 dark:from-emerald-900/10 dark:to-green-900/10 rounded-t-2xl relative overflow-hidden dither-soft"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
									<Plus class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
								</div>
								<div>
									<h4 class="font-medium text-foreground">Create New Task</h4>
									{#if creation.reasoning}
										<p class="text-xs text-muted-foreground mt-0.5">
											{creation.reasoning}
										</p>
									{/if}
								</div>
							</div>
							{#if onOperationEdit}
								<Button
									onclick={() => handleEditClick(creation)}
									class="p-2 text-muted-foreground hover:text-emerald-600 dark:text-muted-foreground dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all duration-200"
									variant="ghost"
									size="sm"
									btnType="container"
									title="Edit operation"
								>
									<Edit3 class="w-4 h-4" />
								</Button>
							{/if}
						</div>
					</div>

					<div class="p-6">
						<div
							class="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700 relative overflow-hidden dither-soft"
						>
							<h5 class="font-medium text-foreground mb-2">
								{creation.data.title}
							</h5>
							{#if creation.data.description}
								<p class="text-sm text-muted-foreground mb-3">
									{creation.data.description}
								</p>
							{/if}
							<div class="flex items-center gap-4 text-xs">
								<span class={getStatusColor(creation.data.status)}>
									{creation.data.status?.replace('_', ' ')}
								</span>
								<span class={getPriorityColor(creation.data.priority)}>
									{creation.data.priority} priority
								</span>
								{#if creation.data.duration_minutes}
									<span class="text-muted-foreground">
										{creation.data.duration_minutes} min
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Deleted Tasks Section -->
	{#if deletedOps.length > 0}
		<div class="space-y-4" in:fade={{ duration: 300, delay: 250 }}>
			<h3
				class="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2"
			>
				<Archive class="w-4 h-4 text-red-500" />
				Tasks to Delete
			</h3>

			{#each deletedOps as deleted, i}
				{@const task = getTaskById(deleted.data.id)}
				<div
					class="group relative bg-card rounded-xl border border-border shadow-ink hover:shadow-ink-strong transition-all duration-300"
					in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
				>
					<div
						class="px-4 py-3 border-b border-border bg-gradient-to-r from-red-50/50 to-red-100/50 dark:from-red-900/10 dark:to-red-900/10 rounded-t-xl relative overflow-hidden dither-soft"
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<div
									class="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0"
								>
									<Archive
										class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<h4 class="text-sm font-medium text-foreground">Delete Task</h4>
									{#if deleted.reasoning}
										<p
											class="text-xs text-muted-foreground mt-0.5 line-clamp-1"
										>
											{deleted.reasoning}
										</p>
									{/if}
								</div>
							</div>
							{#if onOperationEdit}
								<Button
									onclick={() => handleEditClick(deleted)}
									class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-red-600 dark:text-muted-foreground dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
									variant="ghost"
									size="sm"
									btnType="container"
									title="Edit operation"
								>
									<Edit3 class="w-3.5 h-3.5" />
								</Button>
							{/if}
						</div>
					</div>

					<div class="p-4">
						{#if task}
							<div class="p-3 bg-muted/50 rounded-lg opacity-60">
								<h5
									class="text-sm font-medium text-foreground line-through mb-1 truncate"
								>
									{task.title}
								</h5>
								{#if task.description}
									<p
										class="text-xs text-muted-foreground line-through line-clamp-2"
									>
										{task.description}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Empty State -->
	{#if operations.length === 0}
		<div class="text-center py-16">
			<div
				class="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-2xl mb-4"
			>
				<AlertTriangle class="w-8 h-8 text-muted-foreground" />
			</div>
			<p class="text-muted-foreground font-medium">No task transformations found</p>
			<p class="text-sm text-muted-foreground mt-2">
				The synthesis didn't identify any changes needed for your tasks
			</p>
		</div>
	{/if}
</div>

<!-- Edit Operation Modal -->
{#if isEditModalOpen && selectedOperation}
	<SynthesisOperationModal
		isOpen={isEditModalOpen}
		operation={selectedOperation}
		onSave={handleSaveOperation}
		onClose={() => {
			isEditModalOpen = false;
			selectedOperation = null;
		}}
	/>
{/if}

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@keyframes shimmer {
		0% {
			background-position: -1000px 0;
		}
		100% {
			background-position: 1000px 0;
		}
	}

	:global(.shimmer) {
		animation: shimmer 3s infinite linear;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.1) 50%,
			transparent 100%
		);
		background-size: 1000px 100%;
	}

	/* Smooth transitions */
	* {
		transition-property:
			background-color, border-color, color, fill, stroke, opacity, box-shadow, transform;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 150ms;
	}
</style>
