<!-- apps/web/src/lib/components/brain-dump/OperationErrorsDisplay.svelte -->
<script lang="ts">
	import { AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';

	export let errors: Array<{
		operationId: string;
		table: string;
		operation: string;
		error: string;
		timestamp?: string;
	}> = [];

	export let summary: {
		successful: number;
		failed: number;
	} = { successful: 0, failed: 0 };

	let showDetails = false;
	let dismissed = false;

	// Group errors by table for better organization
	$: errorsByTable = errors.reduce(
		(acc, error) => {
			if (!acc[error.table]) {
				acc[error.table] = [];
			}
			acc[error.table].push(error);
			return acc;
		},
		{} as Record<string, typeof errors>
	);

	// Get user-friendly table names
	function getTableDisplayName(table: string): string {
		const names: Record<string, string> = {
			projects: 'Projects',
			tasks: 'Tasks',
			notes: 'Notes',
			phases: 'Project Phases',
			brain_dumps: 'Brain Dumps',
			project_context: 'Project Context'
		};
		return names[table] || table;
	}

	// Get user-friendly operation names
	function getOperationDisplayName(operation: string): string {
		const names: Record<string, string> = {
			create: 'Create',
			update: 'Update',
			delete: 'Delete'
		};
		return names[operation] || operation;
	}

	// Get user-friendly error messages
	function getErrorMessage(error: string): string {
		// Map technical errors to user-friendly messages
		if (error.includes('duplicate key')) {
			return 'This item already exists';
		}
		if (error.includes('foreign key')) {
			return 'Related data not found or cannot be deleted';
		}
		if (error.includes('not found')) {
			return 'Item not found';
		}
		if (error.includes('permission') || error.includes('denied')) {
			return "You don't have permission for this action";
		}
		if (error.includes('validation') || error.includes('invalid')) {
			return 'Invalid data provided';
		}
		if (error.includes('network') || error.includes('connection')) {
			return 'Network connection issue';
		}
		if (error.includes('timeout')) {
			return 'Operation timed out';
		}
		// Return original if no mapping found
		return error;
	}
</script>

{#if errors.length > 0 && !dismissed}
	<div
		class="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
		transition:fade={{ duration: 200 }}
	>
		<div class="flex items-start justify-between">
			<div class="flex items-start gap-3">
				<AlertTriangle
					class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"
				/>
				<div class="flex-1">
					<h3 class="font-medium text-amber-900 dark:text-amber-100">
						Some operations failed
					</h3>
					<p class="text-sm text-amber-800 dark:text-amber-200 mt-1">
						{summary.successful} operations succeeded, {summary.failed} failed
					</p>

					{#if !showDetails}
						<button
							on:click={() => (showDetails = true)}
							class="mt-2 text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1 transition-colors"
						>
							<ChevronDown class="w-4 h-4" />
							Show details
						</button>
					{:else}
						<button
							on:click={() => (showDetails = false)}
							class="mt-2 text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1 transition-colors"
						>
							<ChevronUp class="w-4 h-4" />
							Hide details
						</button>
					{/if}
				</div>
			</div>

			<button
				on:click={() => (dismissed = true)}
				class="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
				aria-label="Dismiss"
			>
				<X class="w-5 h-5" />
			</button>
		</div>

		{#if showDetails}
			<div class="mt-4 space-y-3" transition:slide={{ duration: 200 }}>
				{#each Object.entries(errorsByTable) as [table, tableErrors]}
					<div
						class="bg-white dark:bg-gray-800 rounded-md p-3 border border-amber-100 dark:border-amber-900"
					>
						<h4 class="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
							{getTableDisplayName(table)}
						</h4>
						<div class="space-y-2">
							{#each tableErrors as error}
								<div class="text-sm">
									<div class="flex items-start gap-2">
										<span
											class="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded text-xs font-medium"
										>
											{getOperationDisplayName(error.operation)}
										</span>
										<p class="text-gray-700 dark:text-gray-300 flex-1">
											{getErrorMessage(error.error)}
										</p>
									</div>
									{#if error.error !== getErrorMessage(error.error)}
										<p
											class="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-2"
										>
											Technical: {error.error}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Add any custom styles if needed */
</style>
