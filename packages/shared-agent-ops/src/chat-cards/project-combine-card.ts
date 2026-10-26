// packages/shared-agent-ops/src/chat-cards/project-combine-card.ts
//
// The combine card (tasker 122, WP5): `propose_project_combine` proposes
// folding a source project into a destination (the 10-01 fold engine,
// supabase/migrations/20260930220000_project_fold_foundation.sql and the
// 20261017170000 readiness companion). The card names what moves, who loses or
// gains access, which past events stay behind and which upcoming events block.
// The member policy is chosen on the click, never by the model. Undo is the
// unfold (20260930220100_project_unfold.sql).
//
// The worker builds the payload from its own fold preview; the web re-previews
// at click time and compares `visibleDigest`s. Client-safe: no Node imports.
// Structured fields only.
import type {
	ProposalCardEnvelopeV1,
	ProposalCardKindSpecV1,
	ProposalCardResolutionV1,
	ProposalCardState,
	ProposalCardUndoV1
} from './proposal-card';
import {
	capped,
	code,
	codes,
	count,
	digestOf,
	isRecord,
	parseDuplicateCheckRef,
	parseProjectRef,
	PROPOSAL_CARD_LIST_LIMIT,
	PROPOSAL_CARD_TTL_MS,
	PROPOSAL_CARD_UNDO_TTL_MS,
	sortedStrings,
	text,
	timestamp,
	uuid,
	type ProjectRefV1,
	type ProposalDuplicateCheckRefV1
} from './card-fields';

export const PROJECT_COMBINE_TOOL_NAME = 'propose_project_combine' as const;
export const PROJECT_COMBINE_CHOICES = [
	'combine_remove_members',
	'combine_add_members',
	'combine',
	'cancel'
] as const;
export type ProjectCombineChoice = (typeof PROJECT_COMBINE_CHOICES)[number];

// ---------------------------------------------------------------------------
// Fold preview (onto_project_fold_preview) parsing.

export type FoldImpactMemberV1 = {
	actor_id: string;
	name: string | null;
	role_key: string;
	access: string;
	/** Access the member already has to the destination (null: none). */
	destination_access: string | null;
	named_for_addition: boolean;
};

export type FoldEventRefV1 = { id: string; title: string; start_at: string | null };

export type FoldImpactV1 = {
	confirmation_token: string;
	source: ProjectRefV1 & { archived: boolean; parent_project_id: string | null };
	destination: ProjectRefV1;
	folder_title: string;
	/** Raw SQL counts (table names and derived keys). */
	counts: Record<string, number>;
	members: FoldImpactMemberV1[];
	members_missing: string[];
	member_additions: string[];
	blockers: string[];
	past_events_left_with_source: FoldEventRefV1[];
	upcoming_standalone_events: FoldEventRefV1[];
	connector_grants_not_copied: {
		project_permissions: number;
		oauth_grants_naming_source: number;
	};
	/** Project chats that follow the combine (info.repointed.chat_sessions). */
	chats_follow: number;
};

function parseEvents(value: unknown): FoldEventRefV1[] | null {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) return null;
	const events: FoldEventRefV1[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return null;
		const id = uuid(entry.id);
		if (!id) return null;
		events.push({
			id,
			title: text(entry.title) ?? 'Untitled event',
			start_at: timestamp(entry.start_at)
		});
	}
	return events;
}

function parseUuids(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const ids: string[] = [];
	for (const entry of value) {
		const id = uuid(entry);
		if (!id) return null;
		ids.push(id);
	}
	return ids;
}

function parseCounts(value: unknown): Record<string, number> | null {
	if (!isRecord(value)) return null;
	const counts: Record<string, number> = {};
	for (const [key, raw] of Object.entries(value)) {
		const parsed = count(raw);
		if (parsed !== null) counts[key] = parsed;
	}
	return counts;
}

