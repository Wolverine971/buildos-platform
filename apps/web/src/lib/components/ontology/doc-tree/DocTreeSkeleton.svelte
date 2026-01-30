<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeSkeleton.svelte -->
<!--
	Loading skeleton for document tree
-->
<script lang="ts">
	interface Props {
		count?: number;
	}

	let { count = 5 }: Props = $props();

	// Generate varied indentation for realistic look
	const items = $derived(
		Array.from({ length: count }, (_, i) => ({
			indent: i === 0 ? 0 : i === 1 ? 0 : i === 2 ? 1 : i === 3 ? 1 : 2,
			width: 40 + Math.random() * 40 // 40-80% width
		}))
	);
</script>

<div class="space-y-1 py-2 px-2">
	{#each items as item, i}
		<div class="flex items-center gap-2 py-1.5" style="padding-left: {item.indent * 16 + 8}px">
			<!-- Chevron placeholder -->
			<div class="w-4 h-4 rounded bg-muted/50 animate-pulse"></div>
			<!-- Icon placeholder -->
			<div class="w-4 h-4 rounded bg-muted/50 animate-pulse"></div>
			<!-- Title placeholder -->
			<div
				class="h-4 rounded bg-muted/50 animate-pulse"
				style="width: {item.width}%; animation-delay: {i * 50}ms"
			></div>
		</div>
	{/each}
</div>
