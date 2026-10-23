<!-- apps/web/src/lib/components/workspace/LooseCard.svelte -->
<!--
	One loose note, doc or task on the Workspace shelf. Click to open it in the reader;
	drag it onto a project tile to file it (the desktop's own drag, so the same confirm
	and Undo). A filing suggestion shows as a ghost chip ("→ 9takes?"): one tap files it,
	× keeps it here. In select mode the card toggles instead, for "start a project".
-->
<script lang="ts">
	import { Check, Circle, FileText, FolderOpen, StickyNote, X } from '$lib/icons/lucide';
	import { relativeDay, shortName } from '$lib/components/projects/desktop/desktop-model';
	import type { LooseItem, WorkspaceSuggestion } from './workspace-model';

	let {
		item,
		workspaceId,
		fresh = false,
		lifted = false,
		selecting = false,
		selected = false,
		filing = null,
		filingName = null,
		busy = false,
		onOpen,
		onToggleSelect,
		onMove,
		onFile,
		onKeep,
		onComplete
	}: {
		item: LooseItem;
		workspaceId: string;
		/** Just captured: Bloom texture for a moment. */
		fresh?: boolean;
		lifted?: boolean;
		selecting?: boolean;
		selected?: boolean;
		/** The agent's open "file this into …" suggestion for this item, if any. */
		filing?: WorkspaceSuggestion | null;
		filingName?: string | null;
		busy?: boolean;
		onOpen: (item: LooseItem) => void;
		onToggleSelect: (item: LooseItem) => void;
		onMove: (item: LooseItem, anchor: HTMLElement) => void;
		onFile: (suggestion: WorkspaceSuggestion) => void;
		onKeep: (suggestion: WorkspaceSuggestion) => void;
		onComplete: (item: LooseItem) => void;
	} = $props();

	const label = $derived(item.kind === 'note' ? 'Note' : item.kind === 'task' ? 'Task' : 'Doc');
	const stamp = $derived.by(() => {
		if (item.kind === 'task' && item.due_at) {
			const due = new Date(item.due_at);
			if (!Number.isNaN(due.getTime()))
				return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
		}
		const when = relativeDay(item.created_at);
		return when === 'today' ? 'Today' : when === 'yesterday' ? 'Yesterday' : when;
	});

	function activate() {
		if (selecting) onToggleSelect(item);
		else onOpen(item);
	}
</script>

<div
	class="card wt-paper"
	class:tx={fresh}
	class:tx-bloom={fresh}
	class:tx-weak={fresh}
	class:lifted
	class:selected
	data-drag-kind={selecting ? undefined : item.entity}
	data-drag-id={selecting ? undefined : item.id}
	data-drag-project={selecting ? undefined : workspaceId}
	data-loose-id={item.id}
>
	<button
		type="button"
		class="main"
		draggable="false"
		aria-pressed={selecting ? selected : undefined}
		aria-label={selecting
			? `${selected ? 'Deselect' : 'Select'} ${item.title}`
			: `Open ${label.toLowerCase()} ${item.title}`}
		onclick={activate}
	>
		<span class="kind micro-label">
			{#if selecting}
				<span class="tick" class:on={selected} aria-hidden="true">
					{#if selected}<Check class="h-3 w-3" />{/if}
				</span>
			{:else if item.kind === 'task'}
				<Circle class="h-3 w-3" />
			{:else if item.children}
				<FolderOpen class="h-3 w-3" />
			{:else if item.kind === 'note'}
				<StickyNote class="h-3 w-3" />
			{:else}
				<FileText class="h-3 w-3" />
			{/if}
			{label.toUpperCase()}{#if item.children}&nbsp;· {item.children} INSIDE{/if}
		</span>
		<span class="title">{item.title}</span>
		{#if item.excerpt}
			<span class="excerpt">{item.excerpt}</span>
		{/if}
	</button>

	<div class="foot">
		<span class="stamp text-muted-foreground">{stamp}</span>
		{#if !selecting}
			{#if filing && filingName}
				<span class="chip wt-ghost tx tx-bloom tx-weak" title={filing.reason}>
					<button
						type="button"
						class="go"
						data-nodrag
						disabled={busy}
						onclick={() => onFile(filing)}
						aria-label="Move {item.title} to {filingName}"
					>
						→ {shortName(filingName, 22)}?
					</button>
					<button
						type="button"
						class="keep"
						data-nodrag
						disabled={busy}
						onclick={() => onKeep(filing)}
						aria-label="Keep {item.title} in the Workspace"
						title="Keep it here"
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{:else}
				<span class="actions">
					{#if item.kind === 'task'}
						<button
							type="button"
							class="mini"
							data-nodrag
							disabled={busy}
							onclick={() => onComplete(item)}
							title="Mark done"
							aria-label="Mark {item.title} done"
						>
							<Check class="h-3.5 w-3.5" />
						</button>
					{/if}
					<button
						type="button"
						class="mini text"
						data-nodrag
						disabled={busy}
						onclick={(event) => onMove(item, event.currentTarget)}
					>
						Move
					</button>
				</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.card {
		position: relative;
		display: grid;
		grid-template-rows: 1fr auto;
		min-width: 0;
		min-height: 7.25rem;
		border-radius: 0.7rem;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: pan-y;
		transition:
			opacity 120ms ease,
			box-shadow 120ms ease,
			border-color 120ms ease;
	}
	.card:hover {
		border-color: hsl(var(--accent) / 0.45);
	}
	.card.selected {
		border-color: hsl(var(--accent));
		box-shadow: 0 0 0 1px hsl(var(--accent));
	}
	.card.lifted {
		opacity: 0.35;
	}
	.main {
		display: grid;
		align-content: start;
		gap: 0.3rem;
		min-width: 0;
		padding: 0.7rem 0.8rem 0.35rem;
		text-align: left;
		border-radius: 0.7rem 0.7rem 0 0;
	}
	.main:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.kind {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: hsl(var(--muted-foreground));
	}
	.title {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.3;
		color: hsl(var(--foreground));
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.excerpt {
		font-size: 0.8rem;
		line-height: 1.35;
		color: hsl(var(--muted-foreground));
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		min-height: 2.25rem;
		padding: 0 0.45rem 0.4rem 0.8rem;
	}
	.stamp {
		font-size: 11px;
		white-space: nowrap;
	}
	.actions {
		display: inline-flex;
		gap: 0.15rem;
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.card:hover .actions,
	.card:focus-within .actions {
		opacity: 1;
	}
	@media (pointer: coarse) {
		.actions {
			opacity: 1;
		}
	}
	.mini {
		display: inline-grid;
		place-items: center;
		min-width: 2rem;
		min-height: 2rem;
		padding: 0 0.4rem;
		border-radius: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.mini:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.mini:focus-visible,
	.chip button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--accent));
	}
	.chip .go {
		min-height: 1.9rem;
		padding: 0 0.15rem 0 0.6rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 11rem;
	}
	.chip .keep {
		display: inline-grid;
		place-items: center;
		min-width: 1.9rem;
		min-height: 1.9rem;
		border-radius: 999px;
		color: hsl(var(--muted-foreground));
	}
	.chip .keep:hover {
		color: hsl(var(--foreground));
	}
	.tick {
		display: inline-grid;
		place-items: center;
		width: 0.95rem;
		height: 0.95rem;
		border: 1.5px solid hsl(var(--border-strong, var(--border)));
		border-radius: 0.25rem;
	}
	.tick.on {
		border-color: hsl(var(--accent));
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	@media (prefers-reduced-motion: reduce) {
		.card,
		.actions {
			transition: none;
		}
	}
</style>
