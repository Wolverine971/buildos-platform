// apps/web/src/lib/components/workspace/find-search.svelte.ts
//
// One search session for the /projects pane and the ⌘K palette (tasker 159). Typing asks for
// word matches after a short pause (the stale request is cancelled); when the query is long
// or the word matches came back thin, it then asks for a best match, which adds on top when
// it lands and never holds the word matches back. A best match already fetched for a query
// is reused when the person types it again.
import {
	FIND_QUERY_MIN,
	normalizeFindQuery,
	shouldAskBestMatch,
	type BestMatchItem,
	type BestMatchResponse,
	type FindItem,
	type FindResponse
} from './find-model';

export type BestMatchState = {
	/** idle: not asked; waiting: asked, not back; ready: back (items may be empty);
	 * unavailable: the model was off or failed (the block stays hidden). */
	status: 'idle' | 'waiting' | 'ready' | 'unavailable';
	items: BestMatchItem[];
	ms: number;
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const IDLE: BestMatchState = { status: 'idle', items: [], ms: 0 };

export function createFindSearch(
	options: {
		fetcher?: Fetcher;
		/** Pause before asking for word matches. */
		debounceMs?: number;
		/** Extra pause before asking for a best match, so it waits for typing to settle. */
		bestDelayMs?: number;
		/** Off: word matches only. */
		bestMatch?: boolean;
	} = {}
) {
	const fetcher: Fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
	const debounceMs = options.debounceMs ?? 140;
	const bestDelayMs = options.bestDelayMs ?? 450;

	let query = $state('');
	let resultQuery = $state('');
	let items = $state.raw<FindItem[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let best = $state.raw<BestMatchState>(IDLE);

	let wordTimer: ReturnType<typeof setTimeout> | null = null;
	let bestTimer: ReturnType<typeof setTimeout> | null = null;
	let wordController: AbortController | null = null;
	let bestController: AbortController | null = null;
	let bestKey = '';
	const bestCache = new Map<string, BestMatchResponse>();

	function stopWords() {
		if (wordTimer) clearTimeout(wordTimer);
		wordTimer = null;
		wordController?.abort();
		wordController = null;
	}

	function stopBest() {
		if (bestTimer) clearTimeout(bestTimer);
		bestTimer = null;
		bestController?.abort();
		bestController = null;
	}

	function set(next: string) {
		query = next;
		const normalized = normalizeFindQuery(next);
		stopWords();
		if (normalized.length < FIND_QUERY_MIN) {
			stopBest();
			bestKey = '';
			items = [];
			resultQuery = '';
			loading = false;
			failed = false;
			best = IDLE;
			return;
		}
		if (normalized.toLocaleLowerCase() !== bestKey) {
			stopBest();
			bestKey = '';
			best = IDLE;
		}
		loading = true;
		wordTimer = setTimeout(() => void runWords(normalized), debounceMs);
	}

	async function runWords(normalized: string) {
		wordTimer = null;
		const controller = new AbortController();
		wordController = controller;
		let found: FindItem[] = [];
		try {
			const response = await fetcher(
				`/api/workspace/find?q=${encodeURIComponent(normalized)}`,
				{ signal: controller.signal }
			);
			const payload = (await response.json().catch(() => null)) as {
				data?: FindResponse;
			} | null;
			if (!response.ok || !payload?.data) throw new Error('Search failed');
			found = payload.data.items ?? [];
			if (controller.signal.aborted) return;
			items = found;
			resultQuery = normalized;
			failed = false;
		} catch {
			if (controller.signal.aborted) return;
			items = [];
			resultQuery = normalized;
			failed = true;
		} finally {
			if (wordController === controller) {
				wordController = null;
				loading = false;
			}
		}
		if (options.bestMatch !== false && shouldAskBestMatch(normalized, found.length))
			scheduleBest(normalized);
	}

	function scheduleBest(normalized: string) {
		const key = normalized.toLocaleLowerCase();
		if (key === bestKey && best.status !== 'idle') return;
		stopBest();
		bestKey = key;
		const cached = bestCache.get(key);
		if (cached) {
			best = toState(cached);
			return;
		}
		best = { status: 'waiting', items: [], ms: 0 };
		bestTimer = setTimeout(() => void runBest(normalized, key), bestDelayMs);
	}

	async function runBest(normalized: string, key: string) {
		bestTimer = null;
		const controller = new AbortController();
		bestController = controller;
		try {
			const response = await fetcher('/api/workspace/find/best', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: normalized }),
				signal: controller.signal
			});
			const payload = (await response.json().catch(() => null)) as {
				data?: BestMatchResponse;
			} | null;
			if (controller.signal.aborted || bestKey !== key) return;
			if (!response.ok || !payload?.data) {
				best = { status: 'unavailable', items: [], ms: 0 };
				return;
			}
			if (payload.data.status !== 'unavailable') bestCache.set(key, payload.data);
			best = toState(payload.data);
		} catch {
			if (controller.signal.aborted || bestKey !== key) return;
			best = { status: 'unavailable', items: [], ms: 0 };
		} finally {
			if (bestController === controller) bestController = null;
		}
	}

	function toState(response: BestMatchResponse): BestMatchState {
		return response.status === 'unavailable'
			? { status: 'unavailable', items: [], ms: response.ms }
			: { status: 'ready', items: response.items, ms: response.ms };
	}

	return {
		get query() {
			return query;
		},
		/** The query `items` answer (lags `query` while a request is in flight). */
		get resultQuery() {
			return resultQuery;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		get failed() {
			return failed;
		},
		get best() {
			return best;
		},
		/** A query long enough to search. */
		get active() {
			return normalizeFindQuery(query).length >= FIND_QUERY_MIN;
		},
		set,
		clear() {
			set('');
		},
		destroy() {
			stopWords();
			stopBest();
		}
	};
}

export type FindSearch = ReturnType<typeof createFindSearch>;
