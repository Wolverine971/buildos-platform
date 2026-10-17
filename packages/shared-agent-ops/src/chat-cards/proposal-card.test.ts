// packages/shared-agent-ops/src/chat-cards/proposal-card.test.ts
import { describe, expect, it } from 'vitest';
import {
	PROPOSAL_CARD_TTL_MS,
	buildProposalCardEnvelopeV1,
	buildProposalCardNonCardResultV1,
	classifyFoldBlocker,
	isProposalCardResult,
	parseFoldImpactV1,
	parseProposalCardEnvelope,
	parseProposalCardNonCardResult,
	parseProposalCardResolution,
	parseUnfoldImpactV1,
	projectCombineContentDigest,
	projectCombinePayloadFromImpact,
	projectCombineUndoDigest,
	projectCombineUndoViewFromUnfold,
	proposalCardKindForTool,
	proposalCardState,
	proposalCardVisibleDigest,
	describeProposalCardResolution,
	type ProjectCombineProposalPayloadV1,
	type ProjectParentProposalPayloadV1
} from './proposal-card';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [CARD, SESSION, CHILD, PARENT, SOURCE, DEST, ALICE, BOB, OWNER, EVENT1, EVENT2, FOLD] =
	Array.from({ length: 12 }, (_, n) => id(n + 1)) as string[];

function parentPayload(
	overrides: Partial<ProjectParentProposalPayloadV1> = {}
): ProjectParentProposalPayloadV1 {
	return {
		version: 1,
		action: 'attach',
		project: { id: CHILD!, name: 'DJ Internal' },
		from_parent: null,
		to_parent: { id: PARENT!, name: 'Wayne Strategies' },
		child_only_members: { names: [], count: 0 },
		effects: ['nothing_moves', 'no_access_change'],
		undo_needs_admin_on_both: false,
		duplicate_check: null,
		note: null,
		...overrides
	};
}

/** The shape onto_project_fold_preview returns (20261017170000 readiness). */
function foldPreview(overrides: Record<string, unknown> = {}) {
	return {
		confirmation_token: 'a'.repeat(32),
		impact: {
			source: { id: SOURCE, name: 'Content Ops', archived: false, parent_project_id: null },
			destination: { id: DEST, name: 'DJ Internal' },
			folder_title: 'From Content Ops',
			counts: {
				onto_documents: 12,
				onto_tasks: '7',
				onto_goals: 1,
				onto_edges: 9,
				onto_comments: 0,
				dated_tasks: 1,
				past_events_left_with_source: 16,
				upcoming_standalone_events: 2,
				pending_proposals: 0,
				assignees_removed: 1
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
					name: null,
					role_key: 'viewer',
					access: 'read',
					destination_access: null,
					named_for_addition: false
				}
			],
			members_missing: [ALICE, BOB],
			member_additions: [],
			blockers: ['members_missing', 'standalone_events_not_supported'],
			past_events_left_with_source: [
				{ id: EVENT1, title: 'Kickoff', start_at: '2026-09-01T15:00:00+00:00' }
			],
			upcoming_standalone_events: [
				{ id: EVENT2, title: 'Review', start_at: '2026-10-20T15:00:00+00:00' }
			],
			connector_grants_not_copied: { project_permissions: 0, oauth_grants_naming_source: 1 },
			...overrides
		},
		info: { repointed: { chat_sessions: 3 } }
	};
}

function combinePayload(): ProjectCombineProposalPayloadV1 {
	const impact = parseFoldImpactV1(foldPreview())!;
	return projectCombinePayloadFromImpact(impact, {
		checkedAt: '2026-10-17T12:00:00.000Z',
		duplicateCheck: { run_id: FOLD!, root_project_id: DEST! },
		note: 'Cadre'
	});
}

