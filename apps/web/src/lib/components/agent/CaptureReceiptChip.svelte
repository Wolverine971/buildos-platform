<!-- apps/web/src/lib/components/agent/CaptureReceiptChip.svelte -->
<!--
	Receipt for a chat checkpoint capture (tasker/95): what was saved, links to it,
	a pending-review note, and Undo. Small and non-blocking; not a model message.
-->
<script lang="ts">
	import { Check, LoaderCircle, RotateCcw } from '$lib/icons/lucide';
	import { type CaptureReceipt, documentHref } from './capture-receipt';

	let { receipt }: { receipt: CaptureReceipt } = $props();

	let undoState = $state<'idle' | 'undoing' | 'failed'>('idle');
	let undoneLocally = $state(false);
	let note = $state<string | null>(null);

	const undone = $derived(undoneLocally || receipt.status === 'undone');
	const savedStartHere = $derived(
		receipt.startHereDocumentId !== null && receipt.appliedSections.length > 0
	);
	const reviewCount = $derived(receipt.reviewSections.length);

	async function undo() {
		if (undoState === 'undoing' || undone) return;
		undoState = 'undoing';
		note = null;
		try {
			const response = await fetch(
				`/api/chat/capture-checkpoints/${encodeURIComponent(receipt.id)}/undo`,
				{ method: 'POST' }
			);
			const body = await response.json().catch(() => null);
			if (!response.ok || !body?.success) throw new Error(body?.error ?? 'Undo failed');
			const result = body.data as {
				undone: boolean;
				startHere: string;
				thinkingLog: string;
			};
			undoneLocally = result.undone;
			const edited = [
				result.startHere === 'changed_since' ? 'START HERE' : null,
				result.thinkingLog === 'changed_since' ? 'the thinking log' : null
			].filter(Boolean);
			note =
				edited.length > 0
					? `${edited.join(' and ')} changed since, so it was left as is.`
					: null;
			undoState = 'idle';
		} catch {
			undoState = 'failed';
			note = 'Could not undo. Try again.';
		}
	}
</script>

<div class="flex flex-col items-center gap-0.5 py-0.5" role="status">
	<div
		class="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-2xs text-muted-foreground"
	>
		<Check class="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
		{#if undone}
			<span>Capture undone</span>
		{:else}
			{#if savedStartHere || receipt.thinkingLogDocumentId}
				<span>
					Saved to
					{#if savedStartHere && receipt.startHereDocumentId}
						<a
							class="font-medium text-foreground underline-offset-2 hover:underline"
							href={documentHref(receipt.projectId, receipt.startHereDocumentId)}
							>START HERE</a
						>{#if receipt.thinkingLogDocumentId}{' · '}{/if}
					{/if}
					{#if receipt.thinkingLogDocumentId}
						<a
							class="font-medium text-foreground underline-offset-2 hover:underline"
							href={documentHref(receipt.projectId, receipt.thinkingLogDocumentId)}
							>thinking log</a
						>
					{/if}
				</span>
			{/if}
			{#if reviewCount > 0}
				{#if savedStartHere || receipt.thinkingLogDocumentId}<span aria-hidden="true"
						>·</span
					>{/if}
				<a class="underline-offset-2 hover:underline" href="/today"
					>{reviewCount === 1 ? '1 change' : `${reviewCount} changes`} to review</a
				>
			{/if}
			<span aria-hidden="true">·</span>
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded px-1 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				onclick={undo}
				disabled={undoState === 'undoing'}
				aria-label="Undo this capture"
			>
				{#if undoState === 'undoing'}
					<LoaderCircle class="h-3 w-3 animate-spin" aria-hidden="true" />
				{:else}
					<RotateCcw class="h-3 w-3" aria-hidden="true" />
				{/if}
				Undo
			</button>
		{/if}
	</div>
	{#if note}
		<p class="text-2xs text-muted-foreground">{note}</p>
	{/if}
</div>