/**
 * The fold preview RPC's response ({confirmation_token, impact, info}), or null
 * when the shape is unusable. Tolerates the pre-readiness impact (no event lists).
 */
export function parseFoldImpactV1(value: unknown): FoldImpactV1 | null {
	if (!isRecord(value)) return null;
	const token = text(value.confirmation_token);
	const impact = isRecord(value.impact) ? value.impact : null;
	if (!token || !impact) return null;
	const sourceRow = isRecord(impact.source) ? impact.source : null;
	const source = parseProjectRef(sourceRow ? { ...sourceRow, name: sourceRow.name ?? '' } : null);
	const destinationRow = isRecord(impact.destination) ? impact.destination : null;
	const destination = parseProjectRef(
		destinationRow ? { ...destinationRow, name: destinationRow.name ?? '' } : null
	);
	const counts = parseCounts(impact.counts);
	const missing = parseUuids(impact.members_missing);
	const additions = parseUuids(impact.member_additions ?? []);
	const blockers = codes(impact.blockers);
	const past = parseEvents(impact.past_events_left_with_source);
	const upcoming = parseEvents(impact.upcoming_standalone_events);
	if (
		!source ||
		!destination ||
		!counts ||
		!missing ||
		!additions ||
		!blockers ||
		!past ||
		!upcoming ||
		!Array.isArray(impact.members)
	)
		return null;
	const members: FoldImpactMemberV1[] = [];
	for (const entry of impact.members) {
		if (!isRecord(entry)) return null;
		const actorId = uuid(entry.actor_id);
		if (!actorId) return null;
		members.push({
			actor_id: actorId,
			name: text(entry.name),
			role_key: text(entry.role_key) ?? 'editor',
			access: text(entry.access) ?? 'read',
			destination_access: text(entry.destination_access),
			named_for_addition: entry.named_for_addition === true
		});
	}
	const grants = isRecord(impact.connector_grants_not_copied)
		? impact.connector_grants_not_copied
		: {};
	const info = isRecord(value.info) ? value.info : {};
	const repointed = isRecord(info.repointed) ? info.repointed : {};
	return {
		confirmation_token: token,
		source: {
			...source,
			archived: sourceRow?.archived === true,
			parent_project_id: uuid(sourceRow?.parent_project_id)
		},
		destination,
		folder_title: text(impact.folder_title) ?? `From ${source.name}`,
		counts,
		members,
		members_missing: missing,
		member_additions: additions,
		blockers,
		past_events_left_with_source: past,
		upcoming_standalone_events: upcoming,
		connector_grants_not_copied: {
			project_permissions: count(grants.project_permissions) ?? 0,
			oauth_grants_naming_source: count(grants.oauth_grants_naming_source) ?? 0
		},
		chats_follow: count(repointed.chat_sessions) ?? 0
	};
}

/**
 * What a blocker means for the card:
 * - `members`: resolved by the click (remove or add the people the destination lacks);
 * - `fixable`: the user can clear it from chat (move or delete upcoming events,
 *   settle a pending proposal), so the card shows with Check again;
 * - `hard`: everything else (limits, policy drift, recurring items, calendar or
 *   asset rollout, event links, sub-projects, unknown codes): no card.
 */
export function classifyFoldBlocker(blocker: string): 'members' | 'fixable' | 'hard' {
	if (blocker === 'members_missing') return 'members';
	if (blocker === 'standalone_events_not_supported' || blocker === 'pending_document_proposal')
		return 'fixable';
	return 'hard';
}

// ---------------------------------------------------------------------------
// The card payload.

export type ProjectCombineMemberV1 = {
	actor_id: string;
	name: string;
	role_key: string;
	access: string;
	/** Owners can't be removed; the card then offers only "add". */
	removable: boolean;
};