describe('proposal card envelope', () => {
	it('builds and parses a nest card, with expiry from the proposal time', () => {
		const card = buildProposalCardEnvelopeV1({
			kind: 'project_parent',
			cardId: CARD!.toUpperCase(),
			sessionId: SESSION!,
			proposedAt: '2026-10-17T12:00:00.000Z',
			payload: parentPayload(),
			message: 'Needs your choice'
		});
		expect(card.card_id).toBe(CARD);
		expect(card.client_action.expires_at).toBe(
			new Date(Date.parse('2026-10-17T12:00:00.000Z') + PROPOSAL_CARD_TTL_MS).toISOString()
		);
		expect(card.model_view).toMatchObject({ action: 'attach', to_parent: { id: PARENT } });
		const parsed = parseProposalCardEnvelope(JSON.parse(JSON.stringify(card)));
		expect(parsed).toEqual(card);
		expect(isProposalCardResult(card)).toBe(true);
		expect(proposalCardState(parsed!)).toBe('pending');
		expect(proposalCardKindForTool('propose_project_parent')).toBe('project_parent');
		expect(proposalCardKindForTool('update_onto_project')).toBeNull();
	});

	it('rejects mismatched ids, unknown kinds and invalid payloads', () => {
		const card = buildProposalCardEnvelopeV1({
			kind: 'project_parent',
			cardId: CARD!,
			sessionId: SESSION!,
			proposedAt: new Date('2026-10-17T12:00:00.000Z'),
			payload: parentPayload(),
			message: ''
		});
		const clone = () => JSON.parse(JSON.stringify(card));
		const otherId = clone();
		otherId.client_action.card_id = id(99);
		expect(parseProposalCardEnvelope(otherId)).toBeNull();
		const otherKind = clone();
		otherKind.kind = 'project_move';
		expect(parseProposalCardEnvelope(otherKind)).toBeNull();
		const saved = clone();
		saved.saved = true;
		expect(parseProposalCardEnvelope(saved)).toBeNull();
		const selfParent = clone();
		selfParent.client_action.payload.to_parent.id = CHILD;
		expect(parseProposalCardEnvelope(selfParent)).toBeNull();
		const badEffect = clone();
		badEffect.client_action.payload.effects = ['moves_everything'];
		expect(parseProposalCardEnvelope(badEffect)).toBeNull();
		const detachWithoutParent = clone();
		detachWithoutParent.client_action.payload.action = 'detach';
		detachWithoutParent.client_action.payload.to_parent = null;
		expect(parseProposalCardEnvelope(detachWithoutParent)).toBeNull();
	});

	it('keeps a valid resolution and drops one for a different card or choice', () => {
		const card = buildProposalCardEnvelopeV1({
			kind: 'project_parent',
			cardId: CARD!,
			sessionId: SESSION!,
			proposedAt: '2026-10-17T12:00:00.000Z',
			payload: parentPayload(),
			message: ''
		});
		const resolution = {
			version: 1,
			card_id: CARD,
			kind: 'project_parent',
			choice: 'apply',
			outcome: 'applied',
			resolved_at: '2026-10-17T12:05:00.000Z',
			reason_code: null,
			receipt: {
				project_id: CHILD,
				parent_project_id: PARENT,
				previous_parent_project_id: null,
				shared_folder_document_id: null
			}
		};
		const parsed = parseProposalCardEnvelope({ ...card, card_resolution: resolution });
		expect(parsed?.card_resolution?.outcome).toBe('applied');
		expect(proposalCardState(parsed!)).toBe('applied');
		expect(describeProposalCardResolution(parsed!, parsed!.card_resolution!).text).toBe(
			'DJ Internal is now inside Wayne Strategies'
		);
		expect(
			parseProposalCardEnvelope({
				...card,
				card_resolution: { ...resolution, card_id: id(42) }
			})?.card_resolution
		).toBeUndefined();
		expect(parseProposalCardResolution({ ...resolution, choice: 'combine' })).toBeNull();
		const undone = parseProposalCardEnvelope({
			...card,
			card_resolution: resolution,
			card_undo: {
				version: 1,
				card_id: CARD,
				kind: 'project_parent',
				outcome: 'undone',
				undone_at: '2026-10-17T13:00:00.000Z',
				reason_code: null,
				receipt: null
			}
		});
		expect(proposalCardState(undone!)).toBe('undone');
	});

	it('builds and parses non-card results', () => {
		const result = buildProposalCardNonCardResultV1({
			kind: 'project_combine',
			status: 'blocked',
			reasonCode: 'calendar_sync_not_deployed',
			message: 'Not yet.'
		});
		expect(parseProposalCardNonCardResult(result)).toEqual(result);
		expect(isProposalCardResult(result)).toBe(false);
		expect(parseProposalCardNonCardResult({ ...result, reason_code: 'Free text!' })).toBeNull();
	});
});

