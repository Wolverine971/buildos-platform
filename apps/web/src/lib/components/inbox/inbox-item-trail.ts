// apps/web/src/lib/components/inbox/inbox-item-trail.ts
//
// "How it got here" for one inbox item (tasker 156): where it came from, which records it
// cited (as links that open in a new tab), and why it asked instead of acting. Pure, and built
// only from what the item already stores (source, dates, evidence refs, review items, the
// auto-apply check), never from reading its wording. The chat's counterpart is
// agent-chat-step-details.ts.

import {
	buildEntityHref,
	type ProjectCleanupAutoApplyBar,
	type ProjectCleanupAutoApplyScores,
	type ProjectCleanupAutoCheck,
	type ProjectCleanupItem,
	type RecordLinkKind
} from '@buildos/shared-types';

export type TrailRecord = {
	key: string;
	/** Short kind word shown to screen readers and in the tooltip. */
	kindLabel: string;
	kind: RecordLinkKind | null;
	title: string;
	/** Null when the record has no page to open (a calendar event, an outside source). */
	href: string | null;
	/** Why the pass cited it, one line. */
	reason: string | null;
};

export type TrailScoreRow = {
	key: keyof ProjectCleanupAutoApplyScores;
	label: string;
	score: number;
	/** Null when the pass recorded scores without the bar (older rows). */
	bar: number | null;
	/** 'max' rows pass when the score is at or under the bar. */
	direction: 'min' | 'max';
	pass: boolean | null;
};

export type TrailCheck = {
	rows: TrailScoreRow[];
	/** One plain line: why it asked, or that every answer cleared its bar. */
	verdict: string;
};

export type InboxItemTrail = {
	/** "Project review · first seen Nov 7 · seen in 3 reviews". */
	origin: string;
	/** Why now, when it says more than the summary already on the card. */
	whyNow: string | null;
	records: TrailRecord[];
	/** How many more records were cited than `records` shows. */
	more: number;
	check: TrailCheck | null;
};

const LINK_KINDS: ReadonlySet<string> = new Set([
	'project',
	'task',
	'document',
	'goal',
	'milestone',
	'plan',
	'risk'
]);

const KIND_LABELS: Record<string, string> = {
	project: 'Project',
	task: 'Task',
	document: 'Doc',
	goal: 'Goal',
	milestone: 'Milestone',
	plan: 'Plan',
	risk: 'Risk',
	calendar_event: 'Event',
	external: 'Source'
};

const SOURCE_LABELS: Record<ProjectCleanupItem['source'], string> = {
	review: 'Project review',
	audit: 'Project audit',
	radar: 'From your recent chats'
};

const MAX_RECORDS = 6;

const SCORE_ROWS: ReadonlyArray<{
	key: keyof ProjectCleanupAutoApplyScores;
	label: string;
	/** How a miss reads after "Asked first:". */
	miss: string;
	barKey: keyof ProjectCleanupAutoApplyBar;
	direction: 'min' | 'max';
}> = [
	{
		key: 'about',
		label: 'Fits the project',
		miss: 'not sure it fits the project',
		barKey: 'minAbout',
		direction: 'min'
	},
	{
		key: 'wanted',
		label: 'You would want it',
		miss: 'not sure you want it',
		barKey: 'minWanted',
		direction: 'min'
	},
	{
		key: 'review',
		label: 'You would want to see it first',
		miss: 'you would likely want to see it first',
		barKey: 'maxReview',
		direction: 'max'
	},
	{
		key: 'safe',
		label: 'Safe without asking',
		miss: 'not sure it is safe without asking',
		barKey: 'minSafe',
		direction: 'min'
	}
];

function shortDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
	return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** The four answers against their bars, as rows the card can draw. */
export function buildScoreRows(
	scores: ProjectCleanupAutoApplyScores,
	bar: ProjectCleanupAutoApplyBar | null | undefined
): TrailScoreRow[] {
	return SCORE_ROWS.map((row) => {
		const score = scores[row.key];
		const limit = bar ? bar[row.barKey] : null;
		return {
			key: row.key,
			label: row.label,
			score,
			bar: limit,
			direction: row.direction,
			pass: limit === null ? null : row.direction === 'min' ? score >= limit : score <= limit
		};
	});
}

