<!-- apps/web/src/lib/components/agent/OperationsQueue.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import {
		CircleCheck,
		CircleX,
		Edit,
		Play,
		Layers,
		TriangleAlert,
		Database,
		FileText,
		FolderOpen,
		ListTodo,
		Target,
		SquareCheck,
		Square,
		ArrowUpDown
	} from 'lucide-svelte';
	import type { ChatOperation } from '@buildos/shared-types';

	// Props using Svelte 5 syntax
	interface Props {
		operations?: ChatOperation[];
		onApprove?: (operation: ChatOperation) => void;
		onApproveAll?: () => void;
		onReject?: (operation: ChatOperation) => void;
		onEdit?: (operation: ChatOperation) => void;
	}

	let {
		operations = [],
		onApprove = () => {},
		onApproveAll = () => {},
		onReject = () => {},
		onEdit = () => {}
	}: Props = $props();

	// State
	let selectedOperations = $state<Set<string>>(new Set());
	let isProcessing = $state(false);
	let sortBy = $state<'sequence' | 'type' | 'table'>('sequence');

	// Derived state
	let sortedOperations = $derived.by(() => {
		const ops = [...operations];

		switch (sortBy) {
			case 'type':
				return ops.sort((a, b) => a.operation.localeCompare(b.operation));
			case 'table':
				return ops.sort((a, b) => a.table.localeCompare(b.table));
			case 'sequence':
			default:
				return ops.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
		}
	});

	let allSelected = $derived(
		operations.length > 0 && selectedOperations.size === operations.length
	);

	let someSelected = $derived(
		selectedOperations.size > 0 && selectedOperations.size < operations.length
	);

	let dependencies = $derived.by(() => {
		// Map operation dependencies
		const deps: Map<string, string[]> = new Map();
		operations.forEach((op) => {
			if (op.ref && op.data.project_ref) {
				// This operation depends on another
				const dependsOn = operations.find((o) => o.ref === op.data.project_ref);
				if (dependsOn) {
					if (!deps.has(op.id)) deps.set(op.id, []);
					deps.get(op.id)!.push(dependsOn.id);
				}
			}
		});
		return deps;
	});

	// Icon mapping
	const tableIcons: Record<string, any> = {
		tasks: ListTodo,
		projects: FolderOpen,
		notes: FileText,
		phases: Layers,
		phase_tasks: Target,
		draft_tasks: ListTodo,
		project_drafts: FolderOpen
	};

	const operationColors: Record<string, string> = {
		create: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800',
		update: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
		delete: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
	};

	// Functions
	function getOperationTitle(op: ChatOperation): string {
		if (op.data.name) return op.data.name;
		if (op.data.title) return op.data.title;
		if (op.data.description) {
			const desc = op.data.description;
			return desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
		}
		return `${op.operation} ${op.table}`;
	}

	function getOperationType(op: ChatOperation): string {
		const tableName = op.table.replace(/_/g, ' ');
		return `${op.operation} ${tableName}`;
	}

	function getIcon(op: ChatOperation) {
		return tableIcons[op.table] || Database;
	}

	function toggleSelection(id: string) {
		if (selectedOperations.has(id)) {
			selectedOperations.delete(id);
		} else {
			selectedOperations.add(id);
		}
		selectedOperations = selectedOperations;
	}

	function toggleAll() {
		if (allSelected) {
			selectedOperations.clear();
		} else {
			operations.forEach((op) => selectedOperations.add(op.id));
		}
		selectedOperations = selectedOperations;
	}

	async function approveSelected() {
		if (selectedOperations.size === 0) return;

		isProcessing = true;

		// Approve operations in dependency order
		const toApprove = Array.from(selectedOperations);
		const approved = new Set<string>();

		// Simple dependency resolution
		while (toApprove.length > 0) {
			const batch = toApprove.filter((opId) => {
				const deps = dependencies.get(opId) || [];
				return deps.every(
					(depId: string) => approved.has(depId) || !selectedOperations.has(depId)
				);
			});

			if (batch.length === 0) {
				// Circular dependency or unresolved deps
				console.error('Could not resolve operation dependencies');
				break;
			}

			for (const opId of batch) {
				const op = operations.find((o) => o.id === opId);
				if (op) {
					onApprove(op);
					approved.add(opId);
				}
				toApprove.splice(toApprove.indexOf(opId), 1);
			}
		}

		selectedOperations.clear();
		selectedOperations = selectedOperations;
		isProcessing = false;
	}

	function approveAll() {
		operations.forEach((op) => selectedOperations.add(op.id));
		selectedOperations = selectedOperations;
		onApproveAll();
		selectedOperations.clear();
	}

	function rejectSelected() {
		const toReject = Array.from(selectedOperations);
		toReject.forEach((opId) => {
			const op = operations.find((o) => o.id === opId);
			if (op) {
				onReject(op);
			}
		});
		selectedOperations.clear();
		selectedOperations = selectedOperations;
	}

	function editOperation(op: ChatOperation) {
		onEdit(op);
	}

	function getMetadataFields(operation: ChatOperation): Array<[string, any]> {
		const fields: Array<[string, any]> = [];

		if (operation.data.priority) fields.push(['priority', operation.data.priority]);
		if (operation.data.status) fields.push(['status', operation.data.status]);
		if (operation.data.task_type) fields.push(['type', operation.data.task_type]);
		if (operation.data.start_date) {
			const date = new Date(operation.data.start_date);
			const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			fields.push(['start', formatted]);
		}

		return fields.slice(0, 3);
	}
</script>

