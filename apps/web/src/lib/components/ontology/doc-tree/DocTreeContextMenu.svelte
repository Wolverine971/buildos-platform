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
	import { onMount } from 'svelte';
	import {
		Archive,
		ExternalLink,
		FileText,
		FolderPlus,
		Globe,
		Link,
		Move,
		Settings2
	} from '$lib/icons/lucide';
	import type { EnrichedDocTreeNode } from '$lib/types/onto-api';

	interface Props {
		position: { x: number; y: number };
		node: EnrichedDocTreeNode;
		canEdit?: boolean;
		onAction: (action: string) => void;
		onClose: () => void;
	}

	let { position, node, canEdit = true, onAction, onClose }: Props = $props();

	let menuRef = $state<HTMLDivElement | null>(null);

	const isFolder = $derived(node.type === 'folder');
	const isPublic = $derived(!isFolder && node.is_public === true);
	const menuItemCount = $derived(
		1 +
			(canEdit ? 1 : 0) +
			(!isFolder ? (isPublic ? 2 + (canEdit ? 1 : 0) : canEdit ? 1 : 0) : 0) +
			(canEdit ? 2 : 0)
	);
	const dividerCount = $derived((!isFolder ? 1 : 0) + (canEdit ? 2 : 0));

	// Position the menu within viewport
	const menuStyle = $derived.by(() => {
		let x = position.x;
		let y = position.y;

		// Keep the complete menu inside the viewport. Short screens scroll the menu body.
		const menuWidth = 200;
		const estimatedHeight = menuItemCount * 44 + dividerCount * 9 + 8;

		if (typeof window !== 'undefined') {
			const menuHeight = Math.min(estimatedHeight, window.innerHeight - 20);
			if (x + menuWidth > window.innerWidth) {
				x = window.innerWidth - menuWidth - 10;
			}
			if (y + menuHeight > window.innerHeight) {
				y = window.innerHeight - menuHeight - 10;
			}
			x = Math.max(10, x);
			y = Math.max(10, y);
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
			e.preventDefault();
			onClose();
			return;
		}

		if (!menuRef?.contains(e.target as Node)) return;
		const items = Array.from(
			menuRef.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
		);
		if (items.length === 0) return;
		const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

		let nextIndex: number | null = null;
		if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
		if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
		if (e.key === 'Home') nextIndex = 0;
		if (e.key === 'End') nextIndex = items.length - 1;

		if (nextIndex !== null) {
			e.preventDefault();
			items[nextIndex]?.focus();
		}

		if (e.key === 'Tab') onClose();
	}

	onMount(() => {
		menuRef?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
	});
</script>

<svelte:document onclick={handleClickOutside} onkeydown={handleKeydown} />

<div
	bind:this={menuRef}
	role="menu"
	aria-label="{node.title} actions"
	class="fixed z-50 max-h-[calc(100dvh-20px)] min-w-[180px] overflow-y-auto rounded-lg border border-border bg-card shadow-ink-strong"
	style={menuStyle}
>
	<div class="py-1">
		<!-- Open -->
		<button
			type="button"
			role="menuitem"
			onclick={() => handleAction('open')}
			class="menu-item pressable"
		>
			<FileText class="w-4 h-4 text-muted-foreground" />
			Open
		</button>

		{#if canEdit}
			<!-- Create child -->
			<button
				type="button"
				role="menuitem"
				onclick={() => handleAction('create-child')}
				class="menu-item pressable"
			>
				<FolderPlus class="w-4 h-4 text-muted-foreground" />
				Create child
			</button>
		{/if}

		<!-- Public page actions (documents only) -->
		{#if !isFolder}
			<div class="my-1 border-t border-border" role="separator"></div>
			{#if isPublic}
				<button
					type="button"
					role="menuitem"
					onclick={() => handleAction('copy-public-link')}
					class="menu-item pressable"
				>
					<Link class="w-4 h-4 text-success" />
					Copy public link
				</button>
				<button
					type="button"
					role="menuitem"
					onclick={() => handleAction('open-public-page')}
					class="menu-item pressable"
				>
					<ExternalLink class="w-4 h-4 text-muted-foreground" />
					Open public page
				</button>
				{#if canEdit}
					<button
						type="button"
						role="menuitem"
						onclick={() => handleAction('manage-public-page')}
						class="menu-item pressable"
					>
						<Settings2 class="w-4 h-4 text-muted-foreground" />
						Manage public page...
					</button>
				{/if}
			{:else if canEdit}
				<button
					type="button"
					role="menuitem"
					onclick={() => handleAction('publish-public-page')}
					class="menu-item pressable"
				>
					<Globe class="w-4 h-4 text-muted-foreground" />
					Share publicly...
				</button>
			{/if}
		{/if}

		{#if canEdit}
			<div class="my-1 border-t border-border" role="separator"></div>

			<!-- Move -->
			<button
				type="button"
				role="menuitem"
				onclick={() => handleAction('move')}
				class="menu-item pressable"
			>
				<Move class="w-4 h-4 text-muted-foreground" />
				Move to...
			</button>

			<div class="my-1 border-t border-border" role="separator"></div>

			<!-- Archive -->
			<button
				type="button"
				role="menuitem"
				onclick={() => handleAction('archive')}
				class="menu-item menu-item-danger pressable"
			>
				<Archive class="w-4 h-4" />
				{isFolder ? 'Archive folder...' : 'Archive'}
			</button>
		{/if}
	</div>
</div>

<style>
	.menu-item {
		display: flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		text-align: left;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.menu-item:hover,
	.menu-item:focus-visible {
		background: hsl(var(--accent) / 0.1);
	}

	.menu-item:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.menu-item-danger {
		color: hsl(var(--destructive));
	}

	.menu-item-danger:hover,
	.menu-item-danger:focus-visible {
		background: hsl(var(--destructive) / 0.1);
	}

	@media (prefers-reduced-motion: reduce) {
		.menu-item {
			transition: none;
		}
	}
</style>
