<!-- apps/web/src/routes/projects/[id]/consolidate/[run_id]/+page.svelte -->
<script lang="ts">
	import ConsolidationRun from '$lib/components/consolidation/ConsolidationRun.svelte';

	let { data } = $props();
	const heading = $derived(
		data.view.run.mode === 'check' ? 'Duplicate check' : 'Consolidate docs'
	);
</script>

<svelte:head>
	<title>{heading} · {data.projectName} | BuildOS</title>
</svelte:head>

<main class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	{#key data.view.run.id}
		<ConsolidationRun
			initial={data.view}
			projectName={data.projectName}
			scopeIsFamily={data.scopeIsFamily}
		/>
	{/key}
</main>
