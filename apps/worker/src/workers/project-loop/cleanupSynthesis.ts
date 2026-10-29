// apps/worker/src/workers/project-loop/cleanupSynthesis.ts
//
// The roll-up call's pure parts (tasker 112). One model call per pass reads every open cleanup
// item next to the current state of what it touches and returns structured verdicts: still true
// or resolved, which items are the same finding, which section each belongs in, and how to group
// them on the card. Items reach the model by short handles ("i1"), never by uuid, and every
// verdict is mapped back through the handle table: an unknown handle is ignored, and code's
// section floor still decides what may sit in "Safe cleanup".
import type {
	ProjectCleanupAnswer,
	ProjectCleanupAnswerAction,
	ProjectCleanupAsk,
	ProjectCleanupGroup,
	ProjectCleanupSection,
	ProjectCleanupSource,
	ProjectCleanupSynthesis,
	ProjectReviewAttentionLevel
} from '@buildos/shared-types';
import { createHash } from 'node:crypto';
import type { RollupVerdict } from './reviewRollup';

export interface CleanupSynthesisItem {
	/** Short handle the model sees, e.g. "i3". */
	handle: string;
	lineageId: string;
	kind: string;
	source: ProjectCleanupSource;
	title: string;
	/** Why it matters (rationale), clipped. */
	summary: string | null;
	/** What approval changes, from the integrity check or the operation labels; null for notes. */
	change: string | null;
	executable: boolean;
	/** Opened by this pass. */
	fresh: boolean;
	firstSeenAt: string;
	seenCount: number;
	/** The current state of each record it is about, one line each. */
	about: string[];
	cautions: string[];
	/** Sections code allows for this item; the first is the default. */
	allowedSections: ProjectCleanupSection[];
	/** Radar and audit items are judged by their own producers; the roll-up only groups them. */
	judged: boolean;
}

export interface CleanupSynthesisResult {
	synthesis: ProjectCleanupSynthesis;
	verdicts: RollupVerdict[];
	merges: Array<{ lineageId: string; into: string }>;
	sections: Map<string, ProjectCleanupSection>;
	summaries: Map<string, string>;
	attentionLevel: ProjectReviewAttentionLevel;
	stateSummary: string | null;
	nextBestAction: string | null;
}

const SECTIONS: readonly ProjectCleanupSection[] = ['safe_cleanup', 'needs_call', 'note'];
const ATTENTION_LEVELS: readonly ProjectReviewAttentionLevel[] = [
	'none',
	'minor',
	'decision',
	'urgent'
];
const SECTION_GROUP_TITLES: Record<ProjectCleanupSection, string> = {
	safe_cleanup: 'Ready to apply',
	needs_call: 'Needs your call',
	note: 'Worth knowing'
};

