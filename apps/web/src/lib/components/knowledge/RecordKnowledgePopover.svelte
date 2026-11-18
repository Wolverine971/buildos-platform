<!-- apps/web/src/lib/components/knowledge/RecordKnowledgePopover.svelte -->
<!--
	The knowledge card for a name in a doc (or chat): loads KnowledgeCardPopover in its own chunk
	once the record has names, then shows it for whichever name was clicked (tasker 160).
-->
<script lang="ts">
	import type { RecordKnowledgeMentions } from './record-knowledge-mentions.svelte';

	interface Props {
		mentions: RecordKnowledgeMentions;
	}

	// No "In this doc" line: the name sits in the text being read, and doc quotes are windows of
	// surrounding text, not a sentence about the name.
	let { mentions }: Props = $props();

	let Popover = $state<typeof import('./KnowledgeCardPopover.svelte').default | null>(null);
	$effect(() => {
		if (Popover || !mentions.mentions.length) return;
		void import('./KnowledgeCardPopover.svelte').then((module) => (Popover = module.default));
	});

	const open = $derived(mentions.openMention);
</script>

{#if Popover}
	<Popover
		anchor={open ? (mentions.open?.anchor ?? null) : null}
		rootId={open?.entity_id ?? null}
		label="About {open?.name ?? ''}"
		onClose={() => mentions.close()}
		onRemoved={(id) => mentions.forget(id)}
	/>
{/if}
