<!-- apps/web/src/lib/components/knowledge/KnowledgeConnections.svelte -->
<!--
	Connections (tasker 166): the overlaps in the people you know, without asking. Four lists
	(companies, places, industries, titles) show where your people cluster; pressing a group or
	typing a word narrows everyone to it, and the people who match are listed underneath. Open
	anyone to see their card.

	Honest about gaps: LinkedIn exports no location or industry, so when a place or industry
	list is thin the view says how many people can't be placed yet and offers research for the
	employers that would fill the most (paid, so it goes through the usual "What should we look
	for?" dialog; nothing is spent from here).

	One request per change (POST /api/knowledge/connections): people, groups and gap sentences
	arrive together. PRIVACY: filters stay in component state, never in the URL.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Briefcase, Hash, Loader2, MapPin, Sparkles, X } from '$lib/icons/lucide';
	import { KIND_ICON } from './knowledge-client';
	import {
		connectionLine,
		filterWords,
		findConnections,
		type ConnectionsAnswer,
		type KnowledgeConnectionFacet,
		type KnowledgeConnectionFilters,
		type KnowledgeConnectionGroup
	} from './connections-client';
	import type { EnrichEntry } from './research-tray';

	interface Props {
		onOpen: (id: string) => void;
		/** Start research for these entries (the page's "What should we look for?" dialog). */
		onResearch?: (entries: EnrichEntry[]) => void;
	}

	let { onOpen, onResearch }: Props = $props();

	type WordFilter = 'company' | 'place' | 'industry' | 'title';
	type Scope = 'world' | 'known';
	type Employment = 'current' | 'former' | 'any';

	const PAGE = 40;
	const GROUPS = 10;
	const FACETS: KnowledgeConnectionFacet[] = ['company', 'region', 'place', 'industry', 'title'];
	const PANELS: Array<{
		filter: WordFilter;
		title: string;
		add: string;
		empty: string;
		icon: typeof MapPin;
	}> = [
		{
			filter: 'company',
			title: 'Companies',
			add: 'Add a company',
			empty: 'No employers recorded for these people yet.',
			icon: KIND_ICON.org
		},
		{
			filter: 'place',
			title: 'Places',
			add: 'Add a city or state',
			empty: 'No locations known for these people yet.',
			icon: MapPin
		},
		{
			filter: 'industry',
			title: 'Industries',
			add: 'Add an industry word',
			empty: 'No industries known for their employers yet.',
			icon: Hash
		},
		{
			filter: 'title',
			title: 'Titles',
			add: 'Add a title word',
			empty: 'No job titles recorded for these people yet.',
			icon: Briefcase
		}
	];
	const FILTER_LABEL: Record<WordFilter, string> = {
		company: 'Company',
		place: 'Place',
		industry: 'Industry',
		title: 'Title'
	};

	let scope = $state<Scope>('world');
	let employment = $state<Employment>('current');
	let words = $state<Record<WordFilter, string[]>>({
		company: [],
		place: [],
		industry: [],
		title: []
	});
	let drafts = $state<Record<WordFilter, string>>({
		company: '',
		place: '',
		industry: '',
		title: ''
	});
	let answer = $state.raw<ConnectionsAnswer | null>(null);
	let unavailable = $state(false);
	let failed = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);

	const active = $derived(
		(Object.keys(words) as WordFilter[]).flatMap((filter) =>
			words[filter].map((word) => ({ filter, word }))
		)
	);
	const people = $derived(answer?.people ?? []);
	const total = $derived(answer?.total ?? 0);
	const coverage = $derived(answer?.coverage ?? null);
	// Nobody at all (before any filter): the import prompt. A filter that finds nobody keeps
	// the lists, so it can be undone.
	const empty = $derived(
		!loading &&
			scope === 'world' &&
			employment === 'current' &&
			coverage !== null &&
			coverage.people === 0 &&
			!active.length
	);

	function filters(): KnowledgeConnectionFilters {
		return {
			scope,
			...(employment !== 'current' ? { employment } : {}),
			...(words.company.length ? { company: words.company } : {}),
			...(words.place.length ? { place: words.place } : {}),
			...(words.industry.length ? { industry: words.industry } : {}),
			...(words.title.length ? { title: words.title } : {})
		};
	}

	/**
	 * What a list can't show yet, said at its foot: people with no known location, employers
	 * with no industry. Place and industry gaps name the employers research would fill first.
	 */
	function gapFor(
		filter: WordFilter
	): { text: string; research: Array<{ id: string; name: string }> } | null {
		if (!coverage || !answer || coverage.people === 0) return null;
		const count = (n: number) => n.toLocaleString();
		if (filter === 'place') {
			const missing = coverage.people - coverage.with_place;
			return missing > 0
				? {
						text: `${count(missing)} of ${count(coverage.people)} can't be placed yet.`,
						research: answer.gaps.companies_without_place
					}
				: null;
		}
		if (filter === 'industry') {
			const missing = coverage.companies - coverage.companies_with_industry;
			return missing > 0
				? {
						text: `${count(missing)} of ${count(coverage.companies)} employers have no industry yet.`,
						research: answer.gaps.companies_without_industry
					}
				: null;
		}
		const missing =
			coverage.people - (filter === 'company' ? coverage.with_company : coverage.with_title);
		if (missing <= 0) return null;
		return {
			text:
				filter === 'company'
					? `${count(missing)} ${missing === 1 ? 'person has' : 'people have'} no employer recorded.`
					: `${count(missing)} ${missing === 1 ? 'person has' : 'people have'} no title recorded.`,
			research: []
		};
	}

	/** Towns once a place is chosen (so a state opens into its towns); states before that. */
	function groupsFor(filter: WordFilter): { total: number; groups: KnowledgeConnectionGroup[] } {
		const facet: KnowledgeConnectionFacet =
			filter === 'place' ? (words.place.length ? 'place' : 'region') : filter;
		return answer?.facets[facet] ?? { total: 0, groups: [] };
	}

	let seq = 0;
	async function load(options: { append?: boolean } = {}) {
		// A page of the new filter must not land on the old filter's list.
		if (options.append && loading) return;
		const mine = ++seq;
		if (options.append) loadingMore = true;
		else loading = true;
		failed = null;
		try {
			const result = await findConnections(filters(), {
				facets: FACETS,
				limit: PAGE,
				offset: options.append ? people.length : 0,
				facetLimit: GROUPS
			});
			if (mine !== seq) return;
			if (!result) {
				unavailable = true;
				return;
			}
			answer =
				options.append && answer
					? { ...result, people: [...answer.people, ...result.people] }
					: result;
		} catch (error) {
			if (mine === seq)
				failed = error instanceof Error ? error.message : 'Could not load connections';
		} finally {
			if (mine === seq) {
				loading = false;
				loadingMore = false;
			}
		}
	}

	function setWords(filter: WordFilter, next: string[]) {
		words = { ...words, [filter]: next };
		void load();
	}

	/** A group row: narrow to it, or clear it when it is already the filter. */
	function toggleGroup(filter: WordFilter, name: string) {
		const on = isOn(filter, name);
		setWords(filter, on ? [] : [name]);
	}

	function isOn(filter: WordFilter, name: string): boolean {
		return words[filter].some((word) => word.toLowerCase() === name.toLowerCase());
	}

	function addDraft(event: SubmitEvent, filter: WordFilter) {
		event.preventDefault();
		const added = filterWords(drafts[filter]);
		drafts = { ...drafts, [filter]: '' };
		if (!added.length) return;
		setWords(filter, filterWords([...words[filter], ...added].join(',')));
	}

	function removeWord(filter: WordFilter, word: string) {
		setWords(
			filter,
			words[filter].filter((entry) => entry !== word)
		);
	}

	function clearAll() {
		words = { company: [], place: [], industry: [], title: [] };
		void load();
	}

	function choose(next: { scope?: Scope; employment?: Employment }) {
		if (next.scope) scope = next.scope;
		if (next.employment) employment = next.employment;
		void load();
	}

	function research(gaps: Array<{ id: string; name: string }>) {
		onResearch?.(
			gaps.map((gap) => ({ id: gap.id, name: gap.name, kind: 'org', researched_at: null }))
		);
	}

	onMount(() => {
		void load();
	});

	const chip =
		'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
	const chipOn = 'border-accent bg-accent/10 font-medium text-foreground';
	const chipOff = 'border-border bg-card text-muted-foreground hover:text-foreground';
