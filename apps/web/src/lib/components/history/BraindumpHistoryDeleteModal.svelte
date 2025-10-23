<!-- apps/web/src/lib/components/history/BraindumpHistoryDeleteModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { TriangleAlert } from 'lucide-svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	export let isOpen = false;
	export let braindump: any = null;
	export let isDeleting = false;
	export let linkedCounts = {
		projects: 0,
		tasks: 0,
		notes: 0,
		questions: 0
	};

	const dispatch = createEventDispatcher();

	function handleConfirm() {
		dispatch('confirm');
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// Calculate total linked items
	$: totalLinkedItems = Object.values(linkedCounts).reduce((sum, count) => sum + count, 0);
</script>

<ConfirmationModal
	{isOpen}
	title="Delete Braindump"
	confirmText="Delete Braindump"
	cancelText="Cancel"
	confirmVariant="danger"
	loading={isDeleting}
	loadingText="Deleting..."
	icon="danger"
	on:confirm={handleConfirm}
	on:cancel={handleCancel}
>
	<div slot="content" class="space-y-4">
		<!-- Braindump info -->
		<div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
			<h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
				{braindump?.title || 'Untitled Braindump'}
			</h4>
			<p class="text-xs text-gray-500 dark:text-gray-400">
				Created {braindump ? new Date(braindump.created_at).toLocaleDateString() : ''}
			</p>
		</div>

		<!-- Linked items warning -->
		{#if totalLinkedItems > 0}
			<div
				class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
			>
				<div class="flex items-start space-x-2">
					<TriangleAlert
						class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
					/>
					<div class="flex-1">
						<p class="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
							This braindump has linked items
						</p>
						<ul class="text-xs text-amber-700 dark:text-amber-400 space-y-1">
							{#if linkedCounts.projects > 0}
								<li>
									• {linkedCounts.projects} project{linkedCounts.projects !== 1
										? 's'
										: ''}
								</li>
							{/if}
							{#if linkedCounts.tasks > 0}
								<li>
									• {linkedCounts.tasks} task{linkedCounts.tasks !== 1 ? 's' : ''}
								</li>
							{/if}
							{#if linkedCounts.notes > 0}
								<li>
									• {linkedCounts.notes} note{linkedCounts.notes !== 1 ? 's' : ''}
								</li>
							{/if}
							{#if linkedCounts.questions > 0}
								<li>
									• {linkedCounts.questions} answered question{linkedCounts.questions !==
									1
										? 's'
										: ''}
								</li>
							{/if}
						</ul>
						<p class="text-xs text-amber-600 dark:text-amber-400 mt-2">
							These items will remain but lose their connection to this braindump.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Permanent deletion warning -->
		<div
			class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
		>
			<p class="text-sm text-red-700 dark:text-red-300">
				<strong>This action is permanent.</strong> The braindump content will be deleted and
				cannot be recovered.
			</p>
		</div>
	</div>
</ConfirmationModal>
