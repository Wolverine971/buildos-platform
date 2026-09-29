// packages/agentic-chat-runtime/src/tools/project-cleanup-reads.ts
//
// Tasker 112, want #4: project chat starts from the nightly "Project cleanup" change set
// instead of re-deriving it. On 2026-09-29 "what's out of date?" cost $0.13 over two turns,
// about 18 reads, and still missed about 40% of what the nightly review had already found.
//
// The view is the one the AI Inbox "Project cleanup" card shows
// (`loadProjectCleanupView` in shared-agent-ops). This module projects it into a
// token-lean payload that fits the model's tool-result budget without the generic
// truncation guard cutting it mid-item.
//
// Verification is off (`verify: false`). Verifying re-resolves every executable row
// against the live project (about five queries per row, so ~100 for a 20-item set) on
// every cleanup question. Chat only presents and builds on the set. The card re-verifies
// each change, hash-pinned, before it applies anything, and the next review pass closes
// items whose change no longer applies.
import {
	isValidUUID,
	type ProjectCleanupItem,
	type ProjectCleanupSection,
	type ProjectCleanupSource,
	type ProjectCleanupView
} from '@buildos/shared-types';
import { loadProjectCleanupView } from '@buildos/shared-agent-ops/project-cleanup';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

export interface SharedGetProjectCleanupArgs {
	project_id: string;
}

export type ProjectCleanupChatRecordV1 = {
	type: string;
	id?: string;
	title: string;
	/** Radar concerns only: one line on why the record looks out of date. */
	reason?: string;
};

export type ProjectCleanupChatItemV1 = {
	/** Lineage id (the radar bundle's suggestion id). */
	id: string;
	source: ProjectCleanupSource;
	title: string;
	summary?: string;
	/** True when approving the item in the card applies a change. */
	executable: boolean;
	/** Operation-derived copy, present only when the view was verified. */
	verified?: string[];
	seen_count: number;
	first_seen_at: string;
	records: ProjectCleanupChatRecordV1[];
};

export type ProjectCleanupChatGroupV1 = {
	title: string;
	section: ProjectCleanupSection;
	recommendation?: string;
	items: ProjectCleanupChatItemV1[];
};

export type ProjectCleanupChatPayloadV1 = {
	project_id: string;
	/** When the latest review pass synthesized the set; null before the first roll-up. */
	synthesized_at: string | null;
	bottom_line: string | null;
	recommendation: string | null;
	counts: ProjectCleanupView['counts'];
	groups: ProjectCleanupChatGroupV1[];
	recently_closed: Array<{ title: string; reason: string; detail?: string }>;
	/** Items left out to fit the budget; the card lists them all. */
	omitted_items?: number;
	message: string;
};

/**
 * The loop gives this tool the 12,000-char web/email/calendar budget (one read stands in
 * for the ~18 it replaces), and its guard cuts at 11,600 after the notice margin. 11,000
 * leaves room for the timezone projection to lengthen each instant. A 12-item set keeps
 * its summaries and three records per item at this size.
 */
export const PROJECT_CLEANUP_CHAT_BUDGET_CHARS = 11_000;

type ProjectionLevel = {
	title: number;
	summary: number;
	records: number;
	concerns: number;
	recordTitle: number;
	reason: number;
	groupRecommendation: number;
	closed: number;
};

/** Each level trades detail for coverage; items are dropped only after the last one. */
const PROJECTION_LEVELS: readonly ProjectionLevel[] = [
	{
		title: 140,
		summary: 200,
		records: 4,
		concerns: 8,
		recordTitle: 80,
		reason: 100,
		groupRecommendation: 200,
		closed: 5
	},
	{
		title: 120,
		summary: 140,
		records: 3,
		concerns: 6,
		recordTitle: 70,
		reason: 80,
		groupRecommendation: 140,
		closed: 4
	},
	{
		title: 100,
		summary: 90,
		records: 2,
		concerns: 4,
		recordTitle: 60,
		reason: 60,
		groupRecommendation: 100,
		closed: 3
	},
	{
		title: 90,
		summary: 0,
		records: 1,
		concerns: 3,
		recordTitle: 50,
		reason: 0,
		groupRecommendation: 0,
		closed: 2
	}
];

const CARD_NOTE =
	'The user applies or dismisses each item in the AI Inbox "Project cleanup" card, which re-checks every change before applying it. Build on this list: confirm items against their records when it matters and add what it misses. Do not re-propose its items as new findings; point the user to the card to apply them.';

