<!-- apps/web/src/lib/components/inbox/InboxProjectCleanup.svelte -->
<!--
	Tasker 112: a project's one living "Project cleanup" change set in the AI Inbox.
	Pick verified changes and apply them together; each still applies through its own
	suggestion decision (own verification, result and trail), so one failure never blocks
	the rest. Findings are marked done or not needed in one tap; a quick note hands an item
	to Jev, who applies it, sets it aside or passes it to an agent. Anything not picked
	stays for later. Triage walks every item one at a time.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import InboxCleanupChangeList from './InboxCleanupChangeList.svelte';
	import InboxProjectManagerBrief from './InboxProjectManagerBrief.svelte';
	import {
		AlertTriangle,
		Check,
		ChevronDown,
		CircleCheck,
		Clock3,
		FileText,
		Flag,
		History,
		ListChecks,
		MessageCircle,
		RefreshCw,
		Send,
		Target,
		X,
		Zap
	} from '$lib/icons/lucide';
	import type {
		ProjectCleanupItem,
		ProjectCleanupView,
		ProjectSuggestionReviewItem
	} from '@buildos/shared-types';
	import { sendCleanupNote } from './cleanup-note.client';
	import {
		CLEANUP_SECTION_LABEL,
		CLEANUP_SOURCE_LABEL,
		addressDecisionsFor,
		approveDecisionsFor,
		cleanupCloseReasonText,
		cleanupCountsLine,
		cleanupItemCautions,
		cleanupResultLabel,
		cleanupSeenLine,
		dismissDecisionsFor,
		formatCleanupDate,
		isCleanupItemSelectable,
		orderedCleanupGroups,
		summarizeCleanupItemOutcome,
		type CleanupDecision,
		type CleanupItemResult,
		type CleanupOutcome
	} from './project-cleanup-presentation';

	type Receipt = CleanupItemResult & { id: string; title: string };
	type JevReply = { id: string; title: string; reply: string; ok: boolean };
	type PendingKind = 'apply' | 'dismiss' | 'address' | 'reload';

	let {
		view = null,
		projectId,
		canDecide = false,
		decisionDisabledReason = null,
		snoozing = false,
		openingChat = false,
		onSnooze,
		onDiscuss,
		onFixInChat,
		onTriage,
		onDecided
	}: {
		view?: ProjectCleanupView | null;
		projectId: string;
		canDecide?: boolean;
		decisionDisabledReason?: string | null;
		snoozing?: boolean;
		openingChat?: boolean;
		onSnooze?: () => void;
		/** Discuss the whole card (null) or one item. */
		onDiscuss?: (item: ProjectCleanupItem | null) => void;
		onFixInChat?: (reviewItem: ProjectSuggestionReviewItem, item: ProjectCleanupItem) => void;
		/** Walk every item one at a time. */
		onTriage?: () => void;
		/** After a save: items handled and the freshly verified view. */
		onDecided?: (summary: { handled: number; view: ProjectCleanupView | null }) => void;
	} = $props();

	const uid = $props.id();

	// The view a save returned wins until the parent hands down a newer one.
	let override = $state.raw<{
		base: ProjectCleanupView | null;
		view: ProjectCleanupView;
	} | null>(null);
	const current = $derived(override && override.base === view ? override.view : view);

	let selected = $state.raw<Set<string>>(new Set());
	let pending = $state<{ kind: PendingKind; itemId: string | null } | null>(null);
	let receipts = $state.raw<Receipt[]>([]);
	let changedIds = $state.raw<Set<string>>(new Set());
	let requestError = $state<string | null>(null);
	let notingId = $state<string | null>(null);
	let noteText = $state('');
	let noteSendingIds = $state.raw<Set<string>>(new Set());
	let jevReplies = $state.raw<JevReply[]>([]);
	let auditOpen = $state(false);
	let auditLoading = $state(false);
	let auditError = $state<string | null>(null);
	let auditRecord = $state.raw<Record<string, unknown> | null>(null);

	const busy = $derived(pending !== null);
	const groups = $derived(orderedCleanupGroups(current));
	const itemsById = $derived(new Map((current?.items ?? []).map((item) => [item.id, item])));
	const readyIds = $derived(
		(current?.items ?? [])
			.filter((item) => item.section === 'safe_cleanup' && isCleanupItemSelectable(item))
			.map((item) => item.id)
	);
	const selectableCount = $derived(
		(current?.items ?? []).filter((item) => isCleanupItemSelectable(item)).length
	);
	const selectedItems = $derived(
		[...selected]
			.map((id) => itemsById.get(id))
			.filter((item): item is ProjectCleanupItem =>
				Boolean(item && isCleanupItemSelectable(item))
			)
	);
	const allReadySelected = $derived(
		readyIds.length > 0 && readyIds.every((id) => selected.has(id))
	);
	const openCount = $derived(
		current ? current.counts.safe_cleanup + current.counts.needs_call + current.counts.note : 0
	);
	const headline = $derived(
		current ? (current.bottom_line ?? cleanupCountsLine(current.counts)) : 'Project cleanup'
	);
	const countChips = $derived(
		current
			? [
					{
						key: 'safe_cleanup',
						label: CLEANUP_SECTION_LABEL.safe_cleanup,
						count: current.counts.safe_cleanup,
						cls: 'border-success/35 bg-success/10 text-success'
					},
					{
						key: 'needs_call',
						label: CLEANUP_SECTION_LABEL.needs_call,
						count: current.counts.needs_call,
						cls: 'border-accent/35 bg-accent/10 text-accent'
					},
					{
						key: 'note',
						label: CLEANUP_SECTION_LABEL.note,
						count: current.counts.note,
						cls: 'border-border bg-muted/50 text-muted-foreground'
					}
				].filter((chip) => chip.count > 0)
			: []
	);
	const auditDate = $derived(formatCleanupDate(current?.latest_audit?.created_at));

	const REVIEW_ICON = {
		task: ListChecks,
		document: FileText,
		goal: Target,
		milestone: Flag
	} as const;

	function cleanupUrl(): string {
		return `/api/onto/projects/${encodeURIComponent(projectId)}/cleanup`;
	}

	function toggle(id: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(id);
		else next.delete(id);
		selected = next;
	}

	function selectAllReady() {
		selected = new Set([...selected, ...readyIds]);
	}

	function groupPickIds(items: ProjectCleanupItem[]): string[] {
		return items.filter((item) => isCleanupItemSelectable(item)).map((item) => item.id);
	}

	function toggleGroup(ids: string[], checked: boolean) {
		const next = new Set(selected);
		for (const id of ids) {
			if (checked) next.add(id);
			else next.delete(id);
		}
		selected = next;
	}

	async function submit(
		kind: Exclude<PendingKind, 'reload'>,
		decisions: CleanupDecision[],
		items: ProjectCleanupItem[],
		itemId: string | null = null
	): Promise<boolean> {
		if (busy || decisions.length === 0) return false;
		pending = { kind, itemId };
		requestError = null;
		try {
			const res = await fetch(cleanupUrl(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decisions })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Could not save your choices');
			const outcomes = (json?.data?.outcomes ?? []) as CleanupOutcome[];
			const nextView = (json?.data?.view ?? null) as ProjectCleanupView | null;
			const nextReceipts = items.flatMap((item): Receipt[] => {
				const result = summarizeCleanupItemOutcome(item, outcomes);
				return result ? [{ ...result, id: item.id, title: item.title }] : [];
			});
			const submittedIds = new Set(items.map((item) => item.id));
			receipts = nextReceipts;
			changedIds = new Set(
				nextReceipts.filter((receipt) => receipt.status === 'changed').map((r) => r.id)
			);
			selected = new Set([...selected].filter((id) => !submittedIds.has(id)));
			if (nextView) override = { base: view, view: nextView };
			onDecided?.({
				handled: nextReceipts.filter(
					(receipt) => receipt.status !== 'changed' && receipt.status !== 'failed'
				).length,
				view: nextView
			});
			return true;
		} catch (error) {
			requestError = error instanceof Error ? error.message : 'Could not save your choices';
			return false;
		} finally {
			pending = null;
		}
	}

	function applySelected() {
		const items = selectedItems;
		if (!items.length) return;
		void submit('apply', approveDecisionsFor(items), items);
	}

	function markDone(item: ProjectCleanupItem) {
		void submit('address', addressDecisionsFor(item), [item], item.id);
	}

	// One tap: "Not needed" never asks why. A reason, if there is one, goes in a note to Jev.
	function markNotNeeded(item: ProjectCleanupItem) {
		void submit('dismiss', dismissDecisionsFor(item, 'not_relevant'), [item], item.id);
	}

	function toggleNote(item: ProjectCleanupItem) {
		if (notingId === item.id) {
			notingId = null;
			return;
		}
		notingId = item.id;
		noteText = '';
		void tick().then(() =>
			document
				.getElementById(`${uid}-item-${item.id}-note`)
				?.querySelector<HTMLTextAreaElement>('textarea')
				?.focus()
		);
	}

	async function sendNote(item: ProjectCleanupItem) {
		const note = noteText.trim();
		if (!note || noteSendingIds.has(item.id)) return;
		noteSendingIds = new Set(noteSendingIds).add(item.id);
		notingId = null;
		noteText = '';
		const result = await sendCleanupNote({ projectId, item, note });
		const sending = new Set(noteSendingIds);
		sending.delete(item.id);
		noteSendingIds = sending;
		jevReplies = [
			...jevReplies.filter((entry) => entry.id !== item.id),
			{
				id: item.id,
				title: item.title,
				reply: result.ok ? result.reply : result.message,
				ok: result.ok
			}
		];
		if (result.ok && result.view) {
			selected = new Set([...selected].filter((id) => id !== item.id));
			override = { base: view, view: result.view };
			onDecided?.({ handled: 1, view: result.view });
		}
	}

	function handleNoteKeydown(event: KeyboardEvent, item: ProjectCleanupItem) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void sendNote(item);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			notingId = null;
		}
	}

	async function reload() {
		if (busy) return;
		pending = { kind: 'reload', itemId: null };
		requestError = null;
		try {
			const res = await fetch(cleanupUrl());
			const json = await res.json().catch(() => null);
			if (!res.ok || !json?.data?.view) {
				throw new Error(json?.error ?? 'Could not load the cleanup list');
			}
			override = { base: view, view: json.data.view as ProjectCleanupView };
		} catch (error) {
			requestError =
				error instanceof Error ? error.message : 'Could not load the cleanup list';
		} finally {
			pending = null;
		}
	}

	async function toggleAuditReport() {
		auditOpen = !auditOpen;
		const auditId = current?.latest_audit?.id;
		if (!auditOpen || auditRecord || auditLoading || !auditId) return;
		auditLoading = true;
		auditError = null;
		try {
			const res = await fetch(
				`/api/onto/projects/${encodeURIComponent(projectId)}/audits/${encodeURIComponent(auditId)}`
			);
			const json = await res.json().catch(() => null);
			if (!res.ok || !json?.data?.audit) {
				throw new Error(json?.error ?? 'Could not open the audit report');
			}
			auditRecord = json.data.audit as Record<string, unknown>;
		} catch (error) {
			auditError = error instanceof Error ? error.message : 'Could not open the audit report';
		} finally {
			auditLoading = false;
		}
	}
