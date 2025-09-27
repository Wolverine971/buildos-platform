<!-- src/lib/components/ui/ToastContainer.svelte -->
<script lang="ts">
	import { toasts, toastService } from '$lib/stores/toast.store';
	import Toast from './Toast.svelte';

	function handleDismiss(event: CustomEvent<string>) {
		toastService.remove(event.detail);
	}
</script>

<!-- Toast Container - Fixed position in top right -->
<div class="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
	{#each $toasts as toast (toast.id)}
		<div class="pointer-events-auto">
			<Toast {toast} on:dismiss={handleDismiss} />
		</div>
	{/each}
</div>
