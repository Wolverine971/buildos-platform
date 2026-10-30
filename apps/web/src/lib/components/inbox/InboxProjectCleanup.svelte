<!-- apps/web/src/lib/components/inbox/InboxProjectCleanup.svelte -->
<!--
	Tasker 112 + 149: a project's one living "Project cleanup" card in the AI Inbox, sorted by
	what each item asks of the user:
	- Pick a path: pre-written questions and changes to make or not, answered in one tap
	- Tidy-ups: safe filing and archiving, picked and applied together, with a Now / After
	  preview of the document tree
	- Out of date: records that may no longer hold
	- Want me to…?: work the assistant can take on (chat opens with it speaking first)
	- Done for you: safe changes applied without asking, each with Undo
	Each decision still applies through its own suggestion (own verification, result and trail),
	so one failure never blocks the rest. Triage walks every item one at a time.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import InboxAskCard from './InboxAskCard.svelte';
	import InboxCleanupChangeList from './InboxCleanupChangeList.svelte';
	import InboxProjectManagerBrief from './InboxProjectManagerBrief.svelte';
	import InboxTidyTree from './InboxTidyTree.svelte';
	import {
		AlertTriangle,
		CalendarClock,
		Check,
		ChevronDown,
		CircleCheck,
		Clock3,
		FileText,
		Flag,
		FolderTree,
		GitBranch,
		History,
		ListChecks,
		MessageCircle,
		MessageSquare,
		PencilLine,
		RefreshCw,
		Send,
		Target,
		Undo2,
		X,
		Zap
	} from '$lib/icons/lucide';
	import type {
		ProjectCleanupAnswer,
		ProjectCleanupAutoApplied,
		ProjectCleanupItem,
		ProjectCleanupView,
		ProjectSuggestionReviewItem
	} from '@buildos/shared-types';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import {
		queueCleanupAnswer,
		queueCleanupNote,
		withoutAnsweredItems,
		type CleanupNoteSendResult,
		type CleanupSendResult
	} from './cleanup-outbox';
	import { flyToPile } from './pile-fly';
	import {
		CLEANUP_ASK_BLOCK,
		CLEANUP_CHANGED_MESSAGE,
		addressDecisionsFor,
		approveDecisionsFor,
		cleanupAnswerNote,
		cleanupAskCounts,
		cleanupAskSummaryLine,
		cleanupCloseReasonText,
		cleanupItemCautions,
		cleanupSeenLine,
		dismissDecisionsFor,
		formatCleanupDate,
		groupCleanupByAsk,
		isCleanupItemSelectable,
		type CleanupAskBlockKey,
		type CleanupAskEntry,
		type CleanupDecision
	} from './project-cleanup-presentation';

	type AnswerKind = 'apply' | 'dismiss' | 'address';
	/** Why an item is back on the card after a save, shown on the item. */
	type ItemNote = { tone: 'warn' | 'info'; text: string };

	let {
		view = null,
		projectId,
		projectName = null,
		canDecide = false,
		decisionDisabledReason = null,
		snoozing = false,
		openingChat = false,
		onSnooze,
		onDiscuss,
		onFixInChat,
		onTriage,
		onDecided,
		onUndone
	}: {
		view?: ProjectCleanupView | null;
		projectId: string;
		/** Shown beside each answer in the Cleared pile. */
		projectName?: string | null;
		canDecide?: boolean;
		decisionDisabledReason?: string | null;
		snoozing?: boolean;
		openingChat?: boolean;
		onSnooze?: () => void;
		/** Discuss the whole card (null) or one item; chat opens with the assistant first. */
		onDiscuss?: (item: ProjectCleanupItem | null) => void;
		onFixInChat?: (reviewItem: ProjectSuggestionReviewItem, item: ProjectCleanupItem) => void;
		/** Walk every item one at a time. */
		onTriage?: () => void;
		/** After a background save: items handled and the freshly verified view. */
		onDecided?: (summary: { handled: number; view: ProjectCleanupView | null }) => void;
		/** After a "Done for you" change is undone, with the view the server returned. */
		onUndone?: (summary: { suggestionId: string; view: ProjectCleanupView | null }) => void;
	} = $props();

	const uid = $props.id();

	// The view a save returned wins until the parent hands down a newer one.
	let override = $state.raw<{
		base: ProjectCleanupView | null;
		view: ProjectCleanupView;
	} | null>(null);
	const latest = $derived(override && override.base === view ? override.view : view);
	// Answers leave the card at once; the Cleared pile saves them in the background.
	const current = $derived(withoutAnsweredItems(latest, projectId));
	const allAnswered = $derived(
		Boolean(latest?.items.length) && (current?.items.length ?? 0) === 0
	);

	let selected = $state.raw<Set<string>>(new Set());
	let reloading = $state(false);
	let changedIds = $state.raw<Set<string>>(new Set());
	let itemNotes = $state.raw<Map<string, ItemNote>>(new Map());
	let requestError = $state<string | null>(null);
	let notingId = $state<string | null>(null);
	let noteText = $state('');
	let auditOpen = $state(false);
	let auditLoading = $state(false);
	let auditError = $state<string | null>(null);
	let auditRecord = $state.raw<Record<string, unknown> | null>(null);
	let undoingId = $state<string | null>(null);
	let undoErrors = $state.raw<Map<string, string>>(new Map());
	let undoneIds = $state.raw<Set<string>>(new Set());
	// Bumped after anything that may change the document tree, so the preview reloads.
	let treeVersion = $state(0);

	const blocks = $derived(groupCleanupByAsk(current));
	const itemsById = $derived(new Map((current?.items ?? []).map((item) => [item.id, item])));

	const pathEntries = $derived(blocks.paths);
	const openPathCount = $derived(pathEntries.length);
	const autoApplied = $derived(
		blocks.autoApplied.filter((entry) => !undoneIds.has(entry.suggestion_id))
	);
	const openBlocks = $derived({ ...blocks, autoApplied });
	const countChips = $derived(cleanupAskCounts(openBlocks));
	const headline = $derived(
		current ? (current.bottom_line ?? cleanupAskSummaryLine(openBlocks)) : 'Project cleanup'
	);

	const readyIds = $derived(
		blocks.tidy.filter((item) => isCleanupItemSelectable(item)).map((item) => item.id)
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
	const auditDate = $derived(formatCleanupDate(current?.latest_audit?.created_at));

	// The tree preview follows the pick; with nothing picked it shows every ready tidy-up.
	const pickedTidy = $derived(blocks.tidy.filter((item) => selected.has(item.id)));
	const tidyPreviewItems = $derived.by(() => {
		if (pickedTidy.length) return pickedTidy;
		const ready = blocks.tidy.filter((item) => isCleanupItemSelectable(item));
		return ready.length ? ready : blocks.tidy;
	});
	const tidyScopeLabel = $derived(
		pickedTidy.length
			? `the ${pickedTidy.length} you picked`
			: tidyPreviewItems.length === 1
				? 'the one tidy-up'
				: `all ${tidyPreviewItems.length}`
	);
	const treeCallItems = $derived([
		...pathEntries.flatMap((entry) => entry.items),
		...blocks.stale,
		...blocks.offers
	]);

	const REVIEW_ICON = {
		task: ListChecks,
		document: FileText,
		goal: Target,
		milestone: Flag
	} as const;

	const BLOCK_ICON = {
		path: GitBranch,
		tidy: FolderTree,
		stale: CalendarClock,
		offer: MessageSquare,
		done: CircleCheck
	} as const;

	const BLOCK_CHIP: Record<CleanupAskBlockKey, string> = {
		path: 'border-info/40 bg-info/10 text-info',
		tidy: 'border-success/40 bg-success/10 text-success',
		stale: 'border-warning/50 bg-warning/10 text-foreground',
		offer: 'border-border-strong bg-muted text-foreground',
		done: 'border-border text-muted-foreground'
	};

	const LINK_BUTTON =
		'inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

	function cleanupUrl(): string {
		return `/api/onto/projects/${encodeURIComponent(projectId)}/cleanup`;
	}

	function hasChanges(item: ProjectCleanupItem): boolean {
		return item.rows.some((row) => (row.verified_operations?.length ?? 0) > 0);
	}

	/** The card or row an answer came from, for the fly-to-pile animation. */
	function sourceOf(event: Event | undefined): Element | null {
		const target = event?.currentTarget;
		return target instanceof Element ? (target.closest('article, li') ?? target) : null;
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

	function toggleGroup(ids: string[], checked: boolean) {
		const next = new Set(selected);
		for (const id of ids) {
			if (checked) next.add(id);
			else next.delete(id);
		}
		selected = next;
	}

	function forget(items: ProjectCleanupItem[]) {
		const ids = new Set(items.map((item) => item.id));
		selected = new Set([...selected].filter((id) => !ids.has(id)));
		if ([...ids].some((id) => itemNotes.has(id) || changedIds.has(id))) {
			itemNotes = new Map([...itemNotes].filter(([id]) => !ids.has(id)));
			changedIds = new Set([...changedIds].filter((id) => !ids.has(id)));
		}
	}

	function adoptView(next: ProjectCleanupView | null) {
		if (next) override = { base: view, view: next };
	}

	/** The save landed: take the fresh view and say why anything came back. */
	function handleSaved(kind: AnswerKind, items: ProjectCleanupItem[], result: CleanupSendResult) {
		adoptView(result.view);
		if (kind === 'apply') treeVersion += 1;
		const notes = new Map(itemNotes);
		const changed = new Set(changedIds);
		let handled = 0;
		for (const item of items) {
			const outcome = result.results.get(item.id) ?? null;
			if (result.error) {
				notes.set(item.id, { tone: 'warn', text: `Not saved: ${result.error}` });
			} else if (outcome?.status === 'changed') {
				changed.add(item.id);
			} else if (outcome?.status === 'failed') {
				notes.set(item.id, {
					tone: 'warn',
					text: `Not applied: ${outcome.message ?? 'Could not apply this.'}`
				});
			} else {
				handled += 1;
			}
		}
		itemNotes = notes;
		changedIds = changed;
		if (!result.error) onDecided?.({ handled, view: result.view });
	}

	function queueAnswer(
		kind: AnswerKind,
		items: ProjectCleanupItem[],
		decisions: CleanupDecision[],
		copy: { title: string; label: string },
		source: Element | null
	) {
		if (!canDecide || !items.length || !decisions.length) return;
		forget(items);
		flyToPile(source, copy.title);
		queueCleanupAnswer({
			projectId,
			projectName,
			title: copy.title,
			label: copy.label,
			items,
			decisions,
			onResult: (result) => handleSaved(kind, items, result)
		});
	}

	function handleNoteSaved(items: ProjectCleanupItem[], result: CleanupNoteSendResult) {
		if (!result.view) return;
		adoptView(result.view);
		treeVersion += 1;
		// The reader can leave an item open; if it comes back, say what the note did.
		const reply = [...new Set(result.replies)].join(' ');
		const stillOpen = new Set(result.view.items.map((item) => item.id));
		if (reply) {
			const notes = new Map(itemNotes);
			for (const item of items) {
				if (stillOpen.has(item.id)) notes.set(item.id, { tone: 'info', text: reply });
			}
			itemNotes = notes;
		}
		onDecided?.({ handled: result.replies.length, view: result.view });
	}

	function queueNote(
		items: ProjectCleanupItem[],
		note: string,
		copy: { title: string; label: string },
		source: Element | null
	) {
		if (!canDecide || !items.length || !note.trim()) return;
		forget(items);
		flyToPile(source, copy.title);
		queueCleanupNote({
			projectId,
			projectName,
			title: copy.title,
			label: copy.label,
			items,
			note,
			onResult: (result) => handleNoteSaved(items, result)
		});
	}

	function applySelected(event?: Event) {
		const items = selectedItems;
		if (!items.length) return;
		queueAnswer(
			'apply',
			items,
			approveDecisionsFor(items),
			{
				title: items.length === 1 ? items[0]!.title : `${items.length} tidy-ups`,
				label: 'Applied'
			},
			sourceOf(event)
		);
	}

	function applyOne(item: ProjectCleanupItem, event?: Event) {
		if (!isCleanupItemSelectable(item)) return;
		queueAnswer(
			'apply',
			[item],
			approveDecisionsFor([item]),
			{ title: item.title, label: 'Update it' },
			sourceOf(event)
		);
	}

	function markDone(item: ProjectCleanupItem, event?: Event) {
		queueAnswer(
			'address',
			[item],
			addressDecisionsFor(item),
			{ title: item.title, label: 'Already handled' },
			sourceOf(event)
		);
	}

	// One tap: "Not needed" never asks why. A reason, if there is one, goes in a note.
	function markNotNeeded(item: ProjectCleanupItem, label = 'Not needed', event?: Event) {
		queueAnswer(
			'dismiss',
			[item],
			dismissDecisionsFor(item, 'not_relevant'),
			{ title: item.title, label },
			sourceOf(event)
		);
	}

	function canApplyAsk(entry: CleanupAskEntry): boolean {
		return entry.items.some((item) => isCleanupItemSelectable(item));
	}

	function answerAsk(
		entry: CleanupAskEntry,
		answer: ProjectCleanupAnswer,
		source: Element | null = null
	) {
		if (!entry.items.length) return;
		if (answer.action === 'chat') {
			onDiscuss?.(entry.items[0] ?? null);
			return;
		}
		const copy = { title: entry.ask.question, label: answer.label };
		if (answer.action === 'note') {
			queueNote(entry.items, cleanupAnswerNote(entry.ask.question, answer), copy, source);
			return;
		}
		const targets =
			answer.action === 'apply'
				? entry.items.filter((item) => isCleanupItemSelectable(item))
				: entry.items;
		if (!targets.length) return;
		const kind: AnswerKind =
			answer.action === 'apply'
				? 'apply'
				: answer.action === 'dismiss'
					? 'dismiss'
					: 'address';
		const decisions =
			kind === 'apply'
				? approveDecisionsFor(targets)
				: kind === 'dismiss'
					? targets.flatMap((item) => dismissDecisionsFor(item, 'not_relevant'))
					: targets.flatMap((item) => addressDecisionsFor(item));
		queueAnswer(kind, targets, decisions, copy, source);
	}

	async function undoAutoApplied(entry: ProjectCleanupAutoApplied) {
		if (undoingId) return;
		undoingId = entry.suggestion_id;
		const errors = new Map(undoErrors);
		errors.delete(entry.suggestion_id);
		undoErrors = errors;
		try {
			const res = await fetch(`${cleanupUrl()}/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ suggestion_id: entry.suggestion_id })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok || json?.data?.ok === false) {
				throw new Error(json?.data?.message ?? json?.error ?? 'Could not undo this');
			}
			const nextView = (json?.data?.view ?? null) as ProjectCleanupView | null;
			undoneIds = new Set(undoneIds).add(entry.suggestion_id);
			adoptView(nextView);
			changedIds = new Set();
			treeVersion += 1;
			onUndone?.({ suggestionId: entry.suggestion_id, view: nextView });
		} catch (error) {
			undoErrors = new Map(undoErrors).set(
				entry.suggestion_id,
				error instanceof Error ? error.message : 'Could not undo this'
			);
		} finally {
			undoingId = null;
		}
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

	function sendNote(item: ProjectCleanupItem, event?: Event) {
		const note = noteText.trim();
		if (!note) return;
		const source =
			sourceOf(event) ??
			document.getElementById(`${uid}-item-${item.id}-note`)?.closest('article, li') ??
			null;
		notingId = null;
		noteText = '';
		queueNote([item], note, { title: item.title, label: 'Your note' }, source);
	}

	function handleNoteKeydown(event: KeyboardEvent, item: ProjectCleanupItem) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			sendNote(item);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			notingId = null;
		}
	}

	async function reload() {
		if (reloading) return;
		reloading = true;
		requestError = null;
		try {
			const res = await fetch(cleanupUrl());
			const json = await res.json().catch(() => null);
			if (!res.ok || !json?.data?.view) {
				throw new Error(json?.error ?? 'Could not load the cleanup list');
			}
			adoptView(json.data.view as ProjectCleanupView);
		} catch (error) {
			requestError =
				error instanceof Error ? error.message : 'Could not load the cleanup list';
		} finally {
			reloading = false;
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

{#snippet blockHead(key: CleanupAskBlockKey, count: number)}
	{@const Icon = BLOCK_ICON[key]}
	<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
		<h3
			id={`${uid}-block-${key}`}
			class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-2xs font-semibold tracking-wide {BLOCK_CHIP[
				key
			]}"
		>
			<Icon class="h-3 w-3 shrink-0" aria-hidden="true" />
			{CLEANUP_ASK_BLOCK[key].label}
			<span class="stamp font-normal opacity-80">({count})</span>
		</h3>
		<p class="min-w-0 break-words text-xs text-muted-foreground">
			{CLEANUP_ASK_BLOCK[key].hint}
		</p>
	</div>
{/snippet}

{#snippet changedBadge(item: ProjectCleanupItem)}
	{@const note = itemNotes.get(item.id)}
	{#if changedIds.has(item.id)}
		<span
			class="mb-1 inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-foreground"
			title={CLEANUP_CHANGED_MESSAGE}
		>
			<AlertTriangle class="h-3 w-3 text-warning" aria-hidden="true" />
			Updated — review again
		</span>
	{/if}
	{#if note}
		<p
			class="mb-1 flex min-w-0 items-start gap-1 rounded border px-1.5 py-0.5 text-2xs text-foreground {note.tone ===
			'warn'
				? 'border-warning/40 bg-warning/10'
				: 'border-accent/30 bg-accent/5'}"
		>
			{#if note.tone === 'warn'}
				<AlertTriangle class="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
			{:else}
				<MessageCircle class="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
			{/if}
			<span class="min-w-0 break-words">{note.text}</span>
		</p>
	{/if}
{/snippet}

{#snippet itemFacts(item: ProjectCleanupItem)}
	{@const cautions = cleanupItemCautions(item)}
	{@const seen = cleanupSeenLine(item)}
	{#if seen}
		<p class="mt-1 inline-flex items-center gap-1 text-2xs text-muted-foreground">
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
					<span class="min-w-0 break-words">{caution}</span>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet whatChanges(rows: ProjectCleanupItem['rows'], showHeadlines: boolean)}
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
			<InboxCleanupChangeList {rows} {showHeadlines} />
		</div>
	</details>
{/snippet}

{#snippet noteToggle(item: ProjectCleanupItem)}
	<button
		type="button"
		onclick={() => toggleNote(item)}
		aria-expanded={notingId === item.id}
		aria-controls={`${uid}-item-${item.id}-note`}
		aria-label={`Add a note: ${item.title}`}
		class={LINK_BUTTON}
	>
		<PencilLine class="h-3.5 w-3.5" aria-hidden="true" />
		Add a note
	</button>
{/snippet}

{#snippet noteBox(item: ProjectCleanupItem)}
	{#if notingId === item.id}
		<div
			id={`${uid}-item-${item.id}-note`}
			class="mt-2 min-w-0 rounded-md border border-accent/30 bg-card p-2.5"
		>
			<p class="text-xs font-semibold text-foreground">What should happen with this?</p>
			<p class="mt-0.5 text-2xs text-muted-foreground">
				Quick calls happen right away; bigger edits go to an agent.
			</p>
			<TextareaWithVoice
				bind:value={noteText}
				rows={2}
				maxRows={6}
				autoResize
				autofocus
				placeholder="e.g. Keep it, I'm still talking to them."
				voiceNoteSource="ai_inbox_cleanup"
				onkeydown={(event: KeyboardEvent) => handleNoteKeydown(event, item)}
				class="mt-2"
			/>
			<div class="mt-2 flex flex-wrap items-center justify-between gap-1.5">
				{#if onDiscuss}
					<button
						type="button"
						onclick={() => {
							notingId = null;
							onDiscuss?.(item);
						}}
						disabled={openingChat}
						class={LINK_BUTTON}
					>
						<MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
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
						onclick={(event: MouseEvent) => sendNote(item, event)}
						disabled={!noteText.trim()}
						class="text-xs"
					>
						Send note
					</Button>
				</div>
			</div>
		</div>
	{/if}
{/snippet}

<div class="min-w-0 space-y-4">
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
				loading={reloading}
				disabled={reloading}
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
							class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold {BLOCK_CHIP[
								chip.key
							]}"
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

		{#if requestError}
			<p
				role="alert"
				class="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
			>
				{requestError}
			</p>
		{/if}

		{#if current.items.length === 0 && !pathEntries.length}
			<div
				role="status"
				class="rounded-md border border-dashed border-border px-3 py-6 text-center"
			>
				<CircleCheck class="mx-auto h-6 w-6 text-success" aria-hidden="true" />
				{#if allAnswered}
					<p class="mt-2 text-sm font-semibold text-foreground">All answered</p>
					<p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
						Saving in the background. Anything that doesn't go through comes back here.
					</p>
				{:else}
					<p class="mt-2 text-sm font-semibold text-foreground">
						Nothing to clean up right now
					</p>
					<p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
						New findings from reviews, audits and freshness checks gather here.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Pick a path -->
		{#if pathEntries.length}
			<section aria-labelledby={`${uid}-block-path`} class="min-w-0 space-y-2">
				{@render blockHead('path', openPathCount)}
				{#each pathEntries as entry (entry.key)}
					{@const lead = entry.items[0] ?? null}
					{@const changeRows = entry.items.flatMap((item) =>
						item.rows.filter((row) => (row.verified_operations?.length ?? 0) > 0)
					)}
					<InboxAskCard
						ask={entry.ask}
						items={entry.items}
						{canDecide}
						canApply={canApplyAsk(entry)}
						meta={entry.fromItem && lead ? cleanupSeenLine(lead) : null}
						{openingChat}
						onAnswer={(answer, _index, source) => answerAsk(entry, answer, source)}
						onTalk={onDiscuss && lead ? () => onDiscuss?.(lead) : undefined}
					>
						{#snippet details()}
							{@const cautions = [
								...new Set(entry.items.flatMap((item) => cleanupItemCautions(item)))
							]}
							{#each entry.items as item (item.id)}
								{@render changedBadge(item)}
							{/each}
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
											<span class="min-w-0 break-words">{caution}</span>
										</li>
									{/each}
								</ul>
							{/if}
							{#if changeRows.length}
								{@render whatChanges(changeRows, changeRows.length > 1)}
							{/if}
						{/snippet}
						{#snippet actions()}
							{#if entry.fromItem && lead}
								{@render noteToggle(lead)}
							{/if}
						{/snippet}
						{#snippet footer()}
							{#if entry.fromItem && lead}
								{@render noteBox(lead)}
							{/if}
						{/snippet}
					</InboxAskCard>
				{/each}
			</section>
		{/if}

		<!-- Tidy-ups -->
		{#if blocks.tidy.length}
			{@const pickIds = canDecide ? readyIds : []}
			<section aria-labelledby={`${uid}-block-tidy`} class="min-w-0 space-y-2">
				{@render blockHead('tidy', blocks.tidy.length)}
				{#key treeVersion}
					<InboxTidyTree
						{projectId}
						items={tidyPreviewItems}
						callItems={treeCallItems}
						scopeLabel={tidyScopeLabel}
					/>
				{/key}
				{#if pickIds.length > 1}
					{@const pickedCount = pickIds.filter((id) => selected.has(id)).length}
					<label
						class="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-xs font-semibold text-foreground focus-within:ring-2 focus-within:ring-ring"
					>
						<input
							type="checkbox"
							checked={pickedCount === pickIds.length}
							indeterminate={pickedCount > 0 && pickedCount < pickIds.length}
							onchange={(event) => toggleGroup(pickIds, event.currentTarget.checked)}
							class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
						/>
						Select all {pickIds.length}
					</label>
				{/if}
				<ul class="space-y-2">
					{#each blocks.tidy as item (item.id)}
						{@const selectable = canDecide && isCleanupItemSelectable(item)}
						{@const itemDomId = `${uid}-item-${item.id}`}
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
											aria-labelledby={`${itemDomId}-title`}
											onchange={(event) =>
												toggle(item.id, event.currentTarget.checked)}
											class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</label>
								{/if}
								<div class="min-w-0 flex-1">
									{@render changedBadge(item)}
									{#if selectable}
										<label
											id={`${itemDomId}-title`}
											for={`${itemDomId}-pick`}
											class="block cursor-pointer break-words text-sm font-semibold text-foreground"
										>
											{item.title}
										</label>
									{:else}
										<p
											id={`${itemDomId}-title`}
											class="break-words text-sm font-semibold text-foreground"
										>
											{item.title}
										</p>
									{/if}
									{#if item.summary && item.summary !== item.title}
										<p class="mt-0.5 break-words text-xs text-muted-foreground">
											{item.summary}
										</p>
									{/if}
									{@render itemFacts(item)}
									{#if hasChanges(item)}
										{@render whatChanges(item.rows, item.rows.length > 1)}
									{/if}
									{#if canDecide}
										<div class="mt-1 flex flex-wrap items-center gap-x-2">
											<Button
												variant="ghost"
												size="sm"
												icon={X}
												onclick={(event: MouseEvent) =>
													markNotNeeded(item, 'Not needed', event)}
												aria-label={`Not needed: ${item.title}`}
												class="text-xs"
											>
												Not needed
											</Button>
											{@render noteToggle(item)}
										</div>
										{@render noteBox(item)}
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
				{#if canDecide && readyIds.length}
					<div
						style="bottom: calc(var(--cleared-pile-offset, 0px) + 0.5rem)"
						class="sticky z-10 -mx-1 flex flex-col gap-2 rounded-md border border-border bg-card/95 p-2 shadow-ink backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:pl-3"
					>
						<p class="text-2xs text-muted-foreground">
							Anything you don't pick stays here for later.
						</p>
						<div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
							<Button
								variant="outline"
								size="sm"
								onclick={selectAllReady}
								disabled={allReadySelected}
								class="text-xs"
							>
								Select all ready
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon={Check}
								onclick={(event: MouseEvent) => applySelected(event)}
								disabled={selectedItems.length === 0}
								class="text-xs"
							>
								Apply {selectedItems.length} selected
							</Button>
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Out of date -->
		{#if blocks.stale.length}
			<section aria-labelledby={`${uid}-block-stale`} class="min-w-0 space-y-2">
				{@render blockHead('stale', blocks.stale.length)}
				<ul class="space-y-2">
					{#each blocks.stale as item (item.id)}
						<li
							class="rounded-md border border-border bg-background p-2.5 shadow-ink-inner"
						>
							{@render changedBadge(item)}
							<p class="break-words text-sm font-semibold text-foreground">
								{item.title}
							</p>
							<!-- A radar bundle's summary is written for chat; its records below say it better. -->
							{#if item.summary && item.summary !== item.title && !item.review_items?.length}
								<p class="mt-0.5 break-words text-xs text-muted-foreground">
									{item.summary}
								</p>
							{/if}
							{@render itemFacts(item)}
							{#if item.review_items?.length}
								<ul class="mt-2 space-y-1.5" aria-label="Records to check">
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
													onclick={() => onFixInChat?.(reviewItem, item)}
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
							{#if hasChanges(item)}
								{@render whatChanges(item.rows, item.rows.length > 1)}
							{/if}
							{#if canDecide}
								<div class="mt-2 flex flex-wrap items-center gap-1.5">
									{#if item.executable}
										<Button
											variant="outline"
											size="sm"
											icon={Check}
											onclick={(event: MouseEvent) => applyOne(item, event)}
											disabled={!isCleanupItemSelectable(item)}
											aria-label={`Update it: ${item.title}`}
											class="text-xs"
										>
											Update it
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											icon={Check}
											onclick={(event: MouseEvent) => markDone(item, event)}
											aria-label={`Already handled: ${item.title}`}
											class="text-xs"
										>
											Already handled
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										icon={X}
										onclick={(event: MouseEvent) =>
											markNotNeeded(item, 'Not needed', event)}
										aria-label={`Not needed: ${item.title}`}
										class="text-xs"
									>
										Not needed
									</Button>
									{#if onDiscuss}
										<button
											type="button"
											onclick={() => onDiscuss?.(item)}
											disabled={openingChat}
											aria-label={`Talk it through: ${item.title}`}
											class={LINK_BUTTON}
										>
											<MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
											Talk it through
										</button>
									{/if}
									{@render noteToggle(item)}
								</div>
								{@render noteBox(item)}
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Want me to…? -->
		{#if blocks.offers.length}
			<section aria-labelledby={`${uid}-block-offer`} class="min-w-0 space-y-2">
				{@render blockHead('offer', blocks.offers.length)}
				<ul class="space-y-2">
					{#each blocks.offers as item (item.id)}
						<li
							class="rounded-md border border-border bg-background p-2.5 shadow-ink-inner"
						>
							<p class="break-words text-sm font-semibold text-foreground">
								{item.title}
							</p>
							{#if item.summary && item.summary !== item.title}
								<p class="mt-0.5 break-words text-xs text-muted-foreground">
									{item.summary}
								</p>
							{/if}
							{#if canDecide}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#if onDiscuss}
										<Button
											variant="primary"
											size="sm"
											icon={MessageCircle}
											onclick={() => onDiscuss?.(item)}
											disabled={openingChat}
											aria-label={`Yes, ask me: ${item.title}`}
											class="text-xs"
										>
											Yes, ask me
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										onclick={(event: MouseEvent) =>
											markNotNeeded(item, 'Not for this project', event)}
										aria-label={`Not for this project: ${item.title}`}
										class="text-xs"
									>
										Not for this project
									</Button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Done for you -->
		{#if autoApplied.length}
			<section aria-labelledby={`${uid}-block-done`} class="min-w-0 space-y-2">
				{@render blockHead('done', autoApplied.length)}
				<ul class="space-y-1.5">
					{#each autoApplied as entry (entry.suggestion_id)}
						{@const when = formatRelativeTime(entry.applied_at)}
						{@const undoError = undoErrors.get(entry.suggestion_id)}
						<li
							class="flex min-w-0 items-start gap-2 rounded-md border border-success/25 bg-success/5 px-2.5 py-1.5"
						>
							<Check
								class="mt-2 h-3.5 w-3.5 shrink-0 text-success"
								aria-hidden="true"
							/>
							<div class="min-w-0 flex-1 py-1">
								<p class="break-words text-xs font-medium text-foreground">
									{entry.title}
								</p>
								{#if entry.reason}
									<p class="mt-0.5 break-words text-2xs text-muted-foreground">
										{entry.reason}
									</p>
								{/if}
								{#if when}
									<p class="stamp mt-0.5 text-2xs text-muted-foreground">
										Applied {when}
									</p>
								{/if}
								{#if undoError}
									<p
										role="alert"
										class="mt-0.5 break-words text-2xs text-destructive"
									>
										{undoError}
									</p>
								{/if}
							</div>
							{#if canDecide && entry.undoable}
								<Button
									variant="ghost"
									size="sm"
									icon={Undo2}
									onclick={() => undoAutoApplied(entry)}
									disabled={undoingId !== null}
									loading={undoingId === entry.suggestion_id}
									aria-label={`Undo: ${entry.title}`}
									class="shrink-0 text-xs"
								>
									Undo
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

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
							disabled={openingChat}
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
							disabled={snoozing}
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