function text(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * The roll-up sees items as handles ("i3") and sometimes writes them into its prose. Handles
 * are our own structured tokens, so code removes them from anything the user reads: a
 * parenthetical of handles is dropped, and a bare handle becomes the item's title.
 */
function scrubHandles(
	value: string | null,
	byHandle: ReadonlyMap<string, CleanupSynthesisItem>
): string | null {
	if (!value) return value;
	const scrubbed = value
		.replace(/\s*\((?:\s*i\d+\s*[,;/&]?)+\s*\)/g, '')
		.replace(/\bi\d+\b/g, (handle) => {
			const item = byHandle.get(handle);
			return item ? `"${item.title}"` : handle;
		})
		.replace(/\s{2,}/g, ' ')
		.trim();
	return scrubbed || null;
}

export function describeCleanupItems(items: readonly CleanupSynthesisItem[]): string {
	if (!items.length) return '(none)';
	return items
		.map((item) => {
			const lines = [
				`- ${item.handle} [${item.source}${item.fresh ? ', new this pass' : `, open since ${item.firstSeenAt.slice(0, 10)}, seen ${item.seenCount}x`}] ${item.title}`,
				item.summary ? `  why: ${item.summary}` : null,
				item.change
					? `  approving it: ${item.change}`
					: '  approving it changes nothing (a note)',
				...item.about.map((line) => `  about: ${line}`),
				...item.cautions.map((line) => `  caution: ${line}`),
				`  may go in: ${item.allowedSections.join(' | ')}${item.judged ? '' : ' (group only; its own check judges it)'}`
			];
			return lines.filter(Boolean).join('\n');
		})
		.join('\n');
}

export const CLEANUP_SYNTHESIS_OUTPUT = [
	'Return ONLY JSON: { "brief": {',
	'  "attention_level": "none"|"minor"|"decision"|"urgent",',
	'  "state_summary": string|null,',
	'  "bottom_line": string|null,      // one sentence: what this cleanup list is about',
	'  "recommendation": string|null,   // the one thing to do first',
	'  "next_best_action": string|null,',
	'  "items": [ { "id": "i1", "verdict": "still_true"|"resolved", "reason": string|null, "section": "safe_cleanup"|"needs_call"|"note", "summary": string } ],',
	'  "merges": [ { "keep": "i1", "absorb": ["i4"], "reason": string } ],',
	'  "groups": [ { "title": string, "section": "safe_cleanup"|"needs_call"|"note", "item_ids": ["i1","i2"], "recommendation": string|null } ],',
	'  "asks": [ { "items": ["i3","i5"], "question": string, "context": string|null, "answers": [ { "label": string, "effect": string|null, "action": "apply"|"dismiss"|"done"|"note"|"chat", "recommended": boolean } ] } ]',
	'} }'
].join('\n');

/**
 * How the roll-up pre-writes questions ("asks", AI Inbox Assistant's Desk, 2026-10-29). Plain
 * language for the model; parseCleanupSynthesis still decides what survives.
 */
export const CLEANUP_ASK_GUIDANCE = [
	"Asks: pre-write the question the owner answers with one tap. Write an ask for every item that needs the owner's judgment (items you put in needs_call or note, audit items, radar items). Do not write asks for safe_cleanup items.",
	'One ask may cover several items when one answer settles them all. Example: a stale "Rod Chamberlin" doc, a goal "Launch Rob Chamberlin book website" that looks abandoned, and an archive of the old recovery plan become one ask, "Is the Rod Chamberlin website still happening?", with answers "Still going", "On hold" and "It\'s over". Each item belongs to at most one ask.',
	"The question names the record and can be answered with a tap. Give 2 or 3 mutually exclusive answers. Each answer's effect says in one line what will change if the owner picks it.",
	'Answer actions: "apply" only when the answer means "make the change shown under approving it", and only for items that have a change; "dismiss" when it is not needed; "done" when the owner already handled it; "note" when the answer describes a specific situation (the answer is handed to a reader that updates the project or starts an agent); "chat" to talk it through.',
	'Audit items are offers of work: phrase them as "Want me to …?" with answers like {"label": "Yes, ask me", "action": "chat"} and {"label": "Not for this project", "action": "dismiss"}.',
	'Findings with nothing to apply get answers like "Already handled" (done), "Not needed" (dismiss), or a specific situation (note).',
	'An "apply" answer applies every item in its ask, so never put an item whose approving changes nothing (a note) in an ask that has an "apply" answer; such an ask is discarded. Ask about the note separately.',
	'Mark at most one answer recommended. Item ids never appear in questions, context, labels or effects.'
].join('\n');

/** Caps on what the card shows from an ask. */
export const CLEANUP_ASK_LIMITS = {
	question: 200,
	context: 300,
	label: 48,
	effect: 160,
	minAnswers: 2,
	maxAnswers: 3,
	/** Bound on the stable id; a long list of lineage ids is hashed down. */
	idChars: 200
} as const;

const ANSWER_ACTIONS: readonly ProjectCleanupAnswerAction[] = [
	'apply',
	'dismiss',
	'done',
	'note',
	'chat'
];

/** Stable across passes for the same items: `ask:` + the covered lineage ids, sorted. */
export function cleanupAskId(lineageIds: readonly string[]): string {
	const joined = `ask:${[...lineageIds].sort().join(',')}`;
	if (joined.length <= CLEANUP_ASK_LIMITS.idChars) return joined;
	return `ask:${createHash('sha256').update(joined).digest('hex').slice(0, 40)}`;
}

/**
 * The model's asks, mapped onto lineages. Code wins: unknown handles and items already settled
 * this pass drop out, each item is in at most one ask, an answer that applies a change needs
 * every covered item to have one, and an ask keeps 2–3 answers with at most one recommended.
 */
export function parseCleanupAsks(params: {
	raw: unknown;
	byHandle: ReadonlyMap<string, CleanupSynthesisItem>;
	/** Lineages resolved or merged away this pass: an ask never covers them. */
	settled: ReadonlySet<string>;
	readable: (value: unknown, max: number) => string | null;
}): ProjectCleanupAsk[] {
	// Scrubbing can turn a handle into a quoted title, so clip again after it.
	const readable = (value: unknown, max: number) => text(params.readable(value, max), max);
	const asks: ProjectCleanupAsk[] = [];
	const claimed = new Set<string>();
	for (const entry of Array.isArray(params.raw) ? params.raw : []) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const items: CleanupSynthesisItem[] = [];
		for (const handle of Array.isArray(record.items) ? record.items : []) {
			const item = typeof handle === 'string' ? params.byHandle.get(handle) : undefined;
			if (!item || params.settled.has(item.lineageId) || claimed.has(item.lineageId))
				continue;
			if (!items.includes(item)) items.push(item);
		}
		if (!items.length) continue;
		const question = readable(record.question, CLEANUP_ASK_LIMITS.question);
		if (!question) continue;
		const everyItemHasAChange = items.every((item) => item.executable);
		const answers: ProjectCleanupAnswer[] = [];
		let recommendedTaken = false;
		let lostApply = false;
		for (const rawAnswer of Array.isArray(record.answers) ? record.answers : []) {
			if (!rawAnswer || typeof rawAnswer !== 'object') continue;
			const answer = rawAnswer as Record<string, unknown>;
			const action = ANSWER_ACTIONS.includes(answer.action as ProjectCleanupAnswerAction)
				? (answer.action as ProjectCleanupAnswerAction)
				: null;
			const label = readable(answer.label, CLEANUP_ASK_LIMITS.label);
			if (!action || !label) continue;
			// "Make the change" only when every covered item has a change to make.
			if (action === 'apply' && !everyItemHasAChange) {
				lostApply = true;
				continue;
			}
			if (answers.some((other) => other.label.toLowerCase() === label.toLowerCase()))
				continue;
			const recommended = answer.recommended === true && !recommendedTaken;
			if (recommended) recommendedTaken = true;
			answers.push({
				label,
				effect: readable(answer.effect, CLEANUP_ASK_LIMITS.effect),
				action,
				recommended
			});
			if (answers.length === CLEANUP_ASK_LIMITS.maxAnswers) break;
		}
		// A question whose "yes" was dropped would offer only "no" and "talk": its items keep
		// their own cards instead (live Wayne pass, 2026-10-29).
		if (lostApply || answers.length < CLEANUP_ASK_LIMITS.minAnswers) continue;
		const lineageIds = items.map((item) => item.lineageId);
		lineageIds.forEach((id) => claimed.add(id));
		asks.push({
			id: cleanupAskId(lineageIds),
			question,
			context: readable(record.context, CLEANUP_ASK_LIMITS.context),
			item_ids: lineageIds,
			answers
		});
	}
	return asks;
}

