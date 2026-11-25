<!-- apps/web/src/lib/components/knowledge/KnowledgeSourceTags.svelte -->
<!--
	Where an entry came from, as small quiet tags: LinkedIn, your own work (tasks, docs, chats),
	another contact import, a web search. "Added by hand" has no tag: it is the absence of the
	others. Renders nothing for an entry with no source to show.
-->
<script lang="ts">
	import { BookUser, Globe, Linkedin, ListChecks } from '$lib/icons/lucide';
	import { KNOWLEDGE_SOURCE_LABEL, type KnowledgeSource } from './knowledge-client';

	interface Props {
		sources: readonly KnowledgeSource[] | undefined;
		/** Leave these out (the list hides the source it is already filtered to). */
		except?: KnowledgeSource | null;
	}

	let { sources, except = null }: Props = $props();

	const ICON = {
		work: ListChecks,
		linkedin: Linkedin,
		contacts: BookUser,
		research: Globe
	} as const;

	const shown = $derived(
		(sources ?? []).filter(
			(source): source is keyof typeof ICON => source !== 'manual' && source !== except
		)
	);
</script>

{#each shown as source (source)}
	{@const Icon = ICON[source]}
	<span
		class="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground"
	>
		<Icon class="h-3 w-3" aria-hidden="true" />
		{KNOWLEDGE_SOURCE_LABEL[source].tag}
	</span>
{/each}
