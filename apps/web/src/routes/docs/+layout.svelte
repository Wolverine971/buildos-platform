<!-- apps/web/src/routes/docs/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	import DocsLayout from '$lib/components/docs/DocsLayout.svelte';
	import { listDocSections } from '$lib/utils/docs';

	let { children }: { children?: Snippet } = $props();

	const sections = listDocSections();

	let activeSlug = $derived(($page.params as { slug?: string }).slug ?? null);

	let isApiRoute = $derived($page.url.pathname.startsWith('/docs/api'));
</script>

{#if isApiRoute}
	{#if children}
		{@render children()}
	{/if}
{:else}
	<DocsLayout {sections} {activeSlug}>
		{#if children}
			{@render children()}
		{/if}
	</DocsLayout>
{/if}
