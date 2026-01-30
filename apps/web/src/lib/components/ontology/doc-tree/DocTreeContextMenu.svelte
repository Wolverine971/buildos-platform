<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte -->
<!--
	Context menu for document tree nodes

	Actions:
	- Open document
	- Create child document
	- Move document
	- Delete document
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { FileText, FolderPlus, Move, Trash2 } from 'lucide-svelte';
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

	// Position the menu within viewport
	const menuStyle = $derived.by(() => {
		let x = position.x;
		let y = position.y;

		// Adjust for viewport bounds (approximate menu size)
		const menuWidth = 180;
		const menuHeight = 160;

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
	class="fixed z-50 min-w-[160px] bg-card border border-border rounded-lg shadow-ink-strong overflow-hidden"
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

		<!-- Delete -->
		<button
			type="button"
			onclick={() => handleAction('delete')}
			class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
		>
			<Trash2 class="w-4 h-4" />
			{isFolder ? 'Delete folder...' : 'Delete'}
		</button>
	</div>
</div>
