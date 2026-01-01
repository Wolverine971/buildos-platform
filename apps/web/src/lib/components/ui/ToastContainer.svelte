<!-- apps/web/src/lib/components/ui/ToastContainer.svelte -->
<script lang="ts">
	import { toasts, toastService } from '$lib/stores/toast.store';
	import Toast from './Toast.svelte';

	function handleDismiss(id: string) {
		toastService.remove(id);
	}
</script>

<!-- Toast Container - Fixed position with safe area support -->
<div
	class="fixed top-4 right-4 left-4 sm:left-auto z-[200] flex flex-col gap-2 pointer-events-none"
	style="padding-top: env(safe-area-inset-top, 0); padding-right: env(safe-area-inset-right, 0);"
>
	{#each $toasts as toast (toast.id)}
		<div class="pointer-events-auto">
			<Toast {toast} ondismiss={handleDismiss} />
		</div>
	{/each}
</div>
