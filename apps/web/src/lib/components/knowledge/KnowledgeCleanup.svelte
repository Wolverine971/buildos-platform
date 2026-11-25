<!-- apps/web/src/lib/components/knowledge/KnowledgeCleanup.svelte -->
<!--
	Clean up: go through your organizations one card at a time, likeliest junk or duplicate first,
	and answer each with one key.

	  X  Remove         gone for good: off the list, off your tasks and docs, never picked up again
	  K  Keep           it belongs; it won't be asked about again
	  1–3  Same company  merge with a look-alike (the fuller entry survives)
	  ⇧1–3 Part of it    keep it as its own entry, filed under the look-alike
	  S  Same as…       pick any organization to merge with
	  U  Part of…       pick any organization to file it under
	  P  It's a person  turn the entry into a person
	  A  Add a person   say who works there (the card stays up)
	  →  Skip · ←  Back · Z  Undo

	Each card shows where the name came from (LinkedIn, your work, contacts, a web search), the
	task or doc sentence it was read from, who is attached, and entries that may be the same
	company. Answers leave at once and are saved a few seconds later, so the last one can be
	undone (CleanupSession). Free: nothing here calls a model.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		ArrowLeft,
		ArrowRight,
		Building,
		Check,
		CheckCircle2,
		ExternalLink,
		FileText,
		GitMerge,
		ListChecks,
		Loader2,
		Network,
		Plus,
		Search,
		Trash2,
		Undo2,
		User,
		UserPlus,
		X
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import KnowledgeSourceTags from './KnowledgeSourceTags.svelte';
	import {
		CLEANUP_UNDO_MS,
		CleanupSession,
		mergeSurvivor,
		type CleanupOther
	} from './cleanup-session.svelte';
	import {
		KNOWLEDGE_SOURCE_LABEL,
		KNOWLEDGE_SOURCES,
		knowledgeApi,
		type KnowledgeCleanupEntry,
		type KnowledgeCleanupSimilar,
		type KnowledgeSource
	} from './knowledge-client';
	import { emptyWhere, whereApi, type KnowledgeWhere } from './where-types';

	interface Props {
		/** Start on one source ("From your work" when the list is filtered to it). */
		initialSource?: KnowledgeSource | null;
		/** Closed, after everything was saved. `changed` = at least one answer was given. */
		onClose: (changed: boolean) => void;
		/** "Open card": leave Clean up and show this entry's full card. */
		onOpenEntry?: (id: string) => void;
	}

	let { initialSource = null, onClose, onOpenEntry }: Props = $props();

	const session = new CleanupSession({
		queue: (params) => knowledgeApi.cleanupQueue(params),
		remove: (id) => knowledgeApi.removeMany([id]),
		keep: (id) => knowledgeApi.update(id, { circle: 'inner' }),
		person: (id) => knowledgeApi.update(id, { kind: 'person' }),
		merge: (keep, merge) => knowledgeApi.merge(keep, merge),
		// Filed under another organization: it is a real one, so it also counts as kept.
		partOf: async (id, parentId) => {
			await knowledgeApi.addFacts(id, [{ predicate: 'part_of', object_id: parentId }]);
			await knowledgeApi.update(id, { circle: 'inner' });
		}
	});
	// svelte-ignore state_referenced_locally
	void session.start(initialSource);

	const entry = $derived(session.current);
	const similar = $derived(entry ? session.similarFor(entry).slice(0, 3) : []);
	/** A person was attached to a card: a change even when no card was answered. */
	let attachedAny = $state(false);
	let closing = $state(false);
	const answered = $derived(session.done.size + session.foldedAway.size > 0 || attachedAny);

	const tallyLine = $derived(
		[
			[session.tally.removed, 'removed'],
			[session.tally.merged, 'merged'],
			[session.tally.kept, 'kept'],
			[session.tally.part, 'filed under another'],
			[session.tally.person, 'made a person']
		]
			.filter(([count]) => count)
			.map(([count, word]) => `${count} ${word}`)
			.join(' · ')
	);
	const sourceTabs = $derived(KNOWLEDGE_SOURCES.filter((source) => session.bySource[source]));

	$effect(() => {
		const message = session.failure;
		if (!message) return;
		toastService.error(message);
		session.failure = null;
	});

	// Where the next few cards show up (the task or doc sentence that named them).
	let whereById = $state.raw<ReadonlyMap<string, KnowledgeWhere>>(new Map());
	const whereAsked = new Set<string>();
	const upcoming = $derived(session.ahead.slice(0, 4).map((e) => e.id));
	$effect(() => {
		const missing = upcoming.filter((id) => !whereAsked.has(id));
		if (!missing.length) return;
		for (const id of missing) whereAsked.add(id);
		whereApi
			.forEntities(missing)
			.then((result) => {
				const next = new Map(untrack(() => whereById));
				for (const id of missing) next.set(id, result[id] ?? emptyWhere());
				whereById = next;
			})
			.catch(() => {
				// The card still works without it; a later card asks again.
				for (const id of missing) whereAsked.delete(id);
			});
	});
	const where = $derived(entry ? (whereById.get(entry.id) ?? null) : null);
	const records = $derived(where ? [...where.tasks, ...where.documents] : []);

	async function close() {
		if (closing) return;
		closing = true;
		await session.flush();
		onClose(answered);
	}

	function openCard(id: string) {
		void session.flush().then(() => onOpenEntry?.(id));
	}

	// ---------------------------------------------------------------------
	// Picking another entry: "Same as…", "Part of…", "Add a person"

	type PickerMode = 'same' | 'part' | 'person';
	interface PickerRow {
		id: string | null;
		name: string;
		summary: string | null;
	}
	const PICKER = {
		same: { title: 'Same company as…', placeholder: 'Search your organizations', kind: 'org' },
		part: { title: 'Part of…', placeholder: 'Search your organizations', kind: 'org' },
		person: { title: 'Who works here?', placeholder: 'Search your people', kind: 'person' }
	} as const;

	let picker = $state<PickerMode | null>(null);
	let pickerQuery = $state('');
	let pickerRows = $state.raw<PickerRow[]>([]);
	let pickerIndex = $state(0);
	let pickerLoading = $state(false);
	let pickerBusy = $state(false);
	let pickerTimer: ReturnType<typeof setTimeout> | undefined;
	let pickerSeq = 0;

	function openPicker(mode: PickerMode) {
		if (!entry) return;
		picker = mode;
		pickerQuery = '';
		pickerRows = [];
		pickerIndex = 0;
	}

	function closePicker() {
		clearTimeout(pickerTimer);
		pickerSeq += 1;
		picker = null;
		pickerLoading = false;
	}

	function onPickerInput() {
		clearTimeout(pickerTimer);
		const mode = picker;
		const text = pickerQuery.trim();
		const seq = ++pickerSeq;
		if (!mode || !text) {
			pickerRows = [];
			pickerLoading = false;
			return;
		}
		pickerLoading = true;
		pickerTimer = setTimeout(() => {
			knowledgeApi
				.list({ q: text, kind: PICKER[mode].kind, view: 'all', limit: 8 })
				.then((result) => {
					if (seq !== pickerSeq) return;
					const found: PickerRow[] = result.entities
						.filter((row) => row.id !== entry?.id && !session.foldedAway.has(row.id))
						.map((row) => ({ id: row.id, name: row.name, summary: row.summary }));
					const exact = found.some(
						(row) => row.name.trim().toLowerCase() === text.toLowerCase()
					);
					// Someone not in the graph yet can be added on the spot.
					pickerRows =
						mode === 'person' && !exact
							? [...found, { id: null, name: text, summary: 'Add as a new person' }]
							: found;
					pickerIndex = 0;
				})
				.catch(() => {
					if (seq === pickerSeq) pickerRows = [];
				})
				.finally(() => {
					if (seq === pickerSeq) pickerLoading = false;
				});
		}, 200);
	}

	function onPickerKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closePicker();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			pickerIndex = Math.min(pickerIndex + 1, Math.max(pickerRows.length - 1, 0));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			pickerIndex = Math.max(pickerIndex - 1, 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const row = pickerRows[pickerIndex];
			if (row) void choose(row);
		}
	}

	async function choose(row: PickerRow) {
		const mode = picker;
		const card = entry;
		if (!mode || !card || pickerBusy) return;
		pickerBusy = true;
		try {
			if (mode === 'person') {
				await attachPerson(card, row);
			} else if (row.id && mode === 'part') {
				session.partOf({ id: row.id, name: row.name });
			} else if (row.id) {
				// The search doesn't say which entry is fuller; the merge preview does.
				const preview = await knowledgeApi.mergePreview([card.id, row.id]);
				const other = preview.entries.find((e) => e.id === row.id);
				if (other && !other.mergeable && preview.suggested_keep !== row.id)
					throw new Error(
						`“${row.name}” is a shared entry, so it can only be the one kept.`
					);
				session.mergeWith(
					{ id: row.id, name: row.name },
					preview.suggested_keep === row.id || (other && !other.mergeable)
						? 'other'
						: 'card'
				);
			}
			closePicker();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not do that');
		} finally {
			pickerBusy = false;
		}
	}

	async function attachPerson(card: KnowledgeCleanupEntry, row: PickerRow) {
		if (row.id) {
			await knowledgeApi.addFacts(row.id, [{ predicate: 'works_at', object_id: card.id }]);
		} else {
			await knowledgeApi.create({
				kind: 'person',
				name: row.name,
				facts: [{ predicate: 'works_at', object_id: card.id }]
			});
		}
		attachedAny = true;
		session.patch(card.id, {
			people: card.people + 1,
			people_names: [...card.people_names, row.name].slice(0, 3)
		});
		toastService.success(`${row.name} works at ${card.name}`);
	}

	// ---------------------------------------------------------------------
	// Keys

	function otherOf(match: KnowledgeCleanupSimilar): CleanupOther {
		return { id: match.id, name: match.name, records: match.records, people: match.people };
	}

	function onKeydown(event: KeyboardEvent) {
		if (picker || closing || event.defaultPrevented) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		)
			return;

		const digit = /^Digit([1-3])$/.exec(event.code)?.[1];
		if (digit) {
			const match = similar[Number(digit) - 1];
			if (!match) return;
			event.preventDefault();
			if (event.shiftKey) session.partOf(otherOf(match));
			else session.mergeWith(otherOf(match));
			return;
		}
		const actions: Record<string, () => void> = {
			x: () => session.remove(),
			Backspace: () => session.remove(),
			Delete: () => session.remove(),
			k: () => session.keep(),
			p: () => session.isPerson(),
			s: () => openPicker('same'),
			u: () => openPicker('part'),
			a: () => openPicker('person'),
			z: () => void session.undo(),
			ArrowRight: () => session.skip(),
			j: () => session.skip(),
			ArrowLeft: () => void session.back()
		};
		const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
		if (!action) return;
		event.preventDefault();
		action();
	}

	const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

	function aboutLine(match: KnowledgeCleanupSimilar): string {
		const parts: string[] = [];
		if (match.records)
			parts.push(`${match.records} task${match.records === 1 ? '' : 's'} & docs`);
		if (match.people) parts.push(people(match.people));
		return parts.join(' · ');
	}

	/** "Sam Jones, Ana Ruiz and 3 more", or "4 people" when no name is loaded. */
	function peopleLine(card: KnowledgeCleanupEntry): string {
		const names = card.people_names;
		const rest = card.people - names.length;
		if (!names.length) return people(card.people);
		return names.join(', ') + (rest > 0 ? ` and ${rest} more` : '');
	}

	const kbd =
		'hidden h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[0.6875rem] font-medium text-muted-foreground sm:inline-flex';
	const actionBtn =
		'inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:bg-muted disabled:opacity-50';
	const chip =
		'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
	const chipOn = 'border-accent bg-accent/10 font-medium text-foreground';
	const chipOff = 'border-border bg-card text-muted-foreground hover:text-foreground';
