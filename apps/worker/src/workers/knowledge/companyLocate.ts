// apps/worker/src/workers/knowledge/companyLocate.ts
//
// One organization's free lookup (tasker 170): ask the company directory and the free outside
// sources for companies with exactly this name, then let decideCompany say what is known.
// Nothing is saved here and nothing is paid for; the knowledge_locate worker saves the verdict.
//
// What leaves BuildOS: the organization's name, to Wikidata, GLEIF, USAspending and Clearbit,
// and one page request to a candidate's own website. Never a person's name, never the user's.
//
// Each outside source's answer is cached by name (company_lookup_cache), so a company is looked
// up once and the answer is reused for every user. A source that failed is not cached: an
// outage must not be remembered as "nobody has this name".

import {
	type CompanyCandidate,
	type CompanyDirectoryRow,
	type CompanyFetch,
	type CompanySource,
	type CompanyVerdict,
	type KnowledgeDataClient,
	clearbitCompanies,
	companyNameKey,
	decideCompany,
	directoryCandidates,
	gleifCompanies,
	usaspendingCompanies,
	websiteCandidate,
	wikidataCompanies
} from '@buildos/shared-agent-ops/knowledge';

/** Outside sources asked by name, and the function that asks each. */
const NAME_SOURCES: ReadonlyArray<{
	source: Exclude<CompanySource, 'directory' | 'website'>;
	ask: (name: string, key: string, fetch: CompanyFetch) => Promise<CompanyCandidate[]>;
}> = [
	{ source: 'clearbit', ask: clearbitCompanies },
	{ source: 'wikidata', ask: wikidataCompanies },
	{ source: 'gleif', ask: gleifCompanies },
	{ source: 'usaspending', ask: usaspendingCompanies }
];

/** Directory rows read for one name, largest companies first. */
export const DIRECTORY_ROWS_PER_NAME = 40;
/** An outside source's answer is trusted for this long before it is asked again. */
export const COMPANY_CACHE_DAYS = 90;
/** Names shorter than this ("X", "AB") match too much to look up. */
const MIN_NAME_KEY_CHARS = 3;

export interface CompanyLookupCache {
	get: (source: CompanySource, key: string) => Promise<CompanyCandidate[] | null>;
	set: (source: CompanySource, key: string, candidates: CompanyCandidate[]) => Promise<void>;
}

export interface CompanyLocateDeps {
	/** Rows of the company directory with this name key. */
	directory: (key: string) => Promise<CompanyDirectoryRow[]>;
	cache: CompanyLookupCache;
	/** JSON from one of the free APIs, paced per host. Throws when the request fails. */
	fetchJson: (
		url: string,
		init?: { method?: 'GET' | 'POST'; body?: unknown }
	) => Promise<unknown>;
	/** The home page of a candidate's own website (guarded public fetch). Null when unreadable. */
	fetchHtml: (url: string) => Promise<string | null>;
}

export type CompanySourceState = 'cached' | 'asked' | 'failed';

export interface CompanyLocateResult {
	verdict: CompanyVerdict;
	/** Where each source's answer came from this time, for the run's record and for tests. */
	sources: Partial<Record<CompanySource, CompanySourceState>>;
}

const NOTHING: CompanyVerdict = { outcome: 'none', chosen: null, options: [], total: 0 };

/**
 * Look one organization up. `ownDomain` is its website when the user's entry already has one:
 * that settles which company it is, so candidates naming another website are set aside.
 */
export async function locateCompany(
	name: string,
	ownDomain: string | null,
	deps: CompanyLocateDeps
): Promise<CompanyLocateResult> {
	const sources: CompanyLocateResult['sources'] = {};
	const key = companyNameKey(name);
	if (!key || key.length < MIN_NAME_KEY_CHARS) return { verdict: NOTHING, sources };

	const fromDirectory = deps
		.directory(key)
		.then((rows) => directoryCandidates(rows))
		.catch(() => [] as CompanyCandidate[]);

	const fromSources = NAME_SOURCES.map(async ({ source, ask }) => {
		const cached = await deps.cache.get(source, key).catch(() => null);
		if (cached) {
			sources[source] = 'cached';
			return cached;
		}
		let failed = false;
		const fetch: CompanyFetch = {
			json: async (url, init) => {
				try {
					return await deps.fetchJson(url, init);
				} catch {
					failed = true;
					return null;
				}
			}
		};
		const found = await ask(name, key, fetch).catch(() => {
			failed = true;
			return [] as CompanyCandidate[];
		});
		sources[source] = failed ? 'failed' : 'asked';
		if (!failed) await deps.cache.set(source, key, found).catch(() => undefined);
		return found;
	});

	let candidates = (await Promise.all([fromDirectory, ...fromSources])).flat();
	if (ownDomain) candidates = candidates.filter((c) => !c.domain || c.domain === ownDomain);

	let verdict = decideCompany(candidates);

	// One company, a website, and no town: its own home page may publish its address.
	const siteToRead =
		ownDomain ??
		(verdict.chosen && verdict.chosen.place?.level !== 'city' ? verdict.chosen.domain : null);
	const hasTown = candidates.some((c) => c.domain === siteToRead && c.place?.level === 'city');
	if (siteToRead && !hasTown) {
		const fromSite = await readWebsite(name, siteToRead, deps, sources);
		if (fromSite) {
			candidates = [...candidates, fromSite];
			verdict = decideCompany(candidates);
		}
	}

	// The entry's own website is the user's word on which company this is: a single source that
	// names that same website is confirmed by it.
	if (ownDomain && verdict.outcome === 'unconfirmed' && verdict.chosen?.domain === ownDomain) {
		verdict = { ...verdict, outcome: 'placed' };
	}
	return { verdict, sources };
}

