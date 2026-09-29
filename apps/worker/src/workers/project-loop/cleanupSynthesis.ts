// apps/worker/src/workers/project-loop/cleanupSynthesis.ts
//
// The roll-up call's pure parts (tasker 112). One model call per pass reads every open cleanup
// item next to the current state of what it touches and returns structured verdicts: still true
// or resolved, which items are the same finding, which section each belongs in, and how to group
// them on the card. Items reach the model by short handles ("i1"), never by uuid, and every
// verdict is mapped back through the handle table: an unknown handle is ignored, and code's
// section floor still decides what may sit in "Safe cleanup".
import type {
	ProjectCleanupGroup,
	ProjectCleanupSection,
	ProjectCleanupSource,
	ProjectCleanupSynthesis,
	ProjectReviewAttentionLevel
} from '@buildos/shared-types';
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
	'  "groups": [ { "title": string, "section": "safe_cleanup"|"needs_call"|"note", "item_ids": ["i1","i2"], "recommendation": string|null } ]',
	'} }'
].join('\n');

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
	const verdicts: RollupVerdict[] = [];
	const sections = new Map<string, ProjectCleanupSection>();
	const summaries = new Map<string, string>();
	const resolved = new Set<string>();

	for (const entry of Array.isArray(raw.items) ? raw.items : []) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const item = typeof record.id === 'string' ? byHandle.get(record.id) : undefined;
		if (!item) continue;
		const summary = text(record.summary, 220);
		if (summary) summaries.set(item.lineageId, summary);
		if (
			typeof record.section === 'string' &&
			item.allowedSections.includes(record.section as ProjectCleanupSection)
		)
			sections.set(item.lineageId, record.section as ProjectCleanupSection);
		if (!item.judged) continue;
		if (record.verdict === 'resolved') {
			const reason = text(record.reason, 220);
			// A close always carries its reason; a bare "resolved" is no opinion.
			if (!reason) continue;
			verdicts.push({ lineageId: item.lineageId, verdict: 'resolved', reason });
			resolved.add(item.lineageId);
		} else if (record.verdict === 'still_true') {
			verdicts.push({
				lineageId: item.lineageId,
				verdict: 'still_true',
				...(text(record.reason, 220) ? { reason: text(record.reason, 220) as string } : {})
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
		const title = text(record.title, 120);
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
			recommendation: text(record.recommendation, 220)
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
	return {
		synthesis: {
			bottom_line: text(raw.bottom_line, 240),
			recommendation: text(raw.recommendation, 240),
			groups,
			open_count: open.length,
			closed_this_pass: [],
			generated_at: params.generatedAt,
			source: 'llm'
		},
		verdicts,
		merges,
		sections,
		summaries,
		attentionLevel,
		stateSummary: text(raw.state_summary, 400),
		nextBestAction: text(raw.next_best_action, 240)
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
			source: 'heuristic'
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
