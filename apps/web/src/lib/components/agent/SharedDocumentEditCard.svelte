<!-- apps/web/src/lib/components/agent/SharedDocumentEditCard.svelte -->
<!--
	Confirm card for an edit Jev proposed to a document the parent project shares
	with its sub-projects (project hierarchy Phase 2). Shows the exact change and
	three choices; the click is the only consent. Resolves in place and stays
	resolved after reload (the server records the outcome on the tool result).
	INKPRINT: Thread texture (shared with), card weight.
-->
<script lang="ts">
	import {
		Ban,
		Check,
		Copy,
		ExternalLink,
		LoaderCircle,
		PencilLine,
		TriangleAlert,
		Users
	} from '$lib/icons/lucide';
	import DocumentChangeDiff from '$lib/components/ui/DocumentChangeDiff.svelte';
	import {
		describeSharedDocumentEditResolution,
		isSharedDocumentEditCardExpired,
		type SharedDocumentEditChoice,
		type SharedDocumentEditFieldChangeV1,
		type SharedDocumentEditResolutionV1
	} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
	import {
		chooseSharedDocumentEdit,
		type SharedDocumentEditCardView
	} from './shared-document-edit-cards';
	import { sharedDocumentEditCardResolutions } from './shared-document-edit-card-state.svelte';

	let {
		card,
		turnActive = false,
		onResolved
	}: {
		card: SharedDocumentEditCardView;
		/** The reply that showed this card is still streaming; choices wait for it. */
		turnActive?: boolean;
		onResolved?: (resolution: SharedDocumentEditResolutionV1) => void;
	} = $props();

	const uid = $props.id();
	const action = $derived(card.action);
	const resolution = $derived(
		sharedDocumentEditCardResolutions.get(card.action.card_id) ?? card.resolution
	);
	const resolved = $derived(resolution ? describeSharedDocumentEditResolution(resolution) : null);

	let busy = $state<SharedDocumentEditChoice | null>(null);
	let error = $state<string | null>(null);
	/** The server said this card can no longer be used (expired or gone). */
	let closedMessage = $state<string | null>(null);
	let announcement = $state('');

	const expired = $derived(!resolution && isSharedDocumentEditCardExpired(card.action));
	const sharedWith = $derived(
		`Shared with ${action.shared_with_count} sub-${action.shared_with_count === 1 ? 'project' : 'projects'}`
	);

	const FIELD_LABELS: Record<SharedDocumentEditFieldChangeV1['field'], string> = {
		title: 'Title',
		description: 'Description',
		state: 'Status',
		type: 'Type',
		metadata: 'Metadata'
	};

	function fieldLine(change: SharedDocumentEditFieldChangeV1): string {
		const label = FIELD_LABELS[change.field];
		if (change.field === 'description' || change.field === 'metadata') return `${label} updated`;
		return `${label}: ${change.from || '—'} → ${change.to || '—'}`;
	}

	const BUSY_LABELS: Record<SharedDocumentEditChoice, string> = {
		apply: 'Updating…',
		copy: 'Copying…',
		cancel: 'Cancelling…'
	};

	async function choose(choice: SharedDocumentEditChoice) {
		if (busy || resolution || turnActive || expired || closedMessage) return;
		busy = choice;
		error = null;
		const result = await chooseSharedDocumentEdit(card.action, choice);
		busy = null;
		if (result.status === 'resolved') {
			sharedDocumentEditCardResolutions.set(card.action.card_id, result.resolution);
			announcement = describeSharedDocumentEditResolution(result.resolution).text;
			onResolved?.(result.resolution);
			return;
		}
		if (result.code === 'CARD_EXPIRED' || result.code === 'CARD_NOT_FOUND') {
			closedMessage = result.message;
			announcement = result.message;
			return;
		}
		error = result.message;
	}

	const buttonBase =
		'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:min-h-9 sm:flex-none';
</script>

<article
	class="w-full max-w-xl min-w-0 rounded-lg border border-border bg-card shadow-ink tx tx-thread tx-weak"
	aria-labelledby="{uid}-title"
	data-testid="shared-document-edit-card"