export const PROJECT_COMBINE_COUNT_KEYS = [
	'documents',
	'tasks',
	'goals',
	'plans',
	'milestones',
	'risks',
	'requirements',
	'metrics',
	'insights',
	'signals',
	'sources',
	'assets',
	'links',
	'comments',
	'dated_tasks',
	'past_events_left_with_source',
	'upcoming_events',
	'pending_proposals',
	'assignees_removed'
] as const;
export type ProjectCombineCountKey = (typeof PROJECT_COMBINE_COUNT_KEYS)[number];
export type ProjectCombineCountsV1 = Record<ProjectCombineCountKey, number>;

/**
 * What moves, independent of the member choice. Adding members changes
 * `assignees_removed`, and blockers are compared separately, so these are what
 * "require the same counts" compares after members are removed or added.
 */
const CONTENT_COUNT_KEYS: readonly ProjectCombineCountKey[] = PROJECT_COMBINE_COUNT_KEYS.filter(
	(key) => !['assignees_removed', 'upcoming_events', 'pending_proposals'].includes(key)
);

const SQL_COUNT_KEYS: Record<ProjectCombineCountKey, string> = {
	documents: 'onto_documents',
	tasks: 'onto_tasks',
	goals: 'onto_goals',
	plans: 'onto_plans',
	milestones: 'onto_milestones',
	risks: 'onto_risks',
	requirements: 'onto_requirements',
	metrics: 'onto_metrics',
	insights: 'onto_insights',
	signals: 'onto_signals',
	sources: 'onto_sources',
	assets: 'onto_assets',
	links: 'onto_edges',
	comments: 'onto_comments',
	dated_tasks: 'dated_tasks',
	past_events_left_with_source: 'past_events_left_with_source',
	upcoming_events: 'upcoming_standalone_events',
	pending_proposals: 'pending_proposals',
	assignees_removed: 'assignees_removed'
};

export type ProjectCombineBlockerV1 = { code: string; fixable: boolean };

export type ProjectCombineProposalPayloadV1 = {
	version: 1;
	source: ProjectRefV1;
	destination: ProjectRefV1;
	/** The "From <source>" folder the source's documents land in. */
	folder_title: string;
	counts: ProjectCombineCountsV1;
	/** Always true: the source is archived with a forwarding link. */
	source_archived_with_forwarding: true;
	/** Project chats that continue in the destination. */
	chats_follow: number;
	/** People who can open the source but not the destination. */
	members_missing: ProjectCombineMemberV1[];
	members_missing_total: number;
	past_events_left_with_source: FoldEventRefV1[];
	past_events_total: number;
	upcoming_events: FoldEventRefV1[];
	upcoming_events_total: number;
	/** Everything but members_missing (the click resolves that). */
	blockers: ProjectCombineBlockerV1[];
	connector_grants_not_copied: {
		project_permissions: number;
		oauth_grants_naming_source: number;
	};
	checked_at: string;
	duplicate_check: ProposalDuplicateCheckRefV1 | null;
	note: string | null;
};

