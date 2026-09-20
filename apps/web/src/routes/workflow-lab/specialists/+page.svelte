<!-- apps/web/src/routes/workflow-lab/specialists/+page.svelte -->
<script lang="ts">
	import SpecialistWorkbench from '$lib/components/agent/SpecialistWorkbench.svelte';
	import { ArrowLeft } from '$lib/icons/lucide';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Specialist workbench · BuildOS</title>
	<meta
		name="description"
		content="Define specialist agents, add reference knowledge, and inspect immutable catalog versions."
	/>
</svelte:head>

<main class="mx-auto min-h-[calc(100dvh-5rem)] max-w-7xl space-y-6 px-4 py-6 sm:px-8">
	<header>
		<a
			href="/workflow-lab"
			class="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
			><ArrowLeft class="size-3.5" />Workflow lab</a
		>
		<p class="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
			BuildOS · Internal prototype
		</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
			Specialist workbench
		</h1>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
			Turn focused expertise into a reusable specialist. Shape its instructions, bring your
			own reference notes, and check what it will receive before publishing a version.
		</p>
	</header>
	{#key data.workbench}
		<SpecialistWorkbench initial={data.workbench} />
	{/key}
</main>