async function readWebsite(
	name: string,
	domain: string,
	deps: CompanyLocateDeps,
	sources: CompanyLocateResult['sources']
): Promise<CompanyCandidate | null> {
	const cached = await deps.cache.get('website', domain).catch(() => null);
	if (cached) {
		sources.website = 'cached';
		return cached[0] ?? null;
	}
	const html = await deps.fetchHtml(`https://${domain}`).catch(() => null);
	if (html === null) {
		sources.website = 'failed';
		return null;
	}
	sources.website = 'asked';
	const candidate = websiteCandidate(name, domain, html);
	await deps.cache.set('website', domain, candidate ? [candidate] : []).catch(() => undefined);
	return candidate;
}

// ---------------------------------------------------------------------------
// The database side of the dependencies

/** The directory and the cache, read and written with the worker's service-role client. */
export function companyLookupStores(
	db: KnowledgeDataClient,
	now: () => Date = () => new Date()
): Pick<CompanyLocateDeps, 'directory' | 'cache'> {
	return {
		directory: async (key) => {
			const { data, error } = await db
				.from('company_directory')
				.select(
					'name, website, locality, region, country, industry, size, founded, linkedin_url'
				)
				.eq('name_key', key)
				.order('size_rank', { ascending: false })
				.limit(DIRECTORY_ROWS_PER_NAME);
			if (error) throw new Error(`Company directory: ${error.message}`);
			return (data ?? []) as CompanyDirectoryRow[];
		},
		cache: {
			get: async (source, key) => {
				const since = new Date(
					now().getTime() - COMPANY_CACHE_DAYS * 86_400_000
				).toISOString();
				const { data } = await db
					.from('company_lookup_cache')
					.select('candidates')
					.eq('source', source)
					.eq('name_key', key.slice(0, 200))
					.gt('fetched_at', since)
					.maybeSingle();
				const candidates = (data as { candidates?: unknown } | null)?.candidates;
				return Array.isArray(candidates) ? (candidates as CompanyCandidate[]) : null;
			},
			set: async (source, key, candidates) => {
				await db.from('company_lookup_cache').upsert(
					{
						source,
						name_key: key.slice(0, 200),
						candidates,
						fetched_at: now().toISOString()
					},
					{ onConflict: 'source,name_key' }
				);
			}
		}
	};
}

// ---------------------------------------------------------------------------
// Paced requests to the free APIs

/**
 * The shortest gap between two requests to one host. GLEIF allows 60 a minute; the others
 * publish no hard number, so these stay well inside what a polite client sends.
 */
export const COMPANY_API_MIN_INTERVAL_MS: Readonly<Record<string, number>> = {
	'api.gleif.org': 1_100,
	'www.wikidata.org': 200,
	'api.usaspending.gov': 250,
	'autocomplete.clearbit.com': 150
};
const DEFAULT_MIN_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 12_000;
/** Says who is asking, as these APIs request. No user detail. */
const USER_AGENT = 'BuildOS-CompanyLookup/1.0 (+https://build-os.com)';

export interface PacedFetchOptions {
	fetchFn?: typeof fetch;
	signal?: AbortSignal;
	minIntervalMs?: Readonly<Record<string, number>>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

/**
 * JSON from a fixed set of public APIs, one request at a time per host with a minimum gap, a
 * timeout, and one retry after a "slow down". Throws on anything else that is not a 2xx.
 */
export function createPacedJsonFetch(
	options: PacedFetchOptions = {}
): CompanyLocateDeps['fetchJson'] {
	const fetchFn = options.fetchFn ?? fetch;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const now = options.now ?? Date.now;
	const intervals = options.minIntervalMs ?? COMPANY_API_MIN_INTERVAL_MS;
	const lanes = new Map<string, Promise<void>>();
	const lastAt = new Map<string, number>();

	const send = async (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => {
		const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
		const response = await fetchFn(url, {
			method: init?.method ?? 'GET',
			headers: {
				accept: 'application/json',
				'user-agent': USER_AGENT,
				...(init?.body !== undefined ? { 'content-type': 'application/json' } : {})
			},
			...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
			signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
		});
		return response;
	};

	return (url, init) => {
		const host = new URL(url).hostname;
		const gap = intervals[host] ?? DEFAULT_MIN_INTERVAL_MS;
		const turn = (lanes.get(host) ?? Promise.resolve()).then(async () => {
			const last = lastAt.get(host);
			const wait = last === undefined ? 0 : last + gap - now();
			if (wait > 0) await sleep(wait);
			lastAt.set(host, now());
		});
		// The lane only orders the start of requests; a failed request must not block the next.
		lanes.set(
			host,
			turn.catch(() => undefined)
		);
		return turn.then(async () => {
			let response = await send(url, init);
			if (response.status === 429 || response.status === 503) {
				await sleep(5_000);
				lastAt.set(host, now());
				response = await send(url, init);
			}
			if (!response.ok) throw new Error(`${host} answered ${response.status}`);
			return (await response.json()) as unknown;
		});
	};
}