</script>

<svelte:window onkeydown={onKeydown} />

<Modal
	isOpen={true}
	onClose={() => void close()}
	size="lg"
	showCloseButton={false}
	closeOnEscape={!picker}
	ariaLabel="Clean up your organizations"
>
	{#snippet header()}
		<header class="flex flex-col gap-2 border-b border-border px-4 py-3">
			<div class="flex items-center gap-3">
				<h2 class="text-lg font-semibold text-foreground">Clean up</h2>
				<p class="text-sm text-muted-foreground" aria-live="polite">
					{#if entry}
						<span class="stamp">{session.left.toLocaleString()}</span> to go
						{#if session.skipped.length}· {session.skipped.length} skipped{/if}
					{:else if session.loading}
						Loading…
					{/if}
				</p>
				<button
					type="button"
					class="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground pressable hover:bg-muted disabled:opacity-60"
					disabled={closing}
					onclick={() => void close()}
				>
					{#if closing}
						<Loader2
							class="h-4 w-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/> Saving
					{:else}
						<X class="h-4 w-4" aria-hidden="true" /> Done
					{/if}
				</button>
			</div>
			{#if sourceTabs.length > 1}
				<div
					class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
					role="toolbar"
					aria-label="Which organizations"
				>
					<button
						type="button"
						class="{chip} {session.source === null ? chipOn : chipOff}"
						aria-pressed={session.source === null}
						onclick={() => void session.start(null)}
					>
						All
					</button>
					{#each sourceTabs as source (source)}
						<button
							type="button"
							class="{chip} {session.source === source ? chipOn : chipOff}"
							aria-pressed={session.source === source}
							onclick={() => void session.start(source)}
						>
							{KNOWLEDGE_SOURCE_LABEL[source].filter}
							<span class="stamp text-xs text-muted-foreground"
								>{session.bySource[source]}</span
							>
						</button>
					{/each}
				</div>
			{/if}
			{#if tallyLine}
				<p class="text-xs text-muted-foreground">{tallyLine}</p>
			{/if}
		</header>
	{/snippet}

	<!-- Focus starts here, not on Done, so a stray Space or Enter never closes Clean up. -->

	<div class="min-h-[18rem] px-4 py-4 focus:outline-none" tabindex="-1" data-autofocus>
		{#if session.error}
			<p class="text-sm text-muted-foreground">{session.error}</p>
		{:else if entry}
			{#key entry.id}
				<article class="flex flex-col gap-4" aria-label={entry.name}>
					<div class="flex items-start gap-3">
						<span
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
							aria-hidden="true"
						>
							<Building class="h-5 w-5" />
						</span>
						<div class="min-w-0 flex-1">
							<h3 class="break-words text-xl font-semibold text-foreground">
								{entry.name}
							</h3>
							{#if entry.summary}
								<p class="truncate text-sm text-muted-foreground">
									{entry.summary}
								</p>
							{/if}
							<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
								<KnowledgeSourceTags sources={entry.sources} />
								{#if entry.sources.includes('manual')}
									<span class="text-xs text-muted-foreground">Added by hand</span>
								{/if}
							</div>
						</div>
						{#if onOpenEntry}
							<button
								type="button"
								class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground"
								onclick={() => openCard(entry.id)}
							>
								<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" /> Open card
							</button>
						{/if}
					</div>

					{#if entry.reasons.length}
						<p class="text-sm text-accent">{entry.reasons.join(' · ')}</p>
					{/if}

					<section class="flex flex-col gap-1.5" aria-label="Where it shows up">
						<p class="micro-label text-muted-foreground">Where it shows up</p>
						{#if !where}
							<p class="text-sm text-muted-foreground">Looking…</p>
						{:else if records.length}
							<ul class="flex flex-col gap-1.5">
								{#each records.slice(0, 3) as record (record.id)}
									{@const RecordIcon =
										record.kind === 'task' ? ListChecks : FileText}
									<li class="flex min-w-0 gap-2 text-sm">
										<RecordIcon
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span class="min-w-0">
											<span class="text-foreground">{record.title}</span>
											{#if record.project_name}
												<span class="text-muted-foreground">
													· {record.project_name}</span
												>
											{/if}
											{#if record.quote}
												<span
													class="line-clamp-2 block text-muted-foreground"
													>“{record.quote}”</span
												>
											{/if}
										</span>
									</li>
								{/each}
							</ul>
							{#if records.length > 3}
								<p class="text-xs text-muted-foreground">
									and {records.length - 3} more
								</p>
							{/if}
						{:else}
							<p class="text-sm text-muted-foreground">
								{entry.sources.includes('work')
									? 'No task or doc you can open names it.'
									: 'Not in any of your projects, tasks or docs.'}
							</p>
						{/if}
					</section>

					{#if entry.people}
						<p class="flex items-center gap-2 text-sm text-muted-foreground">
							<User class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span class="min-w-0 truncate">{peopleLine(entry)}</span>
						</p>
					{/if}

					{#if similar.length}
						<section
							class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2"
							aria-label="Might be the same company"
						>
							<p class="micro-label px-1 text-muted-foreground">
								Might be the same company
							</p>
							<ul class="flex flex-col gap-1.5">
								{#each similar as match, index (match.id)}
									{@const about = aboutLine(match)}
									{@const survivor = mergeSurvivor(entry, otherOf(match))}
									<li
										class="flex min-w-0 flex-col gap-1 rounded-md bg-card px-2 py-1.5"
									>
										<div class="flex min-w-0 flex-wrap items-center gap-2">
											<span class={kbd} aria-hidden="true">{index + 1}</span>
											<span
												class="min-w-0 truncate text-sm font-medium text-foreground"
												>{match.name}</span
											>
											<KnowledgeSourceTags sources={match.sources} />
											{#if about}
												<span class="text-xs text-muted-foreground"
													>{about}</span
												>
											{/if}
										</div>
										<p class="text-xs text-accent">{match.reason}</p>
										<div class="flex flex-wrap gap-1">
											<button
												type="button"
												class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground pressable hover:bg-muted"
												onclick={() => session.mergeWith(otherOf(match))}
											>
												<GitMerge class="h-3.5 w-3.5" aria-hidden="true" />
												{survivor === 'other'
													? `Same company: merge into “${match.name}”`
													: `Same company: merge it into this one`}
											</button>
											<button
												type="button"
												class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground"
												onclick={() => session.partOf(otherOf(match))}
											>
												<Network class="h-3.5 w-3.5" aria-hidden="true" />
												Part of “{match.name}”
											</button>
										</div>
									</li>
								{/each}
							</ul>
						</section>
					{/if}

					{#if picker}
						{@const mode = PICKER[picker]}
						<section
							class="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 p-2"
							aria-label={mode.title}
						>
							<div class="flex items-center gap-2">
								<p class="micro-label px-1 text-muted-foreground">
									{mode.title}
								</p>
								<button
									type="button"
									class="ml-auto inline-grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
									aria-label="Cancel"
									onclick={closePicker}
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</div>
							<label class="relative block">
								<span class="sr-only">{mode.placeholder}</span>
								<Search
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
									aria-hidden="true"
								/>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="search"
									class="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
									placeholder={mode.placeholder}
									autofocus
									bind:value={pickerQuery}
									oninput={onPickerInput}
									onkeydown={onPickerKeydown}
								/>
							</label>
							{#if pickerRows.length}
								<ul class="flex flex-col" role="listbox" aria-label="Matches">
									{#each pickerRows as row, index (row.id ?? `new:${row.name}`)}
										<li role="option" aria-selected={index === pickerIndex}>
											<button
												type="button"
												class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm pressable hover:bg-muted disabled:opacity-60 {index ===
												pickerIndex
													? 'bg-muted'
													: ''}"
												disabled={pickerBusy}
												onclick={() => void choose(row)}
											>
												{#if row.id === null}
													<Plus
														class="h-3.5 w-3.5 shrink-0 text-accent"
														aria-hidden="true"
													/>
												{/if}
												<span
													class="min-w-0 truncate font-medium text-foreground"
													>{row.name}</span
												>
												{#if row.summary}
													<span
														class="min-w-0 truncate text-xs text-muted-foreground"
														>{row.summary}</span
													>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{:else if pickerLoading}
								<p class="px-1 text-xs text-muted-foreground">Searching…</p>
							{:else if pickerQuery.trim()}
								<p class="px-1 text-xs text-muted-foreground">Nothing matches.</p>
							{/if}
						</section>
					{/if}
				</article>
			{/key}
		{:else if session.loading}
			<p class="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2
					class="h-4 w-4 animate-spin motion-reduce:animate-none"
					aria-hidden="true"
				/> Finding what to look at first…
			</p>
		{:else}
			<div class="flex flex-col items-start gap-3 py-6">
				<CheckCircle2 class="h-8 w-8 text-accent" aria-hidden="true" />
				<h3 class="text-lg font-semibold text-foreground">
					{session.skipped.length ? 'That’s the queue' : 'All clean'}
				</h3>
				<p class="max-w-prose text-sm text-muted-foreground">
					{#if tallyLine}{tallyLine}.{:else}Nothing here needs an answer.{/if}
					{#if session.skipped.length}
						You skipped {session.skipped.length}.
					{/if}
				</p>
				<div class="flex flex-wrap gap-2">
					{#if session.skipped.length}
						<button
							type="button"
							class={actionBtn}
							onclick={() => session.revisitSkipped()}
						>
							Go through the skipped ones
						</button>
					{/if}
					{#if session.source}
						<button
							type="button"
							class={actionBtn}
							onclick={() => void session.start(null)}
						>
							Look at every source
						</button>
					{/if}
					<button
						type="button"
						class="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable"
						onclick={() => void close()}
					>
						Done
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		{#if entry}
			<footer class="flex flex-col gap-2 border-t border-border px-4 py-3">
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-destructive/40 bg-card px-3 text-sm font-medium text-destructive pressable hover:bg-destructive/10"
						onclick={() => session.remove()}
					>
						<Trash2 class="h-4 w-4" aria-hidden="true" /> Remove
						<span class={kbd} aria-hidden="true">X</span>
					</button>
					<button
						type="button"
						class="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable"
						onclick={() => session.keep()}
					>
						<Check class="h-4 w-4" aria-hidden="true" /> Keep
						<span
							class="{kbd} border-transparent !bg-accent-foreground/20 !text-accent-foreground"
							aria-hidden="true">K</span
						>
					</button>
					<button type="button" class={actionBtn} onclick={() => openPicker('same')}>
						<GitMerge class="h-4 w-4" aria-hidden="true" /> Same as…
						<span class={kbd} aria-hidden="true">S</span>
					</button>
					<button type="button" class={actionBtn} onclick={() => openPicker('part')}>
						<Network class="h-4 w-4" aria-hidden="true" /> Part of…
						<span class={kbd} aria-hidden="true">U</span>
					</button>
					<button type="button" class={actionBtn} onclick={() => session.isPerson()}>
						<User class="h-4 w-4" aria-hidden="true" /> It’s a person
						<span class={kbd} aria-hidden="true">P</span>
					</button>
					<button type="button" class={actionBtn} onclick={() => openPicker('person')}>
						<UserPlus class="h-4 w-4" aria-hidden="true" /> Add a person
						<span class={kbd} aria-hidden="true">A</span>
					</button>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<button
						type="button"
						class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 pressable hover:bg-muted hover:text-foreground disabled:opacity-40"
						disabled={!session.skipped.length}
						onclick={() => void session.back()}
					>
						<ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" /> Back
					</button>
					<button
						type="button"
						class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 pressable hover:bg-muted hover:text-foreground"
						onclick={() => session.skip()}
					>
						Skip <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
					</button>
					{#if session.ahead.length > 1}
						<p class="hidden min-w-0 flex-1 truncate text-xs sm:block">
							Next: {session.ahead
								.slice(1, 4)
								.map((e) => e.name)
								.join(', ')}
						</p>
					{/if}
				</div>
			</footer>
		{/if}

		{#if session.pending}
			{@const pending = session.pending}
			{#key pending}
				<div
					class="relative flex items-center gap-3 overflow-hidden border-t border-border bg-muted/40 px-4 py-2"
					role="status"
				>
					<p class="min-w-0 flex-1 truncate text-sm text-foreground">{pending.label}</p>
					<button
						type="button"
						class="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground pressable hover:bg-muted"
						onclick={() => void session.undo()}
					>
						<Undo2 class="h-3.5 w-3.5" aria-hidden="true" /> Undo
						<span class={kbd} aria-hidden="true">Z</span>
					</button>
					<span
						class="cleanup-undo-bar absolute bottom-0 left-0 h-0.5 w-full origin-left bg-accent motion-reduce:hidden"
						style:animation-duration="{CLEANUP_UNDO_MS}ms"
						aria-hidden="true"
					></span>
				</div>
			{/key}
		{/if}
	{/snippet}
</Modal>

<style>
	.cleanup-undo-bar {
		animation-name: cleanup-undo-drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}
	@keyframes cleanup-undo-drain {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}
</style>
