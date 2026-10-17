// apps/web/src/lib/components/agent/proposal-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	chooseProposalCard,
	collectProposalCards,
	combineBlockedReason,
	combineChoiceFor,
	combineCountParts,
	extractProposalCard,
	foldBlockerText,
	parseCombineUndoView,
	placeProposalCards,
	previewProposalCard,
	projectParentLines,
	proposalCardProjectIds,
	proposalCardTitle,
	undoAvailable,
	undoPreviewProposalCard,
	undoProposalCard
} from './proposal-cards';
import {
	CHILD,
	DEST,
	PARENT,
	SESSION,
	SOURCE,
	UPCOMING_BLOCKED_IMPACT,
	card,
	combineDigest,
	combinePayload,
	jsonResponse,
	parentPayload,
	resolution,
	undoView
} from './proposal-cards.fixture';

function activity(result: unknown, status: ActivityEntry['status'] = 'completed'): ActivityEntry {
	return {
		id: `activity-${Math.random()}`,
		content: 'propose_project_parent',
		timestamp: new Date(),
		activityType: 'tool_call',
		status,
		metadata: { toolName: 'propose_project_parent', result }
	};
}

function block(id: string, activities: ActivityEntry[], status: ThinkingBlockMessage['status']) {
	return {
		id,
		type: 'thinking_block',
		role: 'assistant',
		content: '',
		activities,
		status,
		timestamp: new Date()
	} as unknown as ThinkingBlockMessage;
}

const message = (id: string, type: 'user' | 'assistant') =>
	({ id, type, role: type, content: '', timestamp: new Date() }) as unknown as UIMessage;

describe('finding proposal cards', () => {
	it('reads a card from a live result, a nested result and a restored row; ignores the rest', () => {
		const nest = card('project_parent', parentPayload());
		expect(extractProposalCard(activity(nest))?.card_id).toBe(nest.card_id);
		expect(extractProposalCard(activity({ result: { data: nest } }))?.card_id).toBe(
			nest.card_id
		);
		expect(extractProposalCard(activity(nest, 'pending'))).toBeNull();
		// A blocked proposal (no card) and an unrelated tool result render nothing.
		expect(
			extractProposalCard(
				activity({
					card_rail: 'proposal_v1',
					status: 'blocked',
					kind: 'project_parent',
					reason_code: 'parent_self',
					message: 'x'
				})
			)
		).toBeNull();
		expect(extractProposalCard(activity({ document: { id: 'doc' } }))).toBeNull();
		// A tampered payload doesn't parse.
		expect(
			extractProposalCard(
				activity({ ...nest, client_action: { ...nest.client_action, payload: {} } })
			)
		).toBeNull();
	});

	it('keeps the most advanced copy of a card (undo > decision > pending)', () => {
		const nest = card('project_parent', parentPayload());
		const decided = { ...nest, card_resolution: resolution(nest) };
		const cards = collectProposalCards([activity(decided), activity(nest)]);
		expect(cards).toHaveLength(1);
		expect(cards[0]?.card_resolution?.outcome).toBe('applied');
	});

	it('places cards under the reply of the turn, or the thinking block while it streams', () => {
		const nest = card('project_parent', parentPayload());
		const streaming = placeProposalCards([
			message('u1', 'user'),
			block('b1', [activity(nest)], 'active')
		]);
		expect(streaming.get('b1')).toMatchObject({ turnActive: true });

		const done = placeProposalCards([
			message('u1', 'user'),
			block('b1', [activity(nest)], 'completed'),
			message('a1', 'assistant'),
			message('u2', 'user'),
			message('a2', 'assistant')
		]);
		expect([...done.keys()]).toEqual(['a1']);
		expect(done.get('a1')?.cards[0]?.card_id).toBe(nest.card_id);
		expect(done.get('a1')?.turnActive).toBe(false);
	});

	it('names every project the card touches so open views refresh', () => {
		const nest = card('project_parent', parentPayload());
		expect(proposalCardProjectIds(nest).sort()).toEqual([CHILD, PARENT].sort());
		const combine = card('project_combine', combinePayload());
		expect(proposalCardProjectIds(combine).sort()).toEqual([SOURCE, DEST].sort());
	});
});

