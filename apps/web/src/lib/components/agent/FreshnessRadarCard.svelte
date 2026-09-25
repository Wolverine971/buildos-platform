<!-- apps/web/src/lib/components/agent/FreshnessRadarCard.svelte -->
<!--
	Freshness radar card (Tasker 88). Lands in the chat about a minute after a brain dump:
	what the new information probably made out of date, one approval for the drafts, and undo
	for anything the radar already changed. Calm by design: a few words, no AI framing.
	Everything shown comes from the worker's card payload; live state comes from the scan-status
	route so a reopened chat shows what already happened.
-->
<script lang="ts">
	import type {
		FreshnessCardPayloadV1,
		FreshnessFlagStatus,
		FreshnessScanStatusV1
	} from '@buildos/shared-types';
	import {
		Check,
		ExternalLink,
		FileText,
		Flag,
		ListChecks,
		Loader2,
		MessageSquare,
		RotateCcw,
		Target
	} from '$lib/icons/lucide';
	import OnTrackGauge from '$lib/components/project/freshness/OnTrackGauge.svelte';
	import { notifyDataMutation } from '$lib/stores/projectDataMutations';
	import type { DataMutation } from './agent-chat.types';
	import {
		FRESHNESS_ITEM_STATE_LABEL,
		FRESHNESS_KIND_LABEL,
		FreshnessActionError,
		approveFreshnessBundle,
		autoAppliedUndoableUntil,
		describeUndoResult,
		draftInChatPromptFor,
		fetchFreshnessScanStatus,
		formatFreshnessPercent,
		freshnessBundleState,
		freshnessEntityHref,
		freshnessFlagView,
		freshnessItemState,
		hasUndoableFlags,
		markFreshnessFlagNotStale,
		remainingBundleOperationCount,
		retiredUndoableUntil,
		undoFreshnessScan,
		type FreshnessBundleState,
		type FreshnessCardEntityKind
	} from './freshness-radar-card';

	let {
		card,
		onDraftInChat,
		onReviewDeeper,
		reviewDisabled = false,
		fetchFn = fetch
	}: {
		card: FreshnessCardPayloadV1;
		/** Pre-fills the chat composer; the button is hidden without a handler. */
		onDraftInChat?: (prompt: string) => void;
		onReviewDeeper?: (card: FreshnessCardPayloadV1) => void;
		reviewDisabled?: boolean;
		fetchFn?: typeof fetch;
	} = $props();

	const uid = $props.id();

	const KIND_ICON: Record<FreshnessCardEntityKind, typeof ListChecks> = {
		task: ListChecks,
		document: FileText,
		goal: Target,
		milestone: Flag
	};

	const BUNDLE_STATE_LABEL: Record<Exclude<FreshnessBundleState, 'none' | 'pending'>, string> = {
		applying: 'Updating…',
		applied: 'Updated',
		failed: 'Some updates did not apply. They are still in your inbox.',
		dismissed: 'Dismissed',
		replaced: 'Replaced by a newer check'
	};

	let scanStatus = $state<FreshnessScanStatusV1 | null>(null);
	let localFlags = $state<Record<string, FreshnessFlagStatus>>({});
	let bundleIdOverride = $state<string | null>(null);
	let bundleStateOverride = $state<FreshnessBundleState | null>(null);
	let busy = $state<string | null>(null);
	let autoUndoNote = $state<string | null>(null);
	let retiredUndoNote = $state<string | null>(null);
	let errorText = $state<string | null>(null);
	let liveText = $state('');

	// Live state for a card restored from history: which flags were already acted on.
	$effect(() => {
		const projectId = card.projectId;
		const scanId = card.scanId;
		const controller = new AbortController();
		fetchFreshnessScanStatus(projectId, scanId, { fetchFn, signal: controller.signal })
			.then((next) => {
				scanStatus = next;
			})
			.catch(() => {
				// The payload alone keeps the card usable; actions report their own errors.
			});
		return () => controller.abort();
	});

	const nowMs = Date.now();

	const rows = $derived(
		card.items.slice(0, 3).map((item) => {
			const view = freshnessFlagView(item.flagId, scanStatus, localFlags);
			return { item, state: freshnessItemState(view.status) };
		})
	);

	const bundleId = $derived(
		bundleIdOverride ?? scanStatus?.bundle?.suggestionId ?? card.bundle?.suggestionId ?? null
	);

	const bundleState = $derived.by<FreshnessBundleState>(() => {
		if (bundleStateOverride) return bundleStateOverride;
		if (!card.bundle || !bundleId) return 'none';
		return freshnessBundleState(scanStatus?.bundle?.status ?? 'pending');
	});

	const operationCount = $derived(remainingBundleOperationCount(card, scanStatus, localFlags));

	const autoFlagIds = $derived(card.autoApplied.map((row) => row.flagId));
	const retiredFlagIds = $derived(card.inboxCleanup.retired.map((row) => row.flagId));
	const autoUndoable = $derived(
		hasUndoableFlags({
			flagIds: autoFlagIds,
			status: scanStatus,
			local: localFlags,
			undoableUntil: autoAppliedUndoableUntil(card),
			now: nowMs
		})
	);
	const retiredUndoable = $derived(
		hasUndoableFlags({
			flagIds: retiredFlagIds,
			status: scanStatus,
			local: localFlags,
			undoableUntil: retiredUndoableUntil(card),
			now: nowMs
		})
	);

	const hasSecondary = $derived(
		card.autoApplied.length > 0 ||
			card.inboxCleanup.retired.length > 0 ||
			card.inboxCleanup.possiblyStaleCount > 0 ||
			card.gaugeChanges.length > 0
	);

	function announce(text: string) {
		liveText = text;
	}

	function setFlags(flagIds: string[], status: FreshnessFlagStatus) {
		if (flagIds.length === 0) return;
		const next = { ...localFlags };
		for (const flagId of flagIds) next[flagId] = status;
		localFlags = next;
	}

	function notifyProjectChanged(mutations: DataMutation[]) {
		notifyDataMutation({
			hasChanges: true,
			totalMutations: Math.max(1, mutations.length),
			affectedProjectIds: [card.projectId],
			hasMessagesSent: false,
			mutations
		});
	}

	function errorMessage(error: unknown, fallback: string): string {
		if (error instanceof FreshnessActionError) {
			if (error.status === 409)
				return 'Things changed since this check. Nothing was updated.';
			return error.message || fallback;
		}
		return fallback;
	}

	async function approveBundle() {
		if (!bundleId || busy) return;
		busy = 'bundle';
		errorText = null;
		try {
			const outcome = await approveFreshnessBundle(card.projectId, bundleId, fetchFn);
			const drafted = rows
				.filter((row) => row.state === 'open' && row.item.disposition === 'drafted')
				.map((row) => row.item);
			if (outcome.superseded) {
				bundleStateOverride = 'replaced';
				announce('This check was replaced by a newer one.');
			} else if (outcome.failed) {
				bundleStateOverride = 'failed';
				announce(BUNDLE_STATE_LABEL.failed);
			} else if (outcome.status === 'applied') {
				bundleStateOverride = 'applied';
				setFlags(
					drafted.map((item) => item.flagId),
					'applied'
				);
				announce(`Updated ${outcome.appliedOperations ?? operationCount} items.`);
			} else {
				bundleStateOverride = freshnessBundleState(outcome.status);
			}
			if (outcome.appliedOperations && outcome.appliedOperations > 0) {
				notifyProjectChanged(
					drafted.map((item) => ({
						entityKind: item.entity.kind,
						entityId: item.entity.id,
						operation: 'update',
						projectIds: [card.projectId]
					}))
				);
			}
		} catch (error) {
			errorText = errorMessage(error, 'Could not update these. Try again.');
			announce(errorText);
		} finally {
			busy = null;
		}
	}

	async function markNotStale(flagId: string, wasDrafted: boolean) {
		if (busy) return;
		busy = `flag:${flagId}`;
		errorText = null;
		try {
			const result = await markFreshnessFlagNotStale(card.projectId, flagId, fetchFn);
			setFlags([flagId], result.flagStatus);
			if (result.suggestionId) {
				bundleIdOverride = result.suggestionId;
			} else if (wasDrafted) {
				// The last drafted change left the bundle: nothing is left to approve.
				bundleStateOverride = 'none';
			}
			announce('Marked as current.');
		} catch (error) {
			errorText = errorMessage(error, 'Could not save that. Try again.');
			announce(errorText);
		} finally {
			busy = null;
		}
	}

	async function undo(kind: 'auto' | 'retired') {
		if (busy) return;
		const flagIds = kind === 'auto' ? autoFlagIds : retiredFlagIds;
		busy = `undo:${kind}`;
		errorText = null;
		try {
			const result = await undoFreshnessScan(card.projectId, card.scanId, flagIds, fetchFn);
			setFlags(result.undone, 'undone');
			const skippedAs = (reason: string) =>
				result.skipped.filter((row) => row.reason === reason).map((row) => row.flagId);
			setFlags(skippedAs('already_undone'), 'undone');
			setFlags(skippedAs('changed_since'), 'resolved_by_change');
			setFlags(skippedAs('window_expired'), 'expired');
			const note = describeUndoResult(result, kind === 'auto' ? 'auto-update' : 'inbox item');
			if (kind === 'auto') autoUndoNote = note;
			else retiredUndoNote = note;
			announce(note);
			if (kind === 'auto' && result.undone.length > 0) {
				const undone = new Set(result.undone);
				notifyProjectChanged(
					card.autoApplied
						.filter((row) => undone.has(row.flagId))
						.map((row) => ({
							entityKind: 'task',
							entityId: row.entity.id,
							operation: 'update',
							projectIds: [card.projectId]
						}))
				);
			}
		} catch (error) {
			errorText = errorMessage(error, 'Could not undo. Try again.');
			announce(errorText);
		} finally {
			busy = null;
		}
	}

	const secondaryButton =
		'inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-ink pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:min-h-8';
	const linkButton =
		'inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-accent transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:min-h-8';
