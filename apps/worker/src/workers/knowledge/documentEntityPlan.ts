// apps/worker/src/workers/knowledge/documentEntityPlan.ts
//
// Noise control and the knowledge write for people and organizations the local NER model found
// in one document (tasker 165). Pure: no model, no database.
//
// Kept: a person or organization the model is confident about (mean probability ≥ 0.85) that
// the document names at least twice, or names in its title or a heading.
// Dropped: the user's own name, their project names, entries they hid, one-word person names
// the user has no entry for yet ("John", "Louis": too vague to start a new person), and
// fragments under two letters.
// In link-only documents (AI research notes full of public figures and big companies) a name is
// kept only when the user's graph already has it, so research adds links, not new entries.
// A one-word person name that is the first or last word of exactly one fuller person name in the
// same document counts toward that person ("Coogan" → "John Coogan").
//
// Every string comparison here is on the model's own output (or on structured names from the
// database), never a word list deciding what text means.

import {
	type KnowledgeWriteBatch,
	normalizeKnowledgeName
} from '@buildos/shared-agent-ops/knowledge';
import type { NerSpan } from './documentNer';

export const DOCUMENT_ENTITY_MIN_SCORE = 0.85;
export const DOCUMENT_ENTITY_MIN_MENTIONS = 2;

export interface DocumentEntityContext {
	/** The user's name(s): full names, and the is_self entry's name. */
	selfNames: string[];
	/** Names of the user's projects. */
	projectNames: string[];
	/** Names of entries the user hid. */
	hiddenNames: string[];
	/** Normalized names of the user's existing private people (one-word names may reuse these). */
	knownPeople: Set<string>;
}

export interface DocumentEntityCandidate {
	kind: 'person' | 'org';
	name: string;
	mentions: number;
	inHeading: boolean;
	score: number;
	/** Words around the first mention. */
	quote: string;
}

export type DocumentEntityDropReason =
	| 'self'
	| 'project'
	| 'hidden'
	| 'low_confidence'
	| 'one_mention'
	| 'first_name_only'
	| 'not_in_graph';

export interface DocumentEntityPick {
	kept: DocumentEntityCandidate[];
	dropped: Array<{ kind: 'person' | 'org'; name: string; reason: DocumentEntityDropReason }>;
}

