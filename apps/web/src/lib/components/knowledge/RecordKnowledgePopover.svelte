<!-- apps/web/src/lib/components/knowledge/RecordKnowledgePopover.svelte -->
<!--
	The knowledge card for a name in a doc, task or chat: loads KnowledgeCardPopover in its own
	chunk once the record has names, then shows it for whichever name was clicked (tasker 160).
	A tagged name (tasker 167) also gets a light peek on hover and a "Remove tag" footer that
	untags that one spot (remembered there, with Undo).
	In a shared project (tasker 168) the card adds "Also in this project" (other members' People),
	and a name only another member has filed opens their "From Alice's People" card with Ask.
-->
<script lang="ts">
	import { Tag, X } from '$lib/icons/lucide';
	import KnowledgeMentionPeek from './KnowledgeMentionPeek.svelte';
	import {
		LENS_ID_PREFIX,
		type RecordKnowledgeMentions
	} from './record-knowledge-mentions.svelte';

	interface Props {
		mentions: RecordKnowledgeMentions;
		/** "doc" or "task", for the footer's wording. */
		where?: string;
	}

	// No "In this doc" line: the name sits in the text being read, and doc quotes are windows of
	// surrounding text, not a sentence about the name.
	let { mentions, where = 'doc' }: Props = $props();

	let deps = $state<typeof import('./record-knowledge-deps') | null>(null);
	$effect(() => {
		if (
			deps ||
			(!mentions.mentions.length && !mentions.tags.length && !mentions.lens?.entries.length)
		)
			return;
		void import('./record-knowledge-deps').then((module) => (deps = module));
	});

	const open = $derived(mentions.openMention);
	const openTagId = $derived(mentions.open?.tagId ?? null);
	const peek = $derived(mentions.peek);
	const peekEntry = $derived(mentions.peekEntry);
	const lensOnly = $derived(open?.entity_id.startsWith(LENS_ID_PREFIX) ?? false);
	const lensEntries = $derived(mentions.lensFor(open));
</script>

{#if deps}
	<deps.KnowledgeCardPopover
		anchor={open && !lensOnly ? (mentions.open?.anchor ?? null) : null}
		rootId={open && !lensOnly ? open.entity_id : null}
		label="About {open?.name ?? ''}"
		onClose={() => mentions.close()}
		onRemoved={(id) => mentions.forget(id)}
		onChanged={() => mentions.refresh()}
	>
		{#snippet footer({ depth }: { depth: number })}
			{#if deps && depth === 1 && lensEntries.length && mentions.lens}
				<deps.KnowledgeLensSection
					entries={lensEntries}
					projectId={mentions.lens.projectId}
					heading="also"
				/>
			{/if}
			{#if depth === 1 && openTagId}
				<div
					class="flex items-center justify-between gap-2 border-t border-border px-4 py-2"
				>
					<p class="min-w-0 text-xs text-muted-foreground">
						Tagged here in this {where}
					</p>
					<button
						type="button"
						class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						onclick={() => void mentions.removeTag(openTagId)}
					>
						<Tag class="h-3.5 w-3.5" aria-hidden="true" /> Remove tag
					</button>
				</div>
			{/if}
		{/snippet}
	</deps.KnowledgeCardPopover>

	{#if open && lensOnly && mentions.open && mentions.lens}
		<deps.TablePopover
			anchor={mentions.open.anchor}
			label="About {open.name}"
			width="w-96"
			onClose={() => mentions.close()}
		>
			<div class="flex items-start gap-2 px-4 pt-3.5">
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-foreground">{open.name}</p>
					<p class="text-xs text-muted-foreground">
						Not in your knowledge. Others in this project have them.
					</p>
				</div>
				<button
					type="button"
					class="-mr-1.5 -mt-1 inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Close"
					onclick={() => mentions.close()}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="mt-3">
				<deps.KnowledgeLensSection
					entries={lensEntries}
					projectId={mentions.lens.projectId}
				/>
			</div>
		</deps.TablePopover>
	{/if}
{/if}

{#if peek && peekEntry}
	<KnowledgeMentionPeek
		anchor={peek.anchor}
		name={peekEntry.name}
		kind={peekEntry.kind}
		summary={peekEntry.summary}
	/>
{/if}