</script>

<div class="min-w-0 space-y-3">
	{#if !current}
		<div class="rounded-md border border-border bg-muted/30 p-3">
			<p class="text-sm font-semibold text-foreground">Project cleanup</p>
			<p class="mt-1 text-xs text-muted-foreground">
				This project's cleanup list didn't load.
			</p>
			<Button
				variant="outline"
				size="sm"
				icon={RefreshCw}
				onclick={reload}
				loading={pending?.kind === 'reload'}
				disabled={busy}
				class="mt-2 text-xs"
			>
				Try again
			</Button>
		</div>
	{:else}
		<div class="min-w-0">
			<p class="micro-label text-accent">Project cleanup</p>
			<p class="mt-1 break-words text-base font-semibold leading-snug text-foreground">
				{headline}
			</p>
			{#if current.recommendation}
				<p class="mt-1 break-words text-sm leading-relaxed text-foreground/80">
					{current.recommendation}
				</p>
			{/if}
			{#if countChips.length}
				<ul class="mt-2 flex flex-wrap gap-1.5" aria-label="What's open">
					{#each countChips as chip (chip.key)}
						<li
							class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold {chip.cls}"
						>
							<span class="stamp">{chip.count}</span>
							{chip.label}
						</li>
					{/each}
				</ul>
			{/if}
			{#if onTriage && canDecide && openCount > 0}
				<Button
					variant="primary"
					size="sm"
					icon={Zap}
					onclick={() => onTriage?.()}
					disabled={busy}
					class="mt-2 w-full text-xs sm:w-auto"
				>
					Triage {openCount} item{openCount === 1 ? '' : 's'} one at a time
				</Button>
			{/if}
			{#if current.latest_audit}
				<button
					type="button"
					onclick={toggleAuditReport}
					aria-expanded={auditOpen}
					aria-controls={`${uid}-audit`}
					class="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
				>
					<FileText class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{auditDate ? `From the ${auditDate} audit` : 'From the latest audit'} — {auditOpen
						? 'hide report'
						: 'open report'}
				</button>
				{#if auditOpen}
					<div
						id={`${uid}-audit`}
						class="mt-1 rounded-md border border-border bg-card p-3"
					>
						{#if auditLoading}
							<p role="status" class="text-xs text-muted-foreground">
								Opening the audit report…
							</p>
						{:else if auditError}
							<p role="alert" class="text-xs text-destructive">{auditError}</p>
						{:else if auditRecord}
							<InboxProjectManagerBrief audit={auditRecord} {projectId} />
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<div aria-live="polite" class="space-y-2">
			{#if jevReplies.length}
				<div class="rounded-md border border-accent/25 bg-accent/5 p-2.5">
					<p class="micro-label text-accent">Jev</p>
					<ul class="mt-1 space-y-1">
						{#each jevReplies as entry (entry.id)}
							<li class="flex min-w-0 items-start gap-1.5 text-xs">
								{#if entry.ok}
									<MessageCircle
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
										aria-hidden="true"
									/>
								{:else}
									<X
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
										aria-hidden="true"
									/>
								{/if}
								<span class="min-w-0 break-words text-foreground">
									<span class="font-semibold">{entry.title}:</span>
									{entry.reply}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if receipts.length}
				<div class="rounded-md border border-border bg-muted/30 p-2.5">
					<p class="micro-label text-muted-foreground">Just now</p>
					<ul class="mt-1 space-y-1">
						{#each receipts as receipt (receipt.id)}
							<li class="flex min-w-0 items-start gap-1.5 text-xs">
								{#if receipt.status === 'failed'}
									<X
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
										aria-hidden="true"
									/>
								{:else if receipt.status === 'changed'}
									<AlertTriangle
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
										aria-hidden="true"
									/>
								{:else}
									<Check
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
										aria-hidden="true"
									/>
								{/if}
								<span class="min-w-0 break-words text-foreground">
									<span class="font-semibold">{cleanupResultLabel(receipt)}:</span
									>
									{receipt.title}
									{#if receipt.status === 'failed' && receipt.message}
										<span class="text-muted-foreground"
											>— {receipt.message}</span
										>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		{#if requestError}
			<p
				role="alert"
				class="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
			>
				{requestError}
			</p>
		{/if}

		{#if current.items.length === 0}
			<div class="rounded-md border border-dashed border-border px-3 py-6 text-center">
				<CircleCheck class="mx-auto h-6 w-6 text-success" aria-hidden="true" />
				<p class="mt-2 text-sm font-semibold text-foreground">
					Nothing to clean up right now
				</p>
				<p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
					New findings from reviews, audits and freshness checks gather here.
				</p>
			</div>
		{/if}

		{#each groups as group, groupIndex (group.key)}
			{@const pickIds = canDecide ? groupPickIds(group.items) : []}
			<section aria-labelledby={`${uid}-group-${groupIndex}`} class="min-w-0">
				<div class="flex flex-wrap items-baseline justify-between gap-x-2">
					<h3
						id={`${uid}-group-${groupIndex}`}
						class="break-words text-sm font-semibold text-foreground"
					>
						{group.title}
						<span class="stamp font-normal text-muted-foreground"
							>({group.items.length})</span
						>
					</h3>
					{#if group.title !== CLEANUP_SECTION_LABEL[group.section]}
						<span class="micro-label text-muted-foreground">
							{CLEANUP_SECTION_LABEL[group.section]}
						</span>
					{/if}
				</div>
				{#if group.recommendation}
					<p class="mt-0.5 break-words text-xs text-muted-foreground">
						{group.recommendation}
					</p>
				{/if}
				{#if pickIds.length > 1}
					{@const pickedCount = pickIds.filter((id) => selected.has(id)).length}
					<label
						class="-ml-1 mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-xs font-semibold text-foreground focus-within:ring-2 focus-within:ring-ring"
					>
						<input
							type="checkbox"
							checked={pickedCount === pickIds.length}
							indeterminate={pickedCount > 0 && pickedCount < pickIds.length}
							disabled={busy}
							onchange={(event) => toggleGroup(pickIds, event.currentTarget.checked)}
							class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
						/>
						Select all {pickIds.length}
					</label>
				{/if}

				<ul class="mt-2 space-y-2">
					{#each group.items as item (item.id)}
						{@const selectable = canDecide && isCleanupItemSelectable(item)}
						{@const cautions = cleanupItemCautions(item)}
						{@const seen = cleanupSeenLine(item)}
						{@const hasChanges = item.rows.some(
							(row) => (row.verified_operations?.length ?? 0) > 0
						)}
						{@const itemDomId = `${uid}-item-${item.id}`}
						{@const itemBusy = pending?.itemId === item.id}
						<li
							class="rounded-md border p-2.5 shadow-ink-inner {selected.has(item.id)
								? 'border-accent/40 bg-accent/5'
								: 'border-border bg-background'}"
						>
							<div class="flex min-w-0 items-start gap-1">
								{#if selectable}
									<label
										class="-my-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
									>
										<input
											id={`${itemDomId}-pick`}
											type="checkbox"
											checked={selected.has(item.id)}
											disabled={busy}
											aria-labelledby={`${itemDomId}-title`}
											onchange={(event) =>
												toggle(item.id, event.currentTarget.checked)}
											class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</label>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<span
											class="inline-flex items-center rounded border border-border bg-muted/50 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
										>
											{CLEANUP_SOURCE_LABEL[item.source] ?? 'Review'}
										</span>
										{#if changedIds.has(item.id)}
											<span
												class="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-foreground"
											>
												<AlertTriangle
													class="h-3 w-3 text-warning"
													aria-hidden="true"
												/>
												Updated — review again
											</span>
										{/if}
									</div>
									{#if selectable}
										<label
											id={`${itemDomId}-title`}
											for={`${itemDomId}-pick`}
											class="mt-1 block cursor-pointer break-words text-sm font-semibold text-foreground"
										>
											{item.title}
										</label>
									{:else}
										<p
											id={`${itemDomId}-title`}
											class="mt-1 break-words text-sm font-semibold text-foreground"
										>
											{item.title}
										</p>
									{/if}
									{#if item.summary && item.summary !== item.title}
										<p class="mt-0.5 break-words text-xs text-muted-foreground">
											{item.summary}
										</p>
									{/if}
									{#if seen}
										<p
											class="mt-1 inline-flex items-center gap-1 text-2xs text-muted-foreground"
										>
											<History class="h-3 w-3 shrink-0" aria-hidden="true" />
											{seen}
										</p>
									{/if}
									{#if cautions.length}
										<ul class="mt-1.5 space-y-1" aria-label="Cautions">
											{#each cautions as caution (caution)}
												<li
													class="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-2xs text-foreground"
												>
													<AlertTriangle
														class="mt-0.5 h-3 w-3 shrink-0 text-warning"
														aria-hidden="true"
													/>
													<span class="min-w-0 break-words"
														>{caution}</span
													>
												</li>
											{/each}
										</ul>
									{/if}
									{#if hasChanges}
										<details class="group mt-1">
											<summary
												class="-ml-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md px-1 text-2xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
											>
												<ChevronDown
													class="h-3 w-3 shrink-0 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none"
													aria-hidden="true"
												/>
												What changes
											</summary>
											<div class="mt-1">
												<InboxCleanupChangeList
													rows={item.rows}
													showHeadlines={item.rows.length > 1}
												/>
											</div>
										</details>
									{/if}
									{#if item.review_items?.length}
										<ul class="mt-2 space-y-1.5" aria-label="Out of date">
											{#each item.review_items as reviewItem (reviewItem.concern_id)}
												{@const Icon =
													REVIEW_ICON[reviewItem.entity_type] ?? FileText}
												<li
													class="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
												>
													<div class="flex min-w-0 items-start gap-2">
														<Icon
															class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
															aria-hidden="true"
														/>
														<div class="min-w-0">
															<p
																class="break-words text-xs font-medium text-foreground"
															>
																{reviewItem.title}
															</p>
															{#if reviewItem.reason}
																<p
																	class="mt-0.5 break-words text-2xs text-muted-foreground"
																>
																	{reviewItem.reason}
																</p>
															{/if}
														</div>
													</div>
													{#if onFixInChat && canDecide}
														<Button
															variant="outline"
															size="sm"
															icon={MessageCircle}
															onclick={() =>
																onFixInChat?.(reviewItem, item)}
															aria-label={`Fix in chat: ${reviewItem.title}`}
															class="w-full shrink-0 text-xs sm:w-auto"
														>
															Fix in chat
														</Button>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
									{#if canDecide}
										<div class="mt-2 flex flex-wrap gap-1.5">
											{#if !item.executable}
												<Button
													variant="outline"
													size="sm"
													icon={Check}
													onclick={() => markDone(item)}
													disabled={busy}
													loading={itemBusy &&
														pending?.kind === 'address'}
													aria-label={`Done: ${item.title}`}
													class="text-xs"
												>
													Done
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="sm"
												icon={X}
												onclick={() => markNotNeeded(item)}
												disabled={busy || noteSendingIds.has(item.id)}
												loading={itemBusy && pending?.kind === 'dismiss'}
												aria-label={`Not needed: ${item.title}`}
												class="text-xs"
											>
												Not needed
											</Button>
											<Button
												variant="ghost"
												size="sm"
												icon={MessageCircle}
												onclick={() => toggleNote(item)}
												disabled={noteSendingIds.has(item.id)}
												loading={noteSendingIds.has(item.id)}
												aria-expanded={notingId === item.id}
												aria-controls={`${itemDomId}-note`}
												aria-label={`Discuss: ${item.title}`}
												class="text-xs"
											>
												{noteSendingIds.has(item.id)
													? 'Jev is reading…'
													: 'Discuss'}
											</Button>
										</div>
										{#if notingId === item.id}
											<div
												id={`${itemDomId}-note`}
												class="mt-2 min-w-0 rounded-md border border-accent/30 bg-card p-2.5"
											>
												<p class="text-xs font-semibold text-foreground">
													Quick note to Jev
												</p>
												<p class="mt-0.5 text-2xs text-muted-foreground">
													Say what should happen. Jev applies it, sets it
													aside, or hands bigger edits to an agent.
												</p>
												<TextareaWithVoice
													bind:value={noteText}
													rows={2}
													maxRows={6}
													autoResize
													autofocus
													placeholder="e.g. Keep it, I'm still talking to them."
													voiceNoteSource="ai_inbox_cleanup"
													onkeydown={(event: KeyboardEvent) =>
														handleNoteKeydown(event, item)}
													class="mt-2"
												/>
												<div
													class="mt-2 flex flex-wrap items-center justify-between gap-1.5"
												>
													{#if onDiscuss}
														<button
															type="button"
															onclick={() => {
																notingId = null;
																onDiscuss?.(item);
															}}
															disabled={openingChat}
															class="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
														>
															<MessageCircle
																class="h-3.5 w-3.5"
																aria-hidden="true"
															/>
															Open the full chat
														</button>
													{:else}
														<span></span>
													{/if}
													<div class="flex gap-1.5">
														<Button
															variant="ghost"
															size="sm"
															onclick={() => (notingId = null)}
															class="text-xs"
														>
															Cancel
														</Button>
														<Button
															variant="primary"
															size="sm"
															icon={Send}
															onclick={() => sendNote(item)}
															disabled={!noteText.trim()}
															class="text-xs"
														>
															Send to Jev
														</Button>
													</div>
												</div>
											</div>
										{/if}
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if current.recently_closed.length}
			<details class="group border-t border-border/70 pt-1">
				<summary
					class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
				>
					<span>Closed since the last review ({current.recently_closed.length})</span>
					<ChevronDown
						class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
						aria-hidden="true"
					/>
				</summary>
				<ul class="space-y-1 px-1 pb-1 pt-1">
					{#each current.recently_closed as closed, closedIndex (`${closed.lineage_id}-${closedIndex}`)}
						<li class="break-words text-xs">
							<span class="text-foreground">{closed.title}</span>
							<span class="text-muted-foreground"
								>— {cleanupCloseReasonText(closed)}</span
							>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		{#if canDecide && selectableCount > 0}
			<div
				class="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-md border border-border bg-card/95 p-2 shadow-ink backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
			>
				<p class="text-2xs text-muted-foreground">
					Anything you don't pick stays here for later.
				</p>
				<div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
					{#if readyIds.length}
						<Button
							variant="outline"
							size="sm"
							onclick={selectAllReady}
							disabled={busy || allReadySelected}
							class="text-xs"
						>
							Select all ready
						</Button>
					{/if}
					<Button
						variant="primary"
						size="sm"
						icon={Check}
						onclick={applySelected}
						disabled={busy || selectedItems.length === 0}
						loading={pending?.kind === 'apply'}
						class="text-xs {readyIds.length ? '' : 'col-span-2'}"
					>
						{pending?.kind === 'apply'
							? 'Applying…'
							: `Apply ${selectedItems.length} selected`}
					</Button>
				</div>
			</div>
		{/if}

		<div class="space-y-2 border-t border-border pt-3">
			{#if !canDecide && decisionDisabledReason}
				<p class="text-2xs text-muted-foreground">{decisionDisabledReason}</p>
			{/if}
			{#if (onDiscuss && canDecide) || onSnooze}
				<div
					class="grid gap-2 sm:flex sm:justify-end {onDiscuss && canDecide && onSnooze
						? 'grid-cols-2'
						: 'grid-cols-1'}"
				>
					{#if onDiscuss && canDecide}
						<Button
							variant="accent"
							size="sm"
							icon={MessageCircle}
							onclick={() => onDiscuss?.(null)}
							disabled={busy || openingChat}
							loading={openingChat}
							class="text-xs"
						>
							Discuss cleanup
						</Button>
					{/if}
					{#if onSnooze}
						<Button
							variant="outline"
							size="sm"
							icon={Clock3}
							onclick={() => onSnooze?.()}
							disabled={busy || snoozing}
							loading={snoozing}
							title="Snooze until tomorrow"
							class="text-xs"
						>
							Snooze
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
