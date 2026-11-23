// packages/shared-agent-ops/src/knowledge/similar-people.ts
//
// "Might also be": people in the graph who may be the same person under another spelling. The
// same person shows up as "Matt Solo" in the phone, "Matt Solowynsky" on LinkedIn and in tasks,
// and "Matt" in a meeting note. Two uses:
//
//   findSimilarPeople(target, people)  → the few likeliest for one entry (its card)
//   findSimilarPairs(people)           → every strong pair in the graph (the duplicates sweep)
//
// Everything here compares the structured name field of two entries (word by word), never free
// text, and a hit is only ever a "same person?" question for the owner: a wrong pairing costs one
// tap on "Not them". Nothing is merged here.

import { canonicalFirstName, sameFirstName } from './import-near-matches';
import { personNameTokens } from './normalize';

export interface SimilarPersonInput {
	id: string;
	name: string;
	/** Organizations this person works at. */
	employerIds?: string[];
}

export type SimilarRule =
	| 'same_name'
	| 'spelling'
	| 'cut_short'
	| 'typo'
	| 'nickname'
	| 'company'
	| 'first_name_company'
	| 'first_name';

export interface SimilarMatch {
	rule: SimilarRule;
	/** Short, user-facing: "“Solo” could be short for “Solowynsky”". */
	reason: string;
	score: number;
}

export interface SimilarPerson extends SimilarMatch {
	id: string;
	name: string;
}

export interface SimilarPair extends SimilarMatch {
	a: string;
	b: string;
}

interface Prepared {
	id: string;
	name: string;
	tokens: string[];
	employers: Set<string>;
}

function prepare(person: SimilarPersonInput): Prepared {
	return {
		id: person.id,
		name: person.name,
		tokens: personNameTokens(person.name),
		employers: new Set(person.employerIds ?? [])
	};
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Edit distance with adjacent swaps, giving up past `max`. Short words only. */
export function nameDistance(a: string, b: string, max = 2): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				value = Math.min(value, prev2[j - 2]! + 1);
			row.push(value);
			best = Math.min(best, value);
		}
		if (best > max) return max + 1;
		prev2 = prev;
		prev = row;
	}
	return prev[b.length]!;
}

function shareEmployer(a: Prepared, b: Prepared): boolean {
	for (const id of a.employers) if (b.employers.has(id)) return true;
	return false;
}

/** Both have known employers and none in common: a weak name match isn't worth asking. */
function differentEmployers(a: Prepared, b: Prepared): boolean {
	return a.employers.size > 0 && b.employers.size > 0 && !shareEmployer(a, b);
}

function compare(a: Prepared, b: Prepared): SimilarMatch | null {
	if (!a.tokens.length || !b.tokens.length || a.id === b.id) return null;
	if (a.tokens.join(' ') === b.tokens.join(' '))
		return differentEmployers(a, b)
			? { rule: 'same_name', reason: 'Same name, different company', score: 0.5 }
			: { rule: 'same_name', reason: 'Same name', score: 0.85 };

	// Every word of the shorter name is in the longer one: a middle name, a nickname in the
	// middle ("Zach Work Saucier"), "Last, First", accents, letters after the name.
	const [small, large] = a.tokens.length <= b.tokens.length ? [a, b] : [b, a];
	if (small.tokens.length >= 2 && small.tokens.every((t) => large.tokens.includes(t)))
		return { rule: 'spelling', reason: 'Same name, written differently', score: 0.8 };

	if (a.tokens.length >= 2 && b.tokens.length >= 2) {
		const [firstA, firstB] = [a.tokens[0]!, b.tokens[0]!];
		const [lastA, lastB] = [a.tokens[a.tokens.length - 1]!, b.tokens[b.tokens.length - 1]!];
		const firstSame = firstA === firstB;
		const firstAlike = firstSame || sameFirstName(firstA, firstB);

		if (lastA === lastB) {
			if (firstAlike)
				return {
					rule: 'nickname',
					reason: `“${cap(firstA)}” and “${cap(firstB)}”, same last name`,
					score: 0.65
				};
			if (firstA[0] === firstB[0] && shareEmployer(a, b))
				return { rule: 'company', reason: 'Same last name and company', score: 0.6 };
			return null;
		}
		if (!firstAlike) return null;
		const score = firstSame ? 0.75 : 0.6;

		// "Matt Solo" / "Matt Solowynsky": a last name cut short in a phone contact.
		const [short, long] = lastA.length <= lastB.length ? [lastA, lastB] : [lastB, lastA];
		if (short.length >= 3 && long.startsWith(short))
			return {
				rule: 'cut_short',
				reason: `“${cap(short)}” could be short for “${cap(long)}”`,
				score
			};
		// "Solowinsky" / "Solowynsky".
		// Stricter when the first names only look alike ("Jack Hennessy" isn't "John Finnessy").
		const allowed = firstSame
			? short.length >= 7
				? 2
				: short.length >= 4
					? 1
					: 0
			: short.length >= 5
				? 1
				: 0;
		if (allowed && nameDistance(lastA, lastB, allowed) <= allowed)
			return {
				rule: 'typo',
				reason: `Last name spelled differently (${cap(lastA)} / ${cap(lastB)})`,
				score
			};
		return null;
	}

	// "Matt" and "Matt Solowynsky".
	const [one, full] = a.tokens.length === 1 ? [a, b] : [b, a];
	if (one.tokens.length !== 1 || full.tokens.length < 2) return null;
	if (full.tokens[0] !== one.tokens[0]) return null;
	if (shareEmployer(one, full))
		return { rule: 'first_name_company', reason: 'Same first name and company', score: 0.7 };
	if (differentEmployers(one, full)) return null;
	return { rule: 'first_name', reason: 'First name only: could be the same person', score: 0.4 };
}

