// packages/shared-agent-ops/src/knowledge/similar-orgs.ts
//
// "Might be the same company": organizations in the graph that may be one company under two
// names. Tasks say "Murtech", a contract says "Murtech, Inc", LinkedIn says "Palantir
// Technologies" where the notes say "Palantir", and a pasted link leaves
// "laindustrialservices.com" next to "LA Industrial Services".
//
//   buildOrgIndex(orgs).similarTo(id)  → the few likeliest for one entry (Clean up, its card)
//   findSimilarOrgs(target, orgs)      → the same, for one lookup
//
// Like similar-people.ts, everything here compares the structured name field of two entries,
// word by word, never free text. A hit is only ever a "same company?" suggestion for the owner:
// a wrong pairing costs one skipped suggestion. Nothing is merged here.

import { domainOf, foldOrgName } from './normalize';

export interface SimilarOrgInput {
	id: string;
	name: string;
}

export type SimilarOrgRule =
	/** Same name once case, "The" and punctuation are ignored ("Magnum-LPL" / "Magnum/LPL"). */
	| 'same_name'
	/** Same name plus a company ending ("Murtech" / "Murtech, Inc"). */
	| 'ending'
	/** One is the other's web address ("laindustrialservices.com" / "LA Industrial Services"). */
	| 'website'
	/** One is the other's opening words ("Palantir" / "Palantir Technologies"). */
	| 'longer_name'
	/** One is the other's initials ("TRNN" / "The Real News Network"). */
	| 'initials'
	/** One names the other inside a combined name ("Trase/Air/Genesis" / "Trase"). */
	| 'named_inside';

export interface SimilarOrgMatch {
	rule: SimilarOrgRule;
	/** Short, user-facing: "“Palantir” may be short for “Palantir Technologies”". */
	reason: string;
	score: number;
}

export interface SimilarOrg extends SimilarOrgMatch {
	id: string;
	name: string;
}

/**
 * Company endings that say nothing about which company it is. Compared against whole words of
 * the name field only.
 */
const ENDINGS = new Set([
	'inc',
	'incorporated',
	'llc',
	'ltd',
	'limited',
	'corp',
	'corporation',
	'co',
	'company',
	'lp',
	'llp',
	'plc',
	'pllc',
	'gmbh'
]);

/** A one-word name shorter than this is too common to lead a match on ("First", "Air"). */
const DISTINCT_WORD_CHARS = 6;

interface Prepared {
	id: string;
	name: string;
	fold: string | null;
	/** Words without accents or punctuation, no leading "the", no company ending. */
	words: string[];
	/** The words run together: "la industrial services" → "laindustrialservices". */
	joined: string;
	/** Every word run together, "the" included: "The Cadre" and "thecadre" both give "thecadre". */
	joinedAll: string;
	/** The site's first label when the name is a bare web address, else null. */
	siteLabel: string | null;
	/** Initials of a name with three or more words, with and without a leading "the". */
	initials: string[];
	/** Folded parts of a combined name ("A / B", "A & B"); empty for a plain name. */
	parts: string[];
}

function wordsOf(name: string): string[] {
	return name
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
}

function prepare(org: SimilarOrgInput): Prepared {
	const name = org.name.trim();
	const all = wordsOf(name);
	// A bare web address: one run with a dot and no spaces. domainOf parses the format.
	const site = !/\s/.test(name) && name.includes('.') ? domainOf(name) : null;
	const siteLabel = site ? (site.split('.')[0] ?? null) : null;
	const withoutThe = all[0] === 'the' && all.length > 1 ? all.slice(1) : all;
	let words = withoutThe;
	while (words.length > 1 && ENDINGS.has(words[words.length - 1]!)) words = words.slice(0, -1);
	const initials =
		!site && withoutThe.length >= 3
			? [...new Set([all, withoutThe].map((list) => list.map((w) => w[0]).join('')))]
			: [];
	const parts = site
		? []
		: name
				.split(/\s*[/&+]\s*/)
				.map((part) => foldOrgName(part))
				.filter((part): part is string => Boolean(part));
	return {
		id: org.id,
		name,
		fold: foldOrgName(name),
		words: site ? [] : words,
		joined: site ? '' : words.join(''),
		joinedAll: site ? '' : all.join(''),
		siteLabel,
		initials,
		parts: parts.length > 1 ? parts : []
	};
}

const quote = (name: string) => `“${name}”`;

function startsWith(longer: string[], shorter: string[]): boolean {
	return shorter.length < longer.length && shorter.every((word, i) => longer[i] === word);
}

