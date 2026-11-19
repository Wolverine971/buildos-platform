<!-- apps/web/src/lib/components/knowledge/KnowledgeEnrichDialog.svelte -->
<!--
	"What should we look for?" before research starts (tasker 164). Used for one entry (Find more
	on a card) and for many (Enrich N from the list). Pick focus areas and/or say it in words for
	the whole batch, optionally add a note to single entries, see which ones were researched
	before (and skip them or say what's missing), and see the most it can cost before starting.
	Starting hands off to the research tray; the dialog never waits on the research itself.
	Mount it only while open (the parent wraps it in {#if}) so every open starts fresh.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Sparkles } from '$lib/icons/lucide';
	import {
		ENRICH_FOCUS_OPTIONS,
		KNOWLEDGE_PREDICATE_MAP,
		MAX_ENRICH_ENTRY_NOTE_CHARS,
		MAX_ENRICH_INSTRUCTIONS_CHARS
	} from '@buildos/shared-agent-ops/knowledge';
	import { KIND_LABEL, knowledgeApi } from './knowledge-client';
	import {
		estimateEnrich,
		type EnrichEntry,
		type EnrichStarted,
		type ResearchAllowance
	} from './research-tray';

	interface Props {
		entries: EnrichEntry[];
		allowance: ResearchAllowance | null;
		onClose: () => void;
		onStarted: (result: EnrichStarted) => void;
	}

	let { entries, allowance, onClose, onStarted }: Props = $props();

	let focus = $state<string[]>([]);
	let instructions = $state('');
	let notes = $state<Record<string, string>>({});
	let notesOpen = $state(false);
	let skipResearched = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const single = $derived(entries.length === 1);
	const researched = $derived(entries.filter((e) => e.researched_at));
	const fresh = $derived(entries.length - researched.length);
	const toRun = $derived(skipResearched ? entries.filter((e) => !e.researched_at) : entries);
	const reResearching = $derived(toRun.some((e) => e.researched_at));
	// Only what fits the kinds being researched (an organization has no school or job title).
	const kinds = $derived(new Set(entries.map((e) => e.kind)));
	const focusOptions = $derived(
		ENRICH_FOCUS_OPTIONS.filter((option) =>
			option.fields.some((field) => {
				const subjects = KNOWLEDGE_PREDICATE_MAP.get(field)?.subjectKinds ?? [];
				return !subjects.length || subjects.some((kind) => kinds.has(kind));
			})
		)
	);
	const fields = $derived([
		...new Set(focusOptions.filter((o) => focus.includes(o.key)).flatMap((o) => o.fields))
	]);
	const saidWhat = $derived(focus.length > 0 || instructions.trim().length > 0);
	const estimate = $derived(allowance ? estimateEnrich(toRun.length, allowance) : null);
	const overBatch = $derived(allowance ? toRun.length > allowance.max_batch : false);
	const blocked = $derived(
		!toRun.length ||
			overBatch ||
			(estimate !== null && (estimate.runs_available === 0 || estimate.left_today < 0.005))
	);
	const needsWhat = $derived(reResearching && !saidWhat);
	const title = $derived(
		single ? `Find more about ${entries[0]?.name ?? ''}` : `Enrich ${entries.length} entries`
	);
	const researchedLine = $derived(
		researched
			.slice(0, 4)
			.map((e) => `${e.name} (${shortDate(e.researched_at!)})`)
			.join(', ') + (researched.length > 4 ? `, and ${researched.length - 4} more` : '')
	);

	function shortDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function money(usd: number): string {
		return `$${usd.toFixed(2)}`;
	}

	function toggleFocus(key: string) {
		focus = focus.includes(key) ? focus.filter((k) => k !== key) : [...focus, key];
	}

	async function start(event: SubmitEvent) {
		event.preventDefault();
		if (blocked || needsWhat || submitting) return;
		submitting = true;
		error = null;
		const ids = toRun.map((e) => e.id);
		const entryNotes = Object.fromEntries(
			Object.entries(notes)
				.filter(([id, note]) => ids.includes(id) && note.trim())
				.map(([id, note]) => [id, note.trim()])
		);
		try {
			const result = await knowledgeApi.enrich({
				entity_ids: ids,
				...(fields.length ? { fields } : {}),
				...(instructions.trim() ? { instructions: instructions.trim() } : {}),
				...(Object.keys(entryNotes).length ? { entry_instructions: entryNotes } : {})
			});
			onStarted(result);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not start the research';
		} finally {
			submitting = false;
		}
	}

	const chip =
		'inline-flex min-h-9 items-center rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8';
</script>

<Modal isOpen={true} {onClose} {title} size="md">
	<form class="flex flex-col gap-4 p-4 sm:p-5" onsubmit={start}>
		<fieldset class="flex flex-col gap-2">
			<legend class="mb-2 text-sm font-medium text-foreground"
				>What should we look for?</legend
			>
			<div class="flex flex-wrap gap-2">
				{#each focusOptions as option (option.key)}
					{@const on = focus.includes(option.key)}
					<button
						type="button"
						class="{chip} {on
							? 'border-accent bg-accent/10 font-medium text-foreground'
							: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
						aria-pressed={on}
						onclick={() => toggleFocus(option.key)}
					>
						{option.label}
					</button>
				{/each}
			</div>
			<p class="text-xs text-muted-foreground">
				{focus.length
					? 'Research looks for these where they fit each entry.'
					: 'Nothing picked: it looks for the usual details for each kind of entry.'}
			</p>
		</fieldset>

		<label class="flex flex-col gap-1 text-sm">
			<span class="font-medium text-foreground"
				>{single ? 'Anything specific?' : 'Anything specific, for all of them?'}</span
			>
			<textarea
				class="min-h-20 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				bind:value={instructions}
				maxlength={MAX_ENRICH_INSTRUCTIONS_CHARS}
				placeholder="e.g. Which podcasts have they been on? What does the company sell?"
			></textarea>
			<span class="text-xs text-muted-foreground"
				>Looking for a phone number, email or school? Pick it above too, so research goes
				after it.</span
			>
		</label>

		{#if !single}
			<div class="flex flex-col gap-2">
				<button
					type="button"
					class="inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={notesOpen}
					onclick={() => (notesOpen = !notesOpen)}
				>
					{#if notesOpen}<ChevronUp
							class="h-4 w-4"
							aria-hidden="true"
						/>{:else}<ChevronDown class="h-4 w-4" aria-hidden="true" />{/if}
					Add a note for specific entries
				</button>
				{#if notesOpen}
					<ul
						class="flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2"
					>
						{#each toRun as entry (entry.id)}
							<li class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
								<label
									for="enrich-note-{entry.id}"
									class="min-w-0 truncate text-sm text-foreground sm:w-40 sm:shrink-0"
									>{entry.name}
									<span class="text-xs text-muted-foreground"
										>· {KIND_LABEL[entry.kind].one}</span
									></label
								>
								<input
									id="enrich-note-{entry.id}"
									class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
									placeholder="Optional"
									maxlength={MAX_ENRICH_ENTRY_NOTE_CHARS}
									bind:value={notes[entry.id]}
								/>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if researched.length}
			<div
				class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5 text-sm"
				role="note"
			>
				<p class="flex gap-2 text-foreground">
					<AlertTriangle
						class="mt-0.5 h-4 w-4 shrink-0 text-warning"
						aria-hidden="true"
					/>
					<span>
						{single
							? `Already researched ${shortDate(researched[0]!.researched_at!)}.`
							: `Already researched: ${researchedLine}.`}
						Research again? Say what you're looking for so it doesn't find the same things.
					</span>
				</p>
				{#if fresh > 0}
					<label class="flex items-center gap-2 pl-6 text-foreground">
						<input
							type="checkbox"
							class="h-4 w-4 rounded border-border"
							bind:checked={skipResearched}
						/>
						Skip these {researched.length} and research the other {fresh}
					</label>
				{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2.5 text-sm">
			{#if estimate && allowance}
				<p class="text-foreground">
					Up to <span class="stamp font-medium">{money(estimate.max_usd)}</span>
					<span class="text-muted-foreground"
						>· {toRun.length} × {money(allowance.per_entry_usd)} at most each</span
					>
				</p>
				<p class="text-xs text-muted-foreground">
					Today: <span class="stamp">{money(allowance.spent_today)}</span> of
					<span class="stamp">{money(allowance.daily_cap)}</span> used. Most entries cost less
					than the cap.
				</p>
				{#if overBatch}
					<p class="text-xs text-warning">
						Up to {allowance.max_batch} entries at a time. Pick fewer.
					</p>
				{:else if estimate.runs_available === 0}
					<p class="text-xs text-warning">
						{allowance.max_active_runs} research batches are already going. Start this when
						one finishes.
					</p>
				{:else if estimate.left_today < 0.005}
					<p class="text-xs text-warning">
						Today's research allowance is used up. It resets at midnight UTC.
					</p>
				{:else}
					{#if estimate.queueable < toRun.length}
						<p class="text-xs text-warning">
							Only {estimate.queueable} can start now ({estimate.runs_available} batch{estimate.runs_available ===
							1
								? ''
								: 'es'} free). The rest will be listed so you can start them later.
						</p>
					{/if}
					{#if estimate.covered < toRun.length}
						<p class="text-xs text-warning">
							Today's allowance covers about {estimate.covered}. Any past that are
							skipped.
						</p>
					{/if}
				{/if}
			{:else}
				<p class="text-muted-foreground">
					Up to {money(toRun.length * 0.03)} · capped per entry, per batch and per day.
				</p>
			{/if}
			<p class="text-xs text-muted-foreground">
				Home addresses and birthdays are never looked up for people. Phone numbers and
				emails only when you pick Phone &amp; email, and they stay private to you.
			</p>
		</div>

		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}

		<div class="flex flex-wrap items-center justify-end gap-2">
			{#if needsWhat}
				<p class="mr-auto text-xs text-muted-foreground">
					Pick what to look for, or say it, to research again.
				</p>
			{/if}
			<button
				type="button"
				class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
				onclick={onClose}>Cancel</button
			>
			<button
				type="submit"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
				disabled={submitting || blocked || needsWhat}
			>
				{#if submitting}
					<Loader2
						class="h-4 w-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
				{:else}
					<Sparkles class="h-4 w-4" aria-hidden="true" />
				{/if}
				{single
					? 'Start research'
					: `Research ${toRun.length} entr${toRun.length === 1 ? 'y' : 'ies'}`}
			</button>
		</div>
	</form>
</Modal>