/** Compare two people by name (and employer). Null when nothing suggests they are one. */
export function compareSimilarPeople(
	a: SimilarPersonInput,
	b: SimilarPersonInput
): SimilarMatch | null {
	return compare(prepare(a), prepare(b));
}

/**
 * The people most likely to be `target` under another spelling, strongest first. A first-name-
 * only guess counts only when it is the one such guess ("Matt" once, not "Matt" ×20).
 */
export function findSimilarPeople(
	target: SimilarPersonInput,
	people: SimilarPersonInput[],
	options: { limit?: number; exclude?: Set<string> } = {}
): SimilarPerson[] {
	const me = prepare(target);
	const found: SimilarPerson[] = [];
	for (const person of people) {
		if (person.id === target.id || options.exclude?.has(person.id)) continue;
		const match = compare(me, prepare(person));
		if (match) found.push({ id: person.id, name: person.name, ...match });
	}
	const guesses = found.filter((m) => m.rule === 'first_name');
	return found
		.filter((m) => m.rule !== 'first_name' || guesses.length === 1)
		.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
		.slice(0, options.limit ?? 5);
}

/** A bucket bigger than this is a very common word; comparing inside it is all noise. */
const MAX_BUCKET = 400;

/**
 * Every pair in the graph that looks like one person, at `minScore` or above (first-name-only
 * guesses sit below the default). Candidates come from shared name words and from first names
 * that start alike ("Matt"/"Matthew", "Bill"/"William"), so this never compares everyone with
 * everyone.
 */
export function findSimilarPairs(
	people: SimilarPersonInput[],
	options: { minScore?: number } = {}
): SimilarPair[] {
	const minScore = options.minScore ?? 0.6;
	const prepared = people.map(prepare).filter((p) => p.tokens.length);
	const buckets = new Map<string, Prepared[]>();
	const put = (key: string, person: Prepared) => {
		const list = buckets.get(key);
		if (list) list.push(person);
		else buckets.set(key, [person]);
	};
	for (const person of prepared) {
		for (const token of new Set(person.tokens)) put(`w:${token}`, person);
		const first = person.tokens[0]!;
		put(`f:${canonicalFirstName(first).slice(0, 3)}`, person);
	}
	const seen = new Set<string>();
	const out: SimilarPair[] = [];
	for (const list of buckets.values()) {
		if (list.length < 2 || list.length > MAX_BUCKET) continue;
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++) {
				const [x, y] =
					list[i]!.id < list[j]!.id ? [list[i]!, list[j]!] : [list[j]!, list[i]!];
				const key = `${x.id}|${y.id}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const match = compare(x, y);
				// The exact same name is the same-name review's job ("Craig" ×2).
				if (match && match.rule !== 'same_name' && match.score >= minScore)
					out.push({ a: x.id, b: y.id, ...match });
			}
	}
	return out.sort((p, q) => q.score - p.score);
}
