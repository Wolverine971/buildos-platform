// packages/shared-agent-ops/src/knowledge/import-near-matches.ts
//
// After a contact import: which brand-new people look like someone already in the graph under
// a slightly different name ("Mike Smith" in the phone, "Michael Smith" on LinkedIn). The
// importer only reuses an entry on an exact name or a shared email, phone or LinkedIn link, so
// without this the same person silently becomes two cards. Everything found here is only ever a
// "same person?" question for the owner. Nothing is merged.

import { normalizeKnowledgeName, personNameTokens } from './normalize';

export interface NearMatchPerson {
	id: string;
	name: string;
	/** Organizations this person works at. */
	employerIds?: string[];
}

export interface NearMatchContact {
	/** The caller's handle for this contact (its batch ref or new entity id). */
	key: string;
	name: string;
	givenName?: string;
	familyName?: string;
	employerId?: string;
}

export type NearMatchRule = 'spelling' | 'nickname' | 'company' | 'first_name';

export interface NearMatch {
	key: string;
	contactName: string;
	existingId: string;
	existingName: string;
	rule: NearMatchRule;
	/** Shown in the duplicates review. */
	reason: string;
	score: number;
}

const REASONS: Record<NearMatchRule, { reason: string; score: number }> = {
	spelling: { reason: 'Same name, written differently', score: 0.8 },
	nickname: { reason: 'Same last name, similar first name', score: 0.65 },
	company: { reason: 'Same last name, first initial and company', score: 0.6 },
	first_name: { reason: 'First name only: could be the same person', score: 0.4 }
};

/**
 * Short first names and the full names they usually stand for. This is a lookup on the
 * structured first-name field of a contact, not a reading of free text, and a hit only asks
 * the owner "same person?", so a wrong pairing costs one tap on "Different". Names where the
 * short form is the start of the long one (Jon/Jonathan, Chris/Christopher) need no entry.
 */
const SHORT_FIRST_NAMES: Record<string, string[]> = {
	abby: ['abigail'],
	andy: ['andrew'],
	becky: ['rebecca'],
	beth: ['elizabeth', 'bethany'],
	betty: ['elizabeth'],
	bill: ['william'],
	billy: ['william'],
	bob: ['robert'],
	bobby: ['robert'],
	cathy: ['catherine', 'katherine', 'kathleen'],
	charlie: ['charles'],
	chuck: ['charles'],
	dave: ['david'],
	dick: ['richard'],
	ed: ['edward', 'edwin'],
	hank: ['henry'],
	harry: ['henry', 'harold'],
	jack: ['john', 'jackson'],
	jake: ['jacob'],
	jerry: ['gerald', 'jerome'],
	jim: ['james'],
	jimmy: ['james'],
	joe: ['joseph'],
	joey: ['joseph'],
	johnny: ['john'],
	kate: ['katherine', 'catherine', 'kathleen'],
	kathy: ['katherine', 'catherine', 'kathleen'],
	katie: ['katherine', 'catherine', 'kathleen'],
	larry: ['lawrence'],
	liz: ['elizabeth'],
	lizzie: ['elizabeth'],
	maggie: ['margaret'],
	meg: ['margaret', 'megan'],
	mike: ['michael'],
	mikey: ['michael'],
	ned: ['edward'],
	nick: ['nicholas'],
	peggy: ['margaret'],
	pete: ['peter'],
	rick: ['richard'],
	ricky: ['richard'],
	rob: ['robert'],
	ron: ['ronald'],
	sandy: ['sandra', 'alexander'],
	steve: ['steven', 'stephen'],
	ted: ['edward', 'theodore'],
	teddy: ['edward', 'theodore'],
	tom: ['thomas'],
	tommy: ['thomas'],
	tony: ['anthony'],
	vicky: ['victoria'],
	will: ['william'],
	zach: ['zachary']
};

/** The full form a short first name usually stands for ("bill" → "william"), else itself. */
export function canonicalFirstName(first: string): string {
	return SHORT_FIRST_NAMES[first]?.[0] ?? first;
}

/** Two first names that can be one person's: "Matt"/"Matthew", "Bill"/"William". */
export function sameFirstName(a: string, b: string): boolean {
	if (a === b) return false;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length >= 3 && long.startsWith(short)) return true;
	return Boolean(SHORT_FIRST_NAMES[a]?.includes(b) || SHORT_FIRST_NAMES[b]?.includes(a));
}

