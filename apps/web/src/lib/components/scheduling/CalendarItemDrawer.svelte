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
		<button class="absolute inset-0 bg-black/30" aria-label="Close drawer" onclick={onClose}
		></button>
		<aside
			class="absolute right-0 top-0 h-full w-full max-w-lg border-l border-border bg-background shadow-ink-strong tx tx-frame tx-weak"
			in:fly={{ x: 400, duration: 180 }}
			out:fly={{ x: 400, duration: 160 }}
		>
			<header class="border-b border-border px-4 py-3 bg-muted/30 tx tx-strip tx-weak">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h2 class="text-sm font-semibold text-foreground leading-tight truncate">
							{title}
						</h2>
						{#if subtitle}
							<p
								class="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
							>
								{subtitle}
							</p>
						{/if}
					</div>
					<button
						class="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted pressable transition-colors"
						aria-label="Close drawer"
						onclick={onClose}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</header>
			<div class="h-[calc(100%-3.5rem)] overflow-y-auto px-4 py-3">
				<slot />
			</div>
		</aside>
	</div>
{/if}
