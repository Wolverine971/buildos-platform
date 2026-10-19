<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, children, footer }: { title: string; children?: Snippet; footer?: Snippet } = $props();
</script>
<div role="dialog" tabindex="-1" aria-label={title}>
	{@render children?.()}
	{@render footer?.()}
</div>
