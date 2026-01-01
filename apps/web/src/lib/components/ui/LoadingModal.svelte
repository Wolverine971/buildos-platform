<!-- apps/web/src/lib/components/ui/LoadingModal.svelte -->
<!--
	Inkprint LoadingModal Component (Svelte 5)
	- Migrated to Svelte 5 runes
	- Responsive padding
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { portal } from '$lib/actions/portal';

	interface Props {
		isOpen?: boolean;
		message?: string;
	}

	let { isOpen = false, message = 'Loading...' }: Props = $props();
</script>

{#if isOpen}
	<div use:portal class="loading-modal-root" transition:fade|global={{ duration: 150 }}>
		<div
			class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center"
		>
			<div
				class="bg-card rounded-lg p-3 sm:p-4 shadow-ink-strong border border-border transform tx tx-pulse tx-weak"
				transition:fade|global={{ duration: 150 }}
			>
				<div
					class="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-accent mx-auto"
				></div>
				<p class="mt-2 text-xs sm:text-sm text-muted-foreground text-center">{message}</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.loading-modal-root {
		position: fixed;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		z-index: 9999;
	}
</style>
