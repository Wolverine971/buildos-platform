<!-- apps/web/src/lib/components/blogs/BlogLayout.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

{#if children}
	{@render children()}
{/if}
