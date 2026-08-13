<!-- apps/web/src/lib/components/ontology/EntityModalDetailsDrawer.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { PanelRightClose, PanelRightOpen } from '$lib/icons/lucide';

	interface Props {
		panelLabel: string;
		children: Snippet;
		mobileDetailsFirst?: boolean;
		showDesktopHeader?: boolean;
		class?: string;
	}

	let {
		panelLabel,
		children,
		mobileDetailsFirst = false,
		showDesktopHeader = false,
		class: className = ''
	}: Props = $props();

	const instanceId = $props.id();
	const panelId = `entity-modal-details-${instanceId}`;
	const toggleId = `${panelId}-toggle`;
	const isDesktop = new MediaQuery('(min-width: 1024px)', false);

	let open = $state(false);
	const hiddenFromDesktopFlow = $derived(isDesktop.current && !open);

	function togglePanel() {
		open = !open;
	}
</script>

<!-- The persistent handle stays on the right edge and follows the drawer seam. -->
<div
	class="pointer-events-none absolute top-1/2 -mt-14 z-20 hidden h-28 w-11 transition-[right] duration-[280ms] ease-out motion-reduce:transition-none lg:block {open
		? 'right-80 xl:right-96'
		: 'right-0'}"
>
	<button
		id={toggleId}
		type="button"
		onclick={togglePanel}
		class="pointer-events-auto group flex h-full w-full flex-col items-center justify-center gap-2 rounded-l-md border border-r-0 px-1 py-2 shadow-ink transition-colors motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {open
			? 'border-accent/50 bg-accent/10 text-foreground'
			: 'border-border-strong bg-muted/95 text-foreground hover:border-accent/50 hover:bg-card'} tx tx-strip tx-weak wt-paper"
		title={open ? `Close ${panelLabel}` : `Open ${panelLabel}`}
		aria-label={open ? `Close ${panelLabel}` : `Open ${panelLabel}`}
		aria-controls={panelId}
		aria-expanded={open}
	>
		{#if open}
			<PanelRightClose class="h-4 w-4 shrink-0 text-accent" />
		{:else}
			<PanelRightOpen
				class="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground motion-reduce:transition-none"
			/>
		{/if}
		<span class="micro-label rotate-180 [writing-mode:vertical-rl]">DETAILS</span>
	</button>
</div>

<!-- Reserve only the drawer's width. Keeping the content out of normal desktop flow prevents a
	 tall closed rail from making the modal body or comments region unnecessarily long. -->
<div
	aria-hidden="true"
	class="hidden lg:col-start-2 lg:row-start-1 lg:block lg:w-80 xl:w-96 transition-[margin-right] duration-[280ms] ease-out motion-reduce:transition-none {open
		? 'lg:mr-0'
		: 'lg:-mr-80 xl:-mr-96'}"
></div>

<aside
	id={panelId}
	aria-label={panelLabel}
	aria-hidden={hiddenFromDesktopFlow}
	inert={hiddenFromDesktopFlow}
	class="min-w-0 lg:absolute lg:inset-y-0 lg:right-0 lg:z-10 lg:w-80 xl:w-96 transition-[transform,visibility] duration-[280ms] ease-out motion-reduce:transition-none {mobileDetailsFirst
		? 'order-1 lg:order-none'
		: ''} {open ? 'lg:visible lg:translate-x-0' : 'lg:invisible lg:translate-x-full'}"
>
	<!-- Bound the sticky desktop rail to the standard modal's 85dvh content viewport after its
		 compact header, footer, and body padding. max-h-full protects shorter modal grids. -->
	<div
		class="min-w-0 lg:sticky lg:top-0 lg:flex lg:h-[calc(85dvh-10.125rem)] lg:max-h-full lg:min-h-0 lg:flex-col lg:overflow-hidden"
	>
		{#if showDesktopHeader}
			<div
				class="ml-4 hidden shrink-0 border-b border-border/70 bg-muted/95 px-3 py-2 tx tx-strip tx-weak lg:block"
			>
				<p class="micro-label text-foreground">{panelLabel.toUpperCase()}</p>
			</div>
		{/if}

		<div
			id={`${panelId}-content`}
			class="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:py-2 lg:pl-4 lg:[scrollbar-gutter:stable] {className}"
		>
			{@render children()}
		</div>
	</div>
</aside>
