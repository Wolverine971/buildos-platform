<!-- apps/web/src/lib/components/agent/OperationsLog.svelte -->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		CircleCheck,
		CircleX,
		TriangleAlert,
		Clock,
		Database,
		FileText,
		FolderOpen,
		ListTodo,
		RefreshCw,
		Layers,
		Target,
		ChevronDown,
		ChevronRight
	} from 'lucide-svelte';
	import type { ChatOperation } from '@buildos/shared-types';

	// Props using Svelte 5 syntax
	interface Props {
		operations: ChatOperation[];
	}

	let { operations = [] }: Props = $props();

	// State
	let expandedOperations = $state<Set<string>>(new Set());

	// Derived state
	let stats = $derived({
		total: operations.length,
		completed: operations.filter((op) => op.status === 'completed').length,
		failed: operations.filter((op) => op.status === 'failed').length,
		partial: operations.filter((op) => op.status === 'partial').length
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

	const statusIcons: Record<string, any> = {
		completed: CircleCheck,
		failed: CircleX,
		partial: TriangleAlert,
		pending: Clock,
		queued: Clock,
		executing: RefreshCw,
		rolled_back: RefreshCw
	};

	const statusColors: Record<string, string> = {
		completed: 'text-green-600 dark:text-green-400',
		failed: 'text-red-600 dark:text-red-400',
		partial: 'text-yellow-600 dark:text-yellow-400',
		pending: 'text-gray-500 dark:text-gray-400',
		queued: 'text-blue-500 dark:text-blue-400',
		executing: 'text-blue-600 dark:text-blue-400',
		rolled_back: 'text-orange-600 dark:text-orange-400'
	};

	// Functions
	function getOperationTitle(op: ChatOperation): string {
		// Try to get a meaningful title from the operation data
		if (op.data.name) return op.data.name;
		if (op.data.title) return op.data.title;
		if (op.data.description) return op.data.description.substring(0, 50) + '...';

		return `${op.operation} ${op.table}`;
	}

	function getOperationDescription(op: ChatOperation): string {
		const tableName = op.table.replace('_', ' ');
		switch (op.operation) {
			case 'create':
				return `Created new ${tableName}`;
			case 'update':
				return `Updated ${tableName}`;
			case 'delete':
				return `Deleted ${tableName}`;
			default:
				return `${op.operation} ${tableName}`;
		}
	}

	function toggleOperation(id: string) {
		if (expandedOperations.has(id)) {
			expandedOperations.delete(id);
		} else {
			expandedOperations.add(id);
		}
		expandedOperations = expandedOperations;
	}

	function formatDuration(ms?: number): string {
		if (!ms) return '';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function formatDate(dateStr?: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function getIcon(op: ChatOperation) {
		return tableIcons[op.table] || Database;
	}

	function getStatusIcon(status: ChatOperation['status']) {
		return statusIcons[status] || Clock;
	}

	// Auto-expand recently completed operations
	$effect(() => {
		// Find operations that just completed
		const recentlyCompleted = operations
			.filter((op) => op.status === 'completed' && op.executed_at)
			.filter((op) => {
				if (!op.executed_at) return false;
				const executedTime = new Date(op.executed_at).getTime();
				const now = Date.now();
				return now - executedTime < 5000; // Within last 5 seconds
			});

		recentlyCompleted.forEach((op) => {
			expandedOperations.add(op.id);
		});
	});
</script>

<div class="h-full overflow-y-auto">
	{#if operations.length === 0}
		<div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
			<Database class="h-12 w-12 text-slate-300 dark:text-slate-600" />
			<p class="text-sm text-slate-500 dark:text-slate-400">No operations executed yet</p>
			<p class="text-xs text-slate-400 dark:text-slate-500">
				Operations will appear here after approval
			</p>
		</div>
	{:else}
		<!-- Summary Stats -->
		<div
			class="flex gap-4 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
		>
			<div class="flex flex-col items-center">
				<span
					class="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400"
					>Total</span
				>
				<span class="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</span>
			</div>
			<div class="flex flex-col items-center">
				<span
					class="text-xs font-medium uppercase tracking-wide text-green-600 dark:text-green-400"
					>Completed</span
				>
				<span class="text-xl font-bold text-green-600 dark:text-green-400"
					>{stats.completed}</span
				>
			</div>
			{#if stats.failed > 0}
				<div class="flex flex-col items-center">
					<span
						class="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400"
						>Failed</span
					>
					<span class="text-xl font-bold text-red-600 dark:text-red-400"
						>{stats.failed}</span
					>
				</div>
			{/if}
			{#if stats.partial > 0}
				<div class="flex flex-col items-center">
					<span
						class="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
						>Partial</span
					>
					<span class="text-xl font-bold text-amber-600 dark:text-amber-400"
						>{stats.partial}</span
					>
				</div>
			{/if}
		</div>

		<!-- Operations List -->
		<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
			{#each operations.slice().reverse() as operation (operation.id)}
				{@const Icon = getIcon(operation)}
				{@const StatusIcon = getStatusIcon(operation.status)}
				{@const isExpanded = expandedOperations.has(operation.id)}

				<div
					class="overflow-hidden rounded-lg border transition-all motion-reduce:transition-none {operationColors[
						operation.operation
					]}"
				>
					<button
						class="flex w-full items-center justify-between bg-transparent p-3 text-left transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
						on:click={() => toggleOperation(operation.id)}
						aria-label={isExpanded
							? `Collapse ${getOperationTitle(operation)}`
							: `Expand ${getOperationTitle(operation)}`}
					>
						<div class="flex min-w-0 items-center gap-2">
							<span class="flex-shrink-0">
								{#if isExpanded}
									<ChevronDown
										class="h-4 w-4 text-slate-600 dark:text-slate-400"
									/>
								{:else}
									<ChevronRight
										class="h-4 w-4 text-slate-600 dark:text-slate-400"
									/>
								{/if}
							</span>
							<Icon class="h-4 w-4 flex-shrink-0" />
							<div class="flex min-w-0 flex-col">
								<span
									class="truncate text-sm font-semibold text-slate-900 dark:text-white"
								>
									{getOperationTitle(operation)}
								</span>
								<span
									class="truncate text-xs text-slate-600 opacity-70 dark:text-slate-400"
								>
									{getOperationDescription(operation)}
								</span>
							</div>
						</div>
						<div class="flex flex-shrink-0 items-center gap-2">
							<StatusIcon class="h-4 w-4 {statusColors[operation.status]}" />
							<Badge
								variant={operation.status === 'completed'
									? 'success'
									: operation.status === 'failed'
										? 'error'
										: 'warning'}
								size="sm"
							>
								{operation.status}
							</Badge>
						</div>
					</button>

					{#if isExpanded}
						<div
							class="border-t border-slate-200/40 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/30"
						>
							<!-- Timing Info -->
							{#if operation.executed_at}
								<div class="mb-2 flex gap-2 text-sm">
									<span
										class="font-medium text-slate-600 opacity-70 dark:text-slate-400"
										>Executed:</span
									>
									<span class="text-slate-900 dark:text-white"
										>{formatDate(operation.executed_at)}</span
									>
								</div>
							{/if}
							{#if operation.duration_ms}
								<div class="mb-2 flex gap-2 text-sm">
									<span
										class="font-medium text-slate-600 opacity-70 dark:text-slate-400"
										>Duration:</span
									>
									<span class="text-slate-900 dark:text-white"
										>{formatDuration(operation.duration_ms)}</span
									>
								</div>
							{/if}

							<!-- Operation Data -->
							{#if operation.data && Object.keys(operation.data).length > 0}
								<div class="mt-3">
									<h4
										class="mb-2 text-sm font-semibold text-slate-900 dark:text-white"
									>
										Data
									</h4>
									<div
										class="rounded bg-white/50 p-2 font-mono text-xs dark:bg-slate-900/30"
									>
										{#each Object.entries(operation.data).slice(0, 5) as [key, value]}
											<div class="mb-1 flex gap-2">
												<span
													class="font-medium text-slate-700 dark:text-slate-300"
													>{key}:</span
												>
												<span
													class="overflow-hidden text-ellipsis text-slate-900 dark:text-white"
												>
													{typeof value === 'object'
														? JSON.stringify(value, null, 2)
														: value}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Error Message -->
							{#if operation.error}
								<div
									class="mt-3 rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/10 dark:text-red-400"
								>
									<span class="mr-2 font-medium">Error:</span>
									<span>{operation.error}</span>
								</div>
							{/if}

							<!-- Reasoning -->
							{#if operation.reasoning}
								<div
									class="mt-3 rounded bg-blue-50 p-2 text-sm text-slate-900 dark:bg-blue-900/10 dark:text-white"
								>
									<span class="mr-2 font-medium text-blue-600 dark:text-blue-400"
										>Reasoning:</span
									>
									<span class="text-slate-700 dark:text-slate-300"
										>{operation.reasoning}</span
									>
								</div>
							{/if}

							<!-- Result -->
							{#if operation.result}
								<div class="mt-3">
									<h4
										class="mb-2 text-sm font-semibold text-slate-900 dark:text-white"
									>
										Result
									</h4>
									<pre
										class="max-h-[200px] overflow-x-auto rounded bg-white/50 p-2 font-mono text-xs dark:bg-slate-900/30">{JSON.stringify(
											operation.result,
											null,
											2
										)}</pre>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
