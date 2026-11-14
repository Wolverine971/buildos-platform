// packages/agentic-chat-runtime/src/context-finder/select.ts
//
// Turns Jev scores into a plan: which records load in full (and which sections of each
// document), which appear as one-line summaries. The plan carries no text, so a browser can
// show and edit it (pin, drop, add) and a worker can materialize it later.
//
// Policy "safe_v1" is the eval's winner (docs/research/jev-context-ranker-2026-09-22):
// Jev's scores are not calibrated, so the rule is rank-relative with an absolute floor.
import { DOCUMENT_CARD_TEXT_MAX_CHARS } from '@buildos/shared-agent-ops/utils/document-card';
import { cardNeedsText, documentCard, documentCardChars } from './card';
import { matchSectionIndex, type ContextFinderEntity, type ContextFinderKind } from './packets';
import { entityScoreKey, headingScoreKey, type ContextFinderScores } from './rank';

export const CONTEXT_FINDER_POLICY = Object.freeze({
	id: 'safe_v1' as const,
	/** Nothing below this loads or shows; chit-chat controls scored under it. */
	floor: 0.25,
	/** Full tier: score at least max(floor, relative × top). */
	relative: 0.6,
	fullCandidates: 16,
	maxFull: 10,
	maxPins: 5,
	/** Ceiling for any host; drift review uses all of it. */
	budgetChars: 14_000,
	sectionsPerDoc: 4,
	/**
	 * Chat (tasker 152, card-only): every picked document arrives as a card (what it is, its
	 * sections with anchors, the flagged ones) and every picked record as its text. A card runs
	 * 0.3–2k characters, so `maxFull` picks normally all fit; this ceiling (the policy's own)
	 * only stops a project of very long cards from growing the prompt without bound. A pick
	 * that does not fit drops to a one-line summary.
	 */
	agentCardBudgetChars: 14_000,
	/**
	 * Hosts that still get document text up front (workflow specialists, Workflow Lab preview;
	 * tasker 150, option B): each picked document's card plus text for its best sections.
	 */
	agentBudgetChars: 5_000,
	agentSectionsPerDoc: 2,
	sectionChars: 2_000,
	sectionFloor: 0.25,
	/** A document with no scored section loads its opening. */
	openingChars: 1_500,
	/**
	 * A pinned document with no scored section: its first 8,000 characters, never less than a
	 * document read returns (6,000). A pin that hid what a read would find is worse than no pin.
	 */
	pinnedOpeningChars: 8_000,
	recordChars: 1_200,
	summaryCandidates: 30,
	maxSummaries: 20
});

export type ContextPlanSectionV1 = {
	heading: string;
	p: number | null;
	/** The heading's anchor, so a repeated heading still names one section. Absent on plans
	 * stored before 2026-11-13 and on sections parsed without an outline. */
	anchor?: string;
};
export type ContextPlanItemV1 = {
	kind: ContextFinderKind;
	id: string;
	title: string;
	tier: 'full' | 'summary';
	/** Jev's probability for this message; null when the user added it without a score. */
	p: number | null;
	pinned?: true;
	/** Documents: sections to load, best first. Empty means the opening. */
	sections: ContextPlanSectionV1[];
};
export type ContextPlanV1 = {
	version: 'context_plan_v1';
	policy: typeof CONTEXT_FINDER_POLICY.id;
	source: 'jev' | 'curated';
	items: ContextPlanItemV1[];
	dropped: { kind: ContextFinderKind; id: string }[];
	topScore: number | null;
	checked: number;
	unchecked: number;
};

const round = (p: number) => Math.round(p * 1000) / 1000;

/** A document's best headings for this message, best first. */
export function scoredSectionsFor(
	entity: ContextFinderEntity,
	scores: ContextFinderScores,
	limit: number = CONTEXT_FINDER_POLICY.sectionsPerDoc
): ContextPlanSectionV1[] {
	if (entity.kind !== 'document') return [];
	return entity.packetHeadings
		.map((section, j) => ({
			heading: section.heading,
			anchor: section.anchor,
			p: scores[headingScoreKey(entity, j)]
		}))
		.filter(
			(x): x is { heading: string; anchor: string | undefined; p: number } =>
				typeof x.p === 'number' && x.p >= CONTEXT_FINDER_POLICY.sectionFloor
		)
		.sort((a, b) => b.p - a.p)
		.slice(0, limit)
		.map((x) => ({
			heading: x.heading,
			p: round(x.p),
			...(x.anchor ? { anchor: x.anchor } : {})
		}));
}

export type ContextExcerptV1 = {
	/** The section heading, or null for a record or a document opening. */
	heading: string | null;
	text: string;
};

/**
 * Excerpts a plan item would inject; shared by selection (budgeting) and materialization.
 * Each excerpt stays at or under 2,000 characters, so no downstream string cap splits one.
 */
