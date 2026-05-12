<!-- apps/web/src/lib/components/landing/public-project-preview/PublicDocsTree.svelte -->
<!--
	Public, read-only documents section.

	When the project has a `doc_structure` JSON tree, render the hierarchy
	(folders + nested docs). Otherwise fall back to a flat list of documents
	grouped by type. No edit/move/delete affordances.
-->
<script lang="ts">
	import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-svelte';
	import { parseDocStructure } from '$lib/services/ontology/doc-structure.service';
	import type { OntoDocument } from '$lib/types/onto-api';
	import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';

	let {
		documents,
		docStructure
	}: {
		documents: OntoDocument[];
		docStructure: DocStructure | unknown | null;
	} = $props();

	const parsedStructure = $derived(parseDocStructure(docStructure));
	const documentsById = $derived.by(() => {
		const map = new Map<string, OntoDocument>();
		for (const doc of documents ?? []) map.set(doc.id, doc);
		return map;
	});

	const hasTree = $derived(parsedStructure.root.length > 0);

	// Top-level container expand/collapse
	let isExpanded = $state(true);

	// Per-folder open state. Folders default open so visitors see the whole shape.
	let openFolders = $state<Set<string>>(new Set());

	function toggleFolder(id: string) {
		const next = new Set(openFolders);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		openFolders = next;
	}

	function isFolderNode(node: DocTreeNode): boolean {
		if (node.type === 'folder') return true;
		if (node.children && node.children.length > 0) return true;
		return false;
	}

	function nodeTitle(node: DocTreeNode): string {
		if (node.title) return node.title;
		const doc = documentsById.get(node.id);
		return doc?.title ?? 'Untitled';
	}

	function nodeDescription(node: DocTreeNode): string | null {
		if (node.description) return node.description;
		const doc = documentsById.get(node.id);
		return doc?.description ?? null;
	}

	// Initial open state — open every top-level folder.
	$effect(() => {
		const initial = new Set<string>();
		for (const root of parsedStructure.root) {
			if (isFolderNode(root)) initial.add(root.id);
		}
		openFolders = initial;
	});

	const flatDocs = $derived(
		(documents ?? [])
			.filter((d) => !d.deleted_at && d.state_key !== 'archived')
			.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
	);
</script>

<section
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	aria-label="Documents"
>
	<button
		type="button"
		onclick={() => (isExpanded = !isExpanded)}
		class="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60 hover:bg-muted/40 transition-colors"
		aria-expanded={isExpanded}
	>
		<div class="flex items-center gap-2">
			<div class="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center">
				<Folder class="w-3.5 h-3.5 text-sky-500" />
			</div>
			<div class="text-left">
				<p class="text-xs sm:text-sm font-semibold text-foreground">Documents</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{documents?.length ?? 0}
					{(documents?.length ?? 0) === 1 ? 'doc' : 'docs'}
				</p>
			</div>
		</div>
		{#if isExpanded}
			<ChevronDown class="w-4 h-4 text-muted-foreground" />
		{:else}
			<ChevronRight class="w-4 h-4 text-muted-foreground" />
		{/if}
	</button>

	{#if isExpanded}
		<div class="p-2 sm:p-3">
			{#if hasTree}
				<ul class="space-y-0.5">
					{#each parsedStructure.root as node (node.id)}
						{@render TreeNode(node, 0)}
					{/each}
				</ul>
			{:else if flatDocs.length === 0}
				<p class="text-xs text-muted-foreground italic px-2 py-3 text-center">
					No documents on this example.
				</p>
			{:else}
				<ul class="space-y-0.5">
					{#each flatDocs as doc (doc.id)}
						<li class="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40">
							<FileText class="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
							<div class="min-w-0 flex-1">
								<p class="text-xs sm:text-sm text-foreground line-clamp-1">
									{doc.title || 'Untitled'}
								</p>
								{#if doc.description}
									<p class="text-[10px] text-muted-foreground line-clamp-1">
										{doc.description}
									</p>
								{/if}
							</div>
							{#if doc.type_key}
								<span
									class="text-[10px] uppercase tracking-widest text-muted-foreground/70 shrink-0"
								>
									{doc.type_key}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

{#snippet TreeNode(node: DocTreeNode, depth: number)}
	{@const isFolder = isFolderNode(node)}
	{@const isOpen = openFolders.has(node.id)}
	{@const title = nodeTitle(node)}
	{@const description = nodeDescription(node)}
	<li>
		<div
			class="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
			style:padding-left="{depth * 14 + 8}px"
		>
			{#if isFolder}
				<button
					type="button"
					onclick={() => toggleFolder(node.id)}
					class="inline-flex items-center justify-center w-4 h-4 rounded-sm mt-0.5 shrink-0 text-muted-foreground hover:bg-muted/60"
					aria-expanded={isOpen}
					aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
				>
					{#if isOpen}
						<ChevronDown class="w-3 h-3" />
					{:else}
						<ChevronRight class="w-3 h-3" />
					{/if}
				</button>
				<Folder class="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-500" />
			{:else}
				<span class="w-4 h-4 shrink-0"></span>
				<FileText class="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-xs sm:text-sm text-foreground line-clamp-1">{title}</p>
				{#if description}
					<p class="text-[10px] text-muted-foreground line-clamp-1">{description}</p>
				{/if}
			</div>
		</div>
		{#if isFolder && isOpen && node.children && node.children.length > 0}
			<ul class="space-y-0.5">
				{#each node.children as child (child.id)}
					{@render TreeNode(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}