/**
 * Map the model's answer back onto lineages. Anything that names an unknown handle, a section
 * code does not allow, or a verdict on an item the roll-up does not judge is dropped.
 */
export function parseCleanupSynthesis(params: {
	raw: unknown;
	items: readonly CleanupSynthesisItem[];
	generatedAt: string;
}): CleanupSynthesisResult {
	const raw =
		params.raw && typeof params.raw === 'object' ? (params.raw as Record<string, unknown>) : {};
	const byHandle = new Map(params.items.map((item) => [item.handle, item]));
	const readable = (value: unknown, max: number) => scrubHandles(text(value, max), byHandle);
	const verdicts: RollupVerdict[] = [];
	const sections = new Map<string, ProjectCleanupSection>();
	const summaries = new Map<string, string>();
	const resolved = new Set<string>();

	for (const entry of Array.isArray(raw.items) ? raw.items : []) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const item = typeof record.id === 'string' ? byHandle.get(record.id) : undefined;
		if (!item) continue;
		const summary = readable(record.summary, 220);
		if (summary) summaries.set(item.lineageId, summary);
		if (
			typeof record.section === 'string' &&
			item.allowedSections.includes(record.section as ProjectCleanupSection)
		)
			sections.set(item.lineageId, record.section as ProjectCleanupSection);
		if (!item.judged) continue;
		if (record.verdict === 'resolved') {
			const reason = readable(record.reason, 220);
			// A close always carries its reason; a bare "resolved" is no opinion.
			if (!reason) continue;
			verdicts.push({ lineageId: item.lineageId, verdict: 'resolved', reason });
			resolved.add(item.lineageId);
		} else if (record.verdict === 'still_true') {
			verdicts.push({
				lineageId: item.lineageId,
				verdict: 'still_true',
				...(readable(record.reason, 220)
					? { reason: readable(record.reason, 220) as string }
					: {})
			});
		}
	}

	const merges: Array<{ lineageId: string; into: string }> = [];
	for (const entry of Array.isArray(raw.merges) ? raw.merges : []) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const keep = typeof record.keep === 'string' ? byHandle.get(record.keep) : undefined;
		if (!keep) continue;
		for (const handle of Array.isArray(record.absorb) ? record.absorb : []) {
			const other = typeof handle === 'string' ? byHandle.get(handle) : undefined;
			// Only items of one kind merge: a review finding with a review finding, or an audit
			// recommendation repeated by a later audit. A merge closes nothing; both rows stay open
			// under the older item. The radar bundle is its own item and never merges.
			if (!other || other === keep || other.kind !== keep.kind) continue;
			if (keep.source === 'radar' || other.source === 'radar') continue;
			merges.push({ lineageId: other.lineageId, into: keep.lineageId });
		}
	}
	const absorbed = new Set(merges.map((merge) => merge.lineageId));

	const sectionOf = (item: CleanupSynthesisItem): ProjectCleanupSection =>
		sections.get(item.lineageId) ?? item.allowedSections[0] ?? 'note';
	const open = params.items.filter(
		(item) => !resolved.has(item.lineageId) && !absorbed.has(item.lineageId)
	);
	const grouped = new Set<string>();
	const groups: ProjectCleanupGroup[] = [];
	for (const entry of Array.isArray(raw.groups) ? raw.groups : []) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const title = readable(record.title, 120);
		const section = SECTIONS.includes(record.section as ProjectCleanupSection)
			? (record.section as ProjectCleanupSection)
			: null;
		if (!title || !section) continue;
		// A group holds only open items whose own section matches it, each in one group.
		const members = (Array.isArray(record.item_ids) ? record.item_ids : [])
			.map((handle) => (typeof handle === 'string' ? byHandle.get(handle) : undefined))
			.filter(
				(item): item is CleanupSynthesisItem =>
					Boolean(item) &&
					open.includes(item as CleanupSynthesisItem) &&
					!grouped.has((item as CleanupSynthesisItem).lineageId) &&
					sectionOf(item as CleanupSynthesisItem) === section
			);
		if (!members.length) continue;
		for (const member of members) grouped.add(member.lineageId);
		groups.push({
			title,
			section,
			item_ids: members.map((member) => member.lineageId),
			recommendation: readable(record.recommendation, 220)
		});
	}
	groups.push(
		...defaultGroups(
			open.filter((item) => !grouped.has(item.lineageId)),
			sectionOf
		)
	);
	for (const item of open)
		if (!sections.has(item.lineageId)) sections.set(item.lineageId, sectionOf(item));

	const attentionLevel = ATTENTION_LEVELS.includes(
		raw.attention_level as ProjectReviewAttentionLevel
	)
		? (raw.attention_level as ProjectReviewAttentionLevel)
		: defaultAttention(open, sectionOf);
	const asks = parseCleanupAsks({
		raw: raw.asks,
		byHandle,
		settled: new Set([...resolved, ...absorbed]),
		readable
	});
	return {
		synthesis: {
			bottom_line: readable(raw.bottom_line, 240),
			recommendation: readable(raw.recommendation, 240),
			groups,
			open_count: open.length,
			closed_this_pass: [],
			generated_at: params.generatedAt,
			source: 'llm',
			asks
		},
		verdicts,
		merges,
		sections,
		summaries,
		attentionLevel,
		stateSummary: readable(raw.state_summary, 400),
		nextBestAction: readable(raw.next_best_action, 240)
	};
}

