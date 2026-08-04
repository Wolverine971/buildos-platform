<!-- apps/web/src/lib/components/docs/DocsLayout.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DocSectionMeta } from '$lib/utils/docs';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';

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
	<div class="mx-auto max-w-7xl px-2 py-6 sm:px-4 sm:py-10 lg:px-6">
		<div class="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
			<aside class="lg:sticky lg:top-6 lg:self-start">
				<DocsSidebar {sections} {activeSlug} />
			</aside>

			<div id="docs-main" class="min-w-0">
				{#if children}
					{@render children()}
				{/if}
			</div>
		</div>
	</div>
</div>
