<!-- apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { portal } from '$lib/actions/portal';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import type { Snippet } from 'svelte';

	let {
		isOpen = false,
		title = '',
		subtitle = '',
		onClose = () => {},
		children
	}: {
		isOpen?: boolean;
		title?: string;
		subtitle?: string;
		onClose?: () => void;
		children?: Snippet;
	} = $props();

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key !== 'Escape') return;
		// Base Modals stack above this drawer and route Escape to their topmost
		// instance; if any is open, the drawer must not also close underneath it.
		if (document.querySelector('.modal-root')) return;
		onClose();
	}

	// Ref-counted body scroll lock (iOS-safe position:fixed technique).
	$effect(() => {
		if (!browser || !isOpen) return;
		lockBodyScroll();
		return () => unlockBodyScroll();
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="fixed inset-0 z-50">
		<button class="absolute inset-0 bg-black/30" aria-label="Close drawer" onclick={onClose}
		></button>
		<aside
			class="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-ink-strong tx tx-frame tx-weak"
			in:fly={{ x: 400, duration: 180 }}
			out:fly={{ x: 400, duration: 160 }}
		>
			<header
				class="shrink-0 border-b border-border px-4 py-3 bg-muted/30 tx tx-strip tx-weak"
			>
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
			<div
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
			>
				{@render children?.()}
			</div>
		</aside>
	</div>
{/if}
