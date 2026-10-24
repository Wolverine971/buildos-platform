// apps/web/src/lib/components/agent/proposal-cards.fixture.ts
// Card envelopes for the proposal-card UI tests (tasker 122), built through the
// real contract so a payload the worker could never produce can't sneak in.
import {
	buildProposalCardEnvelopeV1,
	parseFoldImpactV1,
	projectCombineDigest,
	projectCombinePayloadFromImpact,
	type ProjectCombineProposalPayloadV1,
	type ProjectParentProposalPayloadV1,
	type ProposalCardEnvelopeV1,
	type ProposalCardResolutionV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';

export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SESSION = fixtureId(1);
export const CHILD = fixtureId(2);
export const PARENT = fixtureId(3);
export const SOURCE = fixtureId(4);
export const DEST = fixtureId(5);
export const ALICE = fixtureId(6);
export const BOB = fixtureId(7);
export const OWNER = fixtureId(8);
export const EVENT_PAST = fixtureId(9);
export const EVENT_UPCOMING = fixtureId(10);
export const RUN = fixtureId(11);
export const FOLD = fixtureId(12);

let cardSeq = 500;
export const nextCardId = () => fixtureId(cardSeq++);

export function parentPayload(
	overrides: Partial<ProjectParentProposalPayloadV1> = {}
): ProjectParentProposalPayloadV1 {
	return {
		version: 1,
		action: 'attach',
		project: { id: CHILD, name: 'Content Ops' },
		from_parent: null,
		to_parent: { id: PARENT, name: 'Wayne Strategies' },
		child_only_members: { names: ['David', 'Ian', 'Phillip'], count: 3 },
		effects: ['nothing_moves', 'no_access_change'],
		undo_needs_admin_on_both: false,
		duplicate_check: null,
		note: null,
		...overrides
	};
}

/** onto_project_fold_preview's response shape (20261017170000 readiness). */
export function foldPreview(impact: Record<string, unknown> = {}) {
	return {
		confirmation_token: 'a'.repeat(32),
		impact: {
			source: { id: SOURCE, name: 'Content Ops', archived: false, parent_project_id: null },
			destination: { id: DEST, name: 'DJ Internal' },
			folder_title: 'From Content Ops',
			counts: {
				onto_documents: 12,
				onto_tasks: 7,
				onto_goals: 1,
				onto_edges: 0,
				onto_comments: 0,
				dated_tasks: 0,
				past_events_left_with_source: 16,
				upcoming_standalone_events: 0,
				pending_proposals: 0,
				assignees_removed: 0
			},
			members: [
				{
					actor_id: OWNER,
					name: 'DJ',
					role_key: 'owner',
					access: 'admin',
					destination_access: 'admin',
					named_for_addition: false
				},
				{
					actor_id: ALICE,
					name: 'Alice',
					role_key: 'editor',
					access: 'write',
					destination_access: null,
					named_for_addition: false
				},
				{
					actor_id: BOB,
					name: 'Bob',
					role_key: 'viewer',
					access: 'read',
					destination_access: null,
					named_for_addition: false
				}
			],
			members_missing: [ALICE, BOB],
			member_additions: [],
			blockers: ['members_missing'],
			past_events_left_with_source: [
				{ id: EVENT_PAST, title: 'Kickoff', start_at: '2026-09-01T15:00:00+00:00' }
			],
			upcoming_standalone_events: [],
			connector_grants_not_copied: { project_permissions: 0, oauth_grants_naming_source: 0 },
			...impact
		},
		info: { repointed: { chat_sessions: 3 } }
	};
}

export function combinePayload(
	impact: Record<string, unknown> = {},
	extras: { duplicateCheck?: ProjectCombineProposalPayloadV1['duplicate_check'] } = {}
): ProjectCombineProposalPayloadV1 {
	return projectCombinePayloadFromImpact(parseFoldImpactV1(foldPreview(impact))!, {
		checkedAt: '2026-10-17T12:00:00.000Z',
		duplicateCheck: extras.duplicateCheck ?? null,
		note: null
	});
}

/** Upcoming events block the combine (named on the card). */
export const UPCOMING_BLOCKED_IMPACT = {
	counts: {
		onto_documents: 12,
		onto_tasks: 7,
		upcoming_standalone_events: 2,
		past_events_left_with_source: 16
	},
	blockers: ['members_missing', 'standalone_events_not_supported'],
	upcoming_standalone_events: [
		{ id: EVENT_UPCOMING, title: 'Webinar dry run', start_at: '2026-10-20T15:00:00+00:00' },
		{ id: fixtureId(13), title: 'Client review', start_at: '2026-10-22T15:00:00+00:00' }
	]
};

export function card<P>(
	kind: ProposalCardEnvelopeV1['kind'],
	payload: P,
	extra: Partial<ProposalCardEnvelopeV1> = {}
): ProposalCardEnvelopeV1 {
	const envelope = buildProposalCardEnvelopeV1({
		kind,
		cardId: nextCardId(),
		sessionId: SESSION,
		// Far future: the card has not expired.
		proposedAt: new Date(Date.now() + 60_000).toISOString(),
		payload,
		message: 'Needs your choice'
	}) as ProposalCardEnvelopeV1;
	return { ...envelope, ...extra };
}

export function resolution(
	target: ProposalCardEnvelopeV1,
	overrides: Partial<ProposalCardResolutionV1> = {}
): ProposalCardResolutionV1 {
	return {
		version: 1,
		card_id: target.card_id,
		kind: target.kind,
		choice: target.kind === 'project_parent' ? 'apply' : 'combine_remove_members',
		outcome: 'applied',
		resolved_at: new Date().toISOString(),
		reason_code: null,
		receipt:
			target.kind === 'project_parent'
				? {
						project_id: CHILD,
						parent_project_id: PARENT,
						previous_parent_project_id: null,
						shared_folder_document_id: null
					}
				: {
						fold_id: FOLD,
						source_project_id: SOURCE,
						destination_project_id: DEST,
						folder_document_id: null,
						members_removed: [
							{ actor_id: ALICE, name: 'Alice' },
							{ actor_id: BOB, name: 'Bob' }
						],
						members_added: [],
						replayed: false
					},
		...overrides
	};
}

export function combineDigest(payload: ProjectCombineProposalPayloadV1): string {
	return projectCombineDigest(payload);
}

/** GET …/undo-preview's view for a combine card. */
export function undoView(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		fold_id: FOLD,
		source: { id: SOURCE, name: 'Content Ops' },
		destination: { id: DEST, name: 'DJ Internal' },
		returning: { onto_documents: 11, onto_tasks: 7 },
		returning_total: 18,
		staying: [
			{ id: fixtureId(14), table: 'onto_documents', reason: 'edited', title: 'Rate card' }
		],
		staying_total: 1,
		folder_removed: true,
		members_added_stay: 0,
		unarchive: true,
		parent_restored_id: null,
		parent_not_restored: false,
		blockers: [],
		checked_at: '2026-10-17T12:10:00.000Z',
		...overrides
	};
}

export function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
