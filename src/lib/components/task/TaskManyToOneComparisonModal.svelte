<!-- src/lib/components/task/TaskManyToOneComparisonModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ManyToOneDiffView from '$lib/components/ui/ManyToOneDiffView.svelte';
	import {
		createManyToOneComparison,
		type ManyToOneItem,
		type FieldConfig
	} from '$lib/utils/many-to-one-diff';
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;
	export let tasks: any[] = [];
	export let referenceTask: any = null;
	export let title = 'Compare Tasks';

	const dispatch = createEventDispatcher();

	let comparison: any = null;
	let showOnlyDifferences = false;

	// Task field configuration
	const taskFieldConfigs: Record<string, FieldConfig> = {
		title: {
			label: 'Task Title',
			priority: 1
		},
		status: {
			label: 'Status',
			priority: 2,
			formatter: (value) => (value ? String(value).replace('_', ' ').toUpperCase() : '')
		},
		priority: {
			label: 'Priority',
			priority: 3,
			formatter: (value) => (value ? String(value).toUpperCase() : '')
		},
		start_date: {
			label: 'Start Date',
			priority: 4,
			formatter: (value) => {
				if (!value) return '';
				try {
					return new Date(value).toLocaleDateString();
				} catch {
					return String(value);
				}
			}
		},
		estimated_hours: {
			label: 'Estimated Hours',
			priority: 5,
			formatter: (value) => (value ? `${value}h` : '')
		},
		description: {
			label: 'Description',
			priority: 6
		},
		details: {
			label: 'Details',
			priority: 7
		},
		task_steps: {
			label: 'Task Steps',
			priority: 8
		}
	};

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}

	function createComparison() {
		if (!tasks.length || !referenceTask) {
			comparison = null;
			return;
		}

		// Convert tasks to ManyToOneItem format
		const leftItems: ManyToOneItem[] = tasks.map((task) => ({
			id: task.id,
			label: task.title || `Task ${task.id}`,
			data: task
		}));

		const rightItem: ManyToOneItem = {
			id: referenceTask.id,
			label: referenceTask.title || `Task ${referenceTask.id}`,
			data: referenceTask
		};

		comparison = createManyToOneComparison(leftItems, rightItem, taskFieldConfigs);
	}

	// Reactive comparison creation
	$: if (tasks.length && referenceTask) {
		createComparison();
	}
</script>

<Modal {isOpen} size="xl" onClose={handleClose} {title}>
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col h-full max-h-[80vh]">
		<!-- Controls -->
		<div
			class="mb-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4"
		>
			<div class="text-sm text-gray-600 dark:text-gray-400">
				Comparing {tasks.length} tasks against reference task: {referenceTask?.title ||
					'Unknown'}
			</div>

			<div class="flex items-center space-x-2">
				<label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
					<input
						type="checkbox"
						bind:checked={showOnlyDifferences}
						class="mr-2 rounded border-gray-300 dark:border-gray-600"
					/>
					Show only differences
				</label>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-auto">
			{#if !tasks.length}
				<div class="text-center py-8">
					<p class="text-gray-600 dark:text-gray-400">
						No tasks provided for comparison.
					</p>
				</div>
			{:else if !referenceTask}
				<div class="text-center py-8">
					<p class="text-gray-600 dark:text-gray-400">No reference task provided.</p>
				</div>
			{:else if comparison}
				<ManyToOneDiffView
					{comparison}
					leftLabel="Tasks to Compare"
					rightLabel="Reference Task"
					{showOnlyDifferences}
				/>
			{:else}
				<div class="text-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"
					></div>
					<p class="text-gray-600 dark:text-gray-400">Creating comparison...</p>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="mt-4 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
			<Button onclick={handleClose} variant="outline">Close</Button>
		</div>
	</div>
</Modal>
