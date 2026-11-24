// packages/shared-agent-ops/src/knowledge/company-lookup.ts
//
// "Where is this company?" answered from free sources, before any paid web search (tasker 170).
//
// A LinkedIn import gives a company as a bare name, and a name is never an identity: there are
// dozens of "Summit Consulting"s. So this module never answers from a name match alone. It
//   1. asks each free source for companies with exactly this name (companyNameKey),
//   2. folds what comes back into distinct companies (same website, or same town),
//   3. and says how sure it is:
//        placed       one company, and two independent sources agree on its website or town
//        unconfirmed  one company on a single source, or one far better known than the rest
//        ask          a few plausible companies: the user picks ("Which one?")
//        common       too many companies share the name to ask about
//        none         no source knows the name
//
// Sources: our own company directory (the People Data Labs free dataset, CC BY 4.0), Wikidata,
// the GLEIF legal-entity register, USAspending.gov, Clearbit's name-to-website autocomplete, and
// the address a company publishes on its own website. All free, none needs a key, and each
// receives a company name only: never a person, never anything else from the user's graph.
//
// No model and no language rules: every decision here compares structured values (name keys,
// domains, place keys, size bands).

import { collapseWhitespace, domainOf } from './normalize';
import { type CanonicalPlace, canonicalPlace, tidyPlaceWord } from './place-names';
import type { KnowledgeWriteBatch } from './types';

export const COMPANY_SOURCES = [
	'directory',
	'wikidata',
	'gleif',
	'usaspending',
	'clearbit',
	'website'
] as const;
export type CompanySource = (typeof COMPANY_SOURCES)[number];

/** How each source is named where the user sees where a detail came from. */
export const COMPANY_SOURCE_LABELS: Readonly<Record<CompanySource, string>> = {
	directory: 'People Data Labs company dataset (CC BY 4.0)',
	wikidata: 'Wikidata',
	gleif: 'GLEIF legal entity register',
	usaspending: 'USAspending.gov',
	clearbit: 'Clearbit company autocomplete',
	website: 'The company’s own website'
};

/** The page to cite for the directory, which has no page per company. */
export const COMPANY_DIRECTORY_URL = 'https://www.peopledatalabs.com/company-dataset';

/**
 * Brand-level sources describe a company the way people name it (one entry, with a website).
 * Registers list legal entities, and one company is often several of those in several
 * countries, so a register entry may support a company but never competes with one.
 */
const REGISTER_SOURCES: ReadonlySet<CompanySource> = new Set(['gleif', 'usaspending']);

export interface CompanyCandidate {
	source: CompanySource;
	/** The name as the source spells it. */
	name: string;
	/** Its website's domain ("boozallen.com"). */
	domain: string | null;
	place: CanonicalPlace | null;
	street?: string | null;
	industry?: string | null;
	/** A headcount band: "11-50", "10001+". */
	size?: string | null;
	founded?: number | null;
	/** Its LinkedIn company page. */
	linkedin?: string | null;
	description?: string | null;
	/** The record's own page at the source, cited with anything saved from it. */
	url: string | null;
}

// ---------------------------------------------------------------------------
// Names

/**
 * Legal-form words dropped from the end of a company name before comparing, so "Deloitte",
 * "Deloitte LLP" and "DELOITTE L.L.P." are one name. A name format, not language; dropping one
 * too many only widens the set of candidates, which the checks below then narrow.
 */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
	'inc',
	'incorporated',
	'llc',
	'llp',
	'lp',
	'ltd',
	'limited',
	'corp',
	'corporation',
	'co',
	'company',
	'plc',
	'pllc',
	'pc',
	'gmbh',
	'ag',
	'sa',
	'sas',
	'sarl',
	'bv',
	'nv',
	'ab',
	'oy',
	'pty',
	'pte',
	'srl',
	'spa'
]);

/**
 * The key two spellings of one company name share: lowercase, no accents or punctuation, "&"
 * as "and", no leading "The", no legal form at the end. Null for a name with nothing left.
 */
