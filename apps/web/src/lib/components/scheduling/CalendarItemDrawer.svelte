<!-- apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';

	export let isOpen = false;
	export let title = '';
	export let onClose: () => void = () => {};

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			onClose();
		}
	}

	onMount(() => {
		const handler = (event: KeyboardEvent) => handleKeydown(event);
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50">
		<button class="absolute inset-0 bg-black/30" aria-label="Close drawer" onclick={onClose} />
		<aside
			class="absolute right-0 top-0 h-full w-full max-w-md border-l border-border bg-background shadow-xl"
			in:fly={{ x: 320, duration: 180 }}
			out:fly={{ x: 320, duration: 160 }}
		>
			<header class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">{title}</h2>
				<button
					class="rounded-md p-1 text-muted-foreground hover:text-foreground"
					aria-label="Close drawer"
					onclick={onClose}
				>
					<X class="h-4 w-4" />
				</button>
			</header>
			<div class="h-full overflow-y-auto px-4 py-4">
				<slot />
			</div>
		</aside>
	</div>
{/if}