function clip(value: string | null | undefined, max: number): string | undefined {
	if (!value || max <= 0) return undefined;
	const text = value.replace(/\s+/g, ' ').trim();
	if (!text) return undefined;
	return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function projectRecords(
	item: ProjectCleanupItem,
	projectId: string,
	level: ProjectionLevel
): ProjectCleanupChatRecordV1[] {
	if (item.review_items?.length) {
		return item.review_items.slice(0, level.concerns).map((concern) => {
			const reason = clip(concern.reason, level.reason);
			return {
				type: concern.entity_type,
				id: concern.entity_id,
				title: clip(concern.title, level.recordTitle) ?? 'Untitled',
				...(reason ? { reason } : {})
			};
		});
	}
	return item.evidence_refs
		.filter((ref) => !(ref.entity_type === 'project' && ref.entity_id === projectId))
		.slice(0, level.records)
		.map((ref) => ({
			type: ref.entity_type,
			...(ref.entity_id ? { id: ref.entity_id } : {}),
			title: clip(ref.title, level.recordTitle) ?? 'Untitled'
		}));
}

function projectItem(
	item: ProjectCleanupItem,
	projectId: string,
	level: ProjectionLevel
): ProjectCleanupChatItemV1 {
	const title = clip(item.title, level.title) ?? 'Project cleanup item';
	const verified = [
		...new Set(
			item.rows
				.map((row) => row.verified_headline)
				.filter((headline): headline is string => Boolean(headline))
				.filter((headline) => headline !== item.title)
				.map((headline) => clip(headline, level.title)!)
		)
	];
	const summary = clip(item.summary ?? item.why_now, level.summary);
	return {
		id: item.id,
		source: item.source,
		title,
		...(summary ? { summary } : {}),
		executable: item.executable,
		...(verified.length ? { verified } : {}),
		seen_count: item.seen_count,
		first_seen_at: item.first_seen_at,
		records: projectRecords(item, projectId, level)
	};
}

function describeCounts(counts: ProjectCleanupView['counts']): string {
	const parts = [
		counts.safe_cleanup ? `${counts.safe_cleanup} ready to apply` : null,
		counts.needs_call ? `${counts.needs_call} need the user's call` : null,
		counts.note ? `${counts.note} worth knowing` : null
	].filter(Boolean);
	return parts.join(', ');
}

function buildMessage(view: ProjectCleanupView): string {
	if (view.counts.total === 0) {
		return view.synthesized_at
			? 'No open cleanup items: the nightly Project Review has nothing flagged for this project. Check the records directly if the user asks about something specific.'
			: 'No Project cleanup set exists for this project yet (the nightly Project Review has not flagged anything). Check the records directly.';
	}
	const noun = view.counts.total === 1 ? 'item' : 'items';
	return `${view.counts.total} open cleanup ${noun} from the nightly Project Review (${describeCounts(view.counts)}). ${CARD_NOTE}`;
}

function projectAtLevel(
	view: ProjectCleanupView,
	level: ProjectionLevel,
	maxItems: number
): ProjectCleanupChatPayloadV1 {
	const itemsById = new Map(view.items.map((item) => [item.id, item]));
	let remaining = maxItems;
	const groups: ProjectCleanupChatGroupV1[] = [];
	for (const group of view.groups) {
		if (remaining <= 0) break;
		const items = group.item_ids
			.map((id) => itemsById.get(id))
			.filter((item): item is ProjectCleanupItem => Boolean(item))
			.slice(0, remaining)
			.map((item) => projectItem(item, view.project_id, level));
		if (!items.length) continue;
		remaining -= items.length;
		const recommendation = clip(group.recommendation, level.groupRecommendation);
		groups.push({
			title: group.title,
			section: group.section,
			...(recommendation ? { recommendation } : {}),
			items
		});
	}
	const shown = groups.reduce((total, group) => total + group.items.length, 0);
	const listed = view.groups.reduce(
		(total, group) => total + group.item_ids.filter((id) => itemsById.has(id)).length,
		0
	);
	return {
		project_id: view.project_id,
		synthesized_at: view.synthesized_at,
		bottom_line: clip(view.bottom_line, 280) ?? null,
		recommendation: clip(view.recommendation, 280) ?? null,
		counts: view.counts,
		groups,
		recently_closed: view.recently_closed.slice(0, level.closed).map((closed) => {
			const detail = clip(closed.detail, 120);
			return {
				title: clip(closed.title, 100) ?? 'Closed item',
				reason: closed.reason,
				...(detail ? { detail } : {})
			};
		}),
		...(listed > shown ? { omitted_items: listed - shown } : {}),
		message:
			listed > shown
				? `${buildMessage(view)} ${listed - shown} lower-priority items are left out here; the card lists them.`
				: buildMessage(view)
	};
}

/**
 * Pure: the chat projection of one project's cleanup change set. Every item keeps its
 * id, group, and records at the first level that fits `budgetChars`; items are dropped
 * from the end (notes before judgment calls before ready changes) only when even the
 * leanest level does not fit, and the payload then says how many were left out.
 */
export function projectProjectCleanupViewForChat(
	view: ProjectCleanupView,
	budgetChars = PROJECT_CLEANUP_CHAT_BUDGET_CHARS
): ProjectCleanupChatPayloadV1 {
	const totalItems = view.items.length;
	const fits = (payload: ProjectCleanupChatPayloadV1) =>
		JSON.stringify(payload).length <= budgetChars;
	for (const level of PROJECTION_LEVELS) {
		const payload = projectAtLevel(view, level, totalItems);
		if (fits(payload)) return payload;
	}
	const leanest = PROJECTION_LEVELS[PROJECTION_LEVELS.length - 1]!;
	let payload = projectAtLevel(view, leanest, totalItems);
	for (let maxItems = totalItems - 1; maxItems >= 1 && !fits(payload); maxItems -= 1) {
		payload = projectAtLevel(view, leanest, maxItems);
	}
	return payload;
}

/**
 * `get_project_cleanup`: the project's open cleanup set, read under the actor's project
 * read access (the same `project_suggestions` / `project_loop_runs` / `project_audits`
 * read RLS grants). The worker's client is service-role, so the access port gates it.
 */
export async function getProjectCleanup(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetProjectCleanupArgs
): Promise<ProjectCleanupChatPayloadV1> {
	const projectId = typeof args?.project_id === 'string' ? args.project_id.trim() : '';
	if (!projectId) throw new Error('project_id is required for get_project_cleanup');
	if (!isValidUUID(projectId)) throw new Error('Invalid project_id: expected UUID');

	await context.access.assertProjectAccess(projectId, 'read');
	const view = await loadProjectCleanupView(context.client as never, projectId, {
		verify: false
	});
	return projectProjectCleanupViewForChat(view);
}
