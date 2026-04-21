<!-- apps/web/src/lib/components/docs/DocsLayout.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DocSectionMeta } from '$lib/utils/docs';
	import DocsSidebar from './DocsSidebar.svelte';

	let {
		sections,
		activeSlug = null,
		children
	}: {
		sections: DocSectionMeta[];
		activeSlug?: string | null;
		children?: Snippet;
	} = $props();
</script>

<div class="min-h-screen bg-background">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
		<div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 lg:gap-8">
			<aside class="order-2 lg:order-1 lg:sticky lg:top-6 lg:self-start">
				<DocsSidebar {sections} {activeSlug} />
			</aside>

			<main id="docs-main" class="order-1 lg:order-2 min-w-0">
				{#if children}
					{@render children()}
				{/if}
			</main>
		</div>
	</div>
</div>
