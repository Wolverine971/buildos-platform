<!-- apps/web/src/lib/components/organize/OrganizeDialogs.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { blockerMessage, impactLines, receiptMessage } from './organize-api';
	import type { createOrganizePersistence } from './useOrganizePersistence.svelte';
	import type { OrganizeProject, PlannedChange } from './organize-plan';
	let {
		persistence,
		projects,
		changes,
		canUndo,
		onundo,
		onrefresh
	}: {
		persistence: ReturnType<typeof createOrganizePersistence>;
		projects: OrganizeProject[];
		changes: PlannedChange[];
		canUndo: boolean;
		onundo: (id: string) => void;
		onrefresh: () => void;
	} = $props();
	const review = $derived(persistence.review);
	const blocked = $derived(review?.preview.impact.some((i) => i.blockers.length) ?? false);
	const reversed = $derived(
		new Set(persistence.history.map((b) => b.inverse_of).filter(Boolean))
	);
	function projectName(id: string) {
		return projects.find((p) => p.id === id)?.name ?? 'Another project';
	}
	function itemName(id: string) {
		return (
			projects.flatMap((p) => [...p.documents, ...p.tasks]).find((item) => item.id === id)
				?.title ?? 'Item'
		);
	}
</script>

{#if review}
	<Modal
		isOpen
		title={review.mode === 'undo' ? 'Review undo' : 'Review changes'}
		size="md"
		variant="bottom-sheet"
		persistent={persistence.busy || persistence.uncertain}
		onClose={persistence.closeReview}
	>
		<div class="space-y-4 p-4 sm:p-5">
			<p class="text-sm text-muted-foreground">
				{review.preview.manifest.length}
				{review.preview.manifest.length === 1 ? 'move' : 'moves'} reviewed against the latest
				project contents. {review.mode === 'undo'
					? 'Content edits are preserved.'
					: 'Apply will save the whole plan together.'}
			</p>
			{#if review.mode === 'apply'}
				<ul class="max-h-40 space-y-2 overflow-y-auto text-sm">
					{#each changes as change, index (`${index}:${change.move.id}`)}
						<li>
							<span class="font-medium">{change.title}</span><span
								class="block text-xs text-muted-foreground"
								>{change.source_name} → {change.destination_name}{change.child_count
									? ` · ${change.child_count} child docs move too`
									: ''}{change.shared_with_count !== null
									? ` · Shared with ${change.shared_with_count} sub-projects`
									: ''}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#each review.preview.impact as impact (`${impact.source_project_id}:${impact.destination_project_id}`)}
				<section class="rounded-lg border border-border p-3">
					<h3 class="text-sm font-medium">
						{projectName(impact.source_project_id)} → {projectName(
							impact.destination_project_id
						)}
					</h3>
					{#each impact.blockers as code (code)}<p
							class="mt-2 text-sm text-destructive"
							role="alert"
						>
							{blockerMessage(code)}
						</p>{/each}
					<ul class="mt-2 space-y-1 text-sm text-muted-foreground">
						{#each impactLines(impact) as line (line)}<li>{line}</li>{/each}
					</ul>
					{#if !impactLines(impact).length && !impact.blockers.length}<p
							class="mt-2 text-sm text-muted-foreground"
						>
							No linked items need to change.
						</p>{/if}
				</section>
			{/each}
			{#if !review.preview.impact.length}<p class="text-sm text-muted-foreground">
					Only document placement within the project changes.
				</p>{/if}
			{#if review.preview.skipped.length}
				<section class="rounded-lg border border-warning/40 bg-warning/5 p-3">
					<h3 class="text-sm font-medium">{review.preview.skipped.length} skipped</h3>
					<ul class="mt-2 space-y-2 text-sm text-muted-foreground">
						{#each review.preview.skipped as item, index (`${index}:${item.id}`)}<li>
								{itemName(item.id)} — {item.reason}
							</li>{/each}
					</ul>
				</section>
			{/if}
			{#if persistence.error}<p class="text-sm text-destructive" role="alert">
					{persistence.error}
				</p>{/if}
		</div>
		{#snippet footer()}
			<div class="flex flex-wrap justify-end gap-2">
				<Button
					variant="ghost"
					disabled={persistence.busy || persistence.uncertain}
					onclick={persistence.closeReview}>Back to plan</Button
				>
				{#if persistence.stale}<Button onclick={onrefresh}>Refresh and review</Button>
				{:else}<Button
						disabled={blocked || persistence.busy}
						loading={persistence.busy}
						onclick={persistence.confirm}
						>{persistence.uncertain
							? 'Retry save'
							: review.mode === 'undo'
								? 'Apply undo'
								: 'Apply changes'}</Button
					>{/if}
			</div>
		{/snippet}
	</Modal>
{/if}

{#if persistence.historyOpen}
	<Modal
		isOpen
		title="Organize history"
		size="lg"
		variant="bottom-sheet"
		onClose={persistence.closeHistory}
	>
		<div class="space-y-4 p-4 sm:p-5">
			<p class="text-sm text-muted-foreground">
				Your latest 30 batches for this project. Undo preserves content edits and skips
				items moved or reordered since the batch. Undo a reversal to redo its moves.
			</p>
			{#if changes.length}<p class="text-sm text-muted-foreground">
					Apply or discard your pending plan before undoing a saved batch.
				</p>{/if}
			{#if persistence.historyLoading}<p role="status" class="text-sm text-muted-foreground">
					Loading history…
				</p>
			{:else if persistence.historyError}<p role="alert" class="text-sm text-destructive">
					{persistence.historyError}
				</p>
				<Button variant="outline" onclick={persistence.openHistory}>Retry history</Button>
			{:else if !persistence.history.length}<p class="py-6 text-sm text-muted-foreground">
					No saved Organize moves yet.
				</p>
			{:else}
				<ol class="space-y-3">
					{#each persistence.history as batch (batch.id)}
						<li class="rounded-lg border border-border p-3">
							<div class="flex flex-wrap items-start justify-between gap-2">
								<div>
									<h3 class="text-sm font-medium">
										{receiptMessage(batch.receipt)}
									</h3>
									<p class="mt-1 text-xs text-muted-foreground">
										<time datetime={batch.created_at}
											>{new Date(batch.created_at).toLocaleString()}</time
										>{batch.inverse_of ? ' · Reversal' : ''}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={!canUndo ||
										persistence.busy ||
										reversed.has(batch.id)}
									onclick={() => onundo(batch.id)}
									>{reversed.has(batch.id) ? 'Undone' : 'Undo batch'}</Button
								>
							</div>
							{#each batch.receipt.impact as impact (`${impact.source_project_id}:${impact.destination_project_id}`)}
								<p class="mt-2 text-xs text-muted-foreground">
									{projectName(impact.source_project_id)} → {projectName(
										impact.destination_project_id
									)} · {impact.items}
									{impact.items === 1 ? 'item' : 'items'}
								</p>
							{/each}
							{#if batch.receipt.calendar_sync === 'queued'}<p
									class="mt-2 text-xs text-muted-foreground"
								>
									Calendar sync was queued.
								</p>{/if}
							{#if batch.receipt.restoration.skipped}<p
									class="mt-2 text-xs text-muted-foreground"
								>
									{batch.receipt.restoration.skipped} changed relationships were left
									as they are.
								</p>{/if}
							{#each batch.receipt.skipped as item, index (`${index}:${item.id}`)}<p
									class="mt-2 text-xs text-muted-foreground"
								>
									{itemName(item.id)} — {item.reason}
								</p>{/each}
						</li>
					{/each}
				</ol>
			{/if}
			{#if persistence.error}<p role="alert" class="text-sm text-destructive">
					{persistence.error}
				</p>{/if}
			{#if persistence.notice}<p role="status" class="text-sm text-muted-foreground">
					{persistence.notice}
				</p>{/if}
			{#each persistence.skipped as item, index (`${index}:${item.id}`)}<p
					class="text-sm text-muted-foreground"
				>
					{itemName(item.id)} — {item.reason}
				</p>{/each}
		</div>
	</Modal>
{/if}
