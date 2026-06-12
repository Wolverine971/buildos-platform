<!-- apps/web/src/lib/components/ui/ToastContainer.svelte -->
<script lang="ts">
	import { toasts, toastService } from '$lib/stores/toast.store';
	import Toast from './Toast.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { cubicOut, cubicIn } from 'svelte/easing';

	function handleDismiss(id: string) {
		toastService.remove(id);
	}

	// Toasts are bottom-anchored below md (768px) and top-right above it; the
	// exit animation direction must match (slide down on mobile, slide right
	// on desktop).
	let viewportWidth = $state(0);
	const isBottomAnchored = $derived(viewportWidth > 0 && viewportWidth < 768);
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<!--
	Toast Container - Mobile-first positioning
	- Mobile: Bottom of screen (easier thumb access)
	- Desktop: Top-right (traditional, out of the way)
	- Safe area support for notched devices
-->
<div
	class="
		fixed z-[10000]
		flex flex-col pointer-events-none

		/* Mobile + landscape phones: Bottom positioning with safe areas */
		bottom-0 left-0 right-0
		pb-4 px-4
		gap-2
		items-center

		/* Tablet+ (md:768): Top-right positioning */
		md:top-4 md:right-4 md:bottom-auto md:left-auto
		md:pb-0 md:px-0
		md:items-end
		md:gap-3
	"
	style="
		padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
		padding-left: max(1rem, env(safe-area-inset-left, 0px));
		padding-right: max(1rem, env(safe-area-inset-right, 0px));
	"
>
	{#each $toasts as toast (toast.id)}
		<!--
			Animation strategy:
			- Mobile (bottom): Slide up from bottom
			- Desktop (top-right): Slide in from right
			- Use CSS to handle the responsive transition
		-->
		<div
			class="pointer-events-auto w-full md:w-auto"
			in:fly={{
				y: 20,
				x: 0,
				duration: 250,
				easing: cubicOut
			}}
			out:fly={{
				y: isBottomAnchored ? 20 : 0,
				x: isBottomAnchored ? 0 : 100,
				duration: 200,
				easing: cubicIn
			}}
			animate:flip={{ duration: 200 }}
		>
			<Toast {toast} ondismiss={handleDismiss} />
		</div>
	{/each}
</div>

<style>
	/* Ensure container doesn't block interactions when empty */
	div:empty {
		display: none;
	}
</style>
