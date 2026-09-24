<!-- apps/web/src/routes/workflow-lab/compare/+page.svelte -->
<script lang="ts">
	import AnswerComparisonLab from '$lib/components/agent/AnswerComparisonLab.svelte';
	import { ArrowLeft } from '$lib/icons/lucide';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Compare answers · BuildOS</title>
	<meta
		name="description"
		content="Blind A/B compare answers from pilot runs or written text, vote without seeing who wrote what, then reveal identities and receipts."
	/>
</svelte:head>

<main class="mx-auto min-h-[calc(100dvh-5rem)] max-w-7xl space-y-6 bg-background px-4 py-6 sm:px-8">
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
			Compare answers
		</h1>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
			Pick answers that responded to the same question, vote on them blind, then reveal to see
			who wrote what and what it cost.
		</p>
	</header>
	{#key data.lab}
		<AnswerComparisonLab initial={data.lab} />
	{/key}
</main>
