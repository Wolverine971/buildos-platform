<!-- apps/web/src/lib/components/ontology/doc-tree/DocDeleteConfirmModal.svelte -->
<!--
	Confirmation modal for deleting a document or folder

	For folders with children, offers two options:
	- Delete all contents (cascade)
	- Keep contents, move to parent (promote)

	Per spec: HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md #11
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertTriangle, Loader, Trash2, FolderUp } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		documentTitle: string;
		hasChildren: boolean;
		childCount?: number;
		onClose: () => void;
		onDelete: (mode: 'cascade' | 'promote') => void;
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
	let selectedMode = $state<'cascade' | 'promote'>('cascade');

	// Reset when opening
	$effect(() => {
		if (isOpen) {
			deleting = false;
			selectedMode = 'cascade';
		}
	});

	async function handleDelete() {
		deleting = true;
		try {
			await onDelete(selectedMode);
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

<Modal bind:isOpen onClose={handleClose} title="Delete Document" size="sm">
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
					Delete "{documentTitle}"?
				</p>
				<p class="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
			</div>
		</div>

		<!-- Options for folders with children -->
		{#if hasChildren}
			<div class="space-y-2 pt-2">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					This folder has {childCount || 'some'} document{childCount !== 1 ? 's' : ''}
				</p>

				<!-- Cascade option -->
				<button
					type="button"
					onclick={() => (selectedMode = 'cascade')}
					class="w-full flex items-start gap-3 p-3 rounded-lg border transition-colors
						{selectedMode === 'cascade'
						? 'border-destructive/50 bg-destructive/5'
						: 'border-border hover:border-border/80 hover:bg-muted/30'}"
				>
					<div
						class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
							{selectedMode === 'cascade' ? 'border-destructive' : 'border-muted-foreground/40'}"
					>
						{#if selectedMode === 'cascade'}
							<div class="w-2.5 h-2.5 rounded-full bg-destructive"></div>
						{/if}
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-foreground flex items-center gap-1.5">
							<Trash2 class="w-4 h-4 text-destructive" />
							Delete folder and all contents
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							All nested documents will be permanently deleted
						</p>
					</div>
				</button>

				<!-- Promote option -->
				<button
					type="button"
					onclick={() => (selectedMode = 'promote')}
					class="w-full flex items-start gap-3 p-3 rounded-lg border transition-colors
						{selectedMode === 'promote'
						? 'border-accent/50 bg-accent/5'
						: 'border-border hover:border-border/80 hover:bg-muted/30'}"
				>
					<div
						class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
							{selectedMode === 'promote' ? 'border-accent' : 'border-muted-foreground/40'}"
					>
						{#if selectedMode === 'promote'}
							<div class="w-2.5 h-2.5 rounded-full bg-accent"></div>
						{/if}
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-foreground flex items-center gap-1.5">
							<FolderUp class="w-4 h-4 text-accent" />
							Delete folder, keep contents
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							Nested documents will move to the parent level
						</p>
					</div>
				</button>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={handleClose} disabled={deleting}>Cancel</Button>
			<Button variant="danger" onclick={handleDelete} disabled={deleting}>
				{#if deleting}
					<Loader class="w-4 h-4 animate-spin mr-2" />
				{/if}
				{hasChildren && selectedMode === 'promote' ? 'Delete Folder Only' : 'Delete'}
			</Button>
		</div>
	{/snippet}
</Modal>
