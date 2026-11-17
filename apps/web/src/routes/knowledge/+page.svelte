<!-- apps/web/src/routes/knowledge/+page.svelte -->
<!--
	Knowledge: the people you know, organizations, websites, channels and videos, all linked
	(tasker 160). Browse and search on the left; the card on the right drills from one entry to
	the next (org → people → person). On phones the card opens as a sheet. Chat is the main way
	in; "Ask in chat" hands an entry to it.

	Research at scale (tasker 164): filter and sort by researched / not researched, tick entries
	(shift-click for a range) and press Enrich N; the "What should we look for?" dialog starts
	the research and the bottom-right tray shows it running while you keep browsing. One poll
	(KnowledgeResearchQueue) feeds the tray, the dialog's allowance and every card.

	PRIVACY: the search text stays in component state, never in the URL. Only the open entry's
	id (?e=) is in the URL so a chat card can link straight to it.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { loadAgentChatModal } from '$lib/components/agent/load-agent-chat-modal';
	import KnowledgeEntityCard from '$lib/components/knowledge/KnowledgeEntityCard.svelte';
	import KnowledgeImportDialog from '$lib/components/knowledge/KnowledgeImportDialog.svelte';
	import KnowledgeEnrichDialog from '$lib/components/knowledge/KnowledgeEnrichDialog.svelte';
	import KnowledgeResearchTray from '$lib/components/knowledge/KnowledgeResearchTray.svelte';
	import { KnowledgeResearchQueue } from '$lib/components/knowledge/research-queue.svelte';
	import {
		isActiveTarget,
		type EnrichEntry,
		type EnrichStarted,
		type ResearchTarget
	} from '$lib/components/knowledge/research-tray';
	import {
		KIND_ICON,
		KIND_LABEL,
		KIND_ORDER,
		knowledgeApi,
		type ImportSummary,
		type KnowledgeEntitySummary,
		type KnowledgeKind,
		type KnowledgeListResult
	} from '$lib/components/knowledge/knowledge-client';
	import {
		GitMerge,
		Loader2,
		Plus,
		Search,
		Share2,
		Sparkles,
		Upload,
		X
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Filter = 'all' | 'known' | 'owned';
	type Researched = 'any' | 'yes' | 'no';
	type Sort = 'recent' | 'name' | 'researched';
	type Row = KnowledgeEntitySummary & { updated_at: string; researched_at?: string | null };

	// First paint only; the page reloads its own list after.
	// svelte-ignore state_referenced_locally
	const initial: KnowledgeListResult | null = data.initial;
	let rows = $state<Row[]>(initial?.entities ?? []);
	let total = $state(initial?.total ?? 0);
	let counts = $state<Partial<Record<KnowledgeKind, number>>>(initial?.counts ?? {});
	let knownCount = $state<number | null>(initial?.known_count ?? null);
	let filter = $state<Filter>('all');
	let kind = $state<KnowledgeKind | null>(null);
	let query = $state('');
	let researched = $state<Researched>('any');
	let sort = $state<Sort>('recent');
	let researchedCounts = $state<{ yes: number; no: number } | null>(initial?.researched ?? null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let stack = $state<string[]>([]);
	let importOpen = $state(false);
	let addOpen = $state(false);
	let duplicates = $state<
		Array<{ id: string; reason: string; a: KnowledgeEntitySummary; b: KnowledgeEntitySummary }>
	>([]);
	let duplicatesOpen = $state(false);
	let chatOpen = $state(false);
	let chatDraft = $state('');
	let innerWidth = $state(1280);

	const wide = $derived(innerWidth >= 1024);
	const selected = $derived(stack.at(-1) ?? null);
	const everythingCount = $derived(Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0));
	const isEmpty = $derived(
		!loading && everythingCount === 0 && !query && filter === 'all' && researched === 'any'
	);

	// Research: one queue for the tray, the dialog and the cards.
	const research = new KnowledgeResearchQueue({ onSettled: onResearchSettled });
	let enrichEntries = $state<EnrichEntry[] | null>(null);
	/** Ticked entries (kept across filters and pages), by id. */
	let picked = $state.raw<Map<string, Row>>(new Map());
	let lastPickIndex: number | null = null;
	const pickedCount = $derived(picked.size);
	const allShownPicked = $derived(rows.length > 0 && rows.every((r) => picked.has(r.id)));
	const someShownPicked = $derived(rows.some((r) => picked.has(r.id)));
	const maxBatch = $derived(research.allowance?.max_batch ?? 75);

	let requestSeq = 0;
	async function refresh(options: { append?: boolean } = {}) {
		const seq = ++requestSeq;
		if (options.append) loadingMore = true;
		else loading = true;
		try {
			const result = await knowledgeApi.list({
				kind,
				filter,
				researched,
				sort,
				q: query.trim() || undefined,
				limit: 60,
				offset: options.append ? rows.length : 0
			});
			if (seq !== requestSeq) return;
			rows = options.append ? [...rows, ...result.entities] : result.entities;
			total = result.total;
			knownCount = result.known_count;
			researchedCounts = result.researched ?? null;
			if (!kind) counts = result.counts;
		} catch (error) {
			if (seq === requestSeq)
				toastService.error(error instanceof Error ? error.message : 'Could not load');
		} finally {
			if (seq === requestSeq) {
				loading = false;
				loadingMore = false;
			}
		}
	}

	async function refreshDuplicates() {
		try {
			duplicates = (await knowledgeApi.mergeCandidates()).candidates;
		} catch {
			// the duplicates banner is a nicety
		}
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void refresh(), 250);
	}

	function choose(next: {
		filter?: Filter;
		kind?: KnowledgeKind | null;
		researched?: Researched;
		sort?: Sort;
	}) {
		if (next.filter !== undefined) filter = next.filter;
		if (next.kind !== undefined) kind = next.kind;
		if (next.researched !== undefined) researched = next.researched;
		if (next.sort !== undefined) sort = next.sort;
		lastPickIndex = null;
		void refresh();
	}

	function togglePick(row: Row, index: number, event: MouseEvent) {
		const on = !picked.has(row.id);
		const from = event.shiftKey && lastPickIndex !== null ? lastPickIndex : index;
		const range = rows.slice(Math.min(from, index), Math.max(from, index) + 1);
		const next = new Map(picked);
		for (const r of range) {
			if (on) next.set(r.id, r);
			else next.delete(r.id);
		}
		picked = next;
		lastPickIndex = index;
	}

	function toggleAllShown() {
		const next = new Map(picked);
		for (const r of rows) {
			if (allShownPicked) next.delete(r.id);
			else next.set(r.id, r);
		}
		picked = next;
	}

	function clearPicked() {
		picked = new Map();
		lastPickIndex = null;
	}

	function enrichPicked() {
		enrichEntries = [...picked.values()].map((r) => ({
			id: r.id,
			name: r.name,
			kind: r.kind,
			researched_at: r.researched_at ?? null
		}));
	}

	function onEnrichStarted(result: EnrichStarted) {
		enrichEntries = null;
		const notQueued = new Set(result.not_queued);
		// Keep ticked only what didn't start, so it can be sent again later.
		picked = new Map([...picked].filter(([id]) => notQueued.has(id)));
		toastService.success(
			result.queued === 1
				? 'Research started. Follow it in the tray.'
				: `Researching ${result.queued} entries. Follow them in the tray.`
		);
		if (result.not_queued.length) {
			toastService.info(
				`${result.not_queued.length} not started yet${result.refused ? `: ${result.refused}` : ''}`
			);
		}
		void research.started();
	}

	/** Research finished for some entries: mark them researched without losing the scroll. */
	function onResearchSettled(targets: ResearchTarget[]) {
		const done = new Map(
			targets.filter((t) => t.status === 'done').map((t) => [t.entity_id, t.finished_at])
		);
		if (!done.size) return;
		if (researched !== 'any' || sort === 'researched') {
			void refresh();
			return;
		}
		rows = rows.map((r) =>
			done.has(r.id) ? { ...r, researched_at: done.get(r.id) ?? new Date().toISOString() } : r
		);
	}

	function setIndeterminate(node: HTMLInputElement) {
		node.indeterminate = someShownPicked && !allShownPicked;
	}

	let lastFocusCheck = 0;
	function onWindowFocus() {
		// Research may have been started from chat in another tab; look once on return.
		if (research.live || Date.now() - lastFocusCheck < 15_000) return;
		lastFocusCheck = Date.now();
		void research.refresh();
	}

	function syncUrl(id: string | null) {
		const url = new URL(page.url);
		if (id) url.searchParams.set('e', id);
		else url.searchParams.delete('e');
		replaceState(url, page.state);
	}

	function open(id: string, options: { drill?: boolean } = {}) {
		stack = options.drill ? [...stack, id] : [id];
		syncUrl(id);
	}

	function back() {
		stack = stack.slice(0, -1);
		syncUrl(stack.at(-1) ?? null);
	}

	function closeCard() {
		stack = [];
		syncUrl(null);
	}

	function askInChat(entity: { name: string; kind: KnowledgeKind }) {
		chatDraft =
			entity.kind === 'person'
				? `What do I know about ${entity.name}? `
				: `Tell me what's in my knowledge about ${entity.name}. `;
		chatOpen = true;
	}

	function onImported(summary: ImportSummary) {
		toastService.success(`Imported ${summary.contacts.toLocaleString()} contacts`);
		filter = 'known';
		kind = null;
		void refresh();
		void refreshDuplicates();
	}

	onMount(() => {
		void refreshDuplicates();
		const fromUrl = page.url.searchParams.get('e');
		if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl)) stack = [fromUrl];
		const stopResearch = research.start();
		return () => {
			clearTimeout(searchTimer);
			stopResearch();
		};
	});

	// Add an entry by hand.
	let addKind = $state<KnowledgeKind>('person');
	let addName = $state('');
	let addLink = $state('');
	let addKnow = $state(true);
	let addSaving = $state(false);
	const addLinkPredicate = $derived(
		addKind === 'person' || addKind === 'org'
			? 'homepage'
			: ['website', 'channel', 'video', 'product', 'event'].includes(addKind)
				? 'url'
				: null
	);
	const ownable = $derived(['website', 'channel', 'video', 'product', 'org'].includes(addKind));

	// Videos: paste one or many YouTube links; titles and channels come from YouTube for free.
	let addVideos = $state('');
	const videoLinks = $derived(
		addVideos
			.split(/\s+/)
			.map((s) => s.trim())
			.filter((s) => /youtu\.?be/i.test(s))
	);

	async function addYouTube() {
		addSaving = true;
		try {
			const result = await knowledgeApi.addYouTube(videoLinks, addKnow);
			addOpen = false;
			addVideos = '';
			const fresh = result.videos.filter((v) => v.new).length;
			toastService.success(
				`Added ${fresh} video${fresh === 1 ? '' : 's'}` +
					(result.videos.length > fresh
						? `, ${result.videos.length - fresh} already here`
						: '') +
					(result.not_found
						? `. ${result.not_found} couldn't be looked up on YouTube.`
						: '')
			);
			choose({ filter: 'all', kind: 'video' });
			if (result.videos.length === 1) open(result.videos[0]!.id);
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not add those videos'
			);
		} finally {
			addSaving = false;
		}
	}

	async function addEntry(event: SubmitEvent) {
		event.preventDefault();
		if (addKind === 'video') return addYouTube();
		const link = addLink.trim();
		const name = addName.trim() || link.replace(/^https?:\/\//, '').replace(/\/$/, '');
		if (!name) return;
		addSaving = true;
		try {
			const result = await knowledgeApi.create({
				kind: addKind,
				name,
				...(addKind === 'person' ? { know: addKnow } : ownable ? { own: addKnow } : {}),
				...(link && addLinkPredicate
					? { facts: [{ predicate: addLinkPredicate, value: link }] }
					: {})
			});
			addOpen = false;
			addName = '';
			addLink = '';
			await refresh();
			open(result.entity_id);
			if (result.matched !== 'created')
				toastService.info('That was already here, so it opened the existing entry');
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not add that');
		} finally {
			addSaving = false;
		}
	}

	async function resolveDuplicate(candidate: (typeof duplicates)[number], same: boolean) {
		try {
			if (same) {
				// Keep the one that is not yours if it is shared; otherwise keep the first.
				const keep =
					candidate.a.scope === 'public'
						? candidate.a
						: candidate.b.scope === 'public'
							? candidate.b
							: candidate.a;
				const merge = keep.id === candidate.a.id ? candidate.b : candidate.a;
				await knowledgeApi.merge(keep.id, merge.id);
			} else {
				await knowledgeApi.rejectCandidate(candidate.id);
			}
			duplicates = duplicates.filter((d) => d.id !== candidate.id);
			if (same) void refresh();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not save that');
		}
	}

	const chip =
		'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
	const chipOn = 'border-accent bg-accent/10 font-medium text-foreground';
	const chipOff = 'border-border bg-card text-muted-foreground hover:text-foreground';
</script>

<svelte:head>
	<title>Knowledge · BuildOS</title>
</svelte:head>

<svelte:window bind:innerWidth onfocus={onWindowFocus} />

{#snippet card(id: string)}
	<ErrorBoundary area="knowledge entry">
		{#key id}
			<KnowledgeEntityCard
				entityId={id}
				onOpen={(next) => open(next, { drill: true })}
				onBack={stack.length > 1 ? back : undefined}
				onClose={closeCard}
				onChanged={() => void refresh()}
				onAskChat={askInChat}
				research={research.byEntity.get(id) ?? null}
				onFindMore={(entity) => (enrichEntries = [entity])}
			/>
		{/key}
	</ErrorBoundary>
{/snippet}

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-7xl space-y-4 px-4 py-4 lg:px-6 lg:py-6">
		<header class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<h1 class="text-2xl font-medium text-foreground">Knowledge</h1>
			<p class="hidden text-sm text-muted-foreground sm:block">
				The people you know and everything you've looked into, linked.
			</p>
			<div class="ml-auto flex gap-2">
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:bg-muted"
					onclick={() => (importOpen = true)}
				>
					<Upload class="h-4 w-4" aria-hidden="true" /> Import contacts
				</button>
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable"
					onclick={() => (addOpen = true)}
				>
					<Plus class="h-4 w-4" aria-hidden="true" /> Add
				</button>
			</div>
		</header>

		{#if data.unavailable}
			<p
				class="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
			>
				Knowledge isn't switched on yet. Check back after the next update.
			</p>
		{:else if isEmpty}
			<section
				class="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6"
			>
				<h2 class="text-lg font-semibold text-foreground">
					Start with the people you know
				</h2>
				<p class="max-w-prose text-sm text-muted-foreground">
					Bring in your phone contacts or LinkedIn connections. Then ask chat things like
					"who do I know at Palantir?" or open anyone here and press Find more to fill in
					what's missing, with sources.
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground pressable"
						onclick={() => (importOpen = true)}
					>
						<Upload class="h-4 w-4" aria-hidden="true" /> Import contacts
					</button>
					<button
						type="button"
						class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground pressable hover:bg-muted"
						onclick={() => (addOpen = true)}
					>
						Add a website or video
					</button>
				</div>
				<p class="text-xs text-muted-foreground">Everything you add is private to you.</p>
			</section>
		{:else}
			<div class="flex flex-col gap-3">
				<label class="relative block">
					<span class="sr-only">Search your knowledge</span>
					<Search
						class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						class="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						placeholder="Search names, companies, emails, links"
						bind:value={query}
						oninput={onSearchInput}
					/>
					{#if query}
						<button
							type="button"
							class="absolute right-2 top-1/2 inline-grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
							aria-label="Clear search"
							onclick={() => {
								query = '';
								void refresh();
							}}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</label>
				<div
					class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
					role="toolbar"
					aria-label="Filter"
				>
					<button
						type="button"
						class="{chip} {filter === 'all' && !kind ? chipOn : chipOff}"
						aria-pressed={filter === 'all' && !kind}
						onclick={() => choose({ filter: 'all', kind: null })}
					>
						Everything <span class="stamp text-xs text-muted-foreground"
							>{everythingCount}</span
						>
					</button>
					<button
						type="button"
						class="{chip} {filter === 'known' ? chipOn : chipOff}"
						aria-pressed={filter === 'known'}
						onclick={() => choose({ filter: 'known', kind: null })}
					>
						People I know {#if knownCount !== null}<span
								class="stamp text-xs text-muted-foreground">{knownCount}</span
							>{/if}
					</button>
					<button
						type="button"
						class="{chip} {filter === 'owned' ? chipOn : chipOff}"
						aria-pressed={filter === 'owned'}
						onclick={() => choose({ filter: 'owned', kind: null })}
					>
						Mine
					</button>
					{#each KIND_ORDER.filter((k) => counts[k]) as k (k)}
						{@const KindIcon = KIND_ICON[k]}
						<button
							type="button"
							class="{chip} {filter === 'all' && kind === k ? chipOn : chipOff}"
							aria-pressed={filter === 'all' && kind === k}
							onclick={() => choose({ filter: 'all', kind: k })}
						>
							<KindIcon class="h-3.5 w-3.5" aria-hidden="true" />
							{KIND_LABEL[k].many}
							<span class="stamp text-xs text-muted-foreground">{counts[k]}</span>
						</button>
					{/each}
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<div
						class="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
						role="toolbar"
						aria-label="Research filter"
					>
						<button
							type="button"
							class="{chip} {researched === 'any' ? chipOn : chipOff}"
							aria-pressed={researched === 'any'}
							onclick={() => choose({ researched: 'any' })}
						>
							Any
						</button>
						<button
							type="button"
							class="{chip} {researched === 'yes' ? chipOn : chipOff}"
							aria-pressed={researched === 'yes'}
							onclick={() => choose({ researched: 'yes' })}
						>
							<Sparkles class="h-3.5 w-3.5" aria-hidden="true" /> Researched
							{#if researchedCounts}<span class="stamp text-xs text-muted-foreground"
									>{researchedCounts.yes}</span
								>{/if}
						</button>
						<button
							type="button"
							class="{chip} {researched === 'no' ? chipOn : chipOff}"
							aria-pressed={researched === 'no'}
							onclick={() => choose({ researched: 'no' })}
						>
							Not researched
							{#if researchedCounts}<span class="stamp text-xs text-muted-foreground"
									>{researchedCounts.no}</span
								>{/if}
						</button>
					</div>
					<label class="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
						Sort
						<select
							class="min-h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							value={sort}
							onchange={(e) => choose({ sort: e.currentTarget.value as Sort })}
						>
							<option value="recent">Recently updated</option>
							<option value="name">Name A–Z</option>
							<option value="researched">Recently researched</option>
						</select>
					</label>
				</div>
				{#if duplicates.length}
					<button
						type="button"
						class="inline-flex w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
						onclick={() => (duplicatesOpen = true)}
					>
						<GitMerge class="h-4 w-4" aria-hidden="true" />
						{duplicates.length} possible duplicate{duplicates.length === 1 ? '' : 's'} to
						review
					</button>
				{/if}
			</div>

			<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
				<section aria-label="Entries" aria-busy={loading} class="min-w-0">
					{#if !rows.length && !loading}
						<p
							class="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
						>
							{query
								? `Nothing matches "${query}".`
								: filter === 'known'
									? 'No people you know yet. Import your contacts to fill this in.'
									: 'Nothing here yet.'}
						</p>
					{:else}
						<div
							class="mb-1.5 flex min-h-9 items-center gap-2 text-sm text-muted-foreground"
						>
							<label
								class="inline-flex min-h-9 cursor-pointer items-center gap-2.5 pl-3.5"
							>
								<input
									type="checkbox"
									class="h-4 w-4 rounded border-border"
									checked={allShownPicked}
									{@attach setIndeterminate}
									onchange={toggleAllShown}
								/>
								{pickedCount
									? `${pickedCount} selected`
									: 'Select all shown, or tick a few to research them at once'}
							</label>
						</div>
						<ul
							class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card {loading
								? 'opacity-60'
								: ''}"
						>
							{#each rows as row, index (row.id)}
								{@const RowIcon = KIND_ICON[row.kind]}
								{@const rowResearch = research.byEntity.get(row.id)}
								<li
									class="flex min-w-0 items-stretch {picked.has(row.id)
										? 'bg-accent/5'
										: ''}"
								>
									<label
										class="flex w-11 shrink-0 cursor-pointer items-center justify-center"
									>
										<input
											type="checkbox"
											class="h-4 w-4 rounded border-border"
											aria-label="Select {row.name}"
											checked={picked.has(row.id)}
											onclick={(e) => togglePick(row, index, e)}
										/>
									</label>
									<button
										type="button"
										class="flex min-h-12 w-full min-w-0 items-center gap-3 py-2 pl-1 pr-3 text-left pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {selected ===
										row.id
											? 'bg-muted'
											: ''}"
										aria-current={selected === row.id ? 'true' : undefined}
										onclick={() => open(row.id)}
									>
										<span
											class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
											aria-hidden="true"
										>
											<RowIcon class="h-4 w-4" />
										</span>
										<span class="min-w-0 flex-1">
											<span
												class="block truncate text-sm font-medium text-foreground"
												>{row.name}</span
											>
											<span
												class="block truncate text-xs text-muted-foreground"
												>{row.summary ?? KIND_LABEL[row.kind].one}</span
											>
										</span>
										{#if rowResearch && isActiveTarget(rowResearch)}
											<Loader2
												class="h-3.5 w-3.5 shrink-0 animate-spin text-accent motion-reduce:animate-none"
												aria-label="Researching"
											/>
										{:else if row.researched_at}
											<span
												class="inline-flex shrink-0 items-center"
												title="Researched {new Date(
													row.researched_at
												).toLocaleDateString(undefined, {
													month: 'short',
													day: 'numeric'
												})}"
											>
												<Sparkles
													class="h-3.5 w-3.5 text-accent"
													aria-hidden="true"
												/>
												<span class="sr-only">Researched</span>
											</span>
										{/if}
										{#if row.scope === 'public'}
											<Share2
												class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
												aria-label="Shared entry"
											/>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
						{#if rows.length < total}
							<div class="mt-3 flex justify-center">
								<button
									type="button"
									class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm text-foreground pressable hover:bg-muted disabled:opacity-60"
									disabled={loadingMore}
									onclick={() => void refresh({ append: true })}
								>
									{#if loadingMore}<Loader2
											class="h-4 w-4 animate-spin motion-reduce:animate-none"
											aria-hidden="true"
										/>{/if}
									Show more ({(total - rows.length).toLocaleString()} left)
								</button>
							</div>
						{/if}
					{/if}
				</section>

				{#if wide}
					<aside class="min-w-0" aria-label="Selected entry">
						<div
							class="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-border bg-card lg:sticky lg:top-4"
						>
							{#if selected}
								{@render card(selected)}
							{:else}
								<p class="p-6 text-sm text-muted-foreground">
									Pick someone or something to see what you know, how it's
									connected, and where it came from.
								</p>
							{/if}
						</div>
					</aside>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if !wide}
	<Modal
		isOpen={Boolean(selected)}
		onClose={closeCard}
		variant="bottom-sheet"
		size="lg"
		showCloseButton={false}
		ariaLabel="Entry"
	>
		{#if selected}{@render card(selected)}{/if}
	</Modal>
{/if}

{#if pickedCount}
	<div
		class="fixed bottom-[calc(0.75rem+var(--app-bottom-dock,0px))] left-3 right-3 z-40 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-ink-strong sm:right-auto sm:w-[22rem] lg:bottom-4 lg:left-6"
		role="region"
		aria-label="Selected entries"
	>
		<p class="min-w-0 flex-1 truncate text-sm text-foreground" aria-live="polite">
			<span class="font-semibold">{pickedCount}</span> selected
			{#if pickedCount > maxBatch}<span class="text-xs text-warning"
					>· up to {maxBatch} at a time</span
				>{/if}
		</p>
		<button
			type="button"
			class="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
			onclick={clearPicked}>Clear</button
		>
		<button
			type="button"
			class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
			disabled={pickedCount > maxBatch}
			onclick={enrichPicked}
		>
			<Sparkles class="h-4 w-4" aria-hidden="true" /> Enrich {pickedCount}
		</button>
	</div>
{/if}

<KnowledgeResearchTray queue={research} onOpenEntity={(id) => open(id)} />

{#if enrichEntries}
	<KnowledgeEnrichDialog
		entries={enrichEntries}
		allowance={research.allowance}
		onClose={() => (enrichEntries = null)}
		onStarted={onEnrichStarted}
	/>
{/if}

<KnowledgeImportDialog isOpen={importOpen} onClose={() => (importOpen = false)} {onImported} />

<Modal isOpen={addOpen} onClose={() => (addOpen = false)} title="Add to your knowledge" size="sm">
	<form class="flex flex-col gap-3 p-4 sm:p-5" onsubmit={addEntry}>
		<label class="flex flex-col gap-1 text-sm">
			<span class="font-medium text-foreground">What is it?</span>
			<select
				class="rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				bind:value={addKind}
			>
				{#each KIND_ORDER as k (k)}
					<option value={k}>{KIND_LABEL[k].one}</option>
				{/each}
			</select>
		</label>
		{#if addKind === 'video'}
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium text-foreground">YouTube links</span>
				<textarea
					class="min-h-28 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					bind:value={addVideos}
					placeholder="Paste one or more links, one per line"
				></textarea>
				<span class="text-xs text-muted-foreground">
					{videoLinks.length
						? `${videoLinks.length} link${videoLinks.length === 1 ? '' : 's'} · titles and channels fill in from YouTube`
						: 'Up to 50 at a time. Titles and channels fill in from YouTube.'}
				</span>
			</label>
		{:else}
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium text-foreground">Name</span>
				<input
					class="rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					bind:value={addName}
					maxlength="300"
				/>
			</label>
		{/if}
		{#if addLinkPredicate && addKind !== 'video'}
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium text-foreground"
					>{addKind === 'person' || addKind === 'org' ? 'Website' : 'Link'}</span
				>
				<input
					type="url"
					class="rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					bind:value={addLink}
					placeholder="https://"
				/>
			</label>
		{/if}
		{#if addKind === 'person' || ownable}
			<label class="flex items-center gap-2 text-sm text-foreground">
				<input
					type="checkbox"
					bind:checked={addKnow}
					class="h-4 w-4 rounded border-border"
				/>
				{addKind === 'person' ? 'I know them' : 'This is mine'}
			</label>
		{/if}
		<div class="flex justify-end gap-2 pt-1">
			<button
				type="button"
				class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
				onclick={() => (addOpen = false)}>Cancel</button
			>
			<button
				type="submit"
				class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
				disabled={addSaving ||
					(addKind === 'video' ? !videoLinks.length : !addName.trim() && !addLink.trim())}
			>
				{addSaving ? 'Adding…' : 'Add'}
			</button>
		</div>
	</form>
</Modal>

<Modal
	isOpen={duplicatesOpen}
	onClose={() => (duplicatesOpen = false)}
	title="Possible duplicates"
	size="md"
>
	<div class="flex flex-col gap-2 p-4 sm:p-5">
		{#if !duplicates.length}
			<p class="text-sm text-muted-foreground">All sorted.</p>
		{/if}
		{#each duplicates as candidate (candidate.id)}
			<div class="flex flex-col gap-2 rounded-md border border-border p-3">
				<p class="text-sm text-foreground">
					<span class="font-medium">{candidate.a.name}</span
					>{#if candidate.a.summary}<span class="text-muted-foreground">
							· {candidate.a.summary}</span
						>{/if}
				</p>
				<p class="text-sm text-foreground">
					<span class="font-medium">{candidate.b.name}</span
					>{#if candidate.b.summary}<span class="text-muted-foreground">
							· {candidate.b.summary}</span
						>{/if}
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground pressable"
						onclick={() => void resolveDuplicate(candidate, true)}
						>{candidate.a.kind === 'person' ? 'Same person' : 'Same one'}</button
					>
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground pressable hover:bg-muted"
						onclick={() => void resolveDuplicate(candidate, false)}
						>{candidate.a.kind === 'person' ? 'Different people' : 'Different'}</button
					>
				</div>
			</div>
		{/each}
	</div>
</Modal>

{#if chatOpen}
	{#await loadAgentChatModal() then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={chatOpen}
			onClose={() => (chatOpen = false)}
			initialDraft={chatDraft}
		/>
	{/await}
{/if}