describe('visibleDigest', () => {
	it('ignores names, timestamps and order, and changes with ids and counts', () => {
		const base = combinePayload();
		const digest = proposalCardVisibleDigest('project_combine', base);
		const renamed: ProjectCombineProposalPayloadV1 = {
			...base,
			source: { ...base.source, name: 'Renamed' },
			checked_at: '2026-10-18T00:00:00.000Z',
			members_missing: [...base.members_missing].reverse().map((m) => ({ ...m, name: 'X' })),
			past_events_left_with_source: base.past_events_left_with_source.map((e) => ({
				...e,
				title: 'Localized',
				start_at: null
			})),
			duplicate_check: null,
			note: null
		};
		expect(proposalCardVisibleDigest('project_combine', renamed)).toBe(digest);
		expect(
			proposalCardVisibleDigest('project_combine', {
				...base,
				counts: { ...base.counts, documents: base.counts.documents + 1 }
			})
		).not.toBe(digest);
		expect(
			proposalCardVisibleDigest('project_combine', {
				...base,
				members_missing: base.members_missing.slice(1),
				members_missing_total: 1
			})
		).not.toBe(digest);
		expect(proposalCardVisibleDigest('project_combine', { ...base, blockers: [] })).not.toBe(
			digest
		);
	});

	it('nest digest ignores names and note', () => {
		const payload = parentPayload();
		expect(proposalCardVisibleDigest('project_parent', payload)).toBe(
			proposalCardVisibleDigest('project_parent', {
				...payload,
				project: { ...payload.project, name: 'Other' },
				note: 'why'
			})
		);
		expect(proposalCardVisibleDigest('project_parent', payload)).not.toBe(
			proposalCardVisibleDigest('project_parent', {
				...payload,
				child_only_members: { names: ['Ann'], count: 1 }
			})
		);
	});

	it('content digest ignores member-dependent counts', () => {
		const base = combinePayload();
		expect(
			projectCombineContentDigest({
				...base,
				counts: { ...base.counts, assignees_removed: 0, upcoming_events: 0 },
				members_missing: []
			})
		).toBe(projectCombineContentDigest(base));
		expect(
			projectCombineContentDigest({ ...base, counts: { ...base.counts, tasks: 0 } })
		).not.toBe(projectCombineContentDigest(base));
	});
});