export function contextItemExcerpts(
	entity: ContextFinderEntity,
	sections: readonly ContextPlanSectionV1[],
	options: { pinned?: boolean } = {}
): { excerpts: ContextExcerptV1[]; chars: number } {
	const policy = CONTEXT_FINDER_POLICY;
	const done = (excerpts: ContextExcerptV1[]) => ({
		excerpts,
		// Counted like the eval's joined text: excerpts plus a blank line between them.
		chars:
			excerpts.reduce((n, x) => n + x.text.length, 0) + 2 * Math.max(0, excerpts.length - 1)
	});
	if (entity.kind !== 'document')
		return done([{ heading: null, text: entity.fullText.slice(0, policy.recordChars) }]);
	// The text could not load (deleted since, or the read failed): the document's card.
	if (!entity.textLoaded) return done(documentCardExcerpts(entity));
	const picked: ContextExcerptV1[] = pickedSections(entity, sections).map((section) => ({
		heading: section.heading,
		text: section.body.slice(0, policy.sectionChars)
	}));
	if (!picked.length)
		return done(
			options.pinned
				? openingExcerpts(entity, policy.pinnedOpeningChars)
				: [{ heading: null, text: entity.fullText.slice(0, policy.openingChars) }]
		);
	return done(picked);
}

/** The entity's sections a plan names, in plan order, at most `sectionsPerDoc`. */
function pickedSections(
	entity: ContextFinderEntity,
	sections: readonly ContextPlanSectionV1[]
): ContextFinderEntity['sections'] {
	const used = new Set<number>();
	const picked: ContextFinderEntity['sections'] = [];
	for (const wanted of sections.slice(0, CONTEXT_FINDER_POLICY.sectionsPerDoc)) {
		// By anchor; a plan without one falls back to the first unused heading match.
		const index = matchSectionIndex(entity.sections, wanted, used);
		if (index < 0) continue;
		used.add(index);
		picked.push(entity.sections[index]!);
	}
	return picked;
}

/** Headings listed on a document card. */
const CARD_HEADINGS = 12;

/** Title-level facts and the outline with anchors, so the model can read a section itself. */
function documentCardExcerpts(entity: ContextFinderEntity): ContextExcerptV1[] {
	const description =
		typeof entity.packet.description === 'string' ? entity.packet.description : '';
	const headings = entity.packetHeadings.slice(0, CARD_HEADINGS);
	const lines = [
		...(description ? [description] : []),
		headings.length
			? 'Text not loaded. Outline (read a section with read_document_section and its anchor):'
			: 'Text not loaded. Read it with get_onto_document_details.',
		...headings.map(
			(section) =>
				`- ${section.heading}${section.anchor ? ` (anchor: ${section.anchor})` : ''}`
		),
		...(entity.packetHeadings.length > headings.length
			? [`- …and ${entity.packetHeadings.length - headings.length} more headings`]
			: [])
	];
	return [{ heading: null, text: lines.join('\n').slice(0, CONTEXT_FINDER_POLICY.sectionChars) }];
}

/**
 * What `contextItemExcerpts` would inject, before the document text loads. Sections come from
 * the outline's offsets; an opening is bounded by the known length. Never under the real
 * size of an unpinned item, so a plan budgeted on it fits once the text is in (pins skip the
 * budget).
 */
export function contextItemChars(
	entity: ContextFinderEntity,
	sections: readonly ContextPlanSectionV1[],
	options: { pinned?: boolean } = {}
): number {
	if (entity.textLoaded) return contextItemExcerpts(entity, sections, options).chars;
	const policy = CONTEXT_FINDER_POLICY;
	const picked = pickedSections(entity, sections);
	if (picked.length)
		return (
			picked.reduce(
				(n, section) => n + Math.min(section.end - section.start, policy.sectionChars),
				0
			) +
			2 * (picked.length - 1)
		);
	const cap = options.pinned ? policy.pinnedOpeningChars : policy.openingChars;
	const size = Math.min(entity.textChars ?? cap, cap);
	// A pinned opening splits into pieces joined by a blank line.
	const pieces = options.pinned ? Math.max(1, Math.ceil(size / policy.sectionChars)) : 1;
	return size + 2 * (pieces - 1);
}

/** The document's first `limit` characters in pieces of at most `sectionChars`, each labeled
 * with the heading of the section it starts in (checkpoint strings stay under their cap). */
function openingExcerpts(entity: ContextFinderEntity, limit: number): ContextExcerptV1[] {
	const size = CONTEXT_FINDER_POLICY.sectionChars;
	const text = entity.fullText.slice(0, limit);
	const excerpts: ContextExcerptV1[] = [];
	for (let pos = 0; pos < text.length; ) {
		let end = Math.min(pos + size, text.length);
		if (end < text.length) {
			// Break after a line when one falls in the second half of the piece.
			const newline = text.lastIndexOf('\n', end - 1);
			if (newline >= pos + size / 2) end = newline + 1;
		}
		let heading: string | null = null;
		for (const section of entity.sections) if (section.start <= pos) heading = section.heading;
		excerpts.push({ heading, text: text.slice(pos, end) });
		pos = end;
	}
	return excerpts;
}

