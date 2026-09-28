<!-- apps/web/src/lib/components/agent/StewardChip.svelte -->
<!-- INKPRINT: compact header control for the project steward (beta) -->
<!--
	Project stewards beta (docs/product/project-agents-plan-2026-09-25.md).
	Beside the project title in chat: "steward" when project chat speaks as the
	project's steward, "standard" when switched off to compare. Approve opens a
	review sheet with the exact charter text (or its changes since the last
	approval); approving sends that text's hash, so the server refuses if the
	document changed after the user opened it. Every change applies from the
	next message. Renders nothing unless the `project_steward` flag is on and
	the project has a charter.
-->
<script lang="ts" module>
	// Once any status read says the flag is off for this account, the chip stays
	// hidden without asking again for the rest of the page's life.
	let stewardDisabledForPage = false;
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { diffLines } from 'diff';
	import { Compass, ShieldCheck, LoaderCircle, TriangleAlert } from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		projectId: string;
		projectName?: string | null;
		/** Changes after each completed chat turn, so charter edits the turn made show up. */
		refreshKey?: number;
	}

	let { projectId, projectName = null, refreshKey = 0 }: Props = $props();

	type StewardStatus = {
		enabled: boolean;
		available?: boolean;
		active?: boolean;
		approvedAt?: string | null;
		charterDocumentId?: string | null;
		charterDocumentTitle?: string | null;
		pendingEdits?: boolean;
		charterSha256?: string | null;
		charterText?: string | null;
		approvedText?: string | null;
		charterTooLong?: boolean;
		charterMaxChars?: number;
	};

	/** What the review sheet shows, frozen when it opens so the text can't change under the reader. */
	type ReviewSnapshot = {
		firstApproval: boolean;
		documentTitle: string;
		charterText: string | null;
		approvedText: string | null;
		sha256: string | null;
		tooLong: boolean;
		maxChars: number;
	};

	type DiffRow = { kind: 'added' | 'removed' | 'same'; text: string };

	let status = $state<StewardStatus | null>(null);
	let busy = $state(false);
	let liveMessage = $state('');
	let reviewOpen = $state(false);
	let review = $state<ReviewSnapshot | null>(null);
	let reviewView = $state<'changes' | 'full'>('changes');
	let reviewError = $state<string | null>(null);

	// Plain (non-reactive) bookkeeping: which project the shown status belongs
	// to, and a counter bumped around every write so a status read that
	// overlaps a write can't overwrite the write's result.
	let loadedFor: string | null = null;
	let mutationSeq = 0;

	async function loadStatus(id: string, signal?: AbortSignal): Promise<void> {
		if (stewardDisabledForPage) return;
		const seq = mutationSeq;
		try {
			const response = await fetch(`/api/onto/projects/${id}/steward`, { signal });
			if (!response.ok) return;
			const payload = await response.json();
			const data = payload?.data as StewardStatus | undefined;
			if (!data || id !== projectId || seq !== mutationSeq || busy) return;
			if (!data.enabled) stewardDisabledForPage = true;
			status = data;
		} catch {
			// Aborted or offline: the chip keeps what it showed; chat is unaffected.
		}
	}

	$effect(() => {
		const id = projectId;
		void refreshKey;
		if (loadedFor !== id) {
			loadedFor = id;
			status = null;
			liveMessage = '';
			reviewOpen = false;
			review = null;
		}
		if (stewardDisabledForPage) return;
		const controller = new AbortController();
		untrack(() => void loadStatus(id, controller.signal));
		return () => controller.abort();
	});

	const visible = $derived(
		Boolean(status?.enabled && (status.available || status.charterDocumentId))
	);
	const label = $derived(projectName?.trim() || 'this project');

	type PostOutcome = { ok: boolean; httpStatus: number; error: string | null };

	/**
	 * POST to the steward route. Resolves null when the chat moved to another
	 * project while the request was in flight: its result belongs to nothing on
	 * screen, so nothing is applied or shown.
	 */
	async function post(body: Record<string, unknown>): Promise<PostOutcome | null> {
		const id = projectId;
		busy = true;
		mutationSeq += 1;
		try {
			const response = await fetch(`/api/onto/projects/${id}/steward`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await response.json().catch(() => null);
			if (id !== projectId) return null;
			if (response.ok && payload?.data) status = payload.data as StewardStatus;
			return {
				ok: response.ok,
				httpStatus: response.status,
				error: response.ok ? null : (payload?.error ?? null)
			};
		} catch {
			return id === projectId ? { ok: false, httpStatus: 0, error: null } : null;
		} finally {
			busy = false;
			mutationSeq += 1;
		}
	}

	function reportError(message: string) {
		liveMessage = message;
		toastService.error(message);
	}

	async function toggleSteward() {
		if (!status) return;
		liveMessage = '';
		const outcome = await post({ action: 'set_active', active: !status.active });
		if (outcome && !outcome.ok) reportError(outcome.error ?? 'Could not update the steward');
	}

	function snapshotFrom(current: StewardStatus): ReviewSnapshot {
		return {
			firstApproval: !current.available,
			documentTitle: current.charterDocumentTitle?.trim() || 'Steward charter',
			charterText: current.charterText ?? null,
			approvedText: current.approvedText ?? null,
			sha256: current.charterSha256 ?? null,
			tooLong: Boolean(current.charterTooLong),
			maxChars: current.charterMaxChars ?? 4000
		};
	}

	function openReview() {
		if (!status) return;
		review = snapshotFrom(status);
		reviewView = review.approvedText !== null ? 'changes' : 'full';
		reviewError = null;
		reviewOpen = true;
	}

	function closeReview() {
		if (busy) return;
		reviewOpen = false;
	}

	async function approveReviewed() {
		const snapshot = review;
		if (!snapshot?.sha256 || !snapshot.charterText || snapshot.tooLong) return;
		const id = projectId;
		reviewError = null;
		const outcome = await post({ action: 'approve_charter', expected_sha256: snapshot.sha256 });
		if (!outcome) return;
		if (outcome.ok) {
			reviewOpen = false;
			liveMessage = 'Charter approved. The steward follows it from your next message.';
			return;
		}
		if (outcome.httpStatus === 409) {
			// The document changed after the sheet opened: show the new text.
			await loadStatus(id);
			if (id !== projectId || !status) return;
			review = snapshotFrom(status);
			reviewView = review.approvedText !== null ? 'changes' : 'full';
		}
		reviewError = outcome.error ?? 'Could not approve the charter';
	}

	const diffRows = $derived.by((): DiffRow[] | null => {
		if (!review || review.approvedText === null || review.charterText === null) return null;
		const rows: DiffRow[] = [];
		// A trailing newline on both sides keeps an edited last line from reading
		// as a changed line just because a line was appended after it.
		for (const part of diffLines(`${review.approvedText}\n`, `${review.charterText}\n`)) {
			const kind: DiffRow['kind'] = part.added ? 'added' : part.removed ? 'removed' : 'same';
			for (const text of part.value.replace(/\n$/, '').split('\n')) rows.push({ kind, text });
		}
		return rows;
	});

	const diffCounts = $derived.by(() => {
		let added = 0;
		let removed = 0;
		for (const row of diffRows ?? []) {
			if (row.kind === 'added') added += 1;
			else if (row.kind === 'removed') removed += 1;
		}
		return { added, removed };
	});

	const canApprove = $derived(
		Boolean(review?.sha256 && review.charterText && !review.tooLong && !busy)
	);
</script>

{#if visible && status}
	<span class="inline-flex shrink-0 items-center gap-1">
		{#if status.available}
			<button
				type="button"
				onclick={() => void toggleSteward()}
				disabled={busy}
				aria-label={status.active
					? 'steward mode on, switch to standard chat'
					: 'standard chat, switch steward on'}
				class="inline-flex h-6 items-center gap-1 rounded-lg border px-2 micro-label font-semibold touch-manipulation pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 {status.active
					? 'border-accent bg-accent/10 text-accent'
					: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
				title={status.active
					? `${label} chat speaks as its steward: charter, story, and live facts. Switch to the standard chat to compare; applies from your next message.`
					: `Standard chat. Switch the ${label} steward back on; applies from your next message.`}
			>
				{#if busy}
					<LoaderCircle class="h-3 w-3 animate-spin motion-reduce:animate-none" />
				{:else}
					<Compass class="h-3 w-3" />
				{/if}
				<span>{status.active ? 'steward' : 'standard'}</span>
			</button>
		{/if}
		{#if status.pendingEdits}
			<button
				type="button"
				onclick={openReview}
				disabled={busy}
				aria-haspopup="dialog"
				class="inline-flex h-6 items-center gap-1 rounded-lg border border-warning/30 bg-warning/10 px-2 micro-label font-semibold text-warning touch-manipulation pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
				title={status.available
					? `"${status.charterDocumentTitle ?? 'Steward charter'}" has edits you haven't approved. The steward won't follow them until you review and approve them.`
					: `Review "${status.charterDocumentTitle ?? 'Steward charter'}" and approve it as the ${label} steward's standing orders.`}
			>
				<ShieldCheck class="h-3 w-3" />
				<span class="hidden sm:inline"
					>{status.available ? 'Approve edits' : 'Approve charter'}</span
				>
				<span class="sm:hidden">Approve</span>
			</button>
		{/if}
		<span class="sr-only" role="status">{liveMessage}</span>
	</span>

	<Modal
		bind:isOpen={reviewOpen}
		onClose={closeReview}
		title={review?.firstApproval ? 'Approve steward charter' : 'Approve charter edits'}
		size="md"
		closeOnBackdrop={!busy}
		closeOnEscape={!busy}
		persistent={busy}
	>
		{#snippet children()}
			{#if review}
				<div class="space-y-3 px-4 py-3">
					<p class="text-sm text-foreground">
						The steward follows these orders like system rules until you change them.
						Approve only text you have read.
					</p>

					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="min-w-0 truncate micro-label text-muted-foreground">
							{review.documentTitle}
						</p>
						{#if diffRows}
							<div
								class="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5"
								role="group"
								aria-label="Show"
							>
								<button
									type="button"
									aria-pressed={reviewView === 'changes'}
									onclick={() => (reviewView = 'changes')}
									class="min-h-11 rounded-md px-3 text-xs font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 {reviewView ===
									'changes'
										? 'bg-card text-foreground shadow-ink'
										: 'text-muted-foreground hover:text-foreground'}"
								>
									Changes
								</button>
								<button
									type="button"
									aria-pressed={reviewView === 'full'}
									onclick={() => (reviewView = 'full')}
									class="min-h-11 rounded-md px-3 text-xs font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 {reviewView ===
									'full'
										? 'bg-card text-foreground shadow-ink'
										: 'text-muted-foreground hover:text-foreground'}"
								>
									Full text
								</button>
							</div>
						{/if}
					</div>

					{#if review.charterText === null}
						<p
							class="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
						>
							There is nothing new to approve: the charter matches what the steward
							already follows.
						</p>
					{:else if diffRows && reviewView === 'changes'}
						<p class="text-xs text-muted-foreground">
							<span class="text-success">+{diffCounts.added}</span>
							<span class="text-destructive">&minus;{diffCounts.removed}</span>
							lines since your last approval
						</p>
						<div
							class="max-h-[45dvh] overflow-y-auto overscroll-contain rounded-md border border-border bg-background py-2 text-sm leading-relaxed shadow-ink-inner sm:max-h-[60vh]"
						>
							{#each diffRows as row, index (index)}
								<div
									class="flex gap-2 px-3 {row.kind === 'added'
										? 'bg-success/10 text-success'
										: row.kind === 'removed'
											? 'bg-destructive/10 text-destructive'
											: 'text-muted-foreground'}"
								>
									<span
										class="w-3 shrink-0 select-none font-mono"
										aria-hidden="true"
										>{row.kind === 'added'
											? '+'
											: row.kind === 'removed'
												? '−'
												: ' '}</span
									>
									{#if row.kind === 'added'}
										<ins
											class="min-w-0 flex-1 whitespace-pre-wrap break-words no-underline"
											><span class="sr-only">Added: </span>{row.text ||
												' '}</ins
										>
									{:else if row.kind === 'removed'}
										<del class="min-w-0 flex-1 whitespace-pre-wrap break-words"
											><span class="sr-only">Removed: </span>{row.text ||
												' '}</del
										>
									{:else}
										<span class="min-w-0 flex-1 whitespace-pre-wrap break-words"
											>{row.text || ' '}</span
										>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="max-h-[45dvh] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground shadow-ink-inner sm:max-h-[60vh]"
						>
							{review.charterText}
						</div>
					{/if}

					{#if review.tooLong && review.charterText !== null}
						<div
							class="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
						>
							<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
							<p>
								This charter is {review.charterText.length.toLocaleString()} characters;
								the steward's limit is {review.maxChars.toLocaleString()}. Shorten
								the document, then approve.
							</p>
						</div>
					{/if}

					{#if reviewError}
						<div
							class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
							role="alert"
						>
							<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
							<p>{reviewError}</p>
						</div>
					{/if}
				</div>
			{/if}
		{/snippet}

		{#snippet footer()}
			<div
				class="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end"
			>
				<Button
					variant="secondary"
					size="md"
					onclick={closeReview}
					disabled={busy}
					class="order-2 w-full sm:order-1 sm:w-auto"
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="md"
					onclick={() => void approveReviewed()}
					disabled={!canApprove}
					loading={busy}
					class="order-1 w-full sm:order-2 sm:w-auto"
				>
					Approve these orders
				</Button>
			</div>
		{/snippet}
	</Modal>
{/if}
