// packages/agentic-chat-runtime/src/context-finder/select.ts
//
// Turns Jev scores into a plan: which records load in full (and which sections of each
// document), which appear as one-line summaries. The plan carries no text, so a browser can
// show and edit it (pin, drop, add) and a worker can materialize it later.
//
// Policy "safe_v1" is the eval's winner (docs/research/jev-context-ranker-2026-09-22):
// Jev's scores are not calibrated, so the rule is rank-relative with an absolute floor.
import type { ContextFinderEntity, ContextFinderKind } from './packets';
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
	budgetChars: 14_000,
	sectionsPerDoc: 4,
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

export type ContextPlanSectionV1 = { heading: string; p: number | null };
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
		.map((section, j) => ({ heading: section.heading, p: scores[headingScoreKey(entity, j)] }))
		.filter(
			(x): x is { heading: string; p: number } =>
				typeof x.p === 'number' && x.p >= CONTEXT_FINDER_POLICY.sectionFloor
		)
		.sort((a, b) => b.p - a.p)
		.slice(0, limit)
		.map((x) => ({ heading: x.heading, p: round(x.p) }));
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
	const used = new Set<number>();
	const picked: ContextExcerptV1[] = [];
	for (const wanted of sections.slice(0, policy.sectionsPerDoc)) {
		// Duplicate headings resolve to the first unused match, in document order.
		const index = entity.sections.findIndex(
			(section, i) => !used.has(i) && section.heading === wanted.heading
		);
		if (index < 0) continue;
		used.add(index);
		picked.push({
			heading: wanted.heading,
			text: entity.sections[index]!.body.slice(0, policy.sectionChars)
		});
	}
	if (!picked.length)
		return done(
			options.pinned
				? openingExcerpts(entity, policy.pinnedOpeningChars)
				: [{ heading: null, text: entity.fullText.slice(0, policy.openingChars) }]
		);
	return done(picked);
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
	maxSummaries?: number;
}): ContextPlanV1 {
	const policy = CONTEXT_FINDER_POLICY;
	const budgetChars = Math.min(input.budgetChars ?? policy.budgetChars, policy.budgetChars);
	const maxSummaries = Math.min(input.maxSummaries ?? policy.maxSummaries, policy.maxSummaries);
	const skip = input.skipIds ?? new Set<string>();
	const drops = input.drops ?? new Set<string>();
	const pins = input.pins ?? new Set<string>();
	// Stable sort keeps the entity order for ties, as the eval did.
	const scored = input.entities
		.filter((entity) => !skip.has(entity.id) && !drops.has(entity.id))
		.map((entity) => ({ entity, p: input.scores[entityScoreKey(entity)] ?? 0 }))
		.sort((a, b) => b.p - a.p);
	const top = scored[0]?.p ?? 0;
	const bar = Math.max(policy.floor, policy.relative * top);
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
		const sections = scoredSectionsFor(entity, input.scores);
		const size = contextItemExcerpts(entity, sections, { pinned: isPinned }).chars;
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
		.filter((x) => x.p >= policy.floor)
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
			sections: scoredSectionsFor(entity, input.scores)
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