>
	<header class="flex items-start gap-2.5 px-3 pt-3">
		<PencilLine class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		<div class="min-w-0 flex-1">
			<h3
				id="{uid}-title"
				class="text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]"
			>
				{action.document_title}
				<span class="font-medium text-muted-foreground">· {action.parent_name}</span>
			</h3>
			<p class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
				<Users class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{sharedWith}
			</p>
		</div>
	</header>

	{#if action.field_changes.length > 0}
		<ul class="mt-2 space-y-0.5 px-3 text-xs text-foreground" aria-label="Field changes">
			{#each action.field_changes as change (change.field)}
				<li class="[overflow-wrap:anywhere]">{fieldLine(change)}</li>
			{/each}
		</ul>
	{/if}

	{#if action.change}
		<div class="mt-2 px-3">
			<DocumentChangeDiff
				id="{uid}-diff"
				hunks={action.change.hunks}
				linesAdded={action.change.lines_added}
				linesRemoved={action.change.lines_removed}
				truncated={action.change.hunks_truncated}
				maxHeightClass="max-h-56"
			/>
		</div>
	{/if}

	<div class="mt-3 border-t border-border px-3 py-2.5">
		{#if resolved && resolution}
			<p
				class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold {resolution.outcome ===
					'stale' || resolution.outcome === 'unknown'
					? 'text-warning'
					: resolution.outcome === 'cancelled'
						? 'text-muted-foreground'
						: 'text-success'}"
				data-testid="shared-document-edit-card-result"
			>
				{#if resolution.outcome === 'stale' || resolution.outcome === 'unknown'}
					<TriangleAlert class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{:else if resolution.outcome === 'cancelled'}
					<Ban class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{:else}
					<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{/if}
				<span class="min-w-0 [overflow-wrap:anywhere]">{resolved.text}</span>
				{#if resolved.href}
					<a
						href={resolved.href}
						class="inline-flex min-h-11 items-center gap-1 rounded-sm text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
					>
						Open
						<ExternalLink class="h-3 w-3" aria-hidden="true" />
						<span class="sr-only">{resolution.copy?.title ?? action.document_title}</span>
					</a>
				{/if}
			</p>
		{:else if expired || closedMessage}
			<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
				<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
				<span>{closedMessage ?? 'This preview expired. Ask Jev again. Nothing changed.'}</span>
			</p>
		{:else}
			<div
				class="flex flex-wrap gap-2"
				role="group"
				aria-label="Choose what happens to this change"
				aria-describedby="{uid}-hint"
				aria-busy={busy !== null}
			>
				<button
					type="button"
					class="{buttonBase} bg-accent text-accent-foreground shadow-ink pressable hover:opacity-90"
					disabled={busy !== null || turnActive}
					onclick={() => choose('apply')}
				>
					{#if busy === 'apply'}
						<LoaderCircle
							class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
						{BUSY_LABELS.apply}
					{:else}
						<Check class="h-3.5 w-3.5" aria-hidden="true" />
						Update shared doc
					{/if}
				</button>
				<button
					type="button"
					class="{buttonBase} border border-border-strong bg-card text-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5"
					disabled={busy !== null || turnActive}
					onclick={() => choose('copy')}
				>
					{#if busy === 'copy'}
						<LoaderCircle
							class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
						{BUSY_LABELS.copy}
					{:else}
						<Copy class="h-3.5 w-3.5" aria-hidden="true" />
						Copy here
					{/if}
				</button>
				<button
					type="button"
					class="{buttonBase} text-muted-foreground hover:bg-muted/50 hover:text-foreground"
					disabled={busy !== null || turnActive}
					onclick={() => choose('cancel')}
				>
					{#if busy === 'cancel'}
						<LoaderCircle
							class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
						{BUSY_LABELS.cancel}
					{:else}
						Cancel
					{/if}
				</button>
			</div>
			<p id="{uid}-hint" class="mt-1.5 text-2xs leading-snug text-muted-foreground">
				{#if turnActive}
					You can choose when Jev finishes replying.
				{:else}
					Update changes the copy all {action.shared_with_count}
					{action.shared_with_count === 1 ? 'sub-project sees' : 'sub-projects see'}. Copy here
					gives this project its own copy with the change. Nothing changes until you choose.
				{/if}
			</p>
			{#if error}
				<p
					class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-foreground"
					role="alert"
				>
					{error}
				</p>
			{/if}
		{/if}
		<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
	</div>
</article>
