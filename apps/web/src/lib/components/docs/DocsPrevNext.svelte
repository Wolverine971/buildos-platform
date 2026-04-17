<!-- apps/web/src/lib/components/docs/DocsPrevNext.svelte -->
<script lang="ts">
	import { ArrowLeft, ArrowRight } from 'lucide-svelte';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let {
		prev,
		next
	}: { prev: DocSectionMeta | null; next: DocSectionMeta | null } = $props();
</script>

<nav aria-label="Docs pagination" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
	{#if prev}
		<a
			href={'/docs/' + prev.slug}
			class="group block bg-card border border-border rounded-lg p-4 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable"
		>
			<span class="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
				<ArrowLeft class="w-3 h-3" />
				Previous
			</span>
			<span
				class="block text-sm font-medium text-foreground group-hover:text-accent transition-colors"
			>
				{prev.title}
			</span>
		</a>
	{:else}
		<span class="hidden sm:block"></span>
	{/if}

	{#if next}
		<a
			href={'/docs/' + next.slug}
			class="group block bg-card border border-border rounded-lg p-4 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable sm:text-right"
		>
			<span
				class="flex items-center gap-1 text-[11px] text-muted-foreground mb-1 sm:justify-end"
			>
				Next
				<ArrowRight class="w-3 h-3" />
			</span>
			<span
				class="block text-sm font-medium text-foreground group-hover:text-accent transition-colors"
			>
				{next.title}
			</span>
		</a>
	{/if}
</nav>
