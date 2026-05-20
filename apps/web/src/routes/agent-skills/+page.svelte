<!-- apps/web/src/routes/agent-skills/+page.svelte -->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import CategoryPage from '../blogs/[category]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let categoryPageData = $derived(data as unknown as ComponentProps<typeof CategoryPage>['data']);
</script>

<CategoryPage data={categoryPageData} />
