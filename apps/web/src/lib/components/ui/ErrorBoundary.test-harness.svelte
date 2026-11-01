<!-- apps/web/src/lib/components/ui/ErrorBoundary.test-harness.svelte -->
<script lang="ts">
	import ErrorBoundary from './ErrorBoundary.svelte';

	let { shouldFail, resetKey }: { shouldFail: () => boolean; resetKey?: unknown } = $props();

	function content() {
		if (shouldFail()) throw new Error('boom');
		return 'Loaded content';
	}
</script>

<p>Sibling stays</p>
<ErrorBoundary area="test-area" context={{ itemId: 'item-1' }} {resetKey}>
	<p>{content()}</p>
</ErrorBoundary>