export function projectCombinePayloadFromImpact(
	impact: FoldImpactV1,
	extras: {
		checkedAt: string;
		duplicateCheck?: ProposalDuplicateCheckRefV1 | null;
		note?: string | null;
	}
): ProjectCombineProposalPayloadV1 {
	const counts = Object.fromEntries(
		PROJECT_COMBINE_COUNT_KEYS.map((key) => [key, impact.counts[SQL_COUNT_KEYS[key]] ?? 0])
	) as ProjectCombineCountsV1;
	const byActor = new Map(impact.members.map((member) => [member.actor_id, member]));
	const missing = impact.members_missing.map((actorId): ProjectCombineMemberV1 => {
		const member = byActor.get(actorId);
		return {
			actor_id: actorId,
			name: member?.name?.trim() || 'Someone',
			role_key: member?.role_key ?? 'editor',
			access: member?.access ?? 'read',
			removable: member ? member.role_key !== 'owner' : false
		};
	});
	const members = capped(missing, PROPOSAL_CARD_LIST_LIMIT);
	const past = capped(impact.past_events_left_with_source, PROPOSAL_CARD_LIST_LIMIT);
	const upcoming = capped(impact.upcoming_standalone_events, PROPOSAL_CARD_LIST_LIMIT);
	return {
		version: 1,
		source: { id: impact.source.id, name: impact.source.name },
		destination: { ...impact.destination },
		folder_title: impact.folder_title,
		counts,
		source_archived_with_forwarding: true,
		chats_follow: impact.chats_follow,
		members_missing: members.items,
		members_missing_total: members.total,
		past_events_left_with_source: past.items,
		// The SQL lists at most 10 past events; the count is exact.
		past_events_total: Math.max(past.total, counts.past_events_left_with_source),
		upcoming_events: upcoming.items,
		upcoming_events_total: Math.max(upcoming.total, counts.upcoming_events),
		blockers: impact.blockers
			.filter((blocker) => classifyFoldBlocker(blocker) !== 'members')
			.map((blocker) => ({
				code: blocker,
				fixable: classifyFoldBlocker(blocker) === 'fixable'
			})),
		connector_grants_not_copied: { ...impact.connector_grants_not_copied },
		checked_at: extras.checkedAt,
		duplicate_check: extras.duplicateCheck ?? null,
		note: extras.note ?? null
	};
}

function parseMembers(value: unknown): ProjectCombineMemberV1[] | null {
	if (!Array.isArray(value) || value.length > PROPOSAL_CARD_LIST_LIMIT) return null;
	const members: ProjectCombineMemberV1[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return null;
		const actorId = uuid(entry.actor_id);
		const name = text(entry.name);
		if (!actorId || name === null) return null;
		members.push({
			actor_id: actorId,
			name,
			role_key: text(entry.role_key) ?? 'editor',
			access: text(entry.access) ?? 'read',
			removable: entry.removable === true
		});
	}
	return members;
}

export function parseProjectCombinePayload(value: unknown): ProjectCombineProposalPayloadV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const source = parseProjectRef(value.source);
	const destination = parseProjectRef(value.destination);
	const countsRow = isRecord(value.counts) ? value.counts : null;
	const members = parseMembers(value.members_missing);
	const past = parseEvents(value.past_events_left_with_source);
	const upcoming = parseEvents(value.upcoming_events);
	const checkedAt = timestamp(value.checked_at);
	const folderTitle = text(value.folder_title);
	if (
		!source ||
		!destination ||
		source.id === destination.id ||
		!countsRow ||
		!members ||
		!past ||
		!upcoming ||
		past.length > PROPOSAL_CARD_LIST_LIMIT ||
		upcoming.length > PROPOSAL_CARD_LIST_LIMIT ||
		!checkedAt ||
		folderTitle === null ||
		!Array.isArray(value.blockers)
	)
		return null;
	const counts = {} as ProjectCombineCountsV1;
	for (const key of PROJECT_COMBINE_COUNT_KEYS) {
		const parsed = count(countsRow[key]);
		if (parsed === null) return null;
		counts[key] = parsed;
	}
	const blockers: ProjectCombineBlockerV1[] = [];
	for (const entry of value.blockers) {
		const blockerCode = isRecord(entry) ? code(entry.code) : null;
		if (!blockerCode || !isRecord(entry)) return null;
		blockers.push({ code: blockerCode, fixable: entry.fixable === true });
	}
	const total = (raw: unknown, listed: number): number | null => {
		const parsed = count(raw);
		return parsed !== null && parsed >= listed ? parsed : null;
	};
	const membersTotal = total(value.members_missing_total, members.length);
	const pastTotal = total(value.past_events_total, past.length);
	const upcomingTotal = total(value.upcoming_events_total, upcoming.length);
	if (membersTotal === null || pastTotal === null || upcomingTotal === null) return null;
	const grants = isRecord(value.connector_grants_not_copied)
		? value.connector_grants_not_copied
		: {};
	return {
		version: 1,
		source,
		destination,
		folder_title: folderTitle,
		counts,
		source_archived_with_forwarding: true,
		chats_follow: count(value.chats_follow) ?? 0,
		members_missing: members,
		members_missing_total: membersTotal,
		past_events_left_with_source: past,
		past_events_total: pastTotal,
		upcoming_events: upcoming,
		upcoming_events_total: upcomingTotal,
		blockers,
		connector_grants_not_copied: {
			project_permissions: count(grants.project_permissions) ?? 0,
			oauth_grants_naming_source: count(grants.oauth_grants_naming_source) ?? 0
		},
		checked_at: checkedAt,
		duplicate_check: parseDuplicateCheckRef(value.duplicate_check),
		note: text(value.note)
	};
}