export function companyNameKey(name: string): string | null {
	const words = name
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/\./g, '')
		.replace(/&/g, ' and ')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	if (words[0] === 'the' && words.length > 1) words.shift();
	while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1]!)) words.pop();
	return words.join('') || null;
}

// ---------------------------------------------------------------------------
// Sources

export interface CompanyFetch {
	/** JSON from a public API. Null on any failure: the source is skipped, never fatal. */
	json: (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => Promise<unknown>;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? collapseWhitespace(value) : null;

/** A website as a source writes it → its domain. Platform pages are not a company's own site. */
export function companyDomain(value: string | null | undefined): string | null {
	const domain = value ? domainOf(value) : null;
	if (!domain) return null;
	const host = domain.replace(/^www\./, '');
	return SHARED_HOSTS.some((shared) => host === shared || host.endsWith(`.${shared}`))
		? null
		: host;
}

/** Hosts where many companies keep a page: never one company's identity. */
const SHARED_HOSTS = [
	'linkedin.com',
	'facebook.com',
	'instagram.com',
	'x.com',
	'twitter.com',
	'youtube.com',
	'tiktok.com',
	'linktr.ee',
	'google.com',
	'github.com',
	'medium.com',
	'substack.com',
	'yelp.com',
	'wikipedia.org',
	'crunchbase.com',
	'wixsite.com',
	'squarespace.com',
	'wordpress.com',
	'blogspot.com',
	'notion.site'
];

/** One row of the company directory table (the People Data Labs free dataset). */
export interface CompanyDirectoryRow {
	name: string;
	website: string | null;
	locality: string | null;
	region: string | null;
	country: string | null;
	industry: string | null;
	size: string | null;
	founded: number | null;
	linkedin_url: string | null;
}

export function directoryCandidates(rows: readonly CompanyDirectoryRow[]): CompanyCandidate[] {
	return rows.map((row) => ({
		source: 'directory' as const,
		name: tidyPlaceWord(row.name),
		domain: companyDomain(row.website),
		place: canonicalPlace({ city: row.locality, region: row.region, country: row.country }),
		industry: row.industry ? tidyPlaceWord(row.industry) : null,
		size: row.size,
		founded: row.founded,
		linkedin: row.linkedin_url
			? `https://www.${row.linkedin_url.replace(/^https?:\/\//, '').replace(/^www\./, '')}`
			: null,
		url: COMPANY_DIRECTORY_URL
	}));
}

/** Clearbit autocomplete: a name → the websites of companies with that name. No location. */
export async function clearbitCompanies(
	name: string,
	key: string,
	fetch: CompanyFetch
): Promise<CompanyCandidate[]> {
	const data = await fetch.json(
		`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`
	);
	const out: CompanyCandidate[] = [];
	for (const item of arr(data)) {
		const row = obj(item);
		const rowName = str(row.name);
		const domain = companyDomain(str(row.domain));
		if (!rowName || !domain || companyNameKey(rowName) !== key) continue;
		out.push({
			source: 'clearbit',
			name: rowName,
			domain,
			place: null,
			url: `https://${domain}`
		});
	}
	return out;
}

/** GLEIF: legal entities with this name, each with a headquarters address. */
export async function gleifCompanies(
	name: string,
	key: string,
	fetch: CompanyFetch
): Promise<CompanyCandidate[]> {
	const data = obj(
		await fetch.json(
			`https://api.gleif.org/api/v1/lei-records?filter%5Bfulltext%5D=${encodeURIComponent(name)}&page%5Bsize%5D=20`
		)
	);
	const all: Array<CompanyCandidate & { active: boolean }> = [];
	for (const record of arr(data.data)) {
		const attributes = obj(obj(record).attributes);
		const entity = obj(attributes.entity);
		const legal = str(obj(entity.legalName).name);
		const names = [legal, ...arr(entity.otherNames).map((n) => str(obj(n).name))].filter(
			(n): n is string => Boolean(n)
		);
		if (!legal || !names.some((n) => companyNameKey(n) === key)) continue;
		const hq = obj(entity.headquartersAddress);
		const country = str(hq.country);
		const place = canonicalPlace({ city: str(hq.city), region: str(hq.region), country });
		if (!place) continue;
		const lei = str(attributes.lei);
		all.push({
			source: 'gleif',
			name: tidyPlaceWord(legal),
			domain: null,
			place,
			street: arr(hq.addressLines).map(str).filter(Boolean).join(', ') || null,
			url: lei ? `https://search.gleif.org/#/record/${lei}` : null,
			active: str(entity.status) !== 'INACTIVE'
		});
	}
	// Dissolved entities are only used when nothing current carries the name.
	const current = all.some((c) => c.active) ? all.filter((c) => c.active) : all;
	return current.map(({ active: _active, ...candidate }) => candidate);
}

/** USAspending.gov: federal contractors and grant recipients, with a street address. */
export async function usaspendingCompanies(
	name: string,
	key: string,
	fetch: CompanyFetch
): Promise<CompanyCandidate[]> {
	const list = obj(
		await fetch.json('https://api.usaspending.gov/api/v2/recipient/', {
			method: 'POST',
			body: { keyword: name, limit: 15, order: 'desc', sort: 'amount' }
		})
	);
	// One company appears as parent ("P"), child ("C") and recipient ("R") rows: the first of
	// each distinct id is enough, parents first.
	const rows = arr(list.results)
		.map(obj)
		.filter((row) => companyNameKey(str(row.name) ?? '') === key && str(row.id));
	rows.sort((a, b) => Number(b.recipient_level === 'P') - Number(a.recipient_level === 'P'));
	const out: CompanyCandidate[] = [];
	const seen = new Set<string>();
	for (const row of rows.slice(0, 3)) {
		const id = str(row.id)!;
		const detail = obj(
			await fetch.json(
				`https://api.usaspending.gov/api/v2/recipient/${encodeURIComponent(id)}/`
			)
		);
		const location = obj(detail.location);
		const place = canonicalPlace({
			city: str(location.city_name),
			region: str(location.state_code),
			country: str(location.country_code) ?? str(location.country_name)
		});
		if (!place || seen.has(place.key)) continue;
		seen.add(place.key);
		out.push({
			source: 'usaspending',
			name: tidyPlaceWord(str(detail.name) ?? str(row.name)!),
			domain: null,
			place,
			street: str(location.address_line1)
				? tidyPlaceWord(str(location.address_line1)!)
				: null,
			url: `https://www.usaspending.gov/recipient/${id}/latest`
		});
	}
	return out;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
/** Wikidata property ids used below. */
const WD = {
	instanceOf: 'P31',
	country: 'P17',
	within: 'P131',
	headquarters: 'P159',
	industry: 'P452',
	inception: 'P571',
	website: 'P856',
	linkedin: 'P4264',
	endTime: 'P582'
} as const;
const WD_HUMAN = 'Q5';

type WikidataEntities = Record<string, Json>;

async function wikidataEntities(
	ids: readonly string[],
	fetch: CompanyFetch
): Promise<WikidataEntities> {
	const unique = [...new Set(ids)].slice(0, 45);
	if (!unique.length) return {};
	const data = obj(
		await fetch.json(
			`${WIKIDATA_API}?action=wbgetentities&ids=${unique.join('%7C')}&props=claims%7Clabels&languages=en&format=json`
		)
	);
	return obj(data.entities) as WikidataEntities;
}

/** The current values of a property: preferred statements, else every one that has not ended. */
function wikidataValues(entity: Json | undefined, property: string): unknown[] {
	const statements = arr(obj(entity?.claims)[property])
		.map(obj)
		.filter((s) => s.rank !== 'deprecated');
	const preferred = statements.filter((s) => s.rank === 'preferred');
	const current = statements.filter((s) => !arr(obj(s.qualifiers)[WD.endTime]).length);
	const chosen = preferred.length ? preferred : current.length ? current : statements;
	return chosen
		.map((s) => obj(obj(s.mainsnak).datavalue).value)
		.filter((value) => value !== undefined && value !== null);
}

const wikidataIds = (entity: Json | undefined, property: string): string[] =>
	wikidataValues(entity, property)
		.map((value) => str(obj(value).id))
		.filter((id): id is string => Boolean(id));

const wikidataLabel = (entity: Json | undefined): string | null =>
	str(obj(obj(entity?.labels).en).value);

/** Wikidata: notable companies, with headquarters, website and industry. */
export async function wikidataCompanies(
	name: string,
	key: string,
	fetch: CompanyFetch
): Promise<CompanyCandidate[]> {
	const search = obj(
		await fetch.json(
			`${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&type=item&limit=7&format=json`
		)
	);
	const hits = arr(search.search)
		.map(obj)
		.filter((hit) =>
			[str(hit.label), str(obj(hit.match).text)].some((n) => n && companyNameKey(n) === key)
		);
	if (!hits.length) return [];
	const entities = await wikidataEntities(
		hits.map((hit) => str(hit.id)).filter((id): id is string => Boolean(id)),
		fetch
	);

	// A company is something with a website or a headquarters that is not a person. The search
	// also returns albums, towns and people with the same name; they carry neither.
	const companies = hits.filter((hit) => {
		const entity = entities[str(hit.id) ?? ''];
		if (!entity || wikidataIds(entity, WD.instanceOf).includes(WD_HUMAN)) return false;
		return (
			wikidataValues(entity, WD.website).length > 0 ||
			wikidataIds(entity, WD.headquarters).length > 0
		);
	});
	if (!companies.length) return [];

	// Labels for the places and industries the companies point at.
	const linked = await wikidataEntities(
		companies.flatMap((hit) => {
			const entity = entities[str(hit.id)!];
			return [
				...wikidataIds(entity, WD.headquarters).slice(0, 1),
				...wikidataIds(entity, WD.industry).slice(0, 1),
				...wikidataIds(entity, WD.country).slice(0, 1)
			];
		}),
		fetch
	);
	const cache: WikidataEntities = { ...linked };
	const load = async (ids: string[]): Promise<void> => {
		const missing = ids.filter((id) => !cache[id]);
		if (missing.length) Object.assign(cache, await wikidataEntities(missing, fetch));
	};
	// A headquarters town names its country, and (two or three steps up) its state.
	await load(
		companies.flatMap((hit) => {
			const hq = cache[wikidataIds(entities[str(hit.id)!], WD.headquarters)[0] ?? ''];
			return [
				...wikidataIds(hq, WD.country).slice(0, 1),
				...wikidataIds(hq, WD.within).slice(0, 1)
			];
		})
	);

	const out: CompanyCandidate[] = [];
	for (const hit of companies) {
		const id = str(hit.id)!;
		const entity = entities[id];
		const hqId = wikidataIds(entity, WD.headquarters)[0];
		const hq = hqId ? cache[hqId] : undefined;
		const countryId = wikidataIds(hq, WD.country)[0] ?? wikidataIds(entity, WD.country)[0];
		if (countryId) await load([countryId]);
		const country = countryId ? wikidataLabel(cache[countryId]) : null;
		const city = wikidataLabel(hq);
		let place = canonicalPlace({ city, country });
		// In countries where the state is part of a town's name, walk up to find it.
		if (hq && place && (place.countryCode === 'US' || place.countryCode === 'CA')) {
			let parentId = wikidataIds(hq, WD.within)[0];
			for (let hop = 0; hop < 3 && parentId; hop++) {
				await load([parentId]);
				const parent = cache[parentId];
				const withState = canonicalPlace({
					city,
					region: wikidataLabel(parent),
					country: place.countryCode
				});
				if (withState?.regionName && withState.region !== withState.regionName) {
					place = withState; // the label was a state: region is now its code
					break;
				}
				parentId = wikidataIds(parent, WD.within)[0];
			}
			// A US or Canadian town with no state found is not placed: the name alone is not a place.
			if (place.region === null) place = canonicalPlace({ country: place.countryCode });
		}
		const website = wikidataValues(entity, WD.website).map((v) => str(v))[0] ?? null;
		const industryId = wikidataIds(entity, WD.industry)[0];
		const inception = str(obj(wikidataValues(entity, WD.inception)[0]).time);
		const year = inception ? Number(inception.slice(1, 5)) : NaN;
		const linkedinId = wikidataValues(entity, WD.linkedin).map((v) => str(v))[0];
		out.push({
			source: 'wikidata',
			name: str(hit.label) ?? name,
			domain: companyDomain(website),
			place,
			industry: industryId ? wikidataLabel(cache[industryId]) : null,
			founded: Number.isFinite(year) && year > 0 ? year : null,
			linkedin: linkedinId ? `https://www.linkedin.com/company/${linkedinId}` : null,
			description: str(hit.description),
			url: `https://www.wikidata.org/wiki/${id}`
		});
	}
	return out;
}

/**
 * The address a company publishes about itself in its page's structured data (schema.org
 * JSON-LD "address" blocks). Reads markup the site wrote for machines; no text is interpreted.
 */
export function companyAddressFromHtml(html: string): {
	city: string | null;
	region: string | null;
	country: string | null;
	street: string | null;
} | null {
	const blocks = html.matchAll(
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
	);
	const found: Json[] = [];
	const walk = (node: unknown, depth: number): void => {
		if (depth > 6 || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) walk(item, depth + 1);
			return;
		}
		const record = node as Json;
		for (const address of arr(
			Array.isArray(record.address) ? record.address : [record.address]
		)) {
			const a = obj(address);
			if (str(a.addressLocality)) found.push(a);
		}
		for (const value of Object.values(record)) walk(value, depth + 1);
	};
	for (const block of blocks) {
		try {
			walk(JSON.parse(block[1]!.trim()), 0);
		} catch {
			// malformed markup on their page: ignore the block
		}
	}
	const address = found[0];
	if (!address) return null;
	const country = address.addressCountry;
	return {
		city: str(address.addressLocality),
		region: str(address.addressRegion),
		country: str(country) ?? str(obj(country).name),
		street: str(address.streetAddress)
	};
}

/** A candidate from the address on a company's own website (its domain already known). */
export function websiteCandidate(
	name: string,
	domain: string,
	html: string
): CompanyCandidate | null {
	const address = companyAddressFromHtml(html);
	if (!address) return null;
	const place = canonicalPlace(address);
	if (!place || place.level !== 'city') return null;
	return {
		source: 'website',
		name,
		domain,
		place,
		street: address.street,
		url: `https://${domain}`
	};
}

// ---------------------------------------------------------------------------
// Folding candidates into distinct companies

export interface CompanyOptionSource {
	source: CompanySource;
	label: string;
	url: string | null;
}

export interface CompanyOption {
	/** Identifies this option within one lookup (its website, else its town). */
	key: string;
	name: string;
	domain: string | null;
	place: CanonicalPlace | null;
	street: string | null;
	industry: string | null;
	size: string | null;
	founded: number | null;
	linkedin: string | null;
	description: string | null;
	sources: CompanyOptionSource[];
	/** Two independent sources agree on its website or its town. */
	agreed: boolean;
}

const SIZE_BANDS = [
	'1-10',
	'11-50',
	'51-200',
	'201-500',
	'501-1000',
	'1001-5000',
	'5001-10000',
	'10001+'
];
/** A company with its own Wikidata entry is treated as at least this well known. */
const NOTABLE_RANK = 6;

/** A headcount band as a number: 1 for "1-10" up to 8 for "10001+", 0 when unknown. */
export function companySizeRank(size: string | null | undefined): number {
	const index = size ? SIZE_BANDS.indexOf(size.replace(/\s/g, '')) : -1;
	return index + 1;
}

/** How well known an option is: its headcount band, or a floor for having a Wikidata entry. */
function prominence(option: CompanyOption): number {
	const notable = option.sources.some((s) => s.source === 'wikidata') ? NOTABLE_RANK : 0;
	return Math.max(companySizeRank(option.size), notable);
}

/** Which source's value is shown when several disagree on a detail of the same company. */
const SOURCE_ORDER: readonly CompanySource[] = [
	'wikidata',
	'directory',
	'website',
	'gleif',
	'usaspending',
	'clearbit'
];
const bySource = (a: CompanyCandidate, b: CompanyCandidate) =>
	SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);

const townKey = (candidate: CompanyCandidate): string | null =>
	candidate.place?.level === 'city' ? candidate.place.key : null;

/** "us:va" for a place in a country whose states are written as codes; null elsewhere. */
function stateKey(place: CanonicalPlace | null): string | null {
	if (!place?.region || !place.regionName || place.region === place.regionName) return null;
	return `${place.countryCode}:${place.region}`.toLowerCase();
}

function buildOption(members: CompanyCandidate[]): CompanyOption {
	const ordered = [...members].sort(bySource);
	const first = <T>(pick: (c: CompanyCandidate) => T | null | undefined): T | null => {
		for (const candidate of ordered) {
			const value = pick(candidate);
			if (value !== null && value !== undefined && value !== '') return value;
		}
		return null;
	};
	// The town most sources name; the more trusted source breaks a tie.
	const votes = new Map<string, { place: CanonicalPlace; sources: Set<CompanySource> }>();
	for (const candidate of ordered) {
		if (!candidate.place) continue;
		const entry = votes.get(candidate.place.key) ?? {
			place: candidate.place,
			sources: new Set<CompanySource>()
		};
		entry.sources.add(candidate.source);
		votes.set(candidate.place.key, entry);
	}
	const ranked = [...votes.values()].sort(
		(a, b) =>
			Number(b.place.level === 'city') - Number(a.place.level === 'city') ||
			b.sources.size - a.sources.size
	);
	const place = ranked[0]?.place ?? null;
	const domain = first((c) => c.domain);

	// Agreement needs two sources that found the same thing on their own. The website's address
	// was fetched from a domain another source gave, so it is that source's word again, not a
	// second opinion: it adds a town, it never confirms one.
	const independent = (sources: Iterable<CompanySource>) =>
		new Set([...sources].filter((source) => source !== 'website')).size;
	// A register's address is often a town over from the one a company gives as its home
	// (McLean and Tysons): sharing the state is agreement enough between a register and the
	// one company known by this name.
	const states = new Map<string, CompanySource[]>();
	for (const candidate of members) {
		const state = stateKey(candidate.place);
		if (state) states.set(state, [...(states.get(state) ?? []), candidate.source]);
	}
	const agreed =
		independent(members.filter((c) => c.domain && c.domain === domain).map((c) => c.source)) >=
			2 ||
		independent(ranked[0]?.sources ?? []) >= 2 ||
		[...states.values()].some((sources) => independent(sources) >= 2);

	const sources: CompanyOptionSource[] = [];
	for (const candidate of ordered) {
		if (sources.some((s) => s.source === candidate.source)) continue;
		sources.push({
			source: candidate.source,
			label: COMPANY_SOURCE_LABELS[candidate.source],
			url: candidate.url
		});
	}
	return {
		key: domain ?? place?.key ?? `${ordered[0]!.source}:${ordered[0]!.url ?? ordered[0]!.name}`,
		name: first((c) => c.name) ?? '',
		domain,
		place,
		street: place ? first((c) => (c.place?.key === place.key ? c.street : null)) : null,
		industry: first((c) => c.industry),
		size: first((c) => c.size),
		founded: first((c) => c.founded),
		linkedin: first((c) => c.linkedin),
		description: first((c) => c.description),
		sources,
		agreed
	};
}

/**
 * Fold candidates into distinct companies. Two brand-level candidates are the same company
 * when they share a website, or share a town without naming different websites. A register
 * entry joins the company in its town; where no brand-level source knows the name, register
 * entries stand as companies of their own, one per town.
 */
export function mergeCompanyCandidates(candidates: readonly CompanyCandidate[]): CompanyOption[] {
	const brand = candidates.filter((c) => !REGISTER_SOURCES.has(c.source));
	const registers = candidates.filter((c) => REGISTER_SOURCES.has(c.source));

	const groups: CompanyCandidate[][] = [];
	const same = (a: CompanyCandidate, b: CompanyCandidate): boolean => {
		if (a.domain && b.domain) return a.domain === b.domain;
		const town = townKey(a);
		return Boolean(town && town === townKey(b));
	};
	for (const candidate of brand) {
		const joined = groups.filter((group) => group.some((member) => same(member, candidate)));
		if (!joined.length) {
			groups.push([candidate]);
			continue;
		}
		// The candidate links groups that were apart (one knew the website, one the town).
		const merged = joined.flat();
		merged.push(candidate);
		for (const group of joined) groups.splice(groups.indexOf(group), 1);
		groups.push(merged);
	}
	// Exactly two groups, one knowing only a website and one only a town: nothing says they
	// are different companies, so they are read as one (never as agreement between sources).
	if (groups.length === 2) {
		const [a, b] = groups as [CompanyCandidate[], CompanyCandidate[]];
		const hasDomain = (g: CompanyCandidate[]) => g.some((c) => c.domain);
		const hasPlace = (g: CompanyCandidate[]) => g.some((c) => c.place);
		if (
			(hasDomain(a) && !hasPlace(a) && hasPlace(b) && !hasDomain(b)) ||
			(hasDomain(b) && !hasPlace(b) && hasPlace(a) && !hasDomain(a))
		) {
			groups.splice(0, 2, [...a, ...b]);
		}
	}

	if (groups.length) {
		for (const entry of registers) {
			const town = townKey(entry);
			const home = groups.find((group) =>
				group.some((member) => town && townKey(member) === town)
			);
			const state = stateKey(entry.place);
			if (home) home.push(entry);
			// The only company known has no town yet: the register's address fills it in.
			else if (groups.length === 1 && !groups[0]!.some((member) => member.place))
				groups[0]!.push(entry);
			// The only company known is in the same state: the register is describing it.
			else if (
				groups.length === 1 &&
				state &&
				groups[0]!.some((member) => stateKey(member.place) === state)
			)
				groups[0]!.push(entry);
			// Otherwise it is another office or subsidiary of a company already listed, or a
			// different legal entity entirely: either way it is not a competing answer.
		}
	} else {
		for (const entry of registers) {
			const key = entry.place?.key;
			const home = groups.find((group) => group.some((member) => member.place?.key === key));
			if (home) home.push(entry);
			else groups.push([entry]);
		}
	}

	const options = groups.map(buildOption);
	// Two options can end up with one key (two towns for one unknown website): keep keys unique.
	const used = new Map<string, number>();
	for (const option of options) {
		const count = used.get(option.key) ?? 0;
		used.set(option.key, count + 1);
		if (count) option.key = `${option.key}#${count + 1}`;
	}
	return options.sort(
		(a, b) => prominence(b) - prominence(a) || b.sources.length - a.sources.length
	);
}

// ---------------------------------------------------------------------------
// The verdict

export const COMPANY_LOOKUP_OUTCOMES = ['placed', 'unconfirmed', 'ask', 'common', 'none'] as const;
export type CompanyLookupOutcome = (typeof COMPANY_LOOKUP_OUTCOMES)[number];

/** A "Which one?" question lists at most this many companies. */
export const MAX_COMPANY_QUESTION_OPTIONS = 4;
/** More distinct companies than this share the name: too common to ask about. */
export const MAX_COMPANY_OPTIONS_TO_ASK = 6;

export interface CompanyVerdict {
	outcome: CompanyLookupOutcome;
	/** The company taken as the answer (placed, unconfirmed). */
	chosen: CompanyOption | null;
	/** The companies to choose between (ask), best known first. */
	options: CompanyOption[];
	/** How many distinct companies carry the name across the sources. */
	total: number;
}

export function decideCompany(candidates: readonly CompanyCandidate[]): CompanyVerdict {
	const options = mergeCompanyCandidates(candidates);
	const total = options.length;
	if (!total) return { outcome: 'none', chosen: null, options: [], total: 0 };
	if (total === 1) {
		const only = options[0]!;
		// A website with no town is a lead for a later search, not an answer to "where".
		if (!only.place) return { outcome: 'none', chosen: only, options: [], total: 1 };
		return {
			outcome: only.agreed ? 'placed' : 'unconfirmed',
			chosen: only,
			options: [],
			total
		};
	}
	// One company far better known than every other with its name (Deloitte against three
	// two-person firms) is the one meant. With two sources agreeing on it, it is placed; on a
	// single source it is likely, not known, and stays unconfirmed.
	const [top, second] = options as [CompanyOption, CompanyOption];
	if (top.place && prominence(top) >= NOTABLE_RANK && prominence(top) - prominence(second) >= 2) {
		return { outcome: top.agreed ? 'placed' : 'unconfirmed', chosen: top, options: [], total };
	}
	const placed = options.filter((option) => option.place);
	if (!placed.length) return { outcome: 'none', chosen: null, options: [], total };
	if (total > MAX_COMPANY_OPTIONS_TO_ASK)
		return { outcome: 'common', chosen: null, options: [], total };
	return {
		outcome: 'ask',
		chosen: null,
		options: placed.slice(0, MAX_COMPANY_QUESTION_OPTIONS),
		total
	};
}

// ---------------------------------------------------------------------------
// Saving an answer

export interface CompanyFactsInput {
	/** The organization entry the details belong to. */
	entityId: string;
	option: CompanyOption;
	/**
	 * True: saved as known. False: saved as "unconfirmed" suggestions (they show on the card and
	 * count in the place filter, and one tap keeps or removes them).
	 */
	confirmed: boolean;
	/** Place entries the user already has, by canonical key, so no town is created twice. */
	existingPlaces?: ReadonlyMap<string, string>;
}

/**
 * The details an option carries, as a write batch on the user's own entry: where it is, its
 * website, and (once confirmed) its industry, founding year and LinkedIn page. Every detail
 * cites the source records it came from.
 */
export function companyFactsBatch(input: CompanyFactsInput): KnowledgeWriteBatch {
	const { entityId, option, confirmed } = input;
	const batch: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };
	const refs: string[] = [];
	option.sources.forEach((source, i) => {
		const ref = `lookup${i}`;
		refs.push(ref);
		batch.sources!.push({
			ref,
			type: 'web',
			...(source.url ? { url: source.url } : {}),
			title: source.label,
			meta: { company_lookup: source.source }
		});
	});
	const status = confirmed ? ('active' as const) : ('suggested' as const);
	const confidence = confirmed ? 0.9 : 0.5;
	const fact = (
		extra: Pick<
			KnowledgeWriteBatch['facts'][number],
			'predicate' | 'object' | 'value' | 'qualifiers'
		>
	) => batch.facts.push({ subject: entityId, status, confidence, sources: refs, ...extra });

