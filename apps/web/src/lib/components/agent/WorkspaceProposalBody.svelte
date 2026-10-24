<!-- apps/web/src/lib/components/agent/WorkspaceProposalBody.svelte -->
<!--
	The Workspace cards' body (tasker 146): the loose items that would move, by title,
	into an existing project (filing) or into a new one (start a project). Built from
	the card's structured fields only; nothing moves until the user chooses.
	INKPRINT: inset inside the card's Frame. Grain for filing into ongoing work, Bloom
	for a new project.
-->
<script lang="ts">
	import { CircleCheck, FileText, StickyNote } from '$lib/icons/lucide';
	import type { WorkspaceItemV1 } from '@buildos/shared-agent-ops/chat-cards/proposal-card';
	import { workspaceItemKindLabel, workspaceNestedLine } from './proposal-cards';

	let {
		items,
		nestedDocuments = 0,
		destination,
		note = null,
		startsProject = false,
		uid
	}: {
		items: WorkspaceItemV1[];
		nestedDocuments?: number;
		/** Where the items go: the target project's name, or the new project's. */
		destination: string;
		/** The card's one-line reason (filing) or the new project's description. */
		note?: string | null;
		startsProject?: boolean;
		/** Id prefix from the card frame. */
		uid: string;
	} = $props();

	const nestedLine = $derived(workspaceNestedLine(nestedDocuments));
</script>

<div
	class="mt-2 space-y-1.5 px-3 text-xs leading-snug text-foreground"
	data-testid="workspace-proposal-body"
>
	{#if note}
		<p class="text-muted-foreground [overflow-wrap:anywhere]">{note}</p>
	{/if}
	<section aria-labelledby="{uid}-items">
		<h4 id="{uid}-items" class="micro-label text-muted-foreground [overflow-wrap:anywhere]">
			{startsProject
				? `Moves into the new project ${destination}`
				: `Moves into ${destination}`}
		</h4>
		<ul
			class="mt-1 space-y-0.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 tx {startsProject
				? 'tx-bloom'
				: 'tx-grain'} tx-weak"
		>
			{#each items as item (item.entity + ':' + item.id)}
				<li class="flex min-w-0 items-center gap-1.5">
					<span class="shrink-0 text-muted-foreground" aria-hidden="true">
						{#if item.kind === 'task'}
							<CircleCheck class="h-3.5 w-3.5" />
						{:else if item.kind === 'note'}
							<StickyNote class="h-3.5 w-3.5" />
						{:else}
							<FileText class="h-3.5 w-3.5" />
						{/if}
					</span>
					<span class="min-w-0 truncate">{item.title}</span>
					<span class="sr-only">({workspaceItemKindLabel(item.kind)})</span>
				</li>
			{/each}
		</ul>
		{#if nestedLine}
			<p class="mt-1 text-muted-foreground">{nestedLine}</p>
		{/if}
	</section>
	{#if startsProject}
		<p class="text-muted-foreground">It also gets its own Start Here doc.</p>
	{/if}
</div>
