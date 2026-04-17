<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte -->
<!--
	Context menu for document tree nodes

		Actions:
		- Open document
		- Create child document
		- Move document
		- Archive document
		- Publish / Manage / Copy link / Open public page (documents only)
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Archive,
		ExternalLink,
		FileText,
		FolderPlus,
		Globe,
		Link,
		Move,
		Settings2
	} from 'lucide-svelte';
	import type { EnrichedDocTreeNode } from '$lib/types/onto-api';

	interface Props {
		position: { x: number; y: number };
		node: EnrichedDocTreeNode;
		onAction: (action: string) => void;
		onClose: () => void;
	}

	let { position, node, onAction, onClose }: Props = $props();

	let menuRef = $state<HTMLDivElement | null>(null);

	const isFolder = $derived(node.type === 'folder');
	const isPublic = $derived(!isFolder && node.is_public === true);

	// Position the menu within viewport
	const menuStyle = $derived.by(() => {
		let x = position.x;
		let y = position.y;

		// Adjust for viewport bounds (approximate menu size)
		const menuWidth = 200;
		const menuHeight = isPublic ? 260 : isFolder ? 160 : 200;

		if (typeof window !== 'undefined') {
			if (x + menuWidth > window.innerWidth) {
				x = window.innerWidth - menuWidth - 10;
			}
			if (y + menuHeight > window.innerHeight) {
				y = window.innerHeight - menuHeight - 10;
			}
		}

		return `left: ${x}px; top: ${y}px;`;
	});

	function handleAction(action: string) {
		onAction(action);
	}

	function handleClickOutside(e: MouseEvent) {
		if (menuRef && !menuRef.contains(e.target as Node)) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside, true);
		document.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside, true);
		document.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={menuRef}
	class="fixed z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-ink-strong overflow-hidden"
	style={menuStyle}
>
	<div class="py-1">
		<!-- Open -->
		<button
			type="button"
			onclick={() => handleAction('open')}
			class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
		>
			<FileText class="w-4 h-4 text-muted-foreground" />
			Open
		</button>

		<!-- Create child -->
		<button
			type="button"
			onclick={() => handleAction('create-child')}
			class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
		>
			<FolderPlus class="w-4 h-4 text-muted-foreground" />
			Create child
		</button>

		<!-- Public page actions (documents only) -->
		{#if !isFolder}
			<div class="my-1 border-t border-border"></div>
			{#if isPublic}
				<button
					type="button"
					onclick={() => handleAction('copy-public-link')}
					class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<Link class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
					Copy public link
				</button>
				<button
					type="button"
					onclick={() => handleAction('open-public-page')}
					class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<ExternalLink class="w-4 h-4 text-muted-foreground" />
					Open public page
				</button>
				<button
					type="button"
					onclick={() => handleAction('manage-public-page')}
					class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<Settings2 class="w-4 h-4 text-muted-foreground" />
					Manage public page...
				</button>
			{:else}
				<button
					type="button"
					onclick={() => handleAction('publish-public-page')}
					class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
				>
					<Globe class="w-4 h-4 text-muted-foreground" />
					Share publicly...
				</button>
			{/if}
		{/if}

		<div class="my-1 border-t border-border"></div>

		<!-- Move -->
		<button
			type="button"
			onclick={() => handleAction('move')}
			class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent/10 transition-colors"
		>
			<Move class="w-4 h-4 text-muted-foreground" />
			Move to...
		</button>

		<div class="my-1 border-t border-border"></div>

		<!-- Archive -->
		<button
			type="button"
			onclick={() => handleAction('archive')}
			class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
		>
			<Archive class="w-4 h-4" />
			{isFolder ? 'Archive folder...' : 'Archive'}
		</button>
	</div>
</div>
