<!-- apps/web/src/routes/knowledge/+page.svelte -->
<!--
	Knowledge: the people you know, organizations, websites, channels and videos, all linked
	(tasker 160). Browse and search on the left; the card on the right drills from one entry to
	the next (org → people → person). On phones the card opens as a sheet. Chat is the main way
	in; "Ask in chat" hands an entry to it.

	What matters to you (tasker 169): the list opens on "Your world". Names that only come up in
	passing (a company in a research brief) sit under "Just mentioned", still found by search;
	the sorter's "not a name" picks sit under "Not names" until restored. Places are a filter on
	people and orgs, not list entries. The card's "Just a mention" / "Part of my world" is the
	user's answer, which the sorter then learns from.

	Merging by hand: tick two or more and press Merge N, or "Merge…" on a card; the duplicates
	review also offers same-name groups ("Craig" ×3) as one merge. KnowledgeMergeDialog shows
	what moves and which one is kept.

	Research at scale (tasker 164): filter and sort by researched / not researched, tick entries
	(shift-click for a range) and press Enrich N; the "What should we look for?" dialog starts
	the research and the bottom-right tray shows it running while you keep browsing. One poll
	(KnowledgeResearchQueue) feeds the tray, the dialog's allowance and every card.

	Sorting: on wide screens each column header (Name, Projects, Tasks, Docs) sorts the whole
	list, not just the rows loaded so far; press it again to reverse. The Sort menu holds the
	same sorts (phones have no headers) plus the date ones. The server orders the paged list;
	"Everything in <project>" is loaded whole, so the browser orders it (knowledge-sort.ts).

	PRIVACY: the search text stays in component state, never in the URL. Only the open entry's
	id (?e=) is in the URL so a chat card can link straight to it.
