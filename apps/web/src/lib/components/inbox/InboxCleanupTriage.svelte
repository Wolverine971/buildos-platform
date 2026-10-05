<!-- apps/web/src/lib/components/inbox/InboxCleanupTriage.svelte -->
<!--
	AI Inbox triage mode: every project's cleanup items, one at a time. Ready-to-apply changes
	come first as one batch per project; calls and notes follow one by one. Each verdict is a
	single tap or key (A apply/done, N not needed, D note to Jev, S skip, Z undo). Decisions
	wait a few seconds so they can be undone, then save together, one request per project.
	A note hands the item to Jev with the user's words; Jev handles it in the background.
-->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import InboxCleanupChangeList from './InboxCleanupChangeList.svelte';
	import {
		AlertTriangle,
		ArrowLeft,
		Check,
		ChevronDown,
		CircleCheck,
		History,
		MessageCircle,
		Send,
		SkipForward,
		Undo2,
		X
	} from '$lib/icons/lucide';
	import type { ProjectCleanupItem } from '@buildos/shared-types';
	import {
		CLEANUP_SECTION_LABEL,
		CLEANUP_SOURCE_LABEL,
		cleanupItemCautions,
		cleanupSeenLine,
		summarizeCleanupItemOutcome,
		type CleanupOutcome
	} from './project-cleanup-presentation';
	import {
		TRIAGE_KEYS,
		TRIAGE_VERDICT_LABEL,
		buildTriageSteps,
		chunkQueuedEntries,
		expandBatchStep,
		groupQueuedByProject,
		triageDecisionsFor,
		triageItemCount,
		triageVerdictsFor,
		type QueuedTriageDecision,
		type TriageNoteResult,
		type TriageProject,
		type TriageStep,
		type TriageSummary,
		type TriageVerdict
	} from './cleanup-triage';

	let {
		projects,
		undoWindowMs = 4000,
		onSendNote,
		onOpenChat,
		onExit
	}: {
		projects: TriageProject[];
		/** How long a decision waits (undoable) before it saves. */
		undoWindowMs?: number;
		/** Hand one item to Jev with the user's note. */
		onSendNote: (
			project: TriageProject,
			item: ProjectCleanupItem,
			note: string
		) => Promise<TriageNoteResult>;
		/** Open the full chat on one item instead of leaving a note. */
		onOpenChat?: (project: TriageProject, item: ProjectCleanupItem) => void;
		onExit: (summary: TriageSummary) => void;
	} = $props();

	type Tally = 'applied' | 'not_needed' | 'done' | 'noted' | 'skipped';
	type HistoryEntry = {
		index: number;
		tally: Tally;
		count: number;
		/** Batch changes left unpicked, counted as skipped. */
		skippedExtra: number;
		stepKey: string;
	};
	type Problem = { key: string; title: string; projectName: string; message: string };
	type NoteStatus = {
		key: string;
		title: string;
		projectName: string;
		status: 'sending' | 'sent' | 'failed';
		message: string | null;
	};

	// The run is a snapshot: views refreshed mid-run must not reshuffle the cards.
	// svelte-ignore state_referenced_locally
	let steps = $state.raw<TriageStep[]>(buildTriageSteps(projects));
	let index = $state(0);
	let history = $state.raw<HistoryEntry[]>([]);
	let queue = $state.raw<QueuedTriageDecision[]>([]);
	let inFlight = $state(0);
	let problems = $state.raw<Problem[]>([]);
	let notes = $state.raw<NoteStatus[]>([]);
	let tallies = $state<Record<Tally, number>>({
		applied: 0,
		not_needed: 0,
		done: 0,
		noted: 0,
		skipped: 0
	});
	// Batch changes the user unticked. Item ids are unique, so this never needs resetting.
	let unpicked = $state.raw<Set<string>>(new Set());
	let exiting = $state(false);
	let noteOpen = $state(false);
	let noteText = $state('');
	let rootEl = $state<HTMLDivElement | null>(null);
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	const touchedProjects = new Set<string>();

	const current = $derived(steps[index] ?? null);
	const totalItems = $derived(triageItemCount(steps));
	const doneItems = $derived(triageItemCount(steps.slice(0, index)));
	const progress = $derived(totalItems ? Math.round((doneItems / totalItems) * 100) : 100);
	const previous = $derived(index > 0 ? (steps[index - 1] ?? null) : null);
	const enteredNewProject = $derived(
		Boolean(current && previous && previous.project.projectId !== current.project.projectId)
	);
	const lastHistory = $derived(history[history.length - 1] ?? null);
	const canUndo = $derived(
		Boolean(
			lastHistory &&
				(lastHistory.tally === 'skipped' ||
					queue.some((entry) => entry.stepKey === lastHistory.stepKey))
		)
	);
	const saving = $derived(inFlight > 0 || queue.length > 0);
	const verdicts = $derived(
		current?.kind === 'item' ? triageVerdictsFor(current.item) : ([] as TriageVerdict[])
	);
	const batchItems = $derived(
		current?.kind === 'batch'
			? current.items.filter((item) => !unpicked.has(item.id))
			: ([] as ProjectCleanupItem[])
	);

	async function focusRoot() {
		await tick();
		rootEl?.focus({ preventScroll: true });
	}

	function advance() {
		noteOpen = false;
		noteText = '';
		index += 1;
		void focusRoot();
	}

	function scheduleFlush() {
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = setTimeout(() => void flush(), undoWindowMs);
	}

	async function flush(options: { keepalive?: boolean } = {}) {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		const batch = queue;
		if (!batch.length) return;
		queue = [];
		await Promise.all(
			groupQueuedByProject(batch).flatMap(({ projectId, entries }) =>
				// Whole entries per request, so one item's rows never split across two saves.
				chunkQueuedEntries(entries).map((chunk) => send(projectId, chunk, options))
			)
		);
	}

	async function send(
		projectId: string,
		entries: QueuedTriageDecision[],
		options: { keepalive?: boolean }
	) {
		inFlight += 1;
		touchedProjects.add(projectId);
		const projectName =
			steps.find((step) => step.project.projectId === projectId)?.project.projectName ??
			'Project';
		const items = entries.flatMap((entry) => entry.items);
		try {
			const res = await fetch(`/api/onto/projects/${encodeURIComponent(projectId)}/cleanup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decisions: entries.flatMap((entry) => entry.decisions) }),
				keepalive: options.keepalive
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Could not save these choices');
			const outcomes = (json?.data?.outcomes ?? []) as CleanupOutcome[];
			const failed: Problem[] = items.flatMap((item) => {
				const result = summarizeCleanupItemOutcome(item, outcomes);
				if (!result || (result.status !== 'failed' && result.status !== 'changed')) {
					return [];
				}
				return [
					{
						key: `${projectId}:${item.id}`,
						title: item.title,
						projectName,
						message:
							result.status === 'changed'
								? 'Changed since you saw it — it stays in the list for another look.'
								: (result.message ?? 'Could not apply this.')
					}
				];
			});
			if (failed.length) problems = [...problems, ...failed];
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not save these choices';
			problems = [
				...problems,
				...items.map((item) => ({
					key: `${projectId}:${item.id}`,
					title: item.title,
					projectName,
					message
				}))
			];
		} finally {
			inFlight -= 1;
		}
	}

	function record(
		step: TriageStep,
		tally: Tally,
		items: ProjectCleanupItem[],
		verdict?: TriageVerdict,
		skippedExtra = 0
	) {
		const decisions = verdict ? items.flatMap((item) => triageDecisionsFor(item, verdict)) : [];
		if (decisions.length) {
			queue = [
				...queue,
				{ stepKey: step.key, projectId: step.project.projectId, items, decisions }
			];
			// Big queues save now; small ones wait out the undo window.
			if (queue.reduce((total, entry) => total + entry.decisions.length, 0) >= 30) {
				void flush();
			} else {
				scheduleFlush();
			}
		}
		history = [
			...history,
			{ index, tally, count: items.length, skippedExtra, stepKey: step.key }
		];
		tallies[tally] += items.length;
		tallies.skipped += skippedExtra;
		advance();
	}

	function decide(verdict: TriageVerdict) {
		const step = current;
		if (!step || step.kind !== 'item') return;
		if (!verdicts.includes(verdict)) return;
		if (verdict === 'note') {
			void openNote();
			return;
		}
		if (verdict === 'skip') {
			record(step, 'skipped', [step.item]);
			return;
		}
		const tally: Tally =
			verdict === 'apply' ? 'applied' : verdict === 'done' ? 'done' : 'not_needed';
		record(step, tally, [step.item], verdict);
	}

	function applyBatch() {
		const step = current;
		if (!step || step.kind !== 'batch' || !batchItems.length) return;
		// Unpicked changes stay for later.
		const skipped = step.items.length - batchItems.length;
		record(step, 'applied', batchItems, 'apply', skipped);
	}

	function goOneByOne() {
		const step = current;
		if (!step || step.kind !== 'batch') return;
		steps = [...steps.slice(0, index), ...expandBatchStep(step), ...steps.slice(index + 1)];
		void focusRoot();
	}

	function skipBatch() {
		const step = current;
		if (!step || step.kind !== 'batch') return;
		record(step, 'skipped', step.items);
	}

	function toggleBatchItem(id: string, checked: boolean) {
		const next = new Set(unpicked);
		if (checked) next.delete(id);
		else next.add(id);
		unpicked = next;
	}

	function undo() {
		const entry = lastHistory;
		if (!entry || !canUndo) return;
		queue = queue.filter((queued) => queued.stepKey !== entry.stepKey);
		if (!queue.length && flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		history = history.slice(0, -1);
		tallies[entry.tally] = Math.max(0, tallies[entry.tally] - entry.count);
		tallies.skipped = Math.max(0, tallies.skipped - entry.skippedExtra);
		noteOpen = false;
		index = entry.index;
		void focusRoot();
	}

	async function openNote() {
		noteOpen = true;
		noteText = '';
		// Ready to type (or tap the mic) the moment it opens.
		await tick();
		rootEl?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
	}

	function closeNote() {
		noteOpen = false;
		noteText = '';
		void focusRoot();
	}

	function sendNote() {
		const step = current;
		const text = noteText.trim();
		if (!step || step.kind !== 'item' || !text) return;
		const key = step.key;
		const status: NoteStatus = {
			key,
			title: step.item.title,
			projectName: step.project.projectName,
			status: 'sending',
			message: null
		};
		notes = [...notes, status];
		touchedProjects.add(step.project.projectId);
		history = [...history, { index, tally: 'noted', count: 1, skippedExtra: 0, stepKey: key }];
		tallies.noted += 1;
		void onSendNote(step.project, step.item, text)
			.then((result) => {
				notes = notes.map((note) =>
					note.key === key
						? {
								...note,
								status: result.ok ? 'sent' : 'failed',
								message: result.message ?? null
							}
						: note
				);
			})
			.catch((error) => {
				notes = notes.map((note) =>
					note.key === key
						? {
								...note,
								status: 'failed',
								message: error instanceof Error ? error.message : 'Could not send'
							}
						: note
				);
			});
		advance();
	}

	function openChatInstead() {
		const step = current;
		if (!step || step.kind !== 'item' || !onOpenChat) return;
		onOpenChat(step.project, step.item);
	}

	async function exit() {
		if (exiting) return;
		exiting = true;
		// Save first so the refreshed inbox reflects every choice.
		await flush();
		onExit({
			handled: tallies.applied + tallies.not_needed + tallies.done + tallies.noted,
			projectIds: [...touchedProjects]
		});
	}

	function isTyping(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || el.isContentEditable;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === 'Escape') {
			// One Escape peels one layer and never closes the inbox from here.
			event.preventDefault();
			if (noteOpen) closeNote();
			else void exit();
			return;
		}
		if (isTyping(event.target) || noteOpen) return;
		const key = event.key.toLowerCase();
		if (key === 'z') {
			event.preventDefault();
			undo();
			return;
		}
		if (!current) return;
		if (current.kind === 'batch') {
			if (key === 'a' || event.key === 'Enter') {
				event.preventDefault();
				applyBatch();
			} else if (key === 'o') {
				event.preventDefault();
				goOneByOne();
			} else if (key === 's' || event.key === 'ArrowRight') {
				event.preventDefault();
				skipBatch();
			}
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			decide('skip');
			return;
		}
		const verdict = verdicts.find((option) => TRIAGE_KEYS[option] === key);
		if (verdict) {
			event.preventDefault();
			decide(verdict);
		}
	}

	function handleNoteKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			sendNote();
		}
	}

	onMount(() => {
		void focusRoot();
	});

	onDestroy(() => {
		// Leaving mid-window still saves what was decided.
		void flush({ keepalive: true });
	});

	const VERDICT_ICON = {
		apply: Check,
		done: Check,
		not_needed: X,
		note: MessageCircle,
		skip: SkipForward
	} as const;
</script>

<!-- Keyboard shortcuts live on the region so they work wherever focus sits inside it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={rootEl}
	tabindex="-1"
	onkeydown={handleKeydown}
	role="region"
	aria-label="Triage"
	class="flex min-h-0 flex-1 flex-col outline-none"
>
	<div class="border-b border-border px-3 py-2.5">
		<div class="flex items-center justify-between gap-2">
			<Button
				variant="ghost"
				size="sm"
				icon={ArrowLeft}
				onclick={exit}
				loading={exiting}
				class="-ml-2 text-xs"
			>
				Back to list
			</Button>
			<p class="stamp text-xs text-muted-foreground" aria-live="polite">
				{#if current}
					{Math.min(doneItems + 1, totalItems)} of {totalItems}
				{:else}
					{totalItems} of {totalItems}
				{/if}
				{#if saving}
					<span class="ml-1 text-muted-foreground/70">· saving</span>
				{/if}
			</p>
			<Button
				variant="ghost"
				size="sm"
				icon={Undo2}
				onclick={undo}
				disabled={!canUndo}
				title="Undo (Z)"
				class="-mr-2 text-xs"
			>
				Undo
			</Button>
		</div>
		<div
			class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label="Triage progress"
			aria-valuemin={0}
			aria-valuemax={totalItems}
			aria-valuenow={doneItems}
		>
			<div
				class="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
				style:width={`${progress}%`}
			></div>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
		{#if current}
			{#key current.key}
				<div class="mx-auto max-w-2xl">
					{#if enteredNewProject && previous}
						<p
							class="mb-2 flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs text-foreground"
						>
							<CircleCheck
								class="h-3.5 w-3.5 shrink-0 text-success"
								aria-hidden="true"
							/>
							<span class="min-w-0 break-words">
								<span class="font-semibold">{previous.project.projectName}</span> is
								done. Next up:
							</span>
						</p>
					{/if}
					<div class="flex flex-wrap items-baseline justify-between gap-x-2">
						<p class="min-w-0 break-words text-xs font-semibold text-muted-foreground">
							{current.project.projectName}
						</p>
						<p class="micro-label text-muted-foreground">
							{current.kind === 'batch'
								? CLEANUP_SECTION_LABEL.safe_cleanup
								: CLEANUP_SECTION_LABEL[current.item.section]}
						</p>
					</div>

					{#if current.kind === 'batch'}
						<h3 class="mt-1 text-base font-semibold leading-snug text-foreground">
							{current.items.length} changes ready to apply
						</h3>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Each one was checked against the project just now. Untick any you want
							to keep.
						</p>
						<ul class="mt-3 space-y-1.5">
							{#each current.items as item (item.id)}
								{@const picked = !unpicked.has(item.id)}
								<li
									class="rounded-md border px-2 py-1.5 {picked
										? 'border-accent/30 bg-accent/5'
										: 'border-border bg-background'}"
								>
									<div class="flex min-w-0 items-start gap-1">
										<label
											class="-my-1.5 -ml-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
										>
											<input
												type="checkbox"
												checked={picked}
												onchange={(event) =>
													toggleBatchItem(
														item.id,
														event.currentTarget.checked
													)}
												aria-label={item.title}
												class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent focus-visible:ring-2 focus-visible:ring-ring"
											/>
										</label>
										<details class="group min-w-0 flex-1 py-1">
											<summary
												class="flex cursor-pointer list-none items-start gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<span
													class="min-w-0 flex-1 break-words text-sm text-foreground {picked
														? ''
														: 'text-muted-foreground line-through decoration-muted-foreground/50'}"
												>
													{item.title}
												</span>
												<ChevronDown
													class="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
													aria-hidden="true"
												/>
											</summary>
											<div class="mt-1.5 space-y-1.5">
												{#if item.summary && item.summary !== item.title}
													<p
														class="break-words text-xs text-muted-foreground"
													>
														{item.summary}
													</p>
												{/if}
												<InboxCleanupChangeList
													rows={item.rows}
													showHeadlines={item.rows.length > 1}
												/>
											</div>
										</details>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						{@const item = current.item}
						{@const cautions = cleanupItemCautions(item)}
						{@const seen = cleanupSeenLine(item)}
						{@const hasChanges = item.rows.some(
							(row) => (row.verified_operations?.length ?? 0) > 0
						)}
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							<span
								class="inline-flex items-center rounded border border-border bg-muted/50 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
							>
								{CLEANUP_SOURCE_LABEL[item.source] ?? 'Review'}
							</span>
							{#if seen}
								<span
									class="inline-flex items-center gap-1 text-2xs text-muted-foreground"
								>
									<History class="h-3 w-3 shrink-0" aria-hidden="true" />
									{seen}
								</span>
							{/if}
						</div>
						<h3
							class="mt-1.5 break-words text-base font-semibold leading-snug text-foreground"
						>
							{item.title}
						</h3>
						{#if item.summary && item.summary !== item.title}
							<p class="mt-1 break-words text-sm leading-relaxed text-foreground/80">
								{item.summary}
							</p>
						{/if}
						{#if item.why_now && item.why_now !== item.summary}
							<p class="mt-1 break-words text-xs text-muted-foreground">
								{item.why_now}
							</p>
						{/if}
						{#if cautions.length}
							<ul class="mt-2 space-y-1" aria-label="Cautions">
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
						{#if hasChanges}
							<div class="mt-3">
								<p class="micro-label text-muted-foreground">What changes</p>
								<div class="mt-1">
									<InboxCleanupChangeList
										rows={item.rows}
										showHeadlines={item.rows.length > 1}
									/>
								</div>
							</div>
						{/if}
						{#if item.review_items?.length}
							<ul class="mt-3 space-y-1" aria-label="Out of date">
								{#each item.review_items as reviewItem (reviewItem.concern_id)}
									<li
										class="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs"
									>
										<span class="font-medium text-foreground"
											>{reviewItem.title}</span
										>
										{#if reviewItem.reason}
											<span class="text-muted-foreground"
												>— {reviewItem.reason}</span
											>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}

						{#if noteOpen}
							<div
								class="mt-4 rounded-md border border-accent/30 bg-card p-2.5 shadow-ink"
							>
								<p class="text-xs font-semibold text-foreground">
									Tell Jev what to do with this
								</p>
								<p class="mt-0.5 text-2xs text-muted-foreground">
									Jev handles quick calls itself and hands bigger edits to an
									agent. You can keep going.
								</p>
								<TextareaWithVoice
									bind:value={noteText}
									rows={2}
									maxRows={6}
									autoResize
									autofocus
									placeholder="e.g. Keep it — I'm still talking to them. Move the FDE doc under Applications."
									vocabularyTerms={current.project.projectName}
									voiceNoteSource="ai_inbox_triage"
									onkeydown={handleNoteKeydown}
									class="mt-2"
								/>
								<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
									{#if onOpenChat}
										<button
											type="button"
											onclick={openChatInstead}
											class="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
											Open the full chat instead
										</button>
									{:else}
										<span></span>
									{/if}
									<div class="flex gap-1.5">
										<Button
											variant="ghost"
											size="sm"
											onclick={closeNote}
											class="text-xs"
										>
											Cancel
										</Button>
										<Button
											variant="primary"
											size="sm"
											icon={Send}
											onclick={sendNote}
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
			{/key}
		{:else}
			<div class="mx-auto max-w-md py-6 text-center">
				<CircleCheck class="mx-auto h-8 w-8 text-success" aria-hidden="true" />
				<p class="mt-2 text-base font-semibold text-foreground">You're through the list</p>
				<p class="stamp mt-1 text-xs text-muted-foreground">
					{[
						tallies.applied ? `${tallies.applied} applied` : null,
						tallies.done ? `${tallies.done} done` : null,
						tallies.not_needed ? `${tallies.not_needed} not needed` : null,
						tallies.noted ? `${tallies.noted} sent to Jev` : null,
						tallies.skipped ? `${tallies.skipped} left for later` : null
					]
						.filter(Boolean)
						.join(' · ') || 'Nothing decided'}
				</p>
				{#if saving}
					<p role="status" class="mt-2 text-xs text-muted-foreground">
						Saving your choices…
					</p>
				{/if}
				<Button
					variant="primary"
					size="sm"
					onclick={exit}
					loading={exiting}
					class="mt-4 text-xs"
				>
					Back to inbox
				</Button>
			</div>
		{/if}

		{#if notes.length || problems.length}
			<div class="mx-auto mt-4 max-w-2xl space-y-2" aria-live="polite">
				{#if notes.length}
					<div class="rounded-md border border-border bg-muted/30 p-2.5">
						<p class="micro-label text-muted-foreground">With Jev</p>
						<ul class="mt-1 space-y-1">
							{#each notes as note (note.key)}
								<li class="flex min-w-0 items-start gap-1.5 text-xs">
									{#if note.status === 'failed'}
										<X
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
											aria-hidden="true"
										/>
									{:else if note.status === 'sent'}
										<Check
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
											aria-hidden="true"
										/>
									{:else}
										<Send
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									{/if}
									<span class="min-w-0 break-words text-foreground">
										{note.title}
										<span class="text-muted-foreground">
											— {note.status === 'sending'
												? 'sending…'
												: (note.message ??
													(note.status === 'sent'
														? 'Jev is on it'
														: 'could not send'))}
										</span>
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if problems.length}
					<div class="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
						<p class="micro-label text-destructive">Didn't go through</p>
						<ul class="mt-1 space-y-1">
							{#each problems as problem, problemIndex (`${problem.key}-${problemIndex}`)}
								<li class="break-words text-xs text-foreground">
									<span class="font-semibold">{problem.title}</span>
									<span class="text-muted-foreground">
										({problem.projectName}) — {problem.message}</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if current && !noteOpen}
		<div class="border-t border-border bg-card px-3 py-2.5">
			<div class="mx-auto max-w-2xl">
				{#if current.kind === 'batch'}
					<div class="grid grid-cols-3 gap-2">
						<Button
							variant="primary"
							size="sm"
							icon={Check}
							onclick={applyBatch}
							disabled={!batchItems.length}
							class="col-span-3 text-sm sm:col-span-1"
						>
							Apply {batchItems.length}
							<kbd class="triage-kbd">A</kbd>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={goOneByOne}
							class="col-span-2 text-sm sm:col-span-1"
						>
							One by one
							<kbd class="triage-kbd">O</kbd>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon={SkipForward}
							onclick={skipBatch}
							class="text-sm"
						>
							Skip
							<kbd class="triage-kbd">S</kbd>
						</Button>
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
						{#each verdicts as verdict (verdict)}
							<Button
								variant={verdict === 'apply' || verdict === 'done'
									? 'primary'
									: verdict === 'skip'
										? 'ghost'
										: 'outline'}
								size="sm"
								icon={VERDICT_ICON[verdict]}
								onclick={() => decide(verdict)}
								class="text-sm sm:flex-1"
							>
								{TRIAGE_VERDICT_LABEL[verdict]}
								<kbd class="triage-kbd">{TRIAGE_KEYS[verdict].toUpperCase()}</kbd>
							</Button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.triage-kbd {
		display: none;
		margin-left: 0.375rem;
		border-radius: 0.25rem;
		border: 1px solid currentColor;
		padding: 0 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.625rem;
		line-height: 1rem;
		opacity: 0.6;
	}
	@media (hover: hover) and (pointer: fine) {
		.triage-kbd {
			display: inline-block;
		}
	}
</style>