/** visibleDigest: everything a click depends on, by id, count and code. */
export function projectCombineDigest(payload: ProjectCombineProposalPayloadV1): string {
	return digestOf({
		kind: 'project_combine',
		source: payload.source.id,
		destination: payload.destination.id,
		counts: { ...payload.counts },
		members_missing: sortedStrings(
			payload.members_missing.map(
				(member) => `${member.actor_id}:${member.removable ? 'removable' : 'kept'}`
			)
		),
		members_missing_total: payload.members_missing_total,
		blockers: sortedStrings(payload.blockers.map((blocker) => blocker.code)),
		upcoming_events: sortedStrings(payload.upcoming_events.map((event) => event.id)),
		upcoming_events_total: payload.upcoming_events_total,
		past_events: sortedStrings(payload.past_events_left_with_source.map((event) => event.id)),
		past_events_total: payload.past_events_total,
		connector_grants_not_copied: { ...payload.connector_grants_not_copied }
	});
}

/** What moves, for "the same counts" after a member change (see CONTENT_COUNT_KEYS). */
export function projectCombineContentDigest(payload: ProjectCombineProposalPayloadV1): string {
	return digestOf({
		source: payload.source.id,
		destination: payload.destination.id,
		counts: Object.fromEntries(CONTENT_COUNT_KEYS.map((key) => [key, payload.counts[key]])),
		past_events: sortedStrings(payload.past_events_left_with_source.map((event) => event.id))
	});
}

// ---------------------------------------------------------------------------
// Receipts.

export type ProjectCombinePersonV1 = { actor_id: string; name: string };

export type ProjectCombineReceiptV1 = {
	/** Set once an apply was attempted (deterministic per card). */
	fold_id: string | null;
	source_project_id: string;
	destination_project_id: string;
	folder_document_id: string | null;
	/** Removed from the source before combining; may be set when the combine then failed. */
	members_removed: ProjectCombinePersonV1[];
	/** Added to the destination by the combine. */
	members_added: ProjectCombinePersonV1[];
	replayed: boolean;
};

export type ProjectCombineUndoReceiptV1 = {
	fold_id: string;
	moved_back: number;
	staying: number;
	folder_removed: boolean;
	parent_restored: boolean;
	members_added_by_fold_stay: number;
	replayed: boolean;
};

function parsePeople(value: unknown): ProjectCombinePersonV1[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value)) return null;
	const people: ProjectCombinePersonV1[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) return null;
		const actorId = uuid(entry.actor_id);
		if (!actorId) return null;
		people.push({ actor_id: actorId, name: text(entry.name) ?? 'Someone' });
	}
	return people;
}

function parseCombineReceipt(value: unknown): ProjectCombineReceiptV1 | null {
	if (!isRecord(value)) return null;
	const source = uuid(value.source_project_id);
	const destination = uuid(value.destination_project_id);
	const removed = parsePeople(value.members_removed);
	const added = parsePeople(value.members_added);
	if (!source || !destination || !removed || !added) return null;
	return {
		fold_id: uuid(value.fold_id),
		source_project_id: source,
		destination_project_id: destination,
		folder_document_id: uuid(value.folder_document_id),
		members_removed: removed,
		members_added: added,
		replayed: value.replayed === true
	};
}