-->
<script lang="ts">
	import type { KnowledgeFocusRef } from '@buildos/shared-agent-ops/knowledge';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { loadAgentChatModal } from '$lib/components/agent/load-agent-chat-modal';
	import KnowledgeEntityCard from '$lib/components/knowledge/KnowledgeEntityCard.svelte';
	import KnowledgeConnections from '$lib/components/knowledge/KnowledgeConnections.svelte';
	import KnowledgeImportDialog from '$lib/components/knowledge/KnowledgeImportDialog.svelte';
	import KnowledgeEnrichDialog from '$lib/components/knowledge/KnowledgeEnrichDialog.svelte';
	import KnowledgeMergeDialog from '$lib/components/knowledge/KnowledgeMergeDialog.svelte';
	import KnowledgeReviewDetails from '$lib/components/knowledge/KnowledgeReviewDetails.svelte';
	import KnowledgeReviewWhy from '$lib/components/knowledge/KnowledgeReviewWhy.svelte';
	import KnowledgeResearchTray from '$lib/components/knowledge/KnowledgeResearchTray.svelte';
	import KnowledgeWherePills from '$lib/components/knowledge/KnowledgeWherePills.svelte';
	import KnowledgeWhereLine from '$lib/components/knowledge/KnowledgeWhereLine.svelte';
	import KnowledgeWhereProjectModal from '$lib/components/knowledge/KnowledgeWhereProjectModal.svelte';
	import {
		emptyWhere,
		isWhereEmpty,
		whereApi,
		type KnowledgeProjectEntries,
		type KnowledgeWhere,
		type KnowledgeWhereProject,
		type KnowledgeWhereRecord
	} from '$lib/components/knowledge/where-types';
	import { fly } from 'svelte/transition';
	import {
		knowledgeResearch,
		knowledgeResearchStarted,
		onKnowledgeResearchSettled,
		watchKnowledgeResearch
	} from '$lib/components/knowledge/research-session.svelte';
	import { wantResearchDock } from '$lib/components/knowledge/research-dock-flag.svelte';
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
		MERGE_MAX,
		knowledgeAddedLine,
		knowledgeApi,
		type ImportSummary,
		type KnowledgeEntitySummary,
		knowledgeSortDefaultDir,
		type KnowledgeKind,
		type KnowledgeListResult,
		type KnowledgeListSort,
		type KnowledgeReviewAbout,
		type KnowledgeReviewList,
		type KnowledgeSortDir
	} from '$lib/components/knowledge/knowledge-client';
	import {
		KNOWLEDGE_SORT_COLUMNS,
		KNOWLEDGE_SORT_MENU,
		knowledgeSortLabel,
		nextKnowledgeSort,
		sortKnowledgeRows
	} from '$lib/components/knowledge/knowledge-sort';
	import {
		ArrowDown,
		ArrowUp,
		ChevronDown,
		ChevronRight,
		ChevronsUpDown,
		GitMerge,
		Loader2,
		Plus,
		Search,
		Share2,
		Sparkles,
		Upload,
		X,
		ListFilter,
		Network
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Filter = 'all' | 'known' | 'owned';
	type View = 'world' | 'reference' | 'dropped';
	type Researched = 'any' | 'yes' | 'no';
	type Sort = KnowledgeListSort;
	type Row = KnowledgeEntitySummary & {
		updated_at: string;
		researched_at?: string | null;
		circle?: string | null;
	};

	// First paint only; the page reloads its own list after.
	// svelte-ignore state_referenced_locally
	const initial: KnowledgeListResult | null = data.initial;
	let rows = $state<Row[]>(initial?.entities ?? []);
	let total = $state(initial?.total ?? 0);
	let counts = $state<Partial<Record<KnowledgeKind, number>>>(initial?.counts ?? {});
	let knownCount = $state<number | null>(initial?.known_count ?? null);
	let view = $state<View>('world');
	let views = $state<{ world: number; reference: number; dropped: number } | null>(
		initial?.views ?? null
	);
	let place = $state<string | null>(null);
	/** The Connections tab (tasker 166): where your people cluster. Mounted on first open, then kept. */
	let connectionsOpen = $state(false);
	let connectionsSeen = $state(false);
	let places = $state<Array<{ id: string; name: string; count: number }>>(initial?.places ?? []);
	let filter = $state<Filter>('all');
	let kind = $state<KnowledgeKind | null>(null);
	let query = $state('');
	let researched = $state<Researched>('any');
	let sort = $state<Sort>('recent');
	let sortDir = $state<KnowledgeSortDir>('desc');
	let researchedCounts = $state<{ yes: number; no: number } | null>(initial?.researched ?? null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let stack = $state<string[]>([]);
	let importOpen = $state(false);
	let addOpen = $state(false);
	let duplicates = $state<KnowledgeReviewList['candidates']>([]);
	let duplicatesOpen = $state(false);
	/** Same kind + exact name, your own ("Craig" ×3): one merge each. */
	let twins = $state<KnowledgeReviewList['twins']>([]);
	/** What tells each entry in the review apart (job, LinkedIn, phone, where it's used), by id. */
	let reviewAbout = $state.raw<Record<string, KnowledgeReviewAbout>>({});
	/** Entries opened up in the review ("Details"), by `<card>:<entry id>`. */
	let reviewOpen = $state.raw<Set<string>>(new Set());
	/** Why the last merge on a review card didn't (fully) happen, by card key. */
	let reviewErrors = $state.raw<Record<string, string>>({});
	/** The merge dialog's starting entries, while it's open. */
	let mergeIds = $state<string[] | null>(null);
	/**
	 * Set while the merge dialog was opened from the duplicates review: which entry it starts
	 * out keeping, how to answer "they're different" there, and that the review comes back after.
	 */
	let mergeReview = $state.raw<{ keep: string | null; different: () => Promise<void> } | null>(
		null
	);
	/** The review card with a merge or an answer in flight. */
	let twinBusy = $state<string | null>(null);
	const twinKey = (group: { kind: string; name: string }) => `twin:${group.kind}:${group.name}`;
	// A "same person?" pair inside a same-name group is answered by that group.
	const twinOf = $derived(
		new Map(twins.flatMap((t) => t.ids.map((id) => [id, t.ids[0]!] as const)))
	);
	const pairQuestions = $derived(
		duplicates.filter(
			(d) =>
				d.origin === 'identity' ||
				!twinOf.has(d.a.id) ||
				twinOf.get(d.a.id) !== twinOf.get(d.b.id)
		)
	);
	const reviewCount = $derived(pairQuestions.length + twins.length);
	let chatOpen = $state(false);
	let chatDraft = $state('');
	let chatFocus = $state<KnowledgeFocusRef | null>(null);
	let chatAutoSend = $state(false);
	/** Bumped when a chat about an entry closes, so the open card reloads what it saved. */
	let cardVersion = $state(0);
	let innerWidth = $state(1280);

	// Where each entry shows up (projects, tasks, docs): one request per page of rows.
	let whereById = $state.raw<Map<string, KnowledgeWhere>>(new Map());
	const whereInFlight = new Set<string>();
	/** "Kyle Smith in Cadre": the project modal. */
	let whereFor = $state<{ entity: Row; project: KnowledgeWhereProject } | null>(null);
	/** A task or doc opened in place from a pill. */
	let openRecord = $state<KnowledgeWhereRecord | null>(null);
	/** Phones: the row whose "where" line is open. */
	let expandedWhere = $state<string | null>(null);
	/** "Everything in Cadre": the list narrowed to one project's entries. */
	let projectLens = $state<{ id: string; name: string } | null>(null);
	let lensData: KnowledgeProjectEntries | null = null;

	async function loadWhere(ids: string[]) {
		for (const id of ids) whereInFlight.add(id);
		try {
			for (let i = 0; i < ids.length; i += 100) {
				const found = await whereApi.forEntities(ids.slice(i, i + 100));
				whereById = new Map([...whereById, ...Object.entries(found)]);
			}
		} catch {
			// The columns are a nicety; the list still works without them.
		} finally {
			for (const id of ids) whereInFlight.delete(id);
		}
	}

	$effect(() => {
		const missing = rows
			.map((r) => r.id)
			.filter((id) => !whereById.has(id) && !whereInFlight.has(id));
		if (missing.length) void loadWhere(missing);
	});

	/** Something changed (a card edit, a renamed task): refetch where these entries show up. */
	function forgetWhere(match: (id: string, where: KnowledgeWhere) => boolean) {
		const next = new Map(whereById);
		for (const [id, where] of whereById) if (match(id, where)) next.delete(id);
		if (next.size !== whereById.size) whereById = next;
		lensData = null;
	}

	function openWhereRecord(record: KnowledgeWhereRecord) {
		if (!record.project_id) {
			toastService.info("That one isn't in a project you can open");
			return;
		}
		whereFor = null;
		openRecord = record;
	}

	function recordChanged() {
		const id = openRecord?.id;
		if (id)
			forgetWhere(
				(_, w) => w.tasks.some((t) => t.id === id) || w.documents.some((d) => d.id === id)
			);
	}

	function setProjectLens(project: { id: string; name: string }) {
		whereFor = null;
		projectLens = project;
		lensData = null;
		kind = null;
		query = '';
		researched = 'any';
		lastPickIndex = null;
		void refresh();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function clearProjectLens() {
		projectLens = null;
		lensData = null;
		void refresh();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		// The slide-over card closes on Escape unless a dialog above it took the key.
		if (event.key !== 'Escape' || event.defaultPrevented || !wide || !selected) return;
		if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
		closeCard();
	}

	const wide = $derived(innerWidth >= 1024);
	const selected = $derived(stack.at(-1) ?? null);
	const everythingCount = $derived(Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0));
	const viewTabs = $derived<Array<{ key: View; label: string }>>([
		{ key: 'world', label: 'Your world' },
		{ key: 'reference', label: 'Just mentioned' },
		// Only once the sorter has dropped something (or you're looking at it).
		...(views?.dropped || view === 'dropped'
			? [{ key: 'dropped' as const, label: 'Not names' }]
			: [])
	]);
	const graphSize = $derived(
		views ? views.world + views.reference + views.dropped : everythingCount
	);
	const isEmpty = $derived(
		!loading &&
			graphSize === 0 &&
			everythingCount === 0 &&
			!query &&
			filter === 'all' &&
			researched === 'any'
	);

	// Research: one queue for the tray, the dialog and the cards, shared with the rest of the app
	// (a task card can start research; the app-wide dock pings when it lands).
	const research = knowledgeResearch;
	$effect(() => {
		if (research.live) wantResearchDock();
	});
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
			if (projectLens) {
				const lens = projectLens;
				if (!lensData || lensData.project.id !== lens.id)
					lensData = await whereApi.inProject(lens.id);
				if (seq !== requestSeq) return;
				const data = lensData;
				whereById = new Map([...whereById, ...Object.entries(data.where)]);
				const all = data.entities as Row[];
				const nextCounts: Partial<Record<KnowledgeKind, number>> = {};
				for (const r of all) nextCounts[r.kind] = (nextCounts[r.kind] ?? 0) + 1;
				counts = nextCounts;
				// Names only (substring), like a find-in-list; the full search is server-side.
				const q = query.trim().toLowerCase();
				rows = sortKnowledgeRows(
					all.filter(
						(r) =>
							(!kind || r.kind === kind) &&
							(!q ||
								r.name.toLowerCase().includes(q) ||
								(r.summary ?? '').toLowerCase().includes(q)) &&
							(researched === 'any' ||
								(researched === 'yes') === Boolean(r.researched_at))
					),
					{ key: sort, dir: sortDir },
					whereById
				);
				total = rows.length;
				return;
			}
			const result = await knowledgeApi.list({
				kind,
				filter,
				researched,
				sort,
				dir: sortDir,
				view,
				place,
				q: query.trim() || undefined,
				limit: 60,
				offset: options.append ? rows.length : 0
			});
			if (seq !== requestSeq) return;
			rows = options.append ? [...rows, ...result.entities] : result.entities;
			total = result.total;
			knownCount = result.known_count;
			if (result.views) views = result.views;
			if (result.places) places = result.places;
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
			const result = await knowledgeApi.mergeCandidates();
			duplicates = result.candidates;
			twins = result.twins ?? [];
			reviewAbout = result.about ?? {};
			// Details opened on cards that are gone don't need to stay open.
			const shown = new Set([
				...result.candidates.flatMap((c) => [`${c.id}:${c.a.id}`, `${c.id}:${c.b.id}`]),
				...(result.twins ?? []).flatMap((t) => t.ids.map((id) => `${twinKey(t)}:${id}`))
			]);
			reviewOpen = new Set([...reviewOpen].filter((key) => shown.has(key)));
		} catch {
			// the duplicates banner is a nicety
		}
	}

	/**
	 * Look through every person for look-alike names ("Matt Solo" / "Matt Solowynsky") and add
	 * the new pairs to the duplicates review. Free (no model). Runs by itself at most once a day
	 * per browser and after an import; "Look again" in the review runs it on demand.
	 */
	const SWEPT_KEY = 'knowledge:duplicates-swept-at';
	const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;
	let sweeping = $state(false);
	let sweepNote = $state<string | null>(null);
	async function sweepDuplicates(quiet = false) {
		if (sweeping) return;
		sweeping = true;
		try {
			const result = await knowledgeApi.sweepDuplicates();
			try {
				localStorage.setItem(SWEPT_KEY, String(Date.now()));
			} catch {
				// storage off: it just runs again next visit
			}
			if (result.added) await refreshDuplicates();
			if (!quiet)
				sweepNote = result.added
					? `Found ${result.added} more look-alike${result.added === 1 ? '' : 's'}.`
					: 'No new look-alikes.';
		} catch (error) {
			if (!quiet)
				sweepNote =
					error instanceof Error ? error.message : 'Could not look for duplicates';
		} finally {
			sweeping = false;
		}
	}
	function sweepIsDue(): boolean {
		try {
			const at = Number(localStorage.getItem(SWEPT_KEY) ?? 0);
			return !at || Date.now() - at > SWEEP_EVERY_MS;
		} catch {
			return true;
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
		dir?: KnowledgeSortDir;
		view?: View;
		place?: string | null;
	}) {
		if (
			next.view !== undefined ||
			next.place !== undefined ||
			(next.filter !== undefined && next.filter !== 'all')
		) {
			projectLens = null;
			lensData = null;
		}
		if (next.view !== undefined) {
			view = next.view;
			connectionsOpen = false;
		}
		if (next.place !== undefined) place = next.place;
		if (next.filter !== undefined) filter = next.filter;
		if (next.kind !== undefined) kind = next.kind;
		if (next.researched !== undefined) researched = next.researched;
		if (next.sort !== undefined) {
			// A different sort starts in its usual direction (names A–Z, the rest most first).
			if (next.sort !== sort) sortDir = knowledgeSortDefaultDir(next.sort);
			sort = next.sort;
		}
		if (next.dir !== undefined) sortDir = next.dir;
		lastPickIndex = null;
		void refresh();
	}

	/** A column header: sort by it, or reverse it when it already leads. */
	function sortBy(key: Sort) {
		const next = nextKnowledgeSort({ key: sort, dir: sortDir }, key);
		choose({ sort: next.key, dir: next.dir });
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

	function mergePicked() {
		mergeIds = [...picked.keys()];
	}

	function closeMerge() {
		mergeIds = null;
		// Opened from the duplicates review: go back to the list.
		if (mergeReview) {
			mergeReview = null;
			duplicatesOpen = true;
		}
	}

	function onMerged(result: {
		kept: string;
		merged: string[];
		failed?: Array<{ id: string; error: string }>;
	}) {
		// Some couldn't be merged: the dialog stays open and says why under each one.
		if (!result.failed?.length) closeMerge();
		if (!result.merged.length) return;
		const gone = new Set(result.merged);
		picked = new Map([...picked].filter(([id]) => !gone.has(id)));
		if (picked.size === 1) clearPicked();
		toastService.success(
			result.merged.length === 1 ? 'Merged' : `Merged ${result.merged.length + 1} into one`
		);
		// An open card on a merged entry now shows the one it became.
		if (stack.some((id) => gone.has(id))) {
			stack = [...new Set(stack.map((id) => (gone.has(id) ? result.kept : id)))];
			syncUrl(stack.at(-1) ?? null);
		}
		forgetWhere((id) => id === result.kept || gone.has(id));
		void refresh();
		void refreshDuplicates();
	}

	/** A merge on a review card went wrong: say why on the card, and in a toast in case it leaves. */
	function reviewFailed(key: string, error: unknown, fallback: string) {
		const message = error instanceof Error && error.message ? error.message : fallback;
		reviewErrors = { ...reviewErrors, [key]: message };
		toastService.error(message);
	}

	function clearReviewError(key: string) {
		if (!(key in reviewErrors)) return;
		const { [key]: _gone, ...rest } = reviewErrors;
		reviewErrors = rest;
	}

	function toggleReviewDetails(key: string) {
		const next = new Set(reviewOpen);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		reviewOpen = next;
	}

	/** One click on a same-name group: fold them into the suggested one. */
	async function mergeTwins(group: KnowledgeReviewList['twins'][number]) {
		const key = twinKey(group);
		twinBusy = key;
		clearReviewError(key);
		try {
			const preview = await knowledgeApi.mergePreview(group.ids);
			const keep = preview.entries.find((e) => e.id === preview.suggested_keep);
			if (!keep || preview.entries.length < 2) {
				void refreshDuplicates();
				throw new Error(
					`Only one "${group.name}" is left: the other was already merged or deleted, so there is nothing to merge.`
				);
			}
			const others = preview.entries.filter((e) => e.id !== keep.id);
			const rest = others.filter((e) => e.mergeable);
			const skipped = others
				.filter((e) => !e.mergeable)
				.map(
					(e) =>
						`"${e.name}" was left out: it is ${e.is_self ? 'you' : 'a shared entry'}, so it can only be the one you keep. Use Review to keep it instead.`
				);
			if (!rest.length) throw new Error(skipped.join(' '));
			const result = await knowledgeApi.mergeMany(
				keep.id,
				rest.map((e) => e.id)
			);
			onMerged({ kept: result.kept, merged: result.merged });
			const problems = [...result.failed.map((f) => f.error), ...skipped];
			if (problems.length) reviewFailed(key, new Error(problems.join(' ')), '');
		} catch (error) {
			reviewFailed(key, error, 'Could not merge those');
		} finally {
			twinBusy = null;
		}
	}

	async function differentTwins(group: KnowledgeReviewList['twins'][number]) {
		const key = twinKey(group);
		twinBusy = key;
		clearReviewError(key);
		try {
			await knowledgeApi.markDifferent(group.ids);
			void refreshDuplicates();
		} catch (error) {
			reviewFailed(key, error, 'Could not save that');
		} finally {
			twinBusy = null;
		}
	}

	/** "Review" on a review card: the merge dialog, where you pick what to keep and what to leave. */
	function reviewInDialog(ids: string[], keep: string | null, different: () => Promise<void>) {
		duplicatesOpen = false;
		mergeReview = { keep, different };
		mergeIds = ids;
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
		knowledgeResearchStarted();
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
		// ?kind= is only a way in ("All people" on a card); the chips own it after that.
		url.searchParams.delete('kind');
		replaceState(url, page.state);
	}

	let listEl = $state<HTMLElement | null>(null);

	/** The row a card's "All people" jumped to, briefly highlighted. */
	let flashId = $state<string | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	/** Pages to load looking for the row before pinning it at the top instead. */
	const MAX_REVEAL_PAGES = 3;

	/**
	 * "All people" from Kyle's card: show every entry of that kind, find Kyle's row (loading a
	 * couple more pages, else pinning his row at the top), center + highlight it, and open his
	 * card beside the list. On phones the card would open as a sheet over the list, so the row is
	 * only scrolled to and highlighted; a tap opens it.
	 */
	async function reveal(
		id: string,
		revealKind: KnowledgeKind,
		options: { arriving?: boolean } = {}
	) {
		const wideNow = window.innerWidth >= 1024;
		stack = wideNow ? [id] : [];
		query = '';
		filter = 'all';
		kind = revealKind;
		researched = 'any';
		view = 'world';
		place = null;
		projectLens = null;
		lensData = null;
		await refresh();
		syncUrl(wideNow ? id : null);
		for (
			let pages = 1;
			!rows.some((r) => r.id === id) && rows.length < total && pages < MAX_REVEAL_PAGES;
			pages++
		) {
			await refresh({ append: true });
		}
		if (!rows.some((r) => r.id === id)) {
			// Far down a long list (or newer than the list's sort): pin it at the top.
			try {
				const { entity } = await knowledgeApi.get(id);
				if (entity.kind === revealKind && entity.status === 'active') {
					rows = [{ ...entity, researched_at: entity.enriched_at }, ...rows];
				}
			} catch {
				return; // gone or not yours: the card shows why
			}
		}
		await tick();
		const row = document.getElementById(`knowledge-row-${id}`);
		if (!row) return;
		// Arriving from another page jumps straight there (a smooth scroll gets cut off by the
		// page settling in); moving within the page glides. ('instant', not 'auto': the app's
		// CSS makes 'auto' smooth.)
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const behavior: ScrollBehavior = reduce || options.arriving ? 'instant' : 'smooth';
		// The list scrolls with the page; the card slides over it on wide screens.
		row.scrollIntoView({ block: 'center', behavior });
		flashId = id;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flashId = null), 2400);
	}

	const isKind = (value: string | null): value is KnowledgeKind =>
		Boolean(value && (KIND_ORDER as readonly string[]).includes(value));

	// Arrivals: a fresh load, a "found new details" toast, a chat link, "All people" from a task
	// card. afterNavigate (not an effect on page.url) because replaceState never updates
	// page.url, so an effect would keep snapping the card back to the arrival entry.
	afterNavigate(({ to, type }) => {
		const url = to?.url;
		if (!url || !url.pathname.startsWith('/knowledge')) return;
		const fromUrl = url.searchParams.get('e');
		const id = fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl) ? fromUrl : null;
		if (!id) return;
		const kindFromUrl = url.searchParams.get('kind');
		if (isKind(kindFromUrl)) void reveal(id, kindFromUrl, { arriving: type !== 'goto' });
		else if (stack.at(-1) !== id) stack = [id];
	});

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

	/** A chat about this one entry: it opens with everything BuildOS holds on it loaded. */
	function askInChat(
		entity: { id: string; name: string; kind: KnowledgeKind },
		options: { message?: string } = {}
	) {
		chatFocus = { entity_id: entity.id, name: entity.name, kind: entity.kind };
		chatDraft = options.message ?? '';
		// A request that arrives ready (Find more → Research in chat) sends itself.
		chatAutoSend = Boolean(options.message);
		chatOpen = true;
	}

	/** The chat may have saved details or a new type: show them on the card and the list. */
	function closeChat() {
		chatOpen = false;
		if (!chatFocus) return;
		chatFocus = null;
		chatAutoSend = false;
		cardVersion += 1;
		forgetWhere(() => true);
		void refresh();
	}

	function onImported(summary: ImportSummary) {
		const n = (value?: number) => (value ?? 0).toLocaleString();
		toastService.success(
			`${n(summary.people_created)} new, ${n(summary.people_matched)} matched, ${n(summary.possible_duplicates)} to review`
		);
		clearTimeout(searchTimer);
		query = '';
		if (selected) closeCard();
		choose({
			filter: 'known',
			kind: null,
			view: 'world',
			place: null,
			researched: 'any',
			sort: summary.format === 'linkedin_csv' ? 'connected' : sort
		});
		// New people may be someone already here under another spelling.
		void refreshDuplicates().then(() => sweepDuplicates(true));
	}

	/** An import was taken back: the list, the open card and the duplicate questions are stale. */
	function onImportUndone() {
		if (selected) closeCard();
		forgetWhere(() => true);
		void refresh();
		void refreshDuplicates();
	}

	onMount(() => {
		void refreshDuplicates().then(() => {
			if (sweepIsDue()) void sweepDuplicates(true);
		});
		const stopListening = onKnowledgeResearchSettled(onResearchSettled);
		watchKnowledgeResearch();
		// The shared queue keeps polling only while research runs, so leaving the page while it
		// runs keeps the app-wide tray and its "found N new details" ping going.
		return () => {
			clearTimeout(searchTimer);
			clearTimeout(flashTimer);
			stopListening();
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

	/** The entry a "Same" answer keeps: the server says which, and the card marks it "Keep". */
	function keptOf(candidate: (typeof duplicates)[number]) {
		return candidate.keep_id === candidate.b.id ? candidate.b : candidate.a;
	}

	async function resolveDuplicate(candidate: (typeof duplicates)[number], same: boolean) {
		twinBusy = candidate.id;
		clearReviewError(candidate.id);
		try {
			if (same) {
				const keep = keptOf(candidate);
				const merge = keep.id === candidate.a.id ? candidate.b : candidate.a;
				await knowledgeApi.merge(keep.id, merge.id);
				toastService.success(`Merged into ${keep.name}`);
			} else {
				await knowledgeApi.rejectCandidate(candidate.id);
			}
			duplicates = duplicates.filter((d) => d.id !== candidate.id);
			if (same) {
				void refresh();
				void refreshDuplicates();
			}
		} catch (error) {
			reviewFailed(
				candidate.id,
				error,
				same ? 'Could not merge those' : 'Could not save that'
			);
			// A refused merge usually means the list is out of date (one was merged already).
			if (same) void refreshDuplicates();
		} finally {
			twinBusy = null;
		}
	}

	const WHERE_GROUPS = ['projects', 'tasks', 'documents'] as const;
	/** The wide-screen table: tick, name, projects, tasks, docs. */
	const tableCols =
		'lg:grid-cols-[2.75rem_minmax(15rem,1.4fr)_minmax(9rem,0.8fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]';
	const chip =
		'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
	const chipOn = 'border-accent bg-accent/10 font-medium text-foreground';
	const chipOff = 'border-border bg-card text-muted-foreground hover:text-foreground';
</script>

<svelte:head>
	<title>Knowledge · BuildOS</title>
</svelte:head>

<svelte:window bind:innerWidth onfocus={onWindowFocus} onkeydown={onWindowKeydown} />

{#snippet card(id: string)}
	<ErrorBoundary area="knowledge entry">
		{#key `${id}:${cardVersion}`}
			<KnowledgeEntityCard
				entityId={id}
				onOpen={(next) => open(next, { drill: true })}
				onBack={stack.length > 1 ? back : undefined}
				onClose={closeCard}
				onChanged={() => {
					forgetWhere((entryId) => entryId === id);
					void refresh();
				}}
				onAskChat={askInChat}
				research={research.byEntity.get(id) ?? null}
				onFindMore={(entity) => (enrichEntries = [entity])}
				onMerge={(entity) => (mergeIds = [entity.id, ...(entity.with ?? [])])}
				onBrowseKind={(entity) => void reveal(entity.id, entity.kind)}
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
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<div
						class="inline-flex w-fit rounded-md border border-border bg-card p-0.5"
						role="tablist"
						aria-label="What to show"
					>
						{#each viewTabs as tab (tab.key)}
							<button
								type="button"
								role="tab"
								aria-selected={!connectionsOpen && view === tab.key}
								class="inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-sm pressable {!connectionsOpen &&
								view === tab.key
									? 'bg-muted font-medium text-foreground'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => choose({ view: tab.key })}
							>
								{tab.label}
								{#if views}<span class="stamp text-xs text-muted-foreground"
										>{views[tab.key]}</span
									>{/if}
							</button>
						{/each}
						<button
							type="button"
							role="tab"
							aria-selected={connectionsOpen}
							class="inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-sm pressable {connectionsOpen
								? 'bg-muted font-medium text-foreground'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => {
								connectionsSeen = true;
								connectionsOpen = true;
							}}
						>
							<Network class="h-3.5 w-3.5" aria-hidden="true" />
							Connections
						</button>
					</div>
					<p class="text-xs text-muted-foreground">
						{connectionsOpen
							? 'Where your people work and live, and who overlaps.'
							: view === 'world'
								? 'People and organizations you deal with.'
								: view === 'reference'
									? 'Names that only come up in passing. Still found by search and chat.'
									: "Words the sorter decided aren't people or organizations."}
					</p>
				</div>
				{#if !connectionsOpen}
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
							class="-mx-4 flex min-w-0 flex-[1_1_14rem] gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
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
								{#if researchedCounts}<span
										class="stamp text-xs text-muted-foreground"
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
								{#if researchedCounts}<span
										class="stamp text-xs text-muted-foreground"
										>{researchedCounts.no}</span
									>{/if}
							</button>
						</div>
						{#if places.length}
							<label
								class="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"
							>
								Place
								<select
									class="min-h-8 max-w-44 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
									value={place ?? ''}
									onchange={(e) =>
										choose({ place: e.currentTarget.value || null })}
								>
									<option value="">Any place</option>
									{#each places as p (p.id)}
										<option value={p.id}>{p.name} ({p.count})</option>
									{/each}
								</select>
							</label>
						{/if}
						<label
							class="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"
						>
							Sort
							<select
								class="min-h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								value={sort}
								onchange={(e) => choose({ sort: e.currentTarget.value as Sort })}
							>
								{#each KNOWLEDGE_SORT_MENU as key (key)}
									<option value={key}
										>{knowledgeSortLabel(
											key,
											key === sort ? sortDir : undefined
										)}</option
									>
								{/each}
							</select>
						</label>
					</div>
					{#if projectLens}
						<div
							class="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-foreground"
							role="status"
						>
							<ListFilter class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
							<span class="min-w-0 flex-1 truncate">
								Everything in
								<a
									href="/projects/{projectLens.id}"
									class="font-medium underline-offset-2 hover:underline"
									>{projectLens.name}</a
								>
								<span class="stamp text-xs text-muted-foreground">{total}</span>
							</span>
							<button
								type="button"
								class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground pressable hover:bg-muted hover:text-foreground"
								onclick={clearProjectLens}
							>
								<X class="h-3.5 w-3.5" aria-hidden="true" /> Clear
							</button>
						</div>
					{/if}
					{#if reviewCount}
						<button
							type="button"
							class="inline-flex w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
							onclick={() => (duplicatesOpen = true)}
						>
							<GitMerge class="h-4 w-4" aria-hidden="true" />
							{reviewCount} possible duplicate{reviewCount === 1 ? '' : 's'} to review
						</button>
					{/if}
				{/if}
			</div>

			{#if connectionsSeen}
				<div class={{ hidden: !connectionsOpen }}>
					<ErrorBoundary area="connections">
						<KnowledgeConnections
							onOpen={(id) => open(id)}
							onResearch={(entries) => (enrichEntries = entries)}
						/>
					</ErrorBoundary>
				</div>
			{/if}

			<div class={{ hidden: connectionsOpen }}>
				<!-- Wide screens: a full-width table (name, projects, tasks, docs); the entry card
					slides over it from the right. -->
				<section
					bind:this={listEl}
					aria-label="Entries"
					aria-busy={loading}
					class="min-w-0"
				>
					{#if !rows.length && !loading}
						<p
							class="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
						>
							{query
								? `Nothing matches "${query}".`
								: view === 'reference'
									? 'Nothing here. Names that only come up in passing land here.'
									: view === 'dropped'
										? 'Nothing here.'
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
						<div
							class="overflow-hidden rounded-lg border border-border bg-card {loading
								? 'opacity-60'
								: ''}"
						>
							<div
								class="hidden border-b border-border text-xs font-medium text-muted-foreground lg:grid {tableCols}"
								role="group"
								aria-label="Sort by column"
							>
								<span></span>
								{#each KNOWLEDGE_SORT_COLUMNS as column (column.key)}
									{@const active = sort === column.key}
									<button
										type="button"
										class="group/sort flex min-w-0 items-center gap-1 py-2 pr-3 text-left pressable hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {column.key ===
										'name'
											? 'pl-1'
											: ''} {active ? 'text-foreground' : ''}"
										aria-pressed={active}
										title={active
											? `${knowledgeSortLabel(column.key, sortDir)}. Press to reverse.`
											: `Sort by ${column.label.toLowerCase()}`}
										onclick={() => sortBy(column.key)}
									>
										{column.label}
										{#if active}
											{@const Arrow = sortDir === 'asc' ? ArrowUp : ArrowDown}
											<Arrow
												class="h-3 w-3 shrink-0 text-accent"
												aria-hidden="true"
											/>
											<span class="sr-only"
												>, sorted: {knowledgeSortLabel(
													column.key,
													sortDir
												)}</span
											>
										{:else}
											<ChevronsUpDown
												class="h-3 w-3 shrink-0 opacity-40 group-hover/sort:opacity-100"
												aria-hidden="true"
											/>
										{/if}
									</button>
								{/each}
							</div>
							<ul class="divide-y divide-border">
								{#each rows as row, index (row.id)}
									{@const RowIcon = KIND_ICON[row.kind]}
									{@const rowResearch = research.byEntity.get(row.id)}
									{@const rowWhere = whereById.get(row.id)}
									<li
										id="knowledge-row-{row.id}"
										class="flex min-w-0 scroll-mt-24 flex-wrap items-stretch transition-colors duration-700 lg:grid lg:items-center {tableCols} {flashId ===
										row.id
											? 'bg-accent/15'
											: picked.has(row.id)
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
											class="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-1 pr-3 text-left pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {selected ===
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
											{#if view === 'world' && row.circle === 'public'}
												<span
													class="shrink-0 rounded border border-border px-1.5 text-xs text-muted-foreground"
													>Just mentioned</span
												>
											{/if}
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
										{#each WHERE_GROUPS as group (group)}
											<div class="hidden min-w-0 pr-3 lg:block">
												{#if rowWhere && rowWhere[group].length}
													{#if group === 'projects'}
														<KnowledgeWherePills
															group="projects"
															items={rowWhere.projects}
															label="Projects naming {row.name}"
															onPick={(project) =>
																(whereFor = {
																	entity: row,
																	project
																})}
														/>
													{:else}
														<KnowledgeWherePills
															{group}
															items={rowWhere[group]}
															label="{group === 'tasks'
																? 'Tasks'
																: 'Docs'} naming {row.name}"
															onPick={openWhereRecord}
														/>
													{/if}
												{:else if rowWhere}
													<span
														class="text-xs text-muted-foreground/50"
														aria-hidden="true">—</span
													>
												{/if}
											</div>
										{/each}
										{#if !wide && rowWhere && !isWhereEmpty(rowWhere)}
											<div class="-mt-2 w-full min-w-0 pb-1.5">
												<KnowledgeWhereLine
													where={rowWhere}
													expanded={expandedWhere === row.id}
													onToggle={() =>
														(expandedWhere =
															expandedWhere === row.id
																? null
																: row.id)}
													onProject={(project) =>
														(whereFor = { entity: row, project })}
													onRecord={openWhereRecord}
												/>
											</div>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
						{#if rows.length < total && !projectLens}
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
			</div>
		{/if}
	</div>
</div>

{#if wide && selected}
	<aside
		aria-label="Selected entry"
		class="fixed bottom-3 right-3 top-[4.5rem] z-40 flex w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong"
		transition:fly={{ x: 24, duration: 180 }}
	>
		<div class="min-h-0 flex-1 overflow-y-auto">{@render card(selected)}</div>
	</aside>
{/if}

{#if whereFor}
	<KnowledgeWhereProjectModal
		entityName={whereFor.entity.name}
		project={whereFor.project}
		where={whereById.get(whereFor.entity.id) ?? emptyWhere()}
		onClose={() => (whereFor = null)}
		onOpenRecord={openWhereRecord}
		onFilterProject={setProjectLens}
	/>
{/if}

{#if openRecord?.project_id}
	{@const record = openRecord}
	{@const recordProject = openRecord.project_id}
	{#if record.kind === 'task'}
		{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
			<TaskEditModal
				taskId={record.id}
				projectId={recordProject}
				onClose={() => (openRecord = null)}
				onUpdated={recordChanged}
				onDeleted={() => {
					recordChanged();
					openRecord = null;
				}}
			/>
		{/await}
	{:else}
		{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
			<DocumentModal
				isOpen={true}
				projectId={recordProject}
				documentId={record.id}
				onClose={() => (openRecord = null)}
				onSaved={recordChanged}
				onDeleted={() => {
					recordChanged();
					openRecord = null;
				}}
			/>
		{/await}
	{/if}
{/if}

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
		{#if pickedCount >= 2}
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground pressable hover:bg-muted disabled:opacity-60"
				disabled={pickedCount > MERGE_MAX + 1}
				title={pickedCount > MERGE_MAX + 1 ? `Up to ${MERGE_MAX + 1} at a time` : undefined}
				onclick={mergePicked}
			>
				<GitMerge class="h-4 w-4" aria-hidden="true" /> Merge {pickedCount}
			</button>
		{/if}
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

{#if mergeIds}
	<KnowledgeMergeDialog
		ids={mergeIds}
		initialKeep={mergeReview?.keep ?? null}
		onDifferent={mergeReview?.different}
		onClose={closeMerge}
		{onMerged}
	/>
{/if}

{#if enrichEntries}
	<KnowledgeEnrichDialog
		entries={enrichEntries}
		allowance={research.allowance}
		onClose={() => (enrichEntries = null)}
		onResearchInChat={(entry, message) => {
			enrichEntries = null;
			askInChat(entry, { message });
		}}
		onStarted={onEnrichStarted}
	/>
{/if}

<KnowledgeImportDialog
	isOpen={importOpen}
	onClose={() => (importOpen = false)}
	{onImported}
	onUndone={onImportUndone}
/>

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

<!--
	One entry in the duplicates review: enough to tell it from its look-alike at a glance, and
	"Details" for everything saved on it and where each detail came from.
-->
{#snippet reviewEntry(
	card: string,
	id: string,
	name: string | null,
	fallbackSummary: string | null,
	keep: boolean
)}
	{@const info = reviewAbout[id]}
	{@const summary = info?.summary ?? fallbackSummary}
	{@const openKey = `${card}:${id}`}
	{@const isOpen = reviewOpen.has(openKey)}
	<li class="min-w-0 rounded-md bg-muted/50 px-3 py-2">
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				{#if name}
					<p class="flex items-center gap-1.5 text-sm font-medium text-foreground">
						<span class="truncate">{name}</span>
						{#if keep}
							<span
								class="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
								>Keep</span
							>
						{/if}
					</p>
				{/if}
				{#if summary}
					<p class="line-clamp-2 text-sm text-foreground">{summary}</p>
				{/if}
				{#if info?.details.length}
					<p class="mt-0.5 break-words text-xs text-foreground">
						{info.details.join(' · ')}
					</p>
				{/if}
				{#if info}
					<p class="mt-0.5 text-xs text-muted-foreground">
						{!summary && !info.details.length && !info.links
							? 'No details yet · '
							: ''}{info.links
							? `On ${info.links} ${info.links === 1 ? 'task or doc' : 'tasks & docs'} · `
							: ''}{knowledgeAddedLine(info.created_at, info.created_via)}
					</p>
				{:else if !summary}
					<p class="text-xs text-muted-foreground">Nothing else recorded yet</p>
				{/if}
			</div>
			<button
				type="button"
				class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-expanded={isOpen}
				onclick={() => toggleReviewDetails(openKey)}
			>
				{#if isOpen}
					<ChevronDown class="h-3.5 w-3.5" aria-hidden="true" />
				{:else}
					<ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
				{/if}
				Details<span class="sr-only"> for {name ?? 'this entry'}</span>
			</button>
		</div>
		{#if isOpen}
			<KnowledgeReviewDetails {id} />
		{/if}
	</li>
{/snippet}

{#snippet reviewError(key: string)}
	{#if reviewErrors[key]}
		<p class="break-words text-sm text-destructive" role="alert">
			<span class="font-medium">Not merged.</span>
			{reviewErrors[key]}
		</p>
	{/if}
{/snippet}

<Modal
	isOpen={duplicatesOpen}
	onClose={() => {
		duplicatesOpen = false;
		reviewErrors = {};
	}}
	title="Possible duplicates"
	size="lg"
>
	<div class="flex flex-col gap-2 p-4 sm:p-5">
		<div class="flex flex-wrap items-start gap-x-3 gap-y-1">
			<p class="min-w-0 flex-1 text-sm text-muted-foreground">
				{#if !reviewCount}
					All sorted.
				{:else}
					Nothing merges until you say so. Open Details on any entry to see everything
					saved on it and where it came from.
				{/if}
			</p>
			<button
				type="button"
				class="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground pressable hover:bg-muted disabled:opacity-60"
				disabled={sweeping}
				title="Look through everyone for names that may be the same person (Matt Solo / Matt Solowynsky)"
				onclick={() => void sweepDuplicates()}
			>
				{#if sweeping}
					<Loader2
						class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/> Looking…
				{:else}
					<Search class="h-3.5 w-3.5" aria-hidden="true" /> Look again
				{/if}
			</button>
		</div>
		{#if sweepNote}
			<p class="text-xs text-muted-foreground" role="status">{sweepNote}</p>
		{/if}
		{#if twins.length}
			<h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Same name
			</h3>
			{#each twins as group (twinKey(group))}
				{@const key = twinKey(group)}
				{@const busy = twinBusy === key}
				<div class="flex flex-col gap-2 rounded-md border border-border p-3">
					<p class="text-sm text-foreground">
						<span class="font-medium">{group.name}</span>
						<span class="text-muted-foreground">· {group.ids.length} entries</span>
					</p>
					<ul class="flex flex-col gap-1.5" aria-label="Entries named {group.name}">
						{#each group.ids as id (id)}
							{@render reviewEntry(key, id, null, null, false)}
						{/each}
					</ul>
					<KnowledgeReviewWhy
						reason="{group.ids.length === 2
							? 'Both'
							: `All ${group.ids.length}`} are saved under exactly this name."
						evidence={group.evidence}
					/>
					{@render reviewError(key)}
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
							disabled={Boolean(twinBusy)}
							onclick={() => void mergeTwins(group)}
						>
							{#if busy}<Loader2
									class="h-4 w-4 animate-spin"
									aria-hidden="true"
								/>{/if}
							{group.ids.length === 2
								? 'Same one, merge'
								: `All the same, merge ${group.ids.length}`}
						</button>
						<button
							type="button"
							class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground pressable hover:bg-muted disabled:opacity-60"
							disabled={Boolean(twinBusy)}
							onclick={() =>
								reviewInDialog(group.ids, null, () => differentTwins(group))}
							>Review</button
						>
						<button
							type="button"
							class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground pressable hover:bg-muted disabled:opacity-60"
							disabled={Boolean(twinBusy)}
							onclick={() => void differentTwins(group)}
							>{group.kind === 'person' ? 'Different people' : 'Different'}</button
						>
					</div>
				</div>
			{/each}
			{#if pairQuestions.length}
				<h3 class="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Maybe the same
				</h3>
			{/if}
		{/if}
		{#each pairQuestions as candidate (candidate.id)}
			{@const keep = keptOf(candidate)}
			{@const busy = twinBusy === candidate.id}
			<div class="flex flex-col gap-2 rounded-md border border-border p-3">
				{#if candidate.question}
					<p class="text-sm font-medium text-foreground">{candidate.question}</p>
				{/if}
				<ul class="flex flex-col gap-1.5" aria-label="The two entries">
					{@render reviewEntry(
						candidate.id,
						candidate.a.id,
						candidate.a.name,
						candidate.a.summary,
						keep.id === candidate.a.id
					)}
					{@render reviewEntry(
						candidate.id,
						candidate.b.id,
						candidate.b.name,
						candidate.b.summary,
						keep.id === candidate.b.id
					)}
				</ul>
				<KnowledgeReviewWhy reason={candidate.reason} evidence={candidate.evidence} />
				{@render reviewError(candidate.id)}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
						disabled={Boolean(twinBusy)}
						onclick={() => void resolveDuplicate(candidate, true)}
					>
						{#if busy}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{/if}
						{candidate.a.kind === 'person' ? 'Same person, merge' : 'Same one, merge'}
					</button>
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground pressable hover:bg-muted disabled:opacity-60"
						disabled={Boolean(twinBusy)}
						onclick={() =>
							reviewInDialog([candidate.a.id, candidate.b.id], keep.id, () =>
								resolveDuplicate(candidate, false)
							)}>Review</button
					>
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground pressable hover:bg-muted disabled:opacity-60"
						disabled={Boolean(twinBusy)}
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
			onClose={closeChat}
			initialDraft={chatDraft}
			initialKnowledgeFocus={chatFocus}
			autoSendInitialDraft={chatAutoSend}
		/>
	{/await}
{/if}
