<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeDragLayer.svelte -->
<!--
	Drag Layer for Document Tree

	Renders:
	- Ghost element following cursor
	- Insertion lines between items
	- Drop target highlights

	This is rendered as a portal at the document level to ensure
	the ghost element isn't clipped by overflow containers.
-->
<script lang="ts">
	import { FileText, Folder } from 'lucide-svelte';
	import type { DragState } from './useDragDrop.svelte';

	interface Props {
		state: DragState;
	}

	let { state }: Props = $props();

	// Offset ghost slightly from cursor for visibility
	const GHOST_OFFSET_X = 12;
	const GHOST_OFFSET_Y = -8;
</script>

{#if state.isDragging && state.draggedNode}
	<!-- Ghost Element -->
	<div
		class="doc-tree-ghost"
		style="
			left: {state.ghostX + GHOST_OFFSET_X}px;
			top: {state.ghostY + GHOST_OFFSET_Y}px;
		"
		role="presentation"
		aria-hidden="true"
	>
		<span class="doc-tree-ghost-icon">
			{#if state.draggedNode.children && state.draggedNode.children.length > 0}
				<Folder class="w-4 h-4" />
			{:else}
				<FileText class="w-4 h-4" />
			{/if}
		</span>
		<span class="doc-tree-ghost-title">
			{state.draggedNode.title}
		</span>
	</div>

	<!-- Drop Feedback Overlay -->
	{#if state.dropZone}
		<div
			class="doc-tree-drop-feedback"
			class:doc-tree-drop-feedback--valid={state.isValidDrop}
			class:doc-tree-drop-feedback--invalid={!state.isValidDrop}
			class:doc-tree-drop-feedback--converting={state.isConverting}
		>
			{#if !state.isValidDrop && state.invalidReason}
				<div class="doc-tree-drop-hint">
					{state.invalidReason}
				</div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	/* Ghost element that follows cursor */
	.doc-tree-ghost {
		position: fixed;
		z-index: 10000;
		pointer-events: none;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--color-card, hsl(var(--card)));
		border: 2px solid var(--color-accent, hsl(var(--accent)));
		border-radius: 8px;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.15),
			0 0 0 1px rgba(0, 0, 0, 0.05);
		max-width: 220px;
		transform: rotate(2deg);
		opacity: 0.95;
	}

	.doc-tree-ghost-icon {
		flex-shrink: 0;
		color: var(--color-accent, hsl(var(--accent)));
	}

	.doc-tree-ghost-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-foreground, hsl(var(--foreground)));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Drop feedback hint */
	.doc-tree-drop-feedback {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10001;
		pointer-events: none;
	}

	.doc-tree-drop-hint {
		padding: 8px 16px;
		background: var(--color-muted, hsl(var(--muted)));
		border: 1px solid var(--color-border, hsl(var(--border)));
		border-radius: 6px;
		font-size: 0.75rem;
		color: var(--color-muted-foreground, hsl(var(--muted-foreground)));
		white-space: nowrap;
	}

	.doc-tree-drop-feedback--invalid .doc-tree-drop-hint {
		background: hsl(var(--destructive) / 0.1);
		border-color: hsl(var(--destructive) / 0.3);
		color: hsl(var(--destructive));
	}

	.doc-tree-drop-feedback--converting .doc-tree-drop-hint {
		background: hsl(var(--accent) / 0.1);
		border-color: hsl(var(--accent) / 0.3);
		color: hsl(var(--accent));
	}

	/* Global styles for drag state */
	:global(body.doc-tree-dragging) {
		cursor: grabbing !important;
		user-select: none !important;
	}

	:global(body.doc-tree-dragging *) {
		cursor: grabbing !important;
	}
</style>