function compare(a: Prepared, b: Prepared): SimilarOrgMatch | null {
	if (a.id === b.id) return null;
	if ((a.fold && a.fold === b.fold) || (a.joinedAll && a.joinedAll === b.joinedAll))
		return { rule: 'same_name', reason: 'Same name, written differently', score: 0.95 };

	if (a.joined && a.joined === b.joined)
		return {
			rule: 'ending',
			reason: `Same name, one with a company ending`,
			score: 0.9
		};

	for (const [site, other] of [
		[a, b],
		[b, a]
	] as const) {
		if (site.siteLabel && other.joined && site.siteLabel === other.joined)
			return {
				rule: 'website',
				reason: `${quote(site.name)} looks like the web address of ${quote(other.name)}`,
				score: 0.85
			};
	}

	if (a.words.length && b.words.length) {
		const [shorter, longer] = a.words.length < b.words.length ? [a, b] : [b, a];
		if (startsWith(longer.words, shorter.words)) {
			const distinct =
				shorter.words.length > 1 || shorter.words[0]!.length >= DISTINCT_WORD_CHARS;
			return {
				rule: 'longer_name',
				reason: `${quote(shorter.name)} may be short for ${quote(longer.name)}`,
				score: shorter.words.length > 1 ? 0.75 : distinct ? 0.6 : 0.4
			};
		}
	}

	for (const [short, long] of [
		[a, b],
		[b, a]
	] as const) {
		if (
			short.words.length === 1 &&
			short.joined.length >= 3 &&
			short.joined.length <= 6 &&
			long.initials.includes(short.joined)
		)
			return {
				rule: 'initials',
				reason: `${quote(short.name)} could be the initials of ${quote(long.name)}`,
				score: 0.6
			};
	}

	for (const [combined, single] of [
		[a, b],
		[b, a]
	] as const) {
		if (single.fold && !single.parts.length && combined.parts.includes(single.fold))
			return {
				rule: 'named_inside',
				reason: `${quote(combined.name)} names ${quote(single.name)}`,
				score: 0.5
			};
	}
	return null;
}

/** How two organization names relate, or null when they don't look alike. */
export function compareOrgNames(a: SimilarOrgInput, b: SimilarOrgInput): SimilarOrgMatch | null {
	return compare(prepare(a), prepare(b));
}

export interface OrgIndex {
	/** The likeliest look-alikes for one entry, best first. */
	similarTo(
		id: string,
		options?: { limit?: number; exclude?: ReadonlySet<string> }
	): SimilarOrg[];
}

/**
 * Index a user's organizations once, then ask per entry. Candidates come from shared keys (first
 * word, folded name, joined words, initials, combined-name parts), so the whole graph is never
 * compared pair by pair.
 */
export function buildOrgIndex(orgs: readonly SimilarOrgInput[]): OrgIndex {
	const prepared = new Map<string, Prepared>();
	const buckets = new Map<string, string[]>();
	const add = (key: string, id: string) => {
		const list = buckets.get(key);
		if (list) list.push(id);
		else buckets.set(key, [id]);
	};
	const keysOf = (p: Prepared): string[] => [
		...(p.fold ? [`fold:${p.fold}`] : []),
		...(p.joined ? [`joined:${p.joined}`] : []),
		...(p.joinedAll ? [`joined:${p.joinedAll}`] : []),
		...(p.siteLabel ? [`joined:${p.siteLabel}`] : []),
		...(p.words[0] ? [`first:${p.words[0]}`] : []),
		// A short one-word name and the names it could be the initials of meet here.
		...(p.words.length === 1 ? [`initials:${p.joined}`] : []),
		...p.initials.map((i) => `initials:${i}`),
		...p.parts.map((part) => `fold:${part}`)
	];
	for (const org of orgs) {
		const p = prepare(org);
		prepared.set(org.id, p);
		for (const key of new Set(keysOf(p))) add(key, org.id);
	}

	return {
		similarTo(id, options = {}) {
			const target = prepared.get(id);
			if (!target) return [];
			const seen = new Set<string>([id]);
			const out: SimilarOrg[] = [];
			for (const key of new Set(keysOf(target))) {
				for (const otherId of buckets.get(key) ?? []) {
					if (seen.has(otherId)) continue;
					seen.add(otherId);
					if (options.exclude?.has(otherId)) continue;
					const other = prepared.get(otherId)!;
					const match = compare(target, other);
					if (match) out.push({ id: other.id, name: other.name, ...match });
				}
			}
			out.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
			return out.slice(0, options.limit ?? 3);
		}
	};
}

/** The organizations that may be `target` under another name, best first. */
export function findSimilarOrgs(
	target: SimilarOrgInput,
	orgs: readonly SimilarOrgInput[],
	options: { limit?: number; exclude?: ReadonlySet<string> } = {}
): SimilarOrg[] {
	const all = orgs.some((org) => org.id === target.id) ? orgs : [target, ...orgs];
	return buildOrgIndex(all).similarTo(target.id, options);
}
