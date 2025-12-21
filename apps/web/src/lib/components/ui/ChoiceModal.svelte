<!-- apps/web/src/lib/components/ui/ChoiceModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Check } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import type { Snippet, Component } from 'svelte';

	interface ChoiceOption {
		id: string;
		label: string;
		description?: string;
		icon?: Component<{ class?: string }>;
		disabled?: boolean;
	}

	interface Props {
		isOpen?: boolean;
		title?: string;
		options?: ChoiceOption[];
		selectedId?: string;
		confirmText?: string;
		cancelText?: string;
		allowEmpty?: boolean;
		description?: Snippet;
		// Svelte 5 callback props (preferred)
		onconfirm?: (data: { selectedId: string }) => void;
		oncancel?: () => void;
	}

	let {
		isOpen = false,
		title = 'Choose an Option',
		options = [],
		selectedId = $bindable(''),
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		allowEmpty = false,
		description,
		onconfirm,
		oncancel
	}: Props = $props();

	// Legacy event dispatcher for backwards compatibility
	const dispatch = createEventDispatcher<{
		confirm: { selectedId: string };
		cancel: void;
	}>();

	function handleConfirm() {
		if (!allowEmpty && !selectedId) return;
		onconfirm?.({ selectedId });
		dispatch('confirm', { selectedId });
	}

	function handleCancel() {
		oncancel?.();
		dispatch('cancel');
	}

	function selectOption(id: string) {
		selectedId = id;
	}
</script>

<Modal {isOpen} {title} size="sm" onClose={handleCancel}>
	{#snippet children()}
		<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
			<!-- Description snippet -->
			{#if description}
				{@render description()}
			{/if}

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
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'} {option.disabled
							? 'opacity-50 cursor-not-allowed'
							: 'hover:bg-muted/50'}"
					>
						<div class="flex items-start space-x-3">
							<!-- Icon -->
							{#if option.icon}
								<div class="flex-shrink-0 mt-1">
									<svelte:component
										this={option.icon}
										class="w-5 h-5 text-muted-foreground"
									/>
								</div>
							{/if}

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between">
									<h4 class="text-sm font-medium text-foreground">
										{option.label}
									</h4>
									{#if selectedId === option.id}
										<Check class="w-4 h-4 text-accent" />
									{/if}
								</div>
								{#if option.description}
									<p class="text-xs text-muted-foreground mt-1">
										{option.description}
									</p>
								{/if}
							</div>
						</div>
					</Button>
				{/each}
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-col sm:flex-row gap-3 sm:justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
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
	{/snippet}
</Modal>