/** Why a checked change was asked about instead of applied. */
export function buildHeldCheck(check: ProjectCleanupAutoCheck): TrailCheck {
	const rows = buildScoreRows(check.scores, check.bar);
	const misses = SCORE_ROWS.filter(
		(row) => rows.find((entry) => entry.key === row.key)?.pass === false
	).map((row) => row.miss);
	const verdict =
		check.outcome === 'cap' || !misses.length
			? 'Asked first: it cleared every bar, but that review had already applied its limit.'
			: `Asked first: ${misses.join('; ')}.`;
	return { rows, verdict };
}

/** Why a change was applied without asking ("Done for you"). */
export function buildAppliedCheck(
	scores: ProjectCleanupAutoApplyScores | null | undefined,
	bar: ProjectCleanupAutoApplyBar | null | undefined
): TrailCheck | null {
	if (!scores) return null;
	return {
		rows: buildScoreRows(scores, bar),
		verdict: 'Applied without asking: it cleared every bar, and it can be undone.'
	};
}

type EvidenceLike = {
	entity_type: string;
	entity_id?: string | null;
	title?: string | null;
	reason?: string | null;
	excerpt?: string | null;
};

function recordsFor(item: ProjectCleanupItem, projectId: string): TrailRecord[] {
	return buildTrailRecords(item.evidence_refs ?? [], item.review_items ?? [], projectId);
}

/** Cited records as link chips, from evidence refs and (radar) review items. */
export function buildTrailRecords(
	evidenceRefs: readonly EvidenceLike[],
	reviewItems: readonly EvidenceLike[],
	projectId: string
): TrailRecord[] {
	const seen = new Set<string>();
	const records: TrailRecord[] = [];
	const push = (
		type: string,
		id: string | null | undefined,
		title: string | null | undefined,
		reason: string | null | undefined
	) => {
		const name = (title ?? '').trim();
		if (!name) return;
		const key = id ? `${type}:${id}` : `${type}:${name.toLowerCase()}`;
		if (seen.has(key)) return;
		seen.add(key);
		const kind = LINK_KINDS.has(type) ? (type as RecordLinkKind) : null;
		records.push({
			key,
			kindLabel: KIND_LABELS[type] ?? 'Record',
			kind,
			title: name,
			href:
				kind && id ? buildEntityHref(kind, id, kind === 'project' ? id : projectId) : null,
			reason: reason?.trim() || null
		});
	};
	for (const ref of evidenceRefs) {
		if (ref && typeof ref.entity_type === 'string') {
			push(ref.entity_type, ref.entity_id, ref.title, ref.reason ?? ref.excerpt);
		}
	}
	for (const review of reviewItems) {
		if (review && typeof review.entity_type === 'string') {
			push(review.entity_type, review.entity_id, review.title, review.reason);
		}
	}
	// A record cited by name only is the same one when another citation carries its id.
	const linked = new Set(
		records.filter((record) => record.href).map((record) => nameKey(record))
	);
	return records.filter((record) => record.href || !linked.has(nameKey(record)));
}

function nameKey(record: TrailRecord): string {
	return `${record.kindLabel}:${record.title.toLowerCase()}`;
}

export function buildCleanupItemTrail(item: ProjectCleanupItem, projectId: string): InboxItemTrail {
	const firstSeen = shortDate(item.first_seen_at);
	const origin = [
		SOURCE_LABELS[item.source] ?? 'Project review',
		firstSeen ? `first seen ${firstSeen}` : null,
		item.seen_count > 1 ? `seen in ${item.seen_count} reviews` : null
	]
		.filter(Boolean)
		.join(' · ');
	const whyNow =
		item.why_now && !sameText(item.why_now, item.summary) && !sameText(item.why_now, item.title)
			? item.why_now.trim()
			: null;
	const all = recordsFor(item, projectId);
	return {
		origin,
		whyNow,
		records: all.slice(0, MAX_RECORDS),
		more: Math.max(0, all.length - MAX_RECORDS),
		check: item.auto_check ? buildHeldCheck(item.auto_check) : null
	};
}
