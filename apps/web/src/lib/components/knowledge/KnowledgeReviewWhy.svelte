<!-- apps/web/src/lib/components/knowledge/KnowledgeReviewWhy.svelte -->
<!--
	Why a set of entries is in the duplicates review: the reason the question was asked ("Same
	last name, similar first name"), then what the entries share and where they differ, from what
	is saved on them. Renders nothing when there is nothing to say.
-->
<script lang="ts">
	import { Check, TriangleAlert } from '$lib/icons/lucide';
	import type { KnowledgeReviewEvidence } from './knowledge-client';

	interface Props {
		reason?: string | null;
		evidence?: KnowledgeReviewEvidence | null;
	}

	let { reason = null, evidence = null }: Props = $props();
</script>

{#if reason || evidence?.same.length || evidence?.different.length}
	<div class="flex flex-col gap-1 text-xs">
		{#if reason}
			<p class="break-words text-muted-foreground">
				<span class="font-medium text-foreground">Why it's here:</span>
				{reason}
			</p>
		{/if}
		{#if evidence?.same.length}
			<p class="flex items-start gap-1.5 break-words text-foreground">
				<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
				<span><span class="font-medium">In common:</span> {evidence.same.join(' · ')}</span>
			</p>
		{/if}
		{#if evidence?.different.length}
			<p class="flex items-start gap-1.5 break-words text-foreground">
				<TriangleAlert
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
					aria-hidden="true"
				/>
				<span
					><span class="font-medium">Different:</span>
					{evidence.different.join(' · ')}</span
				>
			</p>
		{/if}
	</div>
{/if}