function parseCombineUndoReceipt(value: unknown): ProjectCombineUndoReceiptV1 | null {
	if (!isRecord(value)) return null;
	const foldId = uuid(value.fold_id);
	if (!foldId) return null;
	return {
		fold_id: foldId,
		moved_back: count(value.moved_back) ?? 0,
		staying: count(value.staying) ?? 0,
		folder_removed: value.folder_removed === true,
		parent_restored: value.parent_restored === true,
		members_added_by_fold_stay: count(value.members_added_by_fold_stay) ?? 0,
		replayed: value.replayed === true
	};
}

// ---------------------------------------------------------------------------
// Unfold preview (onto_project_unfold_preview) and the Undo view.

export type UnfoldStayingItemV1 = {
	id: string;
	table: string;
	reason: string;
	title: string | null;
};

export type UnfoldImpactV1 = {
	confirmation_token: string;
	fold_id: string;
	source: ProjectRefV1;
	destination: ProjectRefV1;
	/** Rows coming back, by table. */
	returning: Record<string, number>;
	staying: UnfoldStayingItemV1[];
	documents_filed_in_source: number;
	folder_removed: boolean;
	members_added_by_fold_stay: number;
	tasks_to_reconcile: number;
	unarchive: boolean;
	parent_project_id: string | null;
	parent_not_restored: boolean;
	blockers: string[];
};

export function parseUnfoldImpactV1(value: unknown): UnfoldImpactV1 | null {
	if (!isRecord(value)) return null;
	const token = text(value.confirmation_token);
	const impact = isRecord(value.impact) ? value.impact : null;
	if (!token || !impact) return null;
	const foldId = uuid(impact.fold_id);
	const sourceRow = isRecord(impact.source) ? impact.source : null;
	const destinationRow = isRecord(impact.destination) ? impact.destination : null;
	const source = parseProjectRef(sourceRow ? { ...sourceRow, name: sourceRow.name ?? '' } : null);
	const destination = parseProjectRef(
		destinationRow ? { ...destinationRow, name: destinationRow.name ?? '' } : null
	);
	const returning = parseCounts(impact.returning);
	const blockers = codes(impact.blockers);
	if (!foldId || !source || !destination || !returning || !blockers) return null;
	if (!Array.isArray(impact.staying)) return null;
	const staying: UnfoldStayingItemV1[] = [];
	for (const entry of impact.staying) {
		if (!isRecord(entry)) return null;
		const id = uuid(entry.id);
		const table = code(entry.table);
		const reason = code(entry.reason);
		if (!id || !table || !reason) return null;
		staying.push({ id, table, reason, title: text(entry.title) });
	}
	const restore = isRecord(impact.source_restore) ? impact.source_restore : {};
	return {
		confirmation_token: token,
		fold_id: foldId,
		source,
		destination,
		returning,
		staying,
		documents_filed_in_source: count(impact.documents_filed_in_source) ?? 0,
		folder_removed: impact.folder_removed === true,
		members_added_by_fold_stay: Array.isArray(impact.members_added_by_fold_stay)
			? impact.members_added_by_fold_stay.length
			: 0,
		tasks_to_reconcile: count(impact.tasks_to_reconcile) ?? 0,
		unarchive: restore.unarchive === true,
		parent_project_id: uuid(restore.parent_project_id),
		parent_not_restored: restore.parent_not_restored === true,
		blockers
	};
}

/** What the Undo confirm shows: what comes back and what stays. */
export type ProjectCombineUndoViewV1 = {
	version: 1;
	fold_id: string;
	source: ProjectRefV1;
	destination: ProjectRefV1;
	returning: Record<string, number>;
	returning_total: number;
	staying: UnfoldStayingItemV1[];
	staying_total: number;
	folder_removed: boolean;
	/** People the combine added stay in the destination. */
	members_added_stay: number;
	unarchive: boolean;
	parent_restored_id: string | null;
	parent_not_restored: boolean;
	blockers: string[];
	checked_at: string;
};

