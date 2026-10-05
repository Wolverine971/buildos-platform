<!-- apps/web/src/lib/components/tables/TablePopover.svelte -->
<!--
	Anchored floating panel for table menus (column, row, filters, provenance).
	Portaled to <body> so the grid's scroll container and modal wrappers never
	clip it; a bottom sheet on phones. Esc and outside clicks close it, and Esc
	is marked handled so a host modal only peels one layer.
-->
<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { portal } from '$lib/actions/portal';

	let {
		anchor,
		onClose,
		label,
		width = 'w-72',
		placement = 'below-start',
		returnFocus = true,
		children
	}: {
		/** The trigger element (focus returns to it) or a rect to sit beside. */
		anchor: HTMLElement | DOMRect | null;
		onClose: () => void;
		label: string;
		/** Width utility for the desktop panel. */
		width?: string;
		placement?: 'below-start' | 'below-end';
		returnFocus?: boolean;
		children: Snippet;
	} = $props();

	let panel = $state<HTMLDivElement | null>(null);
	let panelWidth = $state(0);
	let panelHeight = $state(0);
	let viewportWidth = $state(1024);
	let viewportHeight = $state(768);
	const sheet = $derived(viewportWidth < 640);

	function anchorRect(): DOMRect | null {
		if (!anchor) return null;
		if (anchor instanceof DOMRect) return anchor;
		return anchor.getBoundingClientRect();
	}

	let rect = $state<DOMRect | null>(null);

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), Math.max(min, max));
	}

	const position = $derived.by(() => {
		if (sheet || !rect) return { left: 16, top: 16 };
		const desiredLeft = placement === 'below-end' ? rect.right - panelWidth : rect.left;
		const left = clamp(desiredLeft, 12, viewportWidth - panelWidth - 12);
		const below = rect.bottom + 6;
		const top =
			below + panelHeight <= viewportHeight - 12
				? below
				: clamp(rect.top - panelHeight - 6, 12, viewportHeight - panelHeight - 12);
		return { left, top };
	});

	function updateRect() {
		rect = anchorRect();
	}

	onMount(() => {
		updateRect();
		const trigger = anchor instanceof HTMLElement ? anchor : null;
		void tick().then(() => {
			const target = panel?.querySelector<HTMLElement>(
				'[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
			);
			(target ?? panel)?.focus({ preventScroll: true });
		});
		const onScroll = (event: Event) => {
			// Scrolling inside the panel is fine; scrolling the page/grid re-anchors.
			if (panel && event.target instanceof Node && panel.contains(event.target)) return;
			updateRect();
		};
		window.addEventListener('scroll', onScroll, true);
		return () => {
			window.removeEventListener('scroll', onScroll, true);
			if (returnFocus && trigger && document.contains(trigger)) {
				trigger.focus({ preventScroll: true });
			}
		};
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
		}
	}

	function handleBackdrop(event: PointerEvent) {
		event.preventDefault();
		onClose();
	}
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	bind:innerHeight={viewportHeight}
	onresize={updateRect}
/>

<div use:portal class="table-popover-root">
	<div
		class="fixed inset-0 z-[10000] {sheet ? 'bg-foreground/20' : ''}"
		role="presentation"
		onpointerdown={handleBackdrop}
	></div>
	<div
		bind:this={panel}
		bind:offsetWidth={panelWidth}
		bind:offsetHeight={panelHeight}
		class="fixed z-[10001] flex max-h-[min(32rem,calc(100dvh-2rem))] flex-col overflow-y-auto border border-border bg-card text-foreground shadow-ink-strong tx tx-frame tx-weak motion-safe:animate-ink-in
			{sheet
			? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]'
			: `${width} max-w-[calc(100vw-1.5rem)] rounded-lg`}"
		style:left={sheet ? undefined : `${position.left}px`}
		style:top={sheet ? undefined : `${position.top}px`}
		style:visibility={!sheet && !rect ? 'hidden' : undefined}
		role="dialog"
		aria-label={label}
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		{#if sheet}
			<div
				class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border"
				aria-hidden="true"
			></div>
		{/if}
		{@render children()}
	</div>
</div>