/**
 * Jev's plan for one message. `skipIds` removes records the prompt already carries (START
 * HERE); `pins` load first and are never skipped for budget; `drops` never load.
 */
export function selectProjectContext(input: {
	entities: readonly ContextFinderEntity[];
	scores: ContextFinderScores;
	checked?: number;
	unchecked?: number;
	skipIds?: ReadonlySet<string>;
	pins?: ReadonlySet<string>;
	drops?: ReadonlySet<string>;
	/** A smaller share of the budget when several projects split one prompt (workspace.ts). */
	budgetChars?: number;
	/** Fewer sections per document than the policy's ceiling (text hosts: `agentSectionsPerDoc`). */
	sectionsPerDoc?: number;
	maxSummaries?: number;
	/**
	 * Raise the bar for loading a record in full (never lower it). A whole-project request
	 * loads in full only what Jev is sure about; summaries keep the normal floor so a
	 * request misread as broad still names its likely records (finder.ts).
	 */
	fullFloor?: number;
	/** card: unpinned documents are budgeted as cards, not section text (tasker 152). */
	documents?: 'text' | 'card';
}): ContextPlanV1 {
	const policy = CONTEXT_FINDER_POLICY;
	const floor = policy.floor;
	const fullFloor = Math.max(floor, input.fullFloor ?? floor);
	const budgetChars = Math.min(input.budgetChars ?? policy.budgetChars, policy.budgetChars);
	const maxSummaries = Math.min(input.maxSummaries ?? policy.maxSummaries, policy.maxSummaries);
	const sectionsPerDoc = Math.min(
		input.sectionsPerDoc ?? policy.sectionsPerDoc,
		policy.sectionsPerDoc
	);
	const skip = input.skipIds ?? new Set<string>();
	const drops = input.drops ?? new Set<string>();
	const pins = input.pins ?? new Set<string>();
	// Stable sort keeps the entity order for ties, as the eval did.
	const scored = input.entities
		.filter((entity) => !skip.has(entity.id) && !drops.has(entity.id))
		.map((entity) => ({ entity, p: input.scores[entityScoreKey(entity)] ?? 0 }))
		.sort((a, b) => b.p - a.p);
	const top = scored[0]?.p ?? 0;
	const bar = Math.max(fullFloor, policy.relative * top);
	const pinned = scored.filter((x) => pins.has(x.entity.id)).slice(0, policy.maxPins);
	const candidates = [
		...pinned,
		...scored
			.filter((x) => !pins.has(x.entity.id) && x.p >= bar)
			.slice(0, policy.fullCandidates)
	];
	let chars = 0;
	const full: ContextPlanItemV1[] = [];
	for (const { entity, p } of candidates) {
		const isPinned = pins.has(entity.id);
		if (!isPinned && full.length >= policy.maxFull) break;
		const sections = scoredSectionsFor(entity, input.scores, sectionsPerDoc);
		const size =
			input.documents === 'card' && entity.kind === 'document' && !isPinned
				? documentCardChars(documentCard(entity, sections)) +
					(cardNeedsText(entity) ? DOCUMENT_CARD_TEXT_MAX_CHARS : 0)
				: contextItemChars(entity, sections, { pinned: isPinned });
		// Skip what doesn't fit and keep packing smaller, lower-ranked items.
		if (!isPinned && chars + size > budgetChars) continue;
		chars += size;
		full.push({
			kind: entity.kind,
			id: entity.id,
			title: entity.title,
			tier: 'full',
			p: round(p),
			...(isPinned ? { pinned: true as const } : {}),
			sections
		});
	}
	const fullIds = new Set(full.map((item) => item.id));
	const summaries: ContextPlanItemV1[] = scored
		.filter((x) => x.p >= floor)
		.slice(0, policy.summaryCandidates)
		.filter((x) => !fullIds.has(x.entity.id))
		.slice(0, maxSummaries)
		.map(({ entity, p }) => ({
			kind: entity.kind,
			id: entity.id,
			title: entity.title,
			tier: 'summary',
			p: round(p),
			// Kept so a pin in the browser can load this document's best sections.
			sections: scoredSectionsFor(entity, input.scores, sectionsPerDoc)
		}));
	return {
		version: 'context_plan_v1',
		policy: policy.id,
		source: pins.size || drops.size ? 'curated' : 'jev',
		items: [...full, ...summaries],
		dropped: input.entities
			.filter((entity) => drops.has(entity.id))
			.map((entity) => ({ kind: entity.kind, id: entity.id })),
		topScore: scored.length ? round(top) : null,
		checked: input.checked ?? input.entities.length,
		unchecked: input.unchecked ?? 0
	};
}