export function projectCombineUndoViewFromUnfold(
	impact: UnfoldImpactV1,
	checkedAt: string
): ProjectCombineUndoViewV1 {
	const staying = capped(impact.staying, PROPOSAL_CARD_LIST_LIMIT);
	return {
		version: 1,
		fold_id: impact.fold_id,
		source: { ...impact.source },
		destination: { ...impact.destination },
		returning: { ...impact.returning },
		returning_total: Object.values(impact.returning).reduce((sum, n) => sum + n, 0),
		staying: staying.items,
		staying_total: staying.total,
		folder_removed: impact.folder_removed,
		members_added_stay: impact.members_added_by_fold_stay,
		unarchive: impact.unarchive,
		parent_restored_id: impact.parent_project_id,
		parent_not_restored: impact.parent_not_restored,
		blockers: [...impact.blockers],
		checked_at: checkedAt
	};
}

export function projectCombineUndoDigest(view: ProjectCombineUndoViewV1): string {
	return digestOf({
		kind: 'project_combine_undo',
		fold_id: view.fold_id,
		returning: { ...view.returning },
		staying: sortedStrings(view.staying.map((item) => `${item.id}:${item.reason}`)),
		staying_total: view.staying_total,
		folder_removed: view.folder_removed,
		members_added_stay: view.members_added_stay,
		unarchive: view.unarchive,
		parent_restored_id: view.parent_restored_id,
		parent_not_restored: view.parent_not_restored,
		blockers: sortedStrings(view.blockers)
	});
}

// ---------------------------------------------------------------------------
// Spec.

function argumentsMatch(args: unknown, payload: ProjectCombineProposalPayloadV1): boolean {
	return (
		isRecord(args) &&
		uuid(args.source_project_id) === payload.source.id &&
		uuid(args.destination_project_id) === payload.destination.id
	);
}

function names(people: readonly ProjectCombinePersonV1[]): string {
	const listed = people.slice(0, 3).map((person) => person.name);
	const rest = people.length - listed.length;
	return rest > 0 ? `${listed.join(', ')} and ${rest} more` : listed.join(' and ');
}

function describeResolution(
	resolution: ProposalCardResolutionV1<ProjectCombineReceiptV1>,
	payload: ProjectCombineProposalPayloadV1
) {
	const removed = resolution.receipt?.members_removed ?? [];
	const destinationHref = `/projects/${payload.destination.id}`;
	switch (resolution.outcome) {
		case 'applied': {
			const who = removed.length
				? ` · removed ${names(removed)}`
				: resolution.receipt?.members_added.length
					? ` · added ${names(resolution.receipt.members_added)}`
					: '';
			return {
				text: `Combined ${payload.source.name} into ${payload.destination.name}${who}`,
				href: destinationHref
			};
		}
		case 'cancelled':
			return { text: 'Cancelled. Nothing changed.', href: null };
		case 'stale':
			return {
				// Said plainly: people can lose access even though nothing combined.
				text: removed.length
					? `Not combined. ${names(removed)} ${removed.length === 1 ? 'was' : 'were'} already removed from ${payload.source.name} before it stopped. Nothing else changed.`
					: 'The projects changed since this card, so nothing was combined. Ask again.',
				href: `/projects/${payload.source.id}`
			};
		case 'unknown':
			return {
				text: removed.length
					? `BuildOS couldn’t confirm whether the combine saved. ${names(removed)} ${removed.length === 1 ? 'was' : 'were'} removed from ${payload.source.name}. Open ${payload.destination.name} to check.`
					: `BuildOS couldn’t confirm whether the combine saved. Open ${payload.destination.name} to check.`,
				href: destinationHref
			};
	}
}

