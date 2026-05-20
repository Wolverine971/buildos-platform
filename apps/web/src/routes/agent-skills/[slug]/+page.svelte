<!-- apps/web/src/routes/agent-skills/[slug]/+page.svelte -->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import ArticlePage from '../../blogs/[category]/[slug]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let articlePageData = $derived(data as unknown as ComponentProps<typeof ArticlePage>['data']);
</script>

<ArticlePage data={articlePageData} />
