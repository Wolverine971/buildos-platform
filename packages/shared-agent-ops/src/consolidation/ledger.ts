// packages/shared-agent-ops/src/consolidation/ledger.ts
//
// The fact ledger behind a consolidation merge (docs/research/doc-task-consolidation-2026-10-03).
// Merging documents loses things; merging facts doesn't, as long as every fact
// pulled from a source ends in exactly one fate:
//   keep        placed in a section of the new doc
//   merged      says the same as another fact that is placed (`with`)
//   superseded  a newer fact replaces it (`with`)
//   history     true at the time; placed in a history section
//   open        an open question; placed in the open-questions section
//   conflict    disagrees with another fact (`with`); shown to the owner, both kept
//   missing     the source claims content it does not contain; noted, never invented
//   dropped     junk or a folder note; needs a reason
// Code checks the ledger before anything is written and repairs what the model
// left out by keeping it, never by dropping it.
//
// Client-safe: no Node imports.

export const FACT_KINDS = [
	'durable',
	'status',
	'decision',
	'plan',
	'question',
	'reference'
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FATES = [
	'keep',
	'merged',
	'superseded',
	'history',
	'open',
	'conflict',
	'missing',
	'dropped'
] as const;
export type Fate = (typeof FATES)[number];

/** Fates whose fact appears in a section of the written doc. */
export const PLACED_FATES: readonly Fate[] = ['keep', 'history', 'open'];
/** Fates that point at another fact. */
export const LINKED_FATES: readonly Fate[] = ['merged', 'superseded', 'conflict'];

export type LedgerFact = {
	id: string;
	/** Document id the fact came from, or `owner` for text the owner typed in. */
	source_id: string;
	kind: FactKind;
	text: string;
	/** Copied from the source; code checked it is there. */
	quote: string;
	/** ISO date the fact was true as of, when the source says. */
	as_of: string | null;
};

export type LedgerFate = {
	fact_id: string;
	fate: Fate;
	/** The other fact for merged / superseded / conflict. */
	with: string | null;
	reason: string | null;
	/** Heading of the section that holds it, for placed fates. */
	section: string | null;
};

export type SourceFlag = {
	source_id: string;
	kind: 'hollow' | 'junk';
	note: string;
	quote: string | null;
};

export type MergeLedger = {
	facts: LedgerFact[];
	fates: LedgerFate[];
	/** Section headings in order. */
	sections: string[];
	flags: SourceFlag[];
	/**
	 * Extracted notes whose quote could not be found in the source. They are not
	 * facts the editor places; the doc lists them under their own heading, so
	 * nothing the reader saw is lost and nothing unchecked reads as settled.
	 */
	unverified: Array<{ source_id: string; text: string }>;
	/** Owner instructions already worked into the fates (typed answers to merge questions). */
	instructions?: string[];
	/** Merge questions whose typed answer is already in `facts` as the owner's own words. */
	owner_question_ids?: string[];
	/**
	 * Each source's `updated_at` when its facts were read. A source edited after
	 * that is not in the draft, so Apply refuses the merge rather than archive it.
	 */
	source_versions?: Record<string, string>;
	/** False between saving the ledger and posting its question cards (a crash there is resumed). */
	questions_posted?: boolean;
	/** The answers the stored markdown was written from (see the worker's answersFingerprint). */
	written_for?: string;
};

export const MERGE_STATUSES = [
	'pending',
	'extracting',
	'reconciling',
	'waiting',
	'writing',
	'ready',
	'failed'
] as const;
export type MergeStatus = (typeof MERGE_STATUSES)[number];

export type MergeCoverage = {
	/** Facts the doc must hold (keep, history, open). */
	placed: number;
	/** Of those, how many the written prose states. */
	stated: number;
	/** The rest, added word for word in a list at the end so nothing is lost. */
	appended_fact_ids: string[];
};

export type MergeDraftView = {
	cluster_key: string;
	status: MergeStatus;
	title: string;
	target_project_id: string;
	source_ids: string[];
	ledger: MergeLedger | null;
	markdown: string | null;
	coverage: MergeCoverage | null;
	error: string | null;
	created_document_id: string | null;
};

export const OTHER_NOTES_SECTION = 'Other notes';

export type LedgerProblem = { fact_id: string | null; problem: string };

/**
 * A merged or superseded fact leaves the doc, so its chain of links (cycle-safe)
 * must end at a fact whose text the doc shows: a placed fact, or a conflict
 * (listed under "Needs your eye"). Otherwise the fact would silently vanish.
 */
function resolvesToShown(id: string, byFact: ReadonlyMap<string, LedgerFate>): boolean {
	const seen = new Set([id]);
	let fate = byFact.get(id);
	while (fate && (fate.fate === 'merged' || fate.fate === 'superseded')) {
		if (!fate.with || seen.has(fate.with)) return false;
		seen.add(fate.with);
		fate = byFact.get(fate.with);
	}
	return Boolean(fate) && (PLACED_FATES.includes(fate!.fate) || fate!.fate === 'conflict');
}

/**
 * Every fact has exactly one fate; links point at real facts; merged and
 * superseded facts lead to a fact the doc shows; placed facts name a section
 * that exists; dropped facts give a reason.
 */
export function checkLedger(ledger: MergeLedger): LedgerProblem[] {
	const problems: LedgerProblem[] = [];
	const facts = new Map(ledger.facts.map((fact) => [fact.id, fact]));
	const seen = new Map<string, LedgerFate>();
	const sections = new Set(ledger.sections);
	for (const fate of ledger.fates) {
		if (!facts.has(fate.fact_id)) {
			problems.push({
				fact_id: fate.fact_id,
				problem: 'fate for a fact that does not exist'
			});
			continue;
		}
		if (seen.has(fate.fact_id)) {
			problems.push({ fact_id: fate.fact_id, problem: 'more than one fate' });
			continue;
		}
		seen.set(fate.fact_id, fate);
	}
	for (const fact of ledger.facts)
		if (!seen.has(fact.id)) problems.push({ fact_id: fact.id, problem: 'no fate' });
	for (const fate of seen.values()) {
		if (LINKED_FATES.includes(fate.fate)) {
			if (!fate.with || !facts.has(fate.with) || fate.with === fate.fact_id)
				problems.push({
					fact_id: fate.fact_id,
					problem: `${fate.fate} needs another fact in "with"`
				});
			else if (
				(fate.fate === 'merged' || fate.fate === 'superseded') &&
				!resolvesToShown(fate.fact_id, seen)
			)
				problems.push({
					fact_id: fate.fact_id,
					problem: `${fate.fate} into a fact that is not placed`
				});
		}
		if (PLACED_FATES.includes(fate.fate) && (!fate.section || !sections.has(fate.section)))
			problems.push({
				fact_id: fate.fact_id,
				problem: 'placed fact needs one of the sections'
			});
		if (fate.fate === 'dropped' && !fate.reason?.trim())
			problems.push({ fact_id: fate.fact_id, problem: 'dropped needs a reason' });
	}
	return problems;
}

/**
 * Makes a ledger pass checkLedger without losing anything: a fact with no fate,
 * or a broken one, is kept in "Other notes" (a replaced fact whose replacement
 * the doc doesn't show is kept there as history). Duplicate fates keep the first.
 */
export function repairLedger(ledger: MergeLedger): MergeLedger {
	const facts = new Map(ledger.facts.map((fact) => [fact.id, fact]));
	const sections = [...new Set(ledger.sections.filter((section) => section.trim()))];
	const byFact = new Map<string, LedgerFate>();
	for (const fate of ledger.fates)
		if (facts.has(fate.fact_id) && !byFact.has(fate.fact_id))
			byFact.set(fate.fact_id, { ...fate });
	let needsOther = false;
	const inOther = (fact_id: string, fate: 'keep' | 'history' = 'keep'): LedgerFate => {
		needsOther = true;
		return { fact_id, fate, with: null, reason: null, section: OTHER_NOTES_SECTION };
	};
	for (const fact of ledger.facts)
		if (!byFact.has(fact.id)) byFact.set(fact.id, inOther(fact.id));
	// Each pass judges every fate against the same snapshot, so every fact in a
	// cycle is kept (none silently wins). Repairs only ever place facts, so a
	// later pass can only find fewer problems; it ends within one pass per fact.
	for (let pass = 0; pass <= ledger.facts.length; pass++) {
		const changes = new Map<string, LedgerFate>();
		for (const [id, fate] of byFact) {
			const brokenLink =
				LINKED_FATES.includes(fate.fate) &&
				(!fate.with || !facts.has(fate.with) || fate.with === id);
			const leadsNowhere =
				!brokenLink &&
				(fate.fate === 'merged' || fate.fate === 'superseded') &&
				!resolvesToShown(id, byFact);
			const unplaced =
				PLACED_FATES.includes(fate.fate) &&
				fate.section !== OTHER_NOTES_SECTION &&
				(!fate.section || !sections.includes(fate.section));
			const silentDrop = fate.fate === 'dropped' && !fate.reason?.trim();
			if (brokenLink || silentDrop) changes.set(id, inOther(id));
			else if (leadsNowhere)
				changes.set(id, inOther(id, fate.fate === 'superseded' ? 'history' : 'keep'));
			else if (unplaced) {
				needsOther = true;
				changes.set(id, { ...fate, section: OTHER_NOTES_SECTION });
			}
		}
		if (changes.size === 0) break;
		for (const [id, fate] of changes) byFact.set(id, fate);
	}
	return {
		...ledger,
		sections:
			needsOther && !sections.includes(OTHER_NOTES_SECTION)
				? [...sections, OTHER_NOTES_SECTION]
				: sections,
		fates: ledger.facts.map((fact) => byFact.get(fact.id)!)
	};
}

/** A fate as stored or as an edit on a merge question option; null when malformed. */
export function parseLedgerFate(value: unknown): LedgerFate | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const item = value as Record<string, unknown>;
	const text = (field: unknown, max: number) =>
		typeof field === 'string' && field.trim() ? field.trim().slice(0, max) : null;
	const factId = text(item.fact_id, 20);
	if (!factId || !FATES.includes(item.fate as Fate)) return null;
	return {
		fact_id: factId,
		fate: item.fate as Fate,
		with: text(item.with, 20),
		reason: text(item.reason, 300),
		section: text(item.section, 80)
	};
}

