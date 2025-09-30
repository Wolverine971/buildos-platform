<!-- apps/web/src/lib/components/brain-dump/TextVirtualizer.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createVirtualScroller } from '$lib/utils/performance-optimization';

	export let text: string = '';
	export let containerHeight: number = 400;
	export let lineHeight: number = 24;
	export let className: string = '';

	let container: HTMLElement;
	let scrollTop = 0;
	let lines: string[] = [];
	let visibleLines: { line: string; index: number }[] = [];
	let virtualHeight = 0;
	let offsetY = 0;

	// Create virtual scroller instance
	$: virtualScroller = createVirtualScroller(containerHeight, lineHeight, 5);

	// Split text into lines and calculate virtual height
	$: {
		lines = text.split('\n');
		virtualHeight = virtualScroller.getScrollHeight(lines.length);
		updateVisibleLines();
	}

	function updateVisibleLines() {
		if (lines.length === 0) {
			visibleLines = [];
			offsetY = 0;
			return;
		}

		const { startIndex, endIndex } = virtualScroller.getVisibleRange(scrollTop, lines.length);
		offsetY = virtualScroller.getOffsetY(startIndex);

		visibleLines = [];
		for (let i = startIndex; i <= endIndex; i++) {
			if (i < lines.length) {
				visibleLines.push({
					line: lines[i],
					index: i
				});
			}
		}
	}

	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;
		scrollTop = target.scrollTop;
		updateVisibleLines();
	}

	onMount(() => {
		updateVisibleLines();
	});
</script>

<div
	bind:this={container}
	class="text-virtualizer {className}"
	style="height: {containerHeight}px; overflow-y: auto;"
	on:scroll={handleScroll}
>
	<!-- Virtual scrollable content -->
	<div style="height: {virtualHeight}px; position: relative;">
		<!-- Visible lines container -->
		<div
			style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
		>
			{#each visibleLines as { line, index } (index)}
				<div
					class="line optimized-text"
					style="height: {lineHeight}px; line-height: {lineHeight}px; padding: 0 8px; word-wrap: break-word;"
					data-line-index={index}
				>
					{line || '\u00A0'}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.text-virtualizer {
		contain: layout style paint;
		will-change: scroll-position;
		/* Optimize scrolling performance */
		-webkit-overflow-scrolling: touch;
		scroll-behavior: auto; /* Disable smooth scrolling for virtualization */
	}

	.line {
		/* Optimize text rendering for performance */
		text-rendering: optimizeSpeed;
		contain: layout style;
	}

	/* Better scrollbar styling */
	.text-virtualizer::-webkit-scrollbar {
		width: 8px;
	}

	.text-virtualizer::-webkit-scrollbar-track {
		background: transparent;
	}

	.text-virtualizer::-webkit-scrollbar-thumb {
		background: rgba(156, 163, 175, 0.5);
		border-radius: 4px;
	}

	.text-virtualizer::-webkit-scrollbar-thumb:hover {
		background: rgba(156, 163, 175, 0.7);
	}

	.dark .text-virtualizer::-webkit-scrollbar-thumb {
		background: rgba(75, 85, 99, 0.5);
	}

	.dark .text-virtualizer::-webkit-scrollbar-thumb:hover {
		background: rgba(75, 85, 99, 0.7);
	}
</style>
