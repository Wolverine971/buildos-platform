<!-- apps/web/src/routes/projects/[id]/consolidate/[run_id]/+page.svelte -->
<script lang="ts">
	import ConsolidationRun from '$lib/components/consolidation/ConsolidationRun.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Consolidate docs · {data.projectName} | BuildOS</title>
</svelte:head>

<main class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	{#key data.view.run.id}
		<ConsolidationRun initial={data.view} projectName={data.projectName} />
	{/key}
</main>
