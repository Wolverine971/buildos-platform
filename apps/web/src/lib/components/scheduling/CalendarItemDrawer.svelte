<!-- apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';

	export let isOpen = false;
	export let title = '';
	export let subtitle = '';
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
			class="absolute right-0 top-0 h-full w-full max-w-lg border-l border-border bg-background shadow-xl"
			in:fly={{ x: 400, duration: 180 }}
			out:fly={{ x: 400, duration: 160 }}
		>
			<header class="border-b border-border px-5 py-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<h2 class="text-base font-semibold text-foreground leading-tight truncate">
							{title}
						</h2>
						{#if subtitle}
							<p class="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
						{/if}
					</div>
					<button
						class="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
						aria-label="Close drawer"
						onclick={onClose}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</header>
			<div class="h-[calc(100%-4.5rem)] overflow-y-auto px-5 py-4">
				<slot />
			</div>
		</aside>
	</div>
{/if}