</script>

<section class="flex flex-col gap-4" aria-label="Connections" aria-busy={loading}>
	{#if unavailable}
		<p class="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
			Connections aren't switched on yet. Check back after the next update.
		</p>
	{:else if empty}
		<p class="rounded-md border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
			No people here yet. Import your contacts or LinkedIn connections and this view shows
			where they work, where they are and who overlaps.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex gap-2" role="toolbar" aria-label="Whose connections">
				<button
					type="button"
					class="{chip} {scope === 'world' ? chipOn : chipOff}"
					aria-pressed={scope === 'world'}
					onclick={() => choose({ scope: 'world' })}
				>
					Everyone in your world
				</button>
				<button
					type="button"
					class="{chip} {scope === 'known' ? chipOn : chipOff}"
					aria-pressed={scope === 'known'}
					onclick={() => choose({ scope: 'known' })}
				>
					People I know
				</button>
			</div>
			<label class="ml-auto flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
				Jobs
				<select
					class="min-h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					value={employment}
					onchange={(e) => choose({ employment: e.currentTarget.value as Employment })}
				>
					<option value="current">Works there now</option>
					<option value="former">Used to work there</option>
					<option value="any">Now or before</option>
				</select>
			</label>
		</div>

		{#if active.length}
			<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
				{#each active as entry (entry.filter + ':' + entry.word)}
					<span
						class="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent bg-accent/10 pl-3 pr-1 text-sm text-foreground"
					>
						<span class="text-muted-foreground">{FILTER_LABEL[entry.filter]}</span>
						<span class="font-medium">{entry.word}</span>
						<button
							type="button"
							class="inline-grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="Remove {FILTER_LABEL[entry.filter]} {entry.word}"
							onclick={() => removeWord(entry.filter, entry.word)}
						>
							<X class="h-3.5 w-3.5" aria-hidden="true" />
						</button>
					</span>
				{/each}
				<button
					type="button"
					class="inline-flex min-h-8 items-center rounded-md px-2 text-sm text-muted-foreground pressable hover:bg-muted hover:text-foreground"
					onclick={clearAll}
				>
					Clear all
				</button>
			</div>
		{/if}

		{#if failed}
			<p
				class="rounded-md border border-border bg-card px-4 py-3 text-sm text-destructive"
				role="alert"
			>
				{failed}
			</p>
		{/if}

		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each PANELS as panel (panel.filter)}
				{@const facet = groupsFor(panel.filter)}
				{@const most = facet.groups[0]?.people ?? 1}
				{@const PanelIcon = panel.icon}
				{@const gap = gapFor(panel.filter)}
				<section
					class="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3"
					aria-label={panel.title}
				>
					<h3 class="flex items-center gap-1.5 text-sm font-medium text-foreground">
						<PanelIcon class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						{panel.title}
						{#if facet.total}<span class="stamp text-xs text-muted-foreground"
								>{facet.total}</span
							>{/if}
					</h3>
					<form onsubmit={(event) => addDraft(event, panel.filter)}>
						<label class="block">
							<span class="sr-only">{panel.add}</span>
							<input
								type="text"
								class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								placeholder={panel.add}
								autocomplete="off"
								bind:value={drafts[panel.filter]}
							/>
						</label>
					</form>
					{#if facet.groups.length}
						<ul class="-mx-1 flex flex-col gap-0.5">
							{#each facet.groups as group (group.key)}
								{@const on = isOn(panel.filter, group.name)}
								<li>
									<button
										type="button"
										class="relative flex min-h-9 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8 {on
											? 'font-medium text-foreground'
											: 'text-foreground'}"
										aria-pressed={on}
										title={group.sample.join(', ')}
										onclick={() => toggleGroup(panel.filter, group.name)}
									>
										<span
											class="absolute inset-y-1 left-0 rounded-r {on
												? 'bg-accent/25'
												: 'bg-accent/10'}"
											style:width="{Math.max(
												4,
												Math.round((group.people / most) * 100)
											)}%"
											aria-hidden="true"
										></span>
										<span class="relative min-w-0 flex-1 truncate"
											>{group.name}</span
										>
										<span class="stamp relative text-xs text-muted-foreground"
											>{group.people}</span
										>
									</button>
								</li>
							{/each}
						</ul>
						{#if facet.total > facet.groups.length}
							<p class="text-xs text-muted-foreground">
								{facet.total - facet.groups.length} more. Type a word above to find one.
							</p>
						{/if}
					{:else if !loading}
						<p class="text-xs text-muted-foreground">{panel.empty}</p>
					{/if}
					{#if gap}
						<p
							class="mt-auto border-t border-border pt-2 text-xs text-muted-foreground"
						>
							{gap.text}
							{#if gap.research.length && onResearch}
								{@const gaps = gap.research}
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={gaps.map((entry) => entry.name).join(', ')}
									onclick={() => research(gaps)}
								>
									<Sparkles class="h-3 w-3" aria-hidden="true" />
									Research the {gaps.length === 1
										? 'biggest'
										: `${gaps.length} biggest`}
								</button>
							{/if}
						</p>
					{/if}
				</section>
			{/each}
		</div>

		<section class="flex min-w-0 flex-col gap-2" aria-label="People">
			<h3 class="flex items-center gap-2 text-sm font-medium text-foreground">
				{total.toLocaleString()}
				{total === 1 ? 'person' : 'people'}
				{#if loading}<Loader2
						class="h-3.5 w-3.5 animate-spin text-muted-foreground"
						aria-hidden="true"
					/>{/if}
			</h3>
			{#if people.length}
				<ul
					class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
				>
					{#each people as person (person.id)}
						{@const line = connectionLine(person)}
						<li>
							<button
								type="button"
								class="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								onclick={() => onOpen(person.id)}
							>
								<span class="flex min-w-0 flex-1 flex-col">
									<span class="truncate font-medium text-foreground"
										>{person.name}</span
									>
									{#if line}<span class="truncate text-xs text-muted-foreground"
											>{line}</span
										>{/if}
								</span>
								{#if person.places.length}
									<span
										class="hidden max-w-[35%] shrink-0 items-center gap-1 truncate text-xs text-muted-foreground sm:inline-flex"
									>
										<MapPin class="h-3 w-3 shrink-0" aria-hidden="true" />
										<span class="truncate">{person.places[0]}</span>
									</span>
								{/if}
								{#if person.tasks + person.documents}
									<span class="stamp shrink-0 text-xs text-muted-foreground">
										{person.tasks + person.documents} in your work
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
				{#if people.length < total}
					<button
						type="button"
						class="inline-flex min-h-9 w-fit items-center gap-1.5 self-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground pressable hover:bg-muted"
						disabled={loading || loadingMore}
						onclick={() => void load({ append: true })}
					>
						{#if loadingMore}<Loader2
								class="h-4 w-4 animate-spin"
								aria-hidden="true"
							/>{/if}
						Show more
					</button>
				{/if}
			{:else if !loading}
				<p
					class="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
				>
					Nobody matches. The lists above say what is still missing.
				</p>
			{/if}
		</section>
	{/if}
</section>
