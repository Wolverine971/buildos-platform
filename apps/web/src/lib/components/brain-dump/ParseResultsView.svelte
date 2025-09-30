<!-- apps/web/src/lib/components/brain-dump/ParseResultsView.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		AlertTriangle,
		CheckCircle,
		XCircle,
		Eye,
		EyeOff,
		Edit3,
		Trash2,
		X,
		Calendar,
		Clock,
		Tag,
		FileText,
		Folder,
		CheckSquare,
		Loader2
	} from 'lucide-svelte';
	import type { ParsedOperation, BrainDumpParseResult } from '$lib/types/brain-dump';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	export let parseResults: BrainDumpParseResult;
	export let disabledOperations: Set<string>;
	export let enabledOperationsCount: number;
	export let isProcessing: boolean;

	const dispatch = createEventDispatcher();

	// Error tracking and analysis - optimized with memoization
	let memoizedErrorAnalysis = {
		operationsWithErrors: [],
		hasErrors: false,
		criticalErrors: [],
		enabledValidOperations: []
	};
	let lastParseResultsHash = '';
	let lastDisabledOperationsSize = 0;

	// Only recalculate when parseResults or disabledOperations actually change
	$: {
		const currentHash = JSON.stringify(
			parseResults.operations.map((op) => ({
				id: op.id,
				error: op.error,
				enabled: op.enabled,
				table: op.table
			}))
		);
		const currentDisabledSize = disabledOperations.size;

		if (
			currentHash !== lastParseResultsHash ||
			currentDisabledSize !== lastDisabledOperationsSize
		) {
			const operationsWithErrors = parseResults.operations.filter(
				(op) => op.error || !op.enabled
			);
			const criticalErrors = operationsWithErrors.filter(
				(op) => op.table === 'projects' || (op.error && op.error.includes('Critical'))
			);
			const enabledValidOperations = parseResults.operations.filter(
				(op) => op.enabled && !op.error && !disabledOperations.has(op.id)
			);

			memoizedErrorAnalysis = {
				operationsWithErrors,
				hasErrors: operationsWithErrors.length > 0,
				criticalErrors,
				enabledValidOperations
			};

			lastParseResultsHash = currentHash;
			lastDisabledOperationsSize = currentDisabledSize;
		}
	}

	// Use memoized values
	$: ({ operationsWithErrors, hasErrors, criticalErrors, enabledValidOperations } =
		memoizedErrorAnalysis);

	let showErrorDetails = false;
	let expandedOperations = new Set<string>();
	let applyingChanges = false;

	// Reset applyingChanges when isProcessing changes to false
	$: if (!isProcessing && applyingChanges) {
		applyingChanges = false;
	}

	// Helper functions
	function toggleOperationExpansion(operationId: string) {
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

	function handleToggleOperation(operationId: string) {
		dispatch('toggleOperation', operationId);
	}

	function handleEditOperation(operation: ParsedOperation) {
		dispatch('editOperation', operation);
	}

	function handleRemoveOperation(operationId: string) {
		dispatch('removeOperation', operationId);
	}

	function handleApply(e: Event) {
		e.stopPropagation();
		applyingChanges = true;
		dispatch('apply');
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<Modal
	isOpen={true}
	onClose={handleCancel}
	title=""
	size="xl"
	closeOnBackdrop={!isProcessing}
	closeOnEscape={!isProcessing}
	persistent={isProcessing}
>
	<div
		slot="header"
		class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0"
	>
		<div>
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Brain Dump Results</h3>
			<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
				{parseResults.operations.length} operations extracted from your brain dump
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
	<!-- Summary and Error Section -->
	{#if parseResults.summary || hasErrors}
		<div class="mb-6">
			{#if parseResults.summary}
				<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
						Summary
					</h3>
					<p class="text-sm text-gray-600 dark:text-gray-300">{parseResults.summary}</p>
				</div>
			{/if}

			{#if hasErrors}
				<div
					class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4"
				>
					<div class="flex items-start gap-3">
						<AlertTriangle
							class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"
						/>
						<div class="flex-1">
							<h4
								class="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1"
							>
								{criticalErrors.length > 0
									? 'Critical Issues Detected'
									: 'Some Operations Have Issues'}
							</h4>
							<p class="text-sm text-amber-700 dark:text-amber-300 mb-3">
								{operationsWithErrors.length} of {parseResults.operations.length} operations
								have validation errors.
								{#if criticalErrors.length > 0}
									Critical issues may prevent proper saving.
								{:else}
									These items will be skipped during save.
								{/if}
							</p>

							<Button
								variant="ghost"
								size="sm"
								icon={showErrorDetails ? EyeOff : Eye}
								on:click={() => (showErrorDetails = !showErrorDetails)}
								class="text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
							>
								{showErrorDetails
									? 'Hide Details'
									: `Show Details (${operationsWithErrors.length})`}
							</Button>

							{#if showErrorDetails}
								<div class="mt-3 space-y-2 max-h-48 overflow-y-auto">
									{#each operationsWithErrors as operation}
										<div
											class="bg-white dark:bg-gray-900 rounded-md p-3 border border-amber-200 dark:border-amber-700"
										>
											<div class="flex items-start justify-between">
												<div class="flex-1">
													<div class="flex items-center gap-2 mb-1">
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
														{#if criticalErrors.includes(operation)}
															<span
																class="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full"
															>
																Critical
															</span>
														{/if}
													</div>

													{#if operation.data?.title || operation.data?.name}
														<p
															class="text-sm font-medium text-gray-900 dark:text-white mb-1"
														>
															{operation.data.title ||
																operation.data.name}
														</p>
													{/if}

													{#if operation.error}
														<p
															class="text-sm text-red-600 dark:text-red-400"
														>
															{operation.error}
														</p>
													{:else if !operation.enabled}
														<p
															class="text-sm text-amber-600 dark:text-amber-400"
														>
															Validation failed - will be skipped
														</p>
													{/if}
												</div>

												<div class="ml-3 flex-shrink-0">
													{#if operation.error}
														<XCircle class="w-5 h-5 text-rose-500" />
													{:else}
														<AlertTriangle
															class="w-5 h-5 text-amber-500"
														/>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Operations List -->
	<div class="space-y-2 sm:space-y-3 px-4 sm:px-6 py-4">
		{#each parseResults.operations as operation (operation.id)}
			{@const isExpanded = expandedOperations.has(operation.id)}
			{@const isDisabled = disabledOperations.has(operation.id)}
			{@const hasError = operation.error || !operation.enabled}
			{@const Icon = getOperationIcon(operation.table)}
			{@const color = getOperationColor(operation.table)}

			<div
				class="border rounded-lg p-3 sm:p-4 transition-all duration-200
					{hasError
					? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
					: isDisabled
						? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
						: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}"
			>
				<div class="flex items-start gap-3">
					<!-- Content -->
					<div class="flex-1">
						<!-- Header -->
						<div class="flex items-center justify-between mb-2">
							<!-- Checkbox/Status -->
							<div class="flex items-center gap-3">
								{#if operation.error}
									<XCircle class="w-5 h-5 text-red-500" />
								{:else if !operation.enabled}
									<AlertTriangle class="w-5 h-5 text-amber-500" />
								{:else if isDisabled}
									<div
										class="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
									></div>
								{:else}
									<div
										class="w-5 h-5 rounded border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center"
									>
										<CheckCircle class="w-3 h-3 text-white" />
									</div>
								{/if}
								<Icon class="w-4 h-4 text-gray-500 dark:text-gray-400" />
								<span class="operation-badge operation-badge-{color}">
									{operation.table}
								</span>
								<span class="text-sm font-medium text-gray-600 dark:text-gray-400">
									{operation.operation}
								</span>

								{#if operation.error}
									<span
										class="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full"
									>
										Error
									</span>
								{:else if !operation.enabled}
									<span
										class="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full"
									>
										Invalid
									</span>
								{:else if isDisabled}
									<span
										class="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-full"
									>
										Disabled
									</span>
								{/if}
							</div>

							<!-- Actions -->
							<div class="flex items-center gap-1">
								<Button
									on:click={() => handleEditOperation(operation)}
									variant="ghost"
									size="sm"
									icon={Edit3}
									class="!p-2 {hasError
										? 'text-amber-600 dark:text-amber-400'
										: ''}"
									title={hasError ? 'Fix operation errors' : 'Edit operation'}
								/>
								<Button
									on:click={() => handleRemoveOperation(operation.id)}
									variant="ghost"
									size="sm"
									icon={Trash2}
									class="!p-2 hover:!text-rose-600 dark:hover:!text-rose-400"
									title="Remove operation"
								/>

								<Button
									on:click={() => toggleOperationExpansion(operation.id)}
									variant="ghost"
									size="sm"
									icon={Eye}
									class="!p-2 {isExpanded
										? 'text-primary-600 dark:text-primary-400'
										: ''}"
									title={isExpanded ? 'Collapse' : 'Expand'}
								/>
								<!-- Toggle Checkbox -->
								{#if !hasError}
									<input
										type="checkbox"
										checked={!isDisabled}
										on:change={() => handleToggleOperation(operation.id)}
										class="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 !p-2"
									/>
								{:else}
									<div class="w-4 h-4"></div>
								{/if}
							</div>
						</div>

						<!-- Title/Name -->
						{#if operation.data?.title || operation.data?.name}
							<h4 class="text-base font-medium text-gray-900 dark:text-white mb-1">
								{operation.data.title || operation.data.name}
							</h4>
						{/if}

						<!-- Description (collapsed) -->
						{#if operation.data?.description && !isExpanded}
							<p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
								{operation.data.description}
							</p>
						{/if}

						{#if operation.data?.executive_summary && !isExpanded}
							<h4 class="text-base font-medium text-gray-900 dark:text-white mb-1">
								Executive Summary
							</h4>
							<p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
								{operation.data.executive_summary}
							</p>
						{/if}

						<!-- Error Message -->
						{#if operation.error}
							<div
								class="mt-2 flex items-start gap-2 p-3 bg-red-100 dark:bg-red-900/30 rounded-md"
							>
								<XCircle
									class="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
								/>
								<div>
									<p class="text-sm font-medium text-red-800 dark:text-red-200">
										Validation Error
									</p>
									<p class="text-sm text-red-700 dark:text-red-300 mt-0.5">
										{operation.error}
									</p>
								</div>
							</div>
						{/if}

						<!-- Expanded Details -->
						{#if isExpanded}
							<div class="mt-3 space-y-3 text-sm">
								{#if operation.data?.description}
									<div>
										<label
											class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
										>
											Description
										</label>
										<p class="text-gray-700 dark:text-gray-300">
											{operation.data.description}
										</p>
									</div>
								{/if}

								{#if operation.data?.details || operation.data?.content}
									<div>
										<label
											class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
										>
											{operation.table === 'notes' ? 'Content' : 'Details'}
										</label>
										<div
											class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
										>
											{operation.data.details || operation.data.content || ''}
										</div>
									</div>
								{/if}

								<!-- Task-specific fields -->
								{#if operation.table === 'tasks'}
									<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
										{#if operation.data?.priority}
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
														: operation.data.priority === 'medium'
															? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
															: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}"
												>
													{operation.data.priority}
												</span>
											</div>
										{/if}

										{#if operation.data?.status}
											<div>
												<label
													class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
												>
													Status
												</label>
												<span class="text-gray-700 dark:text-gray-300"
													>{operation.data.status}</span
												>
											</div>
										{/if}

										{#if operation.data?.duration_minutes}
											<div>
												<label
													class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
												>
													Duration
												</label>
												<div
													class="flex items-center gap-1 text-gray-700 dark:text-gray-300"
												>
													<Clock class="w-3 h-3" />
													<span>{operation.data.duration_minutes}min</span
													>
												</div>
											</div>
										{/if}

										{#if operation.data?.start_date}
											<div>
												<label
													class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
												>
													Start Date
												</label>
												<div
													class="flex items-center gap-1 text-gray-700 dark:text-gray-300"
												>
													<Calendar class="w-3 h-3" />
													<span
														>{formatDate(
															operation.data.start_date
														)}</span
													>
												</div>
											</div>
										{/if}
									</div>
								{/if}

								<!-- Project-specific fields -->
								{#if operation.table === 'projects'}
									{#if operation.data?.executive_summary}
										<div>
											<label
												class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
											>
												Executive Summary
											</label>
											<p class="text-gray-700 dark:text-gray-300">
												{operation.data.executive_summary}
											</p>
										</div>
									{/if}

									{#if operation.data?.tags && operation.data.tags.length > 0}
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
								{/if}

								<!-- References -->
								{#if operation.data?.project_ref || operation.data?.parent_task_ref}
									<div>
										<label
											class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
										>
											References
										</label>
										<div class="space-y-1">
											{#if operation.data.project_ref}
												<p class="text-gray-700 dark:text-gray-300">
													Project: <code
														class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs"
														>{operation.data.project_ref}</code
													>
												</p>
											{/if}
											{#if operation.data.parent_task_ref}
												<p class="text-gray-700 dark:text-gray-300">
													Parent Task: <code
														class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs"
														>{operation.data.parent_task_ref}</code
													>
												</p>
											{/if}
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

	<!-- Footer -->
	<div
		slot="footer"
		class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
	>
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
			<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
				<span class="font-medium text-gray-900 dark:text-white"
					>{enabledValidOperations.length}</span
				>
				of {parseResults.operations.length} selected
				{#if hasErrors}
					<span class="text-amber-600 dark:text-amber-400 block sm:inline sm:ml-2">
						({operationsWithErrors.length} errors)
					</span>
				{/if}
			</div>

			<div class="flex gap-2 sm:gap-3">
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
					disabled={isProcessing || enabledValidOperations.length === 0}
					on:click={handleApply}
					loading={isProcessing || applyingChanges}
					icon={criticalErrors.length > 0 ? AlertTriangle : undefined}
					class="{criticalErrors.length > 0
						? '!bg-amber-600 hover:!bg-amber-700'
						: ''} px-3 sm:px-4 flex-1 sm:flex-initial"
				>
					{#if criticalErrors.length > 0}
						Save Anyway
					{:else if isProcessing || applyingChanges}
						Saving...
					{:else}
						Apply Changes
					{/if}
					{#if enabledValidOperations.length > 0 && !isProcessing && !applyingChanges}
						({enabledValidOperations.length})
					{/if}
				</Button>
			</div>
		</div>
	</div>
</Modal>

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

	/* Line clamp utility */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
