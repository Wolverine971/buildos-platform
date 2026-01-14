<!-- apps/web/src/lib/components/ui/InfoModal.svelte -->
<script lang="ts">
	import { Info } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen?: boolean;
		title?: string;
		buttonText?: string;
		showIcon?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		children?: Snippet;
		footer?: Snippet;
		// Svelte 5 callback props (preferred)
		onclose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		title = 'Information',
		buttonText = 'Got it',
		showIcon = true,
		size = 'sm',
		children: slotContent,
		footer: slotFooter,
		onclose
	}: Props = $props();

	function handleClose() {
		isOpen = false;
		onclose?.();
	}
</script>

<Modal bind:isOpen {title} {size} onClose={handleClose}>
	{#snippet children()}
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
						{#if slotContent}
							{@render slotContent()}
						{/if}
					</div>
				</div>
			{:else if slotContent}
				{@render slotContent()}
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		{#if slotFooter}
			{@render slotFooter()}
		{:else}
			<div
				class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
			>
				<Button onclick={handleClose} variant="primary" size="md" class="w-full sm:w-auto">
					{buttonText}
				</Button>
			</div>
		{/if}
	{/snippet}
</Modal>