/** Fates that leave the fact's own words visible: in a section, or under "Needs your eye". */
const SHOWN_FATES: readonly Fate[] = ['keep', 'history', 'open', 'conflict', 'missing'];

/**
 * True when edits only keep or note facts: safe to apply when nobody answered.
 * Folding a fact into another (merged) removes its words, so it is not.
 */
export function safeEdits(edits: readonly LedgerFate[]): boolean {
	return edits.every((edit) => SHOWN_FATES.includes(edit.fate));
}

/** Applies fate edits on top of a ledger, then repairs anything an edit left loose. */
export function applyEdits(ledger: MergeLedger, edits: readonly LedgerFate[]): MergeLedger {
	if (edits.length === 0) return ledger;
	const byFact = new Map(ledger.fates.map((fate) => [fate.fact_id, fate]));
	const sections = [...ledger.sections];
	const known = new Set(ledger.facts.map((fact) => fact.id));
	for (const edit of edits) {
		if (!known.has(edit.fact_id)) continue;
		if (PLACED_FATES.includes(edit.fate) && edit.section && !sections.includes(edit.section))
			sections.push(edit.section);
		byFact.set(edit.fact_id, { ...edit });
	}
	return repairLedger({ ...ledger, sections, fates: [...byFact.values()] });
}

