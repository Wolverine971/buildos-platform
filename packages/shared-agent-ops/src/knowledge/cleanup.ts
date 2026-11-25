// packages/shared-agent-ops/src/knowledge/cleanup.ts
//
// Where an entry came from, and the Clean up queue's order (the /knowledge page).
//
// Sources answer "why is this in my list?": LinkedIn's export, the user's own BuildOS work
// (tasks, docs, chats), another contact import, web research, or typed in by hand. An entry can
// have more than one: a LinkedIn company that a task also names is both.
//
// The queue puts the entries most likely to be junk or a duplicate first, so the user clears
// the worst of a long list quickly. The score only ORDERS a list a person reviews: nothing is
// hidden, removed or merged by it.

import { domainOf, normalizeEmail } from './normalize';
import type { SimilarOrgRule } from './similar-orgs';

export type KnowledgeSource = 'linkedin' | 'work' | 'contacts' | 'research' | 'manual';

/** Display order: where most entries come from first. */
export const KNOWLEDGE_SOURCES: readonly KnowledgeSource[] = [
	'work',
	'linkedin',
	'contacts',
	'research',
	'manual'
];

export function isKnowledgeSource(value: unknown): value is KnowledgeSource {
	return typeof value === 'string' && (KNOWLEDGE_SOURCES as readonly string[]).includes(value);
}

/** created_via values written by something reading the user's own work. */
const WORK_VIAS = new Set(['task', 'backfill', 'chat', 'system']);

/**
 * Where an entry came from. Mirrors the `sources` column knowledge_list computes (migration
 * 20261124200000): change both together.
 *   linkedin  it carries a LinkedIn identity (a company or profile from the export)
 *   work      a task, doc, project or chat names it, or a reader of those made it
 *   contacts  another contact import made it (phone, Google)
 *   research  a web search made it
 *   manual    typed in, or saved by a connected agent
 */
export function knowledgeSourcesOf(entry: {
	created_via: string;
	has_linkedin: boolean;
	has_records: boolean;
}): KnowledgeSource[] {
	const out: KnowledgeSource[] = [];
	if (entry.has_records || WORK_VIAS.has(entry.created_via)) out.push('work');
	if (entry.has_linkedin) out.push('linkedin');
	if (entry.created_via === 'import' && !entry.has_linkedin) out.push('contacts');
	if (entry.created_via === 'enrichment') out.push('research');
	if (!out.length) out.push('manual');
	return out;
}

export const KNOWLEDGE_SOURCE_LABEL: Record<KnowledgeSource, { tag: string; filter: string }> = {
	work: { tag: 'Your work', filter: 'From your work' },
	linkedin: { tag: 'LinkedIn', filter: 'LinkedIn' },
	contacts: { tag: 'Contacts', filter: 'Contacts' },
	research: { tag: 'Web search', filter: 'Web search' },
	manual: { tag: 'Added by hand', filter: 'Added by hand' }
};

export interface CleanupSignals {
	name: string;
	sources: readonly KnowledgeSource[];
	/** Tasks and docs that name it. */
	tasks: number;
	documents: number;
	/** People attached to it (works at, studied at). */
	people: number;
	/** Details of its own (website, description, place). */
	details: number;
	circle: string | null;
	researched: boolean;
	/** Its best look-alike, when there is one. */
	similar?: { name: string; score: number; rule: SimilarOrgRule } | null;
}

export interface CleanupScore {
	/** Higher = look at it sooner. */
	score: number;
	/** Why it is in the queue, most telling first. Short, user-facing. */
	reasons: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * How soon the Clean up queue should show an organization. Mostly counts the graph already
 * holds (how many records name it, who is attached, what is known about it). Two checks read
 * the name itself and are deliberately small and harmless when they misfire, since they only
 * move an entry up a list a person reviews: whether the name parses as an email or web address
 * (a structured format), and whether it is a single word.
 */
export function scoreOrgCleanup(entry: CleanupSignals): CleanupScore {
	let score = 0;
	const reasons: string[] = [];
	const name = entry.name.trim();
	const records = entry.tasks + entry.documents;
	const fromWork = entry.sources.includes('work');

	if (normalizeEmail(name)) {
		score += 5;
		reasons.push('The name is an email address');
	} else if (!/\s/.test(name) && name.includes('.') && domainOf(name)) {
		score += 2;
		reasons.push('The name is a web address');
	}

	// Both sides of a likely pair come up early. No reason line: the card lists its look-alikes
	// itself, and the line would go stale the moment the pair is merged.
	if (entry.similar && entry.similar.score >= 0.5) score += 2 + entry.similar.score * 2;

	if (fromWork) {
		if (records === 0) {
			score += 2;
			reasons.push('No task or doc names it any more');
		} else if (records === 1) {
			score += 2;
			reasons.push(entry.tasks ? 'Named in one task' : 'Named in one doc');
		} else if (records >= 4) {
			score -= 2;
		}
	}

	if (entry.people === 0) {
		score += 1;
		reasons.push('No people attached');
	} else if (entry.people >= 2) {
		score -= 1;
	}

	// A one-word name nobody is attached to ("Desk", "Media") is the commonest misread.
	if (name.split(/\s+/).length === 1) score += entry.people === 0 ? 2.5 : 1.5;

	// Already filed under "Just mentioned": out of the way, so it can wait.
	if (entry.circle === 'public') {
		score -= 1;
		reasons.push('Already under Just mentioned');
	} else if (entry.circle !== 'inner') {
		score += 0.5;
	}

	if (entry.researched || entry.details > 0) score -= 2;

	if (!reasons.length) {
		if (entry.people) reasons.push(`${plural(entry.people, 'person')} attached`);
		else if (records) reasons.push(`Named in ${plural(records, 'task or doc')}`);
	}
	return { score, reasons };
}