</script>

<section
	class="min-w-0 rounded-lg border border-border bg-card p-3 text-foreground shadow-ink tx tx-frame tx-weak sm:p-4"
	aria-labelledby="{uid}-heading"
	data-testid="freshness-radar-card"
>
	<header class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			{#if card.projectName}
				<p class="micro-label truncate text-muted-foreground">{card.projectName}</p>
			{/if}
			<h3 id="{uid}-heading" class="mt-0.5 text-sm font-semibold leading-snug">
				{card.headline}
			</h3>
		</div>
		{#if rows.length > 0}
			<span
				class="shrink-0 pt-0.5 text-2xs text-muted-foreground"
				title="Percentages are a model estimate of how likely each record is out of date. They are not yet calibrated on your projects."
			>
				Model estimate
			</span>
		{/if}
	</header>

	{#if rows.length > 0}
		<ul
			class="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border bg-background/60"
		>
			{#each rows as row (row.item.flagId)}
				{@const item = row.item}
				{@const KindIcon = KIND_ICON[item.entity.kind]}
				{@const percent = formatFreshnessPercent(item.probability)}
				{@const closed = row.state !== 'open'}
				<li
					class="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
					data-state={row.state}
				>
					<div class="min-w-0 flex-1" class:opacity-70={closed}>
						<div class="flex min-w-0 items-center gap-2">
							<KindIcon
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<a
								href={freshnessEntityHref(card.projectId, item.entity)}
								target="_blank"
								rel="noopener noreferrer"
								class="min-w-0 truncate text-sm font-medium text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title={item.entity.title}
							>
								{item.entity.title}<span class="sr-only"
									>, {FRESHNESS_KIND_LABEL[item.entity.kind].toLowerCase()}, opens
									in a new tab</span
								>
							</a>
							<span
								class="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground"
								aria-label="{percent} likely out of date, model estimate"
							>
								{percent}
							</span>
						</div>
						{#if item.proposal}
							<p class="mt-0.5 pl-5 text-xs text-foreground/80">
								{item.proposal.summary}
							</p>
						{:else if item.reason}
							<p class="mt-0.5 line-clamp-3 pl-5 text-xs text-foreground/80">
								{item.reason}
							</p>
						{:else if item.evidenceExcerpt}
							<p
								class="mt-0.5 line-clamp-2 pl-5 text-xs italic text-muted-foreground"
							>
								“{item.evidenceExcerpt}”
							</p>
						{/if}
					</div>
					<div class="flex shrink-0 flex-wrap items-center gap-1.5 pl-5 sm:pl-2">
						{#if closed}
							<span
								class="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground"
							>
								{#if row.state === 'updated' || row.state === 'not_stale'}
									<Check class="h-3 w-3" aria-hidden="true" />
								{/if}
								{FRESHNESS_ITEM_STATE_LABEL[
									row.state as Exclude<typeof row.state, 'open'>
								]}
							</span>
						{:else}
							{#if !item.proposal && onDraftInChat}
								<button
									type="button"
									class={secondaryButton}
									disabled={busy !== null}
									onclick={() => onDraftInChat?.(draftInChatPromptFor(item))}
									aria-label="Fix {item.entity.title} in chat"
								>
									<MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
									Fix in chat
								</button>
							{/if}
							<button
								type="button"
								class={secondaryButton}
								disabled={busy !== null}
								onclick={() =>
									markNotStale(item.flagId, item.disposition === 'drafted')}
								aria-label="{item.entity.title} is not out of date"
							>
								{#if busy === `flag:${item.flagId}`}
									<Loader2
										class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
								{/if}
								Not out of date
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if card.moreCount > 0}
		<a
			href="/projects/{encodeURIComponent(card.projectId)}"
			target="_blank"
			rel="noopener noreferrer"
			class="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			+{card.moreCount} more on the project
			<ExternalLink class="h-3 w-3" aria-hidden="true" /><span class="sr-only"
				>, opens in a new tab</span
			>
		</a>
	{/if}

	{#if onReviewDeeper}
		<button
			type="button"
			class="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"
			disabled={busy !== null || reviewDisabled}
			onclick={() => onReviewDeeper?.(card)}
		>
			<MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
			Review deeper
		</button>
		<p class="mt-1 text-xs text-muted-foreground">Prepare a read-only review in chat.</p>
	{/if}

	{#if bundleState !== 'none'}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if bundleState === 'pending'}
				<button
					type="button"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink pressable hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"
					disabled={busy !== null || operationCount === 0}
					onclick={approveBundle}
					aria-label="Update these {operationCount} {operationCount === 1
						? 'item'
						: 'items'}"
				>
					{#if busy === 'bundle'}
						<Loader2
							class="h-4 w-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					{/if}
					Update these
					<span class="tabular-nums opacity-80" aria-hidden="true"
						>· {operationCount}</span
					>
				</button>
			{:else}
				<p
					class="inline-flex items-center gap-1.5 text-xs font-medium {bundleState ===
					'failed'
						? 'text-foreground'
						: 'text-muted-foreground'}"
					data-bundle-state={bundleState}
				>
					{#if bundleState === 'applied'}
						<Check class="h-3.5 w-3.5 text-success" aria-hidden="true" />
					{/if}
					{BUNDLE_STATE_LABEL[bundleState]}
				</p>
			{/if}
		</div>
	{/if}

	{#if hasSecondary}
		<div class="mt-3 space-y-2 border-t border-border pt-3 text-xs">
			{#if card.autoApplied.length > 0}
				<div>
					<div class="flex flex-wrap items-center gap-x-2">
						<span class="font-medium text-foreground">
							Auto-updated {card.autoApplied.length}
						</span>
						{#if autoUndoNote}
							<span class="text-muted-foreground">· {autoUndoNote}</span>
						{:else if autoUndoable}
							<span class="text-muted-foreground" aria-hidden="true">·</span>
							<button
								type="button"
								class={linkButton}
								disabled={busy !== null}
								onclick={() => undo('auto')}
								aria-label="Undo {card.autoApplied.length} automatic {card
									.autoApplied.length === 1
									? 'update'
									: 'updates'}"
							>
								{#if busy === 'undo:auto'}
									<Loader2
										class="h-3 w-3 animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
								{:else}
									<RotateCcw class="h-3 w-3" aria-hidden="true" />
								{/if}
								Undo
							</button>
						{/if}
					</div>
					<ul class="mt-0.5 space-y-0.5 text-muted-foreground">
						{#each card.autoApplied as row (row.flagId)}
							<li class="truncate">
								<span class="text-foreground/80">{row.entity.title}</span> · {row.summary}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if card.inboxCleanup.retired.length > 0}
				<div class="flex flex-wrap items-center gap-x-2">
					<span
						class="font-medium text-foreground"
						title={card.inboxCleanup.retired.map((row) => row.title).join('\n')}
					>
						Retired {card.inboxCleanup.retired.length} stale inbox {card.inboxCleanup
							.retired.length === 1
							? 'item'
							: 'items'}
					</span>
					{#if retiredUndoNote}
						<span class="text-muted-foreground">· {retiredUndoNote}</span>
					{:else if retiredUndoable}
						<span class="text-muted-foreground" aria-hidden="true">·</span>
						<button
							type="button"
							class={linkButton}
							disabled={busy !== null}
							onclick={() => undo('retired')}
							aria-label="Restore {card.inboxCleanup.retired
								.length} retired inbox {card.inboxCleanup.retired.length === 1
								? 'item'
								: 'items'}"
						>
							{#if busy === 'undo:retired'}
								<Loader2
									class="h-3 w-3 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{:else}
								<RotateCcw class="h-3 w-3" aria-hidden="true" />
							{/if}
							Undo
						</button>
					{/if}
				</div>
			{/if}

			{#if card.inboxCleanup.possiblyStaleCount > 0}
				<p class="text-muted-foreground">
					{card.inboxCleanup.possiblyStaleCount} inbox {card.inboxCleanup
						.possiblyStaleCount === 1
						? 'item'
						: 'items'} possibly stale
				</p>
			{/if}

			{#if card.gaugeChanges.length > 0}
				<ul class="space-y-1">
					{#each card.gaugeChanges as change (change.entity.id)}
						{@const GaugeIcon = change.entity.kind === 'goal' ? Target : Flag}
						<li class="flex min-w-0 items-center gap-2">
							<GaugeIcon
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span
								class="min-w-0 truncate text-foreground/80"
								title={change.entity.title}>{change.entity.title}</span
							>
							<OnTrackGauge
								gauge={change.to}
								size="xs"
								subject={change.entity.title}
								class="ml-auto"
							/>
							{#if change.from && change.from !== change.to}
								<span class="shrink-0 text-2xs text-muted-foreground"
									>was {change.from.replace('_', ' ')}</span
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if errorText}
		<p class="mt-2 text-xs font-medium text-destructive" role="alert">{errorText}</p>
	{/if}
	<p class="sr-only" aria-live="polite">{liveText}</p>
</section>