describe('proposal card requests', () => {
	it('sends only the card id, session, choice and seen digest, and reads the resolution', async () => {
		const combine = card('project_combine', combinePayload());
		const decided = resolution(combine);
		const fetchImpl = vi.fn(async () =>
			jsonResponse(200, { success: true, data: { resolution: decided } })
		);
		const digest = combineDigest(combinePayload());
		const result = await chooseProposalCard(
			combine,
			'combine_remove_members',
			digest,
			fetchImpl as unknown as typeof fetch
		);
		expect(result).toEqual({ status: 'resolved', resolution: decided });
		expect(fetchImpl).toHaveBeenCalledWith(`/api/chat/proposal-cards/${combine.card_id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				choice: 'combine_remove_members',
				session_id: SESSION,
				seen_digest: digest
			})
		});
	});

	it('hands back the fresh view on PREVIEW_CHANGED', async () => {
		const combine = card('project_combine', combinePayload());
		const fresh = combinePayload(UPCOMING_BLOCKED_IMPACT);
		const fetchImpl = vi.fn(async () =>
			jsonResponse(409, {
				success: false,
				error: 'The projects changed since you looked. Here is the latest. Nothing changed.',
				code: 'PREVIEW_CHANGED',
				details: { view: fresh, digest: combineDigest(fresh) }
			})
		);
		const result = await chooseProposalCard(
			combine,
			'combine_add_members',
			combineDigest(combinePayload()),
			fetchImpl as unknown as typeof fetch
		);
		expect(result).toMatchObject({
			status: 'error',
			code: 'PREVIEW_CHANGED',
			fresh: { view: fresh, digest: combineDigest(fresh) }
		});
	});

	it('says plainly when BuildOS cannot be reached', async () => {
		const nest = card('project_parent', parentPayload());
		const result = await chooseProposalCard(nest, 'apply', null, (async () => {
			throw new TypeError('offline');
		}) as unknown as typeof fetch);
		expect(result).toMatchObject({ status: 'error', code: null });
		expect(result.status === 'error' && result.message).toContain('Couldn’t reach BuildOS');
	});

	it('undoes with the undo digest and previews with the session in the query', async () => {
		const combine = card('project_combine', combinePayload());
		const undo = {
			version: 1,
			card_id: combine.card_id,
			kind: 'project_combine',
			outcome: 'undone',
			undone_at: '2026-10-17T12:20:00.000Z',
			reason_code: null,
			receipt: null
		};
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(200, { success: true, data: { undo } }))
			.mockResolvedValueOnce(
				jsonResponse(200, {
					success: true,
					data: { view: undoView(), digest: 'b'.repeat(64) }
				})
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					success: true,
					data: { view: combinePayload(), digest: 'c'.repeat(64) }
				})
			);
		expect(
			await undoProposalCard(combine, 'b'.repeat(64), fetchImpl as unknown as typeof fetch)
		).toMatchObject({ status: 'undone', undo: { outcome: 'undone' } });
		expect(fetchImpl.mock.calls[0]?.[0]).toBe(
			`/api/chat/proposal-cards/${combine.card_id}/undo`
		);
		expect(JSON.parse(fetchImpl.mock.calls[0]?.[1].body)).toEqual({
			session_id: SESSION,
			seen_digest: 'b'.repeat(64)
		});

		expect(
			await undoPreviewProposalCard(combine, fetchImpl as unknown as typeof fetch)
		).toMatchObject({ status: 'ok', digest: 'b'.repeat(64) });
		expect(fetchImpl.mock.calls[1]?.[0]).toBe(
			`/api/chat/proposal-cards/${combine.card_id}/undo-preview?session_id=${SESSION}`
		);
		expect(
			await previewProposalCard(combine, fetchImpl as unknown as typeof fetch)
		).toMatchObject({ status: 'ok', digest: 'c'.repeat(64) });
		expect(fetchImpl.mock.calls[2]?.[0]).toBe(
			`/api/chat/proposal-cards/${combine.card_id}/preview?session_id=${SESSION}`
		);
	});

	it('reads an already-decided card from a preview refusal', async () => {
		const combine = card('project_combine', combinePayload());
		const decided = resolution(combine, {
			outcome: 'cancelled',
			choice: 'cancel',
			receipt: null
		});
		const result = await previewProposalCard(combine, (async () =>
			jsonResponse(409, {
				success: false,
				error: 'This card was already decided.',
				code: 'ALREADY_RESOLVED',
				details: { resolution: decided }
			})) as unknown as typeof fetch);
		expect(result).toMatchObject({ status: 'error', resolution: { outcome: 'cancelled' } });
	});
});

describe('proposal card copy', () => {
	it('titles each kind from its subjects', () => {
		const attach = card('project_parent', parentPayload());
		expect(proposalCardTitle(attach, attach.client_action.payload)).toBe(
			'Put Content Ops inside Wayne Strategies'
		);
		const detach = parentPayload({
			action: 'detach',
			from_parent: { id: PARENT, name: 'Wayne Strategies' },
			to_parent: null
		});
		expect(proposalCardTitle(card('project_parent', detach), detach)).toBe(
			'Take Content Ops out of Wayne Strategies'
		);
		const combine = card('project_combine', combinePayload());
		expect(proposalCardTitle(combine, combine.client_action.payload)).toBe(
			'Combine Content Ops into DJ Internal'
		);
	});

	it('tells the nest card’s plain truth: nothing moves, no one gains access', () => {
		expect(projectParentLines(parentPayload())).toEqual([
			'Nothing moves. You can take it out any time.',
			'No one gains or loses access. David, Ian and Phillip still see only Content Ops.',
			'People who can open Wayne Strategies see its shared docs inside Content Ops.'
		]);
		expect(
			projectParentLines(
				parentPayload({
					child_only_members: { names: [], count: 0 },
					from_parent: { id: SOURCE, name: 'Old Hub' },
					effects: [
						'nothing_moves',
						'no_access_change',
						'leaves_previous_parent',
						'creates_shared_folder'
					]
				})
			)
		).toEqual([
			'Nothing moves. You can take it out any time.',
			'No one gains or loses access.',
			'It leaves Old Hub.',
			'People who can open Wayne Strategies see its shared docs inside Content Ops.',
			'Wayne Strategies gets a “Shared with sub-projects” folder.'
		]);
	});

	it('counts what moves by kind and explains blockers', () => {
		const payload = combinePayload();
		expect(combineCountParts(payload.counts)).toEqual(['12 docs', '7 tasks', '1 goal']);
		expect(foldBlockerText('calendar_sync_not_deployed', payload)).toContain('calendar sync');
		expect(foldBlockerText('something_new', payload)).toBe(
			'Something in these projects can’t be combined yet.'
		);
	});

	it('requires a member pick when people would lose access, and blocks on upcoming events', () => {
		const payload = combinePayload();
		expect(combineChoiceFor(payload, null)).toBeNull();
		expect(combineBlockedReason(payload, null)).toBe('member_choice');
		expect(combineChoiceFor(payload, 'remove')).toBe('combine_remove_members');
		expect(combineChoiceFor(payload, 'add')).toBe('combine_add_members');
		expect(combineBlockedReason(payload, 'add')).toBeNull();

		const blocked = combinePayload(UPCOMING_BLOCKED_IMPACT);
		expect(combineBlockedReason(blocked, 'add')).toBe('blocked');

		const noOneMissing = combinePayload({ members_missing: [], blockers: [] });
		expect(combineChoiceFor(noOneMissing, null)).toBe('combine');

		const ownerMissing = combinePayload({
			members: [
				{
					actor_id: SOURCE,
					name: 'Co-owner',
					role_key: 'owner',
					access: 'admin',
					destination_access: null,
					named_for_addition: false
				}
			],
			members_missing: [SOURCE]
		});
		expect(combineChoiceFor(ownerMissing, 'remove')).toBeNull();
		expect(combineChoiceFor(ownerMissing, 'add')).toBe('combine_add_members');
	});

	it('offers Undo only for an applied card, once, within 7 days', () => {
		const nest = card('project_parent', parentPayload());
		const applied = resolution(nest);
		expect(undoAvailable(nest, applied, null)).toBe(true);
		expect(undoAvailable(nest, resolution(nest, { outcome: 'stale' }), null)).toBe(false);
		expect(
			undoAvailable(
				nest,
				applied,
				null,
				Date.parse(applied.resolved_at) + 7 * 24 * 60 * 60 * 1000
			)
		).toBe(false);
	});

	it('parses the combine undo view and rejects a malformed one', () => {
		expect(parseCombineUndoView(undoView())).toMatchObject({
			returning_total: 18,
			staying_total: 1,
			folder_removed: true
		});
		expect(parseCombineUndoView({ version: 1 })).toBeNull();
	});
});