describe('fold impact', () => {
	it('parses the fold preview and builds the card payload', () => {
		const impact = parseFoldImpactV1(foldPreview());
		expect(impact).not.toBeNull();
		expect(impact!.counts.onto_tasks).toBe(7);
		expect(impact!.chats_follow).toBe(3);
		const payload = combinePayload();
		expect(payload.counts).toMatchObject({
			documents: 12,
			tasks: 7,
			links: 9,
			past_events_left_with_source: 16,
			upcoming_events: 2,
			assignees_removed: 1,
			risks: 0
		});
		expect(payload.members_missing).toEqual([
			{
				actor_id: ALICE,
				name: 'Alice',
				role_key: 'editor',
				access: 'write',
				removable: true
			},
			{ actor_id: BOB, name: 'Someone', role_key: 'viewer', access: 'read', removable: true }
		]);
		// members_missing is the click's job, never a card blocker.
		expect(payload.blockers).toEqual([
			{ code: 'standalone_events_not_supported', fixable: true }
		]);
		expect(payload.past_events_total).toBe(16);
		expect(payload.upcoming_events.map((event) => event.id)).toEqual([EVENT2]);
		const card = buildProposalCardEnvelopeV1({
			kind: 'project_combine',
			cardId: CARD!,
			sessionId: SESSION!,
			proposedAt: '2026-10-17T12:00:00.000Z',
			payload,
			message: ''
		});
		expect(parseProposalCardEnvelope(JSON.parse(JSON.stringify(card)))).toEqual(card);
		expect(card.model_view).not.toHaveProperty('client_action');
	});

	it('marks owners as not removable and caps every list at 20', () => {
		const many = Array.from({ length: 25 }, (_, n) => id(500 + n));
		const impact = parseFoldImpactV1(
			foldPreview({
				members: [
					{ actor_id: OWNER, name: 'Them', role_key: 'owner', access: 'admin' },
					...many.map((actor) => ({ actor_id: actor, name: 'P', role_key: 'viewer' }))
				],
				members_missing: [OWNER, ...many]
			})
		)!;
		const payload = projectCombinePayloadFromImpact(impact, {
			checkedAt: '2026-10-17T12:00:00Z'
		});
		expect(payload.members_missing).toHaveLength(20);
		expect(payload.members_missing_total).toBe(26);
		expect(payload.members_missing[0]).toMatchObject({ actor_id: OWNER, removable: false });
	});

	it('rejects unusable previews', () => {
		expect(parseFoldImpactV1(null)).toBeNull();
		expect(parseFoldImpactV1({ impact: foldPreview().impact })).toBeNull();
		expect(parseFoldImpactV1(foldPreview({ blockers: ['Bad Code'] }))).toBeNull();
		expect(parseFoldImpactV1(foldPreview({ members_missing: ['nope'] }))).toBeNull();
	});

	it('classifies blockers', () => {
		expect(classifyFoldBlocker('members_missing')).toBe('members');
		expect(classifyFoldBlocker('standalone_events_not_supported')).toBe('fixable');
		expect(classifyFoldBlocker('pending_document_proposal')).toBe('fixable');
		expect(classifyFoldBlocker('calendar_sync_not_deployed')).toBe('hard');
		expect(classifyFoldBlocker('too_many_entities')).toBe('hard');
		expect(classifyFoldBlocker('something_new')).toBe('hard');
	});
});

describe('unfold impact', () => {
	const unfold = {
		confirmation_token: 'b'.repeat(32),
		impact: {
			fold_id: FOLD,
			source: { id: SOURCE, name: 'Content Ops' },
			destination: { id: DEST, name: 'DJ Internal' },
			returning: { onto_documents: 10, onto_tasks: 6 },
			staying: [
				{ id: id(301), table: 'onto_documents', reason: 'edited_since_fold', title: 'Plan' }
			],
			documents_filed_in_source: 10,
			folder_removed: false,
			members_added_by_fold_stay: [{ actor_id: ALICE }],
			tasks_to_reconcile: 0,
			source_restore: {
				unarchive: true,
				parent_project_id: null,
				parent_not_restored: false
			},
			blockers: []
		}
	};

	it('parses the unfold preview into an undo view with a stable digest', () => {
		const impact = parseUnfoldImpactV1(unfold)!;
		expect(impact.members_added_by_fold_stay).toBe(1);
		const view = projectCombineUndoViewFromUnfold(impact, '2026-10-17T12:00:00Z');
		expect(view.returning_total).toBe(16);
		expect(view.staying_total).toBe(1);
		const later = projectCombineUndoViewFromUnfold(impact, '2026-10-18T12:00:00Z');
		expect(projectCombineUndoDigest(later)).toBe(projectCombineUndoDigest(view));
		expect(
			projectCombineUndoDigest({ ...view, returning: { onto_documents: 9, onto_tasks: 6 } })
		).not.toBe(projectCombineUndoDigest(view));
	});

	it('rejects a malformed unfold preview', () => {
		expect(
			parseUnfoldImpactV1({ ...unfold, impact: { ...unfold.impact, fold_id: 'x' } })
		).toBeNull();
	});
});