function describeUndo(
	undo: ProposalCardUndoV1<ProjectCombineUndoReceiptV1>,
	payload: ProjectCombineProposalPayloadV1
) {
	switch (undo.outcome) {
		case 'undone': {
			const staying = undo.receipt?.staying ?? 0;
			return {
				text: staying
					? `Undone. ${payload.source.name} is back; ${staying} edited ${staying === 1 ? 'item stays' : 'items stay'} in ${payload.destination.name}.`
					: `Undone. ${payload.source.name} is back.`,
				href: `/projects/${payload.source.id}`
			};
		}
		case 'stale':
			return {
				text: 'Couldn’t undo: the combined project changed since. Nothing moved back.',
				href: `/projects/${payload.destination.id}`
			};
		case 'unknown':
			return {
				text: `BuildOS couldn’t confirm whether the undo saved. Open ${payload.destination.name} to check.`,
				href: `/projects/${payload.destination.id}`
			};
	}
}

function noteMeaning(
	state: ProposalCardState,
	payload: ProjectCombineProposalPayloadV1,
	card: ProposalCardEnvelopeV1<ProjectCombineProposalPayloadV1>
): string {
	const removed =
		(card.card_resolution?.receipt as ProjectCombineReceiptV1 | null | undefined)
			?.members_removed.length ?? 0;
	switch (state) {
		case 'pending':
			return payload.blockers.length
				? 'The user has not chosen yet and nothing changed. The card is blocked until the listed blockers are cleared; help with those, then the user can press Check again. Do not propose the combine again.'
				: 'The user has not chosen yet and nothing changed. If they want this, point them to the card; do not propose it again.';
		case 'applied':
			return 'The user confirmed. Everything from the source now lives in the destination under the folder_title folder; the source is archived and forwards to the destination. Project chats followed it.';
		case 'cancelled':
			return 'The user cancelled. Nothing changed.';
		case 'stale':
			return removed
				? 'Nothing was combined, but the listed people were already removed from the source before it stopped. Tell the user plainly; check the projects before proposing again.'
				: 'The projects changed before the user chose, so nothing was combined. Check the current state before proposing again.';
		case 'unknown':
			return 'BuildOS could not confirm whether the combine saved. Ask the user to open the destination and check before trying again.';
		case 'undone':
			return 'The user undid the combine. Unedited items moved back to the source and it is active again; items edited since the combine, and people the combine added, stayed in the destination.';
	}
}

export const PROJECT_COMBINE_CARD_SPEC: ProposalCardKindSpecV1<
	ProjectCombineProposalPayloadV1,
	ProjectCombineReceiptV1,
	ProjectCombineUndoReceiptV1
> = {
	kind: 'project_combine',
	toolName: PROJECT_COMBINE_TOOL_NAME,
	ttlMs: PROPOSAL_CARD_TTL_MS,
	undoTtlMs: PROPOSAL_CARD_UNDO_TTL_MS,
	choices: PROJECT_COMBINE_CHOICES,
	hasPreview: true,
	hasUndoPreview: true,
	parsePayload: parseProjectCombinePayload,
	parseReceipt: parseCombineReceipt,
	parseUndoReceipt: parseCombineUndoReceipt,
	argumentsMatch,
	digest: projectCombineDigest,
	modelView: (payload) => ({
		source: payload.source,
		destination: payload.destination,
		folder_title: payload.folder_title,
		counts: payload.counts,
		chats_follow: payload.chats_follow,
		members_missing: payload.members_missing.map((member) => ({
			name: member.name,
			role_key: member.role_key,
			removable: member.removable
		})),
		members_missing_total: payload.members_missing_total,
		blockers: payload.blockers,
		upcoming_events: payload.upcoming_events,
		upcoming_events_total: payload.upcoming_events_total,
		past_events_left_with_source_total: payload.past_events_total,
		duplicate_check_run_id: payload.duplicate_check?.run_id ?? null
	}),
	subjects: (payload) => [
		{ role: 'source', ...payload.source },
		{ role: 'destination', ...payload.destination }
	],
	describeResolution,
	describeUndo,
	noteMeaning
};
