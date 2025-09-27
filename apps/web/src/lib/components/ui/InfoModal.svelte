<!-- src/lib/components/ui/InfoModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Info } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;
	export let title: string = 'Information';
	export let buttonText: string = 'Got it';
	export let showIcon: boolean = true;
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'sm';

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	function handleClose() {
		dispatch('close');
	}
</script>

<Modal {isOpen} {title} {size} onClose={handleClose}>
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
		{#if showIcon}
			<div class="flex items-start space-x-3">
				<div class="flex-shrink-0">
					<div
						class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30"
					>
						<Info class="w-6 h-6 text-primary-600 dark:text-primary-400" />
					</div>
				</div>
				<div class="flex-1">
					<slot />
				</div>
			</div>
		{:else}
			<slot />
		{/if}
	</div>

	<div
		class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<Button on:click={handleClose} variant="primary" size="md" class="w-full sm:w-auto">
			{buttonText}
		</Button>
	</div>
</Modal>