/**
 * Pair each new contact with the existing people it may be. `people` are entries that were
 * already in the graph before the import; `contacts` are the ones the import did not match.
 * At most two questions per contact, strongest first.
 */
export function findNearMatches(
	contacts: NearMatchContact[],
	people: NearMatchPerson[]
): NearMatch[] {
	const tokensOf = new Map<string, string[]>();
	const byToken = new Map<string, NearMatchPerson[]>();
	for (const person of people) {
		const tokens = personNameTokens(person.name);
		tokensOf.set(person.id, tokens);
		for (const token of new Set(tokens)) {
			byToken.set(token, [...(byToken.get(token) ?? []), person]);
		}
	}
	// How many contacts in this file are just that one word: "Chris" twice is not one person.
	const oneWordContacts = new Map<string, number>();
	const firstWordContacts = new Map<string, number>();
	for (const contact of contacts) {
		const tokens = personNameTokens(contact.name);
		if (!tokens.length) continue;
		firstWordContacts.set(tokens[0]!, (firstWordContacts.get(tokens[0]!) ?? 0) + 1);
		if (tokens.length === 1)
			oneWordContacts.set(tokens[0]!, (oneWordContacts.get(tokens[0]!) ?? 0) + 1);
	}

	const out: NearMatch[] = [];
	for (const contact of contacts) {
		const tokens = personNameTokens(contact.name);
		if (!tokens.length) continue;
		const given = personNameTokens(contact.givenName ?? '')[0] ?? tokens[0]!;
		const familyTokens = personNameTokens(contact.familyName ?? '');
		const family = familyTokens.length
			? familyTokens
			: tokens.length > 1
				? [tokens[tokens.length - 1]!]
				: [];
		const exact = normalizeKnowledgeName(contact.name);

		const found = new Map<string, NearMatch>();
		const add = (person: NearMatchPerson, rule: NearMatchRule) => {
			const prior = found.get(person.id);
			if (prior && prior.score >= REASONS[rule].score) return;
			found.set(person.id, {
				key: contact.key,
				contactName: contact.name,
				existingId: person.id,
				existingName: person.name,
				rule,
				...REASONS[rule]
			});
		};

		const candidates = new Set<NearMatchPerson>();
		for (const token of new Set([...tokens, ...family])) {
			for (const person of byToken.get(token) ?? []) candidates.add(person);
		}

		for (const person of candidates) {
			const theirs = tokensOf.get(person.id) ?? [];
			// The exact same name is the importer's own job (it reuses the entry or asks).
			if (normalizeKnowledgeName(person.name) === exact) continue;

			// Every word of the shorter name appears in the longer one: accents, punctuation,
			// a middle name, a maiden name in brackets, letters after the name.
			const [small, large] =
				tokens.length <= theirs.length ? [tokens, theirs] : [theirs, tokens];
			if (small.length >= 2 && small.every((token) => large.includes(token))) {
				add(person, 'spelling');
				continue;
			}

			if (family.length && family.every((token) => theirs.includes(token))) {
				const others = theirs.filter((token) => !family.includes(token));
				if (others.some((token) => sameFirstName(given, token))) {
					add(person, 'nickname');
					continue;
				}
				if (
					contact.employerId &&
					person.employerIds?.includes(contact.employerId) &&
					others.some((token) => token[0] === given[0])
				) {
					add(person, 'company');
					continue;
				}
			}
		}

		// "Louis" in the phone and exactly one "Louis Tran" already here (or the other way round).
		if (!found.size) {
			if (tokens.length === 1 && oneWordContacts.get(tokens[0]!) === 1) {
				const sameFirst = [...candidates].filter((person) => {
					const theirs = tokensOf.get(person.id) ?? [];
					return theirs.length > 1 && theirs[0] === tokens[0];
				});
				if (sameFirst.length === 1) add(sameFirst[0]!, 'first_name');
			} else if (tokens.length > 1) {
				const oneWord = [...candidates].filter((person) => {
					const theirs = tokensOf.get(person.id) ?? [];
					return theirs.length === 1 && theirs[0] === tokens[0];
				});
				if (oneWord.length === 1 && firstWordContacts.get(tokens[0]!) === 1)
					add(oneWord[0]!, 'first_name');
			}
		}

		out.push(...[...found.values()].sort((a, b) => b.score - a.score).slice(0, 2));
	}
	return out;
}