function defaultGroups(
	items: readonly CleanupSynthesisItem[],
	sectionOf: (item: CleanupSynthesisItem) => ProjectCleanupSection
): ProjectCleanupGroup[] {
	return SECTIONS.flatMap((section) => {
		const members = items.filter((item) => sectionOf(item) === section);
		return members.length
			? [
					{
						title: SECTION_GROUP_TITLES[section],
						section,
						item_ids: members.map((item) => item.lineageId),
						recommendation: null
					}
				]
			: [];
	});
}

function defaultAttention(
	items: readonly CleanupSynthesisItem[],
	sectionOf: (item: CleanupSynthesisItem) => ProjectCleanupSection
): ProjectReviewAttentionLevel {
	if (!items.length) return 'none';
	return items.some((item) => sectionOf(item) !== 'note') ? 'decision' : 'minor';
}

/** No model answer: keep every item open, in its default section, with code's own summary line. */
export function buildHeuristicCleanupSynthesis(params: {
	items: readonly CleanupSynthesisItem[];
	generatedAt: string;
}): CleanupSynthesisResult {
	const sectionOf = (item: CleanupSynthesisItem) => item.allowedSections[0] ?? 'note';
	const counts = SECTIONS.map(
		(section) =>
			[section, params.items.filter((item) => sectionOf(item) === section).length] as const
	);
	const safe = counts.find(([section]) => section === 'safe_cleanup')?.[1] ?? 0;
	const calls = counts.find(([section]) => section === 'needs_call')?.[1] ?? 0;
	const bottomLine = params.items.length
		? [
				safe ? `${safe} cleanup change${safe === 1 ? '' : 's'} ready to apply` : null,
				calls
					? `${calls} item${calls === 1 ? '' : 's'} need${calls === 1 ? 's' : ''} your call`
					: null
			]
				.filter(Boolean)
				.join('; ') || 'A few notes on this project'
		: null;
	return {
		synthesis: {
			bottom_line: bottomLine,
			recommendation: safe
				? 'Review the ready changes and apply the ones you agree with.'
				: null,
			groups: defaultGroups(params.items, sectionOf),
			open_count: params.items.length,
			closed_this_pass: [],
			generated_at: params.generatedAt,
			source: 'heuristic',
			asks: []
		},
		verdicts: [],
		merges: [],
		sections: new Map(params.items.map((item) => [item.lineageId, sectionOf(item)])),
		summaries: new Map(),
		attentionLevel: defaultAttention(params.items, sectionOf),
		stateSummary: null,
		nextBestAction: null
	};
}
