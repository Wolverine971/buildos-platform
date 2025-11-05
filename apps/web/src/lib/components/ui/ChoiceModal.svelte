<!-- apps/web/src/lib/components/ui/ChoiceModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Check } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;
	export let title: string = 'Choose an Option';
	export let options: Array<{
		id: string;
		label: string;
		description?: string;
		icon?: any;
		disabled?: boolean;
	}> = [];
	export let selectedId: string = '';
	export let confirmText: string = 'Confirm';
	export let cancelText: string = 'Cancel';
	export let allowEmpty: boolean = false;

	const dispatch = createEventDispatcher<{
		confirm: { selectedId: string };
		cancel: void;
	}>();

	function handleConfirm() {
		if (!allowEmpty && !selectedId) return;
		dispatch('confirm', { selectedId });
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function selectOption(id: string) {
		selectedId = id;
	}
</script>

<Modal {isOpen} {title} size="sm" onClose={handleCancel}>
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
		<!-- Description slot -->
		<slot name="description" />

		<!-- Options -->
		<div class="space-y-2 my-4">
			{#each options as option}
				<Button
					type="button"
					onclick={() => selectOption(option.id)}
					disabled={option.disabled}
					variant="ghost"
					size="md"
					fullWidth
					btnType="container"
					class="text-left p-3 rounded-lg border transition-colors {selectedId ===
					option.id
						? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
						: 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'} {option.disabled
						? 'opacity-50 cursor-not-allowed'
						: 'hover:bg-gray-50 dark:hover:bg-gray-700'}"
				>
					<div class="flex items-start space-x-3">
						<!-- Icon -->
						{#if option.icon}
							<div class="flex-shrink-0 mt-1">
								<svelte:component
									this={option.icon}
									class="w-5 h-5 text-gray-600 dark:text-gray-400"
								/>
							</div>
						{/if}

						<!-- Content -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-medium text-gray-900 dark:text-white">
									{option.label}
								</h4>
								{#if selectedId === option.id}
									<Check class="w-4 h-4 text-primary-600 dark:text-primary-400" />
								{/if}
							</div>
							{#if option.description}
								<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
									{option.description}
								</p>
							{/if}
						</div>
					</div>
				</Button>
			{/each}
		</div>
	</div>

	<!-- Actions -->
	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<Button
			type="button"
			onclick={handleCancel}
			variant="secondary"
			size="md"
			class="order-2 sm:order-1 w-full sm:w-auto"
		>
			{cancelText}
		</Button>
		<Button
			type="button"
			onclick={handleConfirm}
			disabled={!allowEmpty && !selectedId}
			variant="primary"
			size="md"
			class="order-1 sm:order-2 w-full sm:w-auto"
		>
			{confirmText}
		</Button>
	</div>
</Modal>