/** Trim edge punctuation and a possessive the model kept inside the span. */
export function tidyEntityName(text: string): string {
	return (
		text
			.replace(/\s+/g, ' ')
			.replace(/^[^\p{L}\p{N}]+/u, '')
			.replace(/['’]s$/u, '')
			.replace(/[^\p{L}\p{N}.)]+$/u, '')
			// A sentence's full stop, not an abbreviation's ("Inc.", "Jr.").
			.replace(/^(.*\p{L}{4,})\.$/u, '$1')
			.trim()
	);
}

function quoteAround(chunk: string, start: number, end: number): string {
	const from = Math.max(0, start - 80);
	const to = Math.min(chunk.length, end + 80);
	return `${from > 0 ? '…' : ''}${chunk.slice(from, to).replace(/\s+/g, ' ').trim()}${to < chunk.length ? '…' : ''}`;
}

export function pickDocumentEntities(
	spans: NerSpan[],
	chunks: string[],
	headings: string[],
	context: DocumentEntityContext,
	options: {
		minScore?: number;
		minMentions?: number;
		/**
		 * Link-only documents (AI research notes): keep only names already in the user's graph,
		 * as `${kind}|${normalized name}`, and never one-word person names.
		 */
		onlyExisting?: Set<string>;
	} = {}
): DocumentEntityPick {
	const minScore = options.minScore ?? DOCUMENT_ENTITY_MIN_SCORE;
	const minMentions = options.minMentions ?? DOCUMENT_ENTITY_MIN_MENTIONS;
	const dropped: DocumentEntityPick['dropped'] = [];

	type Group = {
		name: string;
		mentions: number;
		scores: { PER: number[]; ORG: number[] };
		first: NerSpan;
	};
	const groups = new Map<string, Group>();
	for (const span of spans) {
		if (span.type !== 'PER' && span.type !== 'ORG') continue;
		const name = tidyEntityName(span.text);
		if (name.replace(/[^\p{L}]/gu, '').length < 2 || name.length > 120) continue;
		const key = normalizeKnowledgeName(name);
		const group = groups.get(key) ?? {
			name,
			mentions: 0,
			scores: { PER: [], ORG: [] },
			first: span
		};
		group.mentions++;
		group.scores[span.type].push(span.score);
		groups.set(key, group);
	}

	// The type the model leaned to across all mentions; its mean probability is the score.
	const kindOf = (group: Group) => {
		const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
		const person = sum(group.scores.PER) >= sum(group.scores.ORG);
		const values = person ? group.scores.PER : group.scores.ORG;
		return {
			kind: (person ? 'person' : 'org') as 'person' | 'org',
			score: sum(values) / values.length
		};
	};

	// Fold "Coogan" / "John" into the only fuller person name it is part of.
	const fullPeople = [...groups.entries()].filter(
		([key, group]) => key.includes(' ') && kindOf(group).kind === 'person'
	);
	for (const [key, group] of [...groups]) {
		if (key.includes(' ') || kindOf(group).kind !== 'person') continue;
		const owners = fullPeople.filter(([full]) => {
			const words = full.split(' ');
			return words[0] === key || words[words.length - 1] === key;
		});
		if (owners.length === 1) {
			const owner = owners[0]![1];
			owner.mentions += group.mentions;
			owner.scores.PER.push(...group.scores.PER);
			groups.delete(key);
		}
	}

	const self = new Set<string>();
	for (const name of context.selfNames) {
		const key = normalizeKnowledgeName(name);
		if (!key) continue;
		self.add(key);
		for (const word of key.split(' ')) if (word.length > 1) self.add(word);
	}
	const projects = new Set(context.projectNames.map(normalizeKnowledgeName).filter(Boolean));
	const hidden = new Set(context.hiddenNames.map(normalizeKnowledgeName).filter(Boolean));
	const headingText = headings.map((h) => normalizeKnowledgeName(h));

	const kept: DocumentEntityCandidate[] = [];
	for (const [key, group] of groups) {
		const { kind, score } = kindOf(group);
		const name = group.name;
		const drop = (reason: DocumentEntityDropReason) => dropped.push({ kind, name, reason });
		if (self.has(key)) {
			drop('self');
			continue;
		}
		if (projects.has(key)) {
			drop('project');
			continue;
		}
		if (hidden.has(key)) {
			drop('hidden');
			continue;
		}
		if (score < minScore) {
			drop('low_confidence');
			continue;
		}
		if (
			kind === 'person' &&
			!key.includes(' ') &&
			(options.onlyExisting || !context.knownPeople.has(key))
		) {
			drop('first_name_only');
			continue;
		}
		if (options.onlyExisting && !options.onlyExisting.has(`${kind}|${key}`)) {
			drop('not_in_graph');
			continue;
		}
		const inHeading = headingText.some((heading) => containsWords(heading, key));
		if (group.mentions < minMentions && !inHeading) {
			drop('one_mention');
			continue;
		}
		const chunk = chunks[group.first.chunk] ?? '';
		kept.push({
			kind,
			name,
			mentions: group.mentions,
			inHeading,
			score,
			quote: quoteAround(chunk, group.first.start, group.first.end)
		});
	}
	kept.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
	return { kept, dropped };
}

/** `needle` appears in `haystack` on word boundaries (both already normalized). */
function containsWords(haystack: string, needle: string): boolean {
	let from = 0;
	for (;;) {
		const at = haystack.indexOf(needle, from);
		if (at < 0) return false;
		const before = at === 0 ? '' : haystack[at - 1]!;
		const after = haystack[at + needle.length] ?? '';
		const edge = (c: string) => !c || !/[\p{L}\p{N}]/u.test(c);
		if (edge(before) && edge(after)) return true;
		from = at + 1;
	}
}

/**
 * The knowledge write for one document: each kept name becomes (or reuses) a private entry
 * linked to the document with the words around its first mention. No source row: a document
 * mention backs no fact, and links are idempotent, so re-reading a document writes nothing new.
 */
export function planDocumentEntityKnowledge(
	doc: { id: string },
	kept: DocumentEntityCandidate[]
): KnowledgeWriteBatch {
	return {
		entities: kept.map((candidate, i) => ({
			ref: `d${i}`,
			kind: candidate.kind,
			name: candidate.name
		})),
		facts: [],
		links: kept.map((candidate, i) => ({
			entity: `d${i}`,
			record_kind: 'document' as const,
			record_id: doc.id,
			quote: candidate.quote.slice(0, 1000)
		}))
	};
}
