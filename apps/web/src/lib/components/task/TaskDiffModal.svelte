<!-- apps/web/src/lib/components/task/TaskDiffModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import DiffView from '$lib/components/ui/DiffView.svelte';
	import { type FieldDiff, createFieldDiff } from '$lib/utils/diff';
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;
	export let oldTask: any = null;
	export let newTask: any = null;
	export let oldLabel = 'Previous Version';
	export let newLabel = 'Current Version';

	const dispatch = createEventDispatcher();

	let diffs: FieldDiff[] = [];

	// Task field configuration for display
	const taskFieldConfig = {
		title: { label: 'Task Title', priority: 1 },
		description: { label: 'Description', priority: 2 },
		details: { label: 'Task Details', priority: 2 },
		status: { label: 'Status', priority: 1 },
		priority: { label: 'Priority', priority: 1 },
		start_date: { label: 'Start Date', priority: 3 },
		task_steps: { label: 'Task Steps', priority: 3 },
		estimated_hours: { label: 'Estimated Hours', priority: 3 }
	};

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}

	function createTaskDiffs(oldTask: any, newTask: any): FieldDiff[] {
		if (!oldTask || !newTask) return [];

		const diffs: FieldDiff[] = [];

		// Check all fields for changes
		for (const [field, config] of Object.entries(taskFieldConfig)) {
			const oldValue = oldTask[field];
			const newValue = newTask[field];

			const fieldDiff = createFieldDiff(field, config.label, oldValue, newValue);
			if (fieldDiff.hasChanges) {
				diffs.push(fieldDiff);
			}
		}

		return diffs;
	}

	// Update diffs when tasks change
	$: if (oldTask && newTask) {
		diffs = createTaskDiffs(oldTask, newTask);
	}
</script>

<Modal {isOpen} size="xl" onClose={handleClose} title="Task Changes">
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col h-full max-h-[75vh]">
		<div class="flex-1 overflow-auto">
			<DiffView
				{diffs}
				fromVersionLabel={oldLabel}
				toVersionLabel={newLabel}
				showFieldPriority={false}
			/>
		</div>
	</div>
</Modal>