<div class="h-full overflow-y-auto">
	{#if operations.length === 0}
		<div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
			<Layers class="h-12 w-12 text-slate-300 dark:text-slate-600" />
			<p class="text-sm text-slate-500 dark:text-slate-400">No pending operations</p>
			<p class="text-xs text-slate-400 dark:text-slate-500">
				Operations will queue here when manual approval is enabled
			</p>
		</div>
	{:else}
		<!-- Action Bar -->
		<div
			class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
		>
			<div class="flex items-center gap-3">
				<button
					class="flex cursor-pointer items-center border-none bg-transparent p-0"
					onclick={toggleAll}
					title={allSelected ? 'Deselect all' : 'Select all'}
					aria-label={allSelected ? 'Deselect all operations' : 'Select all operations'}
				>
					{#if allSelected}
						<SquareCheck class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					{:else if someSelected}
						<Square class="h-5 w-5 text-blue-600 opacity-50 dark:text-blue-400" />
					{:else}
						<Square class="h-5 w-5 text-slate-400 dark:text-slate-500" />
					{/if}
				</button>
				<span class="text-sm text-slate-600 dark:text-slate-400">
					{selectedOperations.size} of {operations.length} selected
				</span>
			</div>

			<div class="flex items-center gap-2">
				<button
					class="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
					onclick={() => {
						const options: Array<'sequence' | 'type' | 'table'> = [
							'sequence',
							'type',
							'table'
						];
						const currentIndex = options.indexOf(sortBy);
						sortBy = options[(currentIndex + 1) % options.length];
					}}
					title="Change sort order"
					aria-label="Change sort order"
				>
					<ArrowUpDown class="h-4 w-4" />
					<span>Sort: {sortBy}</span>
				</button>
			</div>
		</div>

		<!-- Operations List -->
		<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
			{#each sortedOperations as operation (operation.id)}
				{@const Icon = getIcon(operation)}
				{@const isSelected = selectedOperations.has(operation.id)}
				{@const hasDependencies = dependencies.has(operation.id)}

				<Card
					variant="outline"
					padding="none"
					class="transition-all motion-reduce:transition-none {operationColors[
						operation.operation
					]} {isSelected
						? 'border-blue-500 bg-blue-50/5 dark:border-blue-400 dark:bg-blue-900/10'
						: ''}"
				>
					<div class="flex items-start gap-3 p-3">
						<!-- Selection & Icon -->
						<div class="flex flex-shrink-0 items-center gap-2">
							<button
								class="flex cursor-pointer items-center border-none bg-transparent p-0"
								onclick={() => toggleSelection(operation.id)}
								aria-label={isSelected
									? `Deselect ${getOperationTitle(operation)}`
									: `Select ${getOperationTitle(operation)}`}
							>
								{#if isSelected}
									<SquareCheck class="h-5 w-5 text-blue-600 dark:text-blue-400" />
								{:else}
									<Square class="h-5 w-5 text-slate-400 dark:text-slate-500" />
								{/if}
							</button>
							<Icon class="h-5 w-5 flex-shrink-0" />
						</div>

						<!-- Main Content -->
						<div class="min-w-0 flex-1">
							<div class="mb-1 flex items-center gap-2">
								<span
									class="truncate text-sm font-semibold text-slate-900 dark:text-white"
								>
									{getOperationTitle(operation)}
								</span>
								{#if hasDependencies}
									<Badge variant="info" size="sm">Has dependencies</Badge>
								{/if}
							</div>
							<div class="mb-2 text-xs text-slate-600 opacity-70 dark:text-slate-400">
								{getOperationType(operation)}
							</div>

							<!-- Metadata Tags -->
							{#if getMetadataFields(operation).length > 0}
								<div class="mb-2 flex flex-wrap gap-1">
									{#each getMetadataFields(operation) as [key, value]}
										<span
											class="inline-flex items-center gap-1 rounded bg-slate-100/50 px-2 py-0.5 text-xs dark:bg-slate-800/50"
										>
											<span class="font-medium opacity-70">{key}:</span>
											<span class="text-slate-900 dark:text-white"
												>{value}</span
											>
										</span>
									{/each}
								</div>
							{/if}

							<!-- Dependencies Warning -->
							{#if hasDependencies}
								<div
									class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
								>
									<TriangleAlert class="h-3 w-3" />
									<span>
										Depends on {dependencies.get(operation.id)?.length || 0} other
										operation(s)
									</span>
								</div>
							{/if}
						</div>

						<!-- Actions -->
						<div class="flex flex-shrink-0 items-center gap-1">
							<Button
								onclick={() => editOperation(operation)}
								variant="ghost"
								size="sm"
								icon={Edit}
								title="Edit operation"
							/>
							<Button
								onclick={() => {
									selectedOperations.clear();
									selectedOperations.add(operation.id);
									approveSelected();
								}}
								variant="ghost"
								size="sm"
								icon={CircleCheck}
								class="text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
								title="Approve operation"
							/>
						</div>
					</div>
				</Card>
			{/each}
		</div>

		<!-- Action Footer -->
		<div
			class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
		>
			<div class="flex items-center gap-2">
				{#if selectedOperations.size > 0}
					<Button
						onclick={rejectSelected}
						variant="secondary"
						size="sm"
						disabled={isProcessing}
					>
						<CircleX class="mr-1 h-4 w-4" />
						Reject Selected
					</Button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				{#if selectedOperations.size > 0}
					<Button
						onclick={approveSelected}
						variant="primary"
						size="sm"
						disabled={isProcessing}
					>
						<CircleCheck class="mr-1 h-4 w-4" />
						Approve {selectedOperations.size} Operation{selectedOperations.size === 1
							? ''
							: 's'}
					</Button>
				{/if}
				<Button
					onclick={approveAll}
					variant="success"
					size="sm"
					disabled={isProcessing || operations.length === 0}
				>
					<Play class="mr-1 h-4 w-4" />
					Approve All
				</Button>
			</div>
		</div>
	{/if}
</div>
