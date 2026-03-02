<!-- apps/web/src/lib/components/ontology/doc-tree/DocDeleteConfirmModal.svelte -->
<!--
	Confirmation modal for archiving a document or folder.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertTriangle, Archive, Loader, FolderUp, Unlink } from 'lucide-svelte';

	type ArchiveMode = 'archive_children' | 'promote_children' | 'unlink_children';

	interface Props {
		isOpen: boolean;
		documentTitle: string;
		hasChildren: boolean;
		childCount?: number;
		onClose: () => void;
		onDelete: (mode: ArchiveMode) => void | Promise<void>;
	}

	let {
		isOpen = $bindable(false),
		documentTitle,
		hasChildren,
		childCount = 0,
		onClose,
		onDelete
	}: Props = $props();

	let deleting = $state(false);
	let selectedMode = $state<ArchiveMode>('archive_children');
	let submitError = $state<string | null>(null);

	// Reset when opening
	$effect(() => {
		if (isOpen) {
			deleting = false;
			selectedMode = 'archive_children';
			submitError = null;
		}
	});

	async function handleDelete() {
		deleting = true;
		submitError = null;
		try {
			await onDelete(selectedMode);
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Failed to archive document';
		} finally {
			deleting = false;
		}
	}

	function handleClose() {
		if (!deleting) {
			onClose();
		}
	}
</script>

<Modal bind:isOpen onClose={handleClose} title="Archive Document" size="sm">
	<div class="space-y-4">
		<!-- Warning icon -->
		<div class="flex items-center gap-3">
			<div
				class="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0"
			>
				<AlertTriangle class="w-5 h-5 text-destructive" />
			</div>
			<div>
				<p class="text-sm font-medium text-foreground">
					Archive "{documentTitle}"?
				</p>
				<p class="text-xs text-muted-foreground mt-0.5">
					Archived documents move to the archived section and out of the active tree.
				</p>
			</div>
		</div>

		<!-- Options for folders with children -->
		{#if hasChildren}
			<div class="space-y-2 pt-2">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					This folder has {childCount || 'some'} document{childCount !== 1 ? 's' : ''}
				</p>

				<!-- Archive descendants -->
				<button
					type="button"
					onclick={() => (selectedMode = 'archive_children')}
					class="w-full flex items-start gap-3 p-3 rounded-lg border transition-colors
						{selectedMode === 'archive_children'
						? 'border-destructive/50 bg-destructive/5'
						: 'border-border hover:border-border/80 hover:bg-muted/30'}"
				>
					<div
						class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
							{selectedMode === 'archive_children' ? 'border-destructive' : 'border-muted-foreground/40'}"
					>
						{#if selectedMode === 'archive_children'}
							<div class="w-2.5 h-2.5 rounded-full bg-destructive"></div>
						{/if}
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-foreground flex items-center gap-1.5">
							<Archive class="w-4 h-4 text-destructive" />
							Archive folder and all children
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							All nested documents are archived and removed from the active tree
						</p>
					</div>
				</button>

				<!-- Promote children -->
				<button
					type="button"
					onclick={() => (selectedMode = 'promote_children')}
					class="w-full flex items-start gap-3 p-3 rounded-lg border transition-colors
						{selectedMode === 'promote_children'
						? 'border-accent/50 bg-accent/5'
						: 'border-border hover:border-border/80 hover:bg-muted/30'}"
				>
					<div
						class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
							{selectedMode === 'promote_children' ? 'border-accent' : 'border-muted-foreground/40'}"
					>
						{#if selectedMode === 'promote_children'}
							<div class="w-2.5 h-2.5 rounded-full bg-accent"></div>
						{/if}
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-foreground flex items-center gap-1.5">
							<FolderUp class="w-4 h-4 text-accent" />
							Archive folder, keep children in tree
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							Nested documents will move to the parent level
						</p>
					</div>
				</button>

				<!-- Unlink children -->
				<button
					type="button"
					onclick={() => (selectedMode = 'unlink_children')}
					class="w-full flex items-start gap-3 p-3 rounded-lg border transition-colors
						{selectedMode === 'unlink_children'
						? 'border-warning/50 bg-warning/5'
						: 'border-border hover:border-border/80 hover:bg-muted/30'}"
				>
					<div
						class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
							{selectedMode === 'unlink_children' ? 'border-warning' : 'border-muted-foreground/40'}"
					>
						{#if selectedMode === 'unlink_children'}
							<div class="w-2.5 h-2.5 rounded-full bg-warning"></div>
						{/if}
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-foreground flex items-center gap-1.5">
							<Unlink class="w-4 h-4 text-warning" />
							Archive folder, move children to unlinked
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							Children stay active but move to the Unlinked Documents section
						</p>
					</div>
				</button>
			</div>
		{/if}

		{#if submitError}
			<p class="text-xs text-destructive">{submitError}</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={handleClose} disabled={deleting}>Cancel</Button>
			<Button variant="danger" onclick={handleDelete} disabled={deleting}>
				{#if deleting}
					<Loader class="w-4 h-4 animate-spin mr-2" />
				{/if}
				Archive
			</Button>
		</div>
	{/snippet}
</Modal>
