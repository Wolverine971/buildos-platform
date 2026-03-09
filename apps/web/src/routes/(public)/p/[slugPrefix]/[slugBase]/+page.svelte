<!-- apps/web/src/routes/(public)/p/[slugPrefix]/[slugBase]/+page.svelte -->
<script lang="ts">
	import PublicPage from '../../[slug]/+page.svelte';

	let { data } = $props();
</script>

<PublicPage {data} />