const FATE_PHRASE: Record<Fate, string> = {
	keep: 'keeps',
	merged: 'folds in',
	superseded: 'marks as replaced',
	history: 'keeps as history',
	open: 'keeps as an open question',
	conflict: 'flags as unsettled',
	missing: 'notes as missing',
	dropped: 'leaves out'
};

/** A merge question option's effect in plain words, for the card's "Will do" line. */
export function describeEdits(
	edits: readonly LedgerFate[],
	textOf: (factId: string) => string
): string {
	if (edits.length === 0) return 'No fact changes; the doc lists this under “Needs your eye”.';
	const clip = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
	const sentence = edits
		.map((edit) => `${FATE_PHRASE[edit.fate]} “${clip(textOf(edit.fact_id))}”`)
		.join(' · ');
	return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** Count of facts by fate, for the review card. */
export function fateCounts(ledger: MergeLedger): Record<Fate, number> {
	const counts = Object.fromEntries(FATES.map((fate) => [fate, 0])) as Record<Fate, number>;
	for (const fate of ledger.fates) counts[fate.fate] += 1;
	return counts;
}

/** Placed facts grouped by section, in section order. */
export function sectionFacts(ledger: MergeLedger): Array<{ heading: string; facts: LedgerFact[] }> {
	const facts = new Map(ledger.facts.map((fact) => [fact.id, fact]));
	return ledger.sections
		.map((heading) => ({
			heading,
			facts: ledger.fates
				.filter((fate) => PLACED_FATES.includes(fate.fate) && fate.section === heading)
				.map((fate) => facts.get(fate.fact_id)!)
				.filter(Boolean)
		}))
		.filter((section) => section.facts.length > 0);
}

/**
 * Text as a reader sees it, for quote checks: no markdown markers (bold, code,
 * table pipes, headings, quote bars, link brackets), straight quotes and
 * dashes, single spaces, lower case. Applied to both sides, so a quote must
 * still appear in the source as one unbroken run. (On 10-04, 51 of 55 notes
 * set aside as unverified were real: the model quoted bold text without `**`.)
 */
export function readerText(text: string): string {
	return text
		.replace(/[‘’‛′]/g, "'")
		.replace(/[“”‟″]/g, '"')
		.replace(/[‐‑‒–—―]/g, '-')
		.replace(/[*_`~|#>[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function isWordChar(char: string | undefined): boolean {
	return Boolean(char) && /[\p{L}\p{N}]/u.test(char!);
}

/**
 * True when the quote appears in the source as the reader sees it. A quote
 * under four characters ("$40", "Ana") must stand on its own, not inside a
 * longer word, so "an" never matches "anything".
 */
export function quoteFound(source: string, quote: string): boolean {
	const needle = readerText(quote);
	if (!needle) return false;
	const haystack = readerText(source);
	if (needle.length >= 4) return haystack.includes(needle);
	for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1))
		if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) return true;
	return false;
}
