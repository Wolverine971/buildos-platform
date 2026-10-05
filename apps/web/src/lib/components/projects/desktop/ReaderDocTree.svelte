<!-- apps/web/src/lib/components/projects/desktop/ReaderDocTree.svelte -->
<!--
	A project's docs as a tree beside the reader (an item's own page). Folders
	open in place; the open doc is marked, and the way to it opens by itself.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronRight, FileText, FolderOpen, Table2 as Table } from '$lib/icons/lucide';
	import type { DocTreeNode } from '$lib/types/onto-api';

	let {
		tree,
		titles,
		tableIds,
		selectedId,
		onOpen
	}: {
		tree: readonly DocTreeNode[];
		titles: ReadonlyMap<string, string>;
		tableIds: ReadonlySet<string>;
		selectedId: string | null;
		onOpen: (documentId: string) => void;
	} = $props();

	let open = $state<Set<string>>(new Set());

	const parents = $derived.by(() => {
		const map = new Map<string, string>();
		const walk = (nodes: readonly DocTreeNode[], parentId: string | null) => {
			for (const node of nodes) {
				if (parentId) map.set(node.id, parentId);
				walk(node.children ?? [], node.id);
			}
		};
		walk(tree, null);
		return map;
	});

	// The open doc may sit in a closed folder: open the way to it.
	$effect(() => {
		if (!selectedId) return;
		const path: string[] = [];
		for (let at = parents.get(selectedId); at; at = parents.get(at)) path.push(at);
		untrack(() => {
			if (path.some((id) => !open.has(id))) open = new Set([...open, ...path]);
		});
	});

	function toggle(id: string) {
		const next = new Set(open);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		open = next;
	}

	function count(nodes: readonly DocTreeNode[]): number {
		return nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0);
	}
</script>

<div class="doc-tree" role="tree" aria-label="Docs">
	{#if tree.length}
		{@render rows(tree, 0)}
	{:else}
		<p class="empty">No docs yet.</p>
	{/if}
</div>

{#snippet rows(nodes: readonly DocTreeNode[], depth: number)}
	{#each nodes as node (node.id)}
		{@const children = node.children ?? []}
		{@const expanded = open.has(node.id)}
		{@const title = node.title || titles.get(node.id) || 'Untitled'}
		{@const selected = selectedId === node.id}
		<div
			class="row"
			class:sel={selected}
			data-row-id={node.id}
			role="treeitem"
			aria-selected={selected}
			aria-expanded={children.length ? expanded : undefined}
			style:--depth={depth}
		>
			{#if children.length}
				<button
					type="button"
					class="toggle"
					aria-expanded={expanded}
					aria-label="{expanded ? 'Collapse' : 'Expand'} {title}"
					onclick={() => toggle(node.id)}
				>
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			{:else}
				<span></span>
			{/if}
			<button
				type="button"
				class="open"
				aria-current={selected ? 'true' : undefined}
				onclick={() => onOpen(node.id)}
			>
				<span class="glyph">
					{#if tableIds.has(node.id)}<Table
							class="h-4 w-4"
						/>{:else if children.length}<FolderOpen class="h-4 w-4" />{:else}<FileText
							class="h-4 w-4"
						/>{/if}
				</span>
				<span class="min-w-0">
					<span class="title">{title}</span>
					{#if children.length}
						<span class="nested">{count(children)} nested</span>
					{/if}
				</span>
			</button>
		</div>
		{#if children.length && expanded}
			{@render rows(children, depth + 1)}
		{/if}
	{/each}
{/snippet}

<style>
	.doc-tree {
		display: grid;
		align-content: start;
		gap: 2px;
		padding: 6px 8px 16px;
	}
	.row {
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr);
		align-items: center;
		gap: 4px;
		min-height: 44px;
		padding: 2px 4px;
		padding-left: calc(4px + var(--depth, 0) * 18px);
		border-radius: 9px;
		transition: background-color 100ms ease;
	}
	.row:hover {
		background: hsl(var(--muted));
	}
	.row.sel {
		background: hsl(var(--accent) / 0.12);
	}
	.row.sel .title {
		color: hsl(var(--accent));
		font-weight: 600;
	}
	.open {
		display: flex;
		min-width: 0;
		min-height: 40px;
		align-items: center;
		gap: 10px;
		border-radius: 7px;
		text-align: left;
	}
	.open:focus-visible,
	.toggle:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.title {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
		color: hsl(var(--foreground));
	}
	.nested {
		display: block;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.glyph {
		display: grid;
		flex: none;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}
	.toggle {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		color: hsl(var(--muted-foreground));
	}
	.toggle:hover {
		background: hsl(var(--border));
		color: hsl(var(--foreground));
	}
	.toggle :global(svg) {
		transition: transform 120ms ease;
	}
	.toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(90deg);
	}
	.empty {
		padding: 16px 8px;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	@media (prefers-reduced-motion: reduce) {
		.row,
		.toggle :global(svg) {
			transition: none;
		}
	}
</style>