	if (option.place) {
		const existing = input.existingPlaces?.get(option.place.key);
		batch.entities.push({
			ref: 'place',
			...(existing ? { id: existing } : {}),
			kind: 'place',
			name: option.place.name,
			keys: [{ type: 'external', value: option.place.key }]
		});
		fact({ predicate: 'located_in', object: 'place' });
	}
	if (option.domain) fact({ predicate: 'homepage', value: `https://${option.domain}` });
	if (confirmed) {
		if (option.street && option.place)
			fact({ predicate: 'address', value: `${option.street}, ${option.place.name}` });
		if (option.industry) fact({ predicate: 'industry', value: option.industry });
		if (option.founded) fact({ predicate: 'founded', value: String(option.founded) });
		if (option.linkedin)
			fact({
				predicate: 'profile_url',
				value: option.linkedin,
				qualifiers: { platform: 'LinkedIn' }
			});
	}
	return batch;
}

/** "Washington, DC · summitllc.com": the line under an option's name. */
export function companyOptionLine(option: Pick<CompanyOption, 'place' | 'domain'>): string {
	return [option.place?.name, option.domain].filter(Boolean).join(' · ');
}

/** "Management consulting · 51-200 people": what a company is, when no source describes it. */
export function companyOptionAbout(
	option: Pick<CompanyOption, 'description' | 'industry' | 'size'>
): string | null {
	if (option.description) return option.description;
	const parts = [option.industry, option.size ? `${option.size} people` : null].filter(Boolean);
	return parts.length ? parts.join(' · ') : null;
}
