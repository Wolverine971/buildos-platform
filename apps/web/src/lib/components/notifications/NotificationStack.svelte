<!-- apps/web/src/lib/components/notifications/NotificationStack.svelte -->
<script lang="ts">
	/**
	 * Notification Stack
	 *
	 * Floating tiles for minimized notifications in the bottom-right corner.
	 * - One tile shows as-is from sm up, so running progress stays visible.
	 * - COLLAPSE_AT+ tiles fold into a deck: the newest tile in front, the rest peeking
	 *   out above it. A toggle under the deck opens every tile in a scrollable column
	 *   (scrollbar hidden; edge fades show when more tiles are out of view).
	 * - Phones only get the toggle while collapsed — even one tile covers the page there.
	 * - The toggle stays below the column so it sits under the pointer/thumb as the
	 *   column opens upward; DOM order matches visual order for keyboard users.
	 */

	import { fly } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { Notification } from '$lib/types/notification.types';
	import { Bell, ChevronDown, ChevronUp } from '$lib/icons/lucide';
	import MinimizedNotification from './MinimizedNotification.svelte';

	let {
		stack,
		notifications,
		expandedId
	}: {
		stack: string[];
		notifications: Map<string, Notification>;
		expandedId: string | null;
	} = $props();

	const COLLAPSE_AT = 2;
	const MAX_PEEKS = 2;
	const PEEK_OFFSET = 8;
	const LIST_ID = 'notification-stack-list';

	let open = $state(false);
	let scroller = $state<HTMLDivElement | null>(null);
	let fadeTop = $state(false);
	let fadeBottom = $state(false);

	// Oldest → newest; the tile open in the modal isn't also shown in the stack.
	let tiles = $derived(
		stack
			.filter((id) => id !== expandedId)
			.map((id) => notifications.get(id))
			.filter((notification): notification is Notification => Boolean(notification))
	);
	let count = $derived(tiles.length);
	let collapsible = $derived(count >= COLLAPSE_AT);
	let front = $derived(tiles.at(-1));
	let peekCount = $derived(Math.min(count - 1, MAX_PEEKS));
	let countLabel = $derived(`${count} ${count === 1 ? 'update' : 'updates'}`);

	// An emptied stack resets, so the next pile-up starts collapsed again.
	$effect(() => {
		if (count === 0) open = false;
	});

	// Opening (or a new tile arriving while open) lands on the newest tiles, right above the toggle.
	$effect(() => {
		void count;
		if (!open || !scroller) return;
		scroller.scrollTop = scroller.scrollHeight;
		updateFades();
	});

	function updateFades() {
		if (!scroller) return;
		const { scrollTop, scrollHeight, clientHeight } = scroller;
		fadeTop = scrollTop > 4;
		fadeBottom = scrollTop + clientHeight < scrollHeight - 4;
	}

	let fadeMask = $derived.by(() => {
		if (!fadeTop && !fadeBottom) return '';
		const top = fadeTop ? 'transparent 0, #000 28px' : '#000 0';
		const bottom = fadeBottom ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%';
		const gradient = `linear-gradient(to bottom, ${top}, ${bottom})`;
		return `mask-image: ${gradient}; -webkit-mask-image: ${gradient};`;
	});

	function stackMotion(): { y: number; duration: number } {
		return prefersReducedMotion.current ? { y: 0, duration: 0 } : { y: 20, duration: 180 };
	}
</script>

{#if count > 0}
	<div
		class="pointer-events-auto fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
		role="region"
		aria-label="Notification stack"
	>
		<!-- Open column (or a lone tile from sm up). -->
		<div
			bind:this={scroller}
			id={LIST_ID}
			onscroll={updateFades}
			style={fadeMask}
			class="-m-1.5 max-h-[min(70dvh,calc(100dvh-6rem))] flex-col gap-2 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden {open
				? 'flex'
				: 'hidden'} {collapsible ? '' : 'sm:flex'}"
		>
			{#if open || !collapsible}
				{#each tiles as notification (notification.id)}
					<div class="shrink-0" transition:fly={stackMotion()}>
						<MinimizedNotification {notification} />
					</div>
				{/each}
			{/if}
		</div>

		<!-- Collapsed deck (sm+): newest tile in front, older ones peeking out above it. -->
		{#if collapsible && !open && front}
			<div class="relative hidden sm:block" style="margin-top: {peekCount * PEEK_OFFSET}px">
				{#each Array.from({ length: peekCount }, (_, index) => index + 1) as depth (depth)}
					<div
						class="absolute inset-0 rounded-lg border border-foreground/15 bg-muted shadow-ink"
						style="transform-origin: top center; transform: translateY(-{depth *
							PEEK_OFFSET}px) scale({1 - depth * 0.05}); z-index: {MAX_PEEKS -
							depth}; opacity: {1 - depth * 0.3};"
						aria-hidden="true"
					></div>
				{/each}
				<div class="relative" style="z-index: {MAX_PEEKS + 1}">
					<MinimizedNotification notification={front} />
				</div>
			</div>
		{/if}

		<!-- Phones always get the toggle; from sm up only a collapsible stack needs it. -->
		<button
			type="button"
			class="inline-flex items-center gap-1.5 self-end rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-ink-strong pressable transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background {collapsible
				? ''
				: 'sm:hidden'}"
			aria-expanded={open}
			aria-controls={LIST_ID}
			onclick={() => (open = !open)}
		>
			{#if open}
				<ChevronDown class="h-3.5 w-3.5" />
				Show less
			{:else}
				<Bell class="h-3.5 w-3.5 text-accent" />
				{countLabel}
				<ChevronUp class="h-3.5 w-3.5 text-muted-foreground" />
			{/if}
		</button>
	</div>
{/if}
