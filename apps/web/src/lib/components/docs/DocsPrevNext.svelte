<!-- apps/web/src/lib/components/docs/DocsPrevNext.svelte -->
<script lang="ts">
	import { ArrowLeft, ArrowRight } from '$lib/icons/lucide';
	import type { DocSectionMeta } from '$lib/utils/docs';

	let { prev, next }: { prev: DocSectionMeta | null; next: DocSectionMeta | null } = $props();
</script>

<nav aria-label="Docs pagination" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
	{#if prev}
		<a
			href={'/docs/' + prev.slug}
			class="group block min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none pressable"
		>
			<span class="micro-label mb-1 flex items-center gap-1">
				<ArrowLeft class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				Previous
			</span>
			<span
				class="block line-clamp-2 text-sm font-medium text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
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
			class="group block min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none pressable sm:text-right"
		>
			<span class="micro-label mb-1 flex items-center gap-1 sm:justify-end">
				Next
				<ArrowRight class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			</span>
			<span
				class="block line-clamp-2 text-sm font-medium text-foreground transition-colors group-hover:text-accent motion-reduce:transition-none"
			>
				{next.title}
			</span>
		</a>
	{/if}
</nav>
