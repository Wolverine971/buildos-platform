<!-- apps/web/src/lib/components/project/DeleteConfirmationModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	export let isOpen = false;
	export let projectName = '';
	export let taskCount = 0;
	export let noteCount = 0;
	export let isDeleting = false;

	const dispatch = createEventDispatcher();

	function handleConfirm() {
		dispatch('confirm');
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<ConfirmationModal
	{isOpen}
	title="Delete project {projectName}?"
	confirmText="Delete Project"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	loading={isDeleting}
	loadingText="Deleting..."
	on:confirm={handleConfirm}
	on:cancel={handleCancel}
>
	<svelte:fragment slot="content">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Are you sure you want to delete this project? This action cannot be undone.
		</p>
	</svelte:fragment>

	<svelte:fragment slot="details">
		<div class="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
			<p class="font-semibold">This will permanently delete:</p>
			<ul class="list-disc list-inside space-y-1 ml-2">
				<li>The project and all its settings</li>
				{#if taskCount > 0}
					<li>{taskCount} task{taskCount !== 1 ? 's' : ''}</li>
				{/if}
				{#if noteCount > 0}
					<li>{noteCount} note{noteCount !== 1 ? 's' : ''}</li>
				{/if}
				<li>All project context and daily briefs</li>
				<li>All project synthesis data</li>
			</ul>
		</div>
	</svelte:fragment>
</ConfirmationModal>
