<!-- apps/web/src/lib/components/ui/LoadingModal.svelte -->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { portal } from '$lib/actions/portal';

	export let isOpen = false;
	export let message = 'Loading...';
</script>

{#if isOpen}
	<div use:portal class="loading-modal-root" transition:fade|global={{ duration: 150 }}>
		<div
			class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center"
		>
			<div
				class="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-xl transform"
				transition:fade|global={{ duration: 150 }}
			>
				<div
					class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"
				></div>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	.loading-modal-root {
		position: fixed;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		z-index: 9999;
	}
</style>
