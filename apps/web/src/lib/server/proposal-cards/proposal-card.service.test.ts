// apps/web/src/lib/server/proposal-cards/proposal-card.service.test.ts
//
// The proposal-card rail's resolver, through the nest card: the click is the
// only consent, the tool row is a hint (session, owner, arguments re-checked),
// a click waits for the turn, cards expire, the claim is single-use under
// concurrency and released when nothing was written, the mirror self-repairs
// from the ledger, and Undo has its own claim.
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFamilyV1 } from '@buildos/shared-types';
import type { ProjectParentProposalPayloadV1 } from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
import {
	previewProposalCard,
	resolveProposalCard,
	undoProposalCard,
	type ProposalCardDeps
} from './proposal-card.service';
import { proposalCardClaimId } from './claim';
import {
	IDS,
	NOW,
	PROPOSED_AT,
	cardRow,
	deferred,
	fakeDb,
	turnRow
} from './proposal-card.test-helpers';

function payload(
	overrides: Partial<ProjectParentProposalPayloadV1> = {}
): ProjectParentProposalPayloadV1 {
	return {
		version: 1,
		action: 'attach',
		project: { id: IDS.CHILD, name: 'DJ Internal' },
		from_parent: null,
		to_parent: { id: IDS.PARENT, name: 'Wayne Strategies' },
		child_only_members: { names: [], count: 0 },
		effects: ['nothing_moves', 'no_access_change'],
		undo_needs_admin_on_both: false,
		duplicate_check: null,
		note: null,
		...overrides
	};
}

function family(parentId: string | null): ProjectFamilyV1 {
	return {
		project_id: IDS.CHILD,
		parent: parentId
			? {
					id: parentId,
					name: 'Parent',
					state_key: 'active',
					can_write: true,
					shared_folder_document_id: null,
					child_count: 1,
					can_detach: true
				}
			: null,
		shelf: [],
		children: [],
		own_shared_folder_document_id: null,
		child_count: 0
	};
}

function fixture(
	options: {
		turnStatus?: string;
		args?: Record<string, unknown>;
		now?: Date;
		currentParent?: string | null;
	} = {}
) {
	let now = options.now ?? NOW;
	const admin = fakeDb(
		{
			chat_tool_executions: [
				cardRow({
					kind: 'project_parent',
					toolName: 'propose_project_parent',
					payload: payload(),
					arguments: options.args ?? {
						project_id: IDS.CHILD,
						parent_project_id: IDS.PARENT
					}
				})
			],
			chat_turn_runs: [turnRow(options.turnStatus)],
			chat_turn_effects: []
		},
		{ now: () => now }
	);
	let parent: string | null = options.currentParent === undefined ? null : options.currentParent;
	const deps: Partial<ProposalCardDeps> = {
		getProjectFamily: vi.fn(async () => family(parent)),
		setProjectParent: vi.fn(async (_client, projectId: string, parentId: string | null) => {
			const previous = parent;
			parent = parentId;
			return {
				project_id: projectId,
				parent_project_id: parentId,
				previous_parent_project_id: previous,
				shared_folder_document_id: parentId ? IDS.FOLDER : null
			};
		}),
		sleep: vi.fn(async () => {}),
		now: () => now
	};
	const base = {
		cardId: IDS.CARD,
		sessionId: IDS.SESSION,
		userId: IDS.USER,
		userClient: {} as any,
		admin: admin.client,
		deps
	};
	return {
		admin,
		deps,
		base,
		setNow: (next: Date) => (now = next),
		setParent: (next: string | null) => (parent = next),
		toolResult: () => admin.tables.chat_tool_executions![0]!.result,
		effects: () => admin.tables.chat_turn_effects!
	};
}

describe('resolveProposalCard (nest card)', () => {
	it('applies the nest under the user session and records + mirrors the result', async () => {
		const f = fixture();
		const result = await resolveProposalCard({ ...f.base, choice: 'apply' });
		expect(result).toMatchObject({
			ok: true,
			alreadyResolved: false,
			resolution: {
				outcome: 'applied',
				choice: 'apply',
				receipt: { project_id: IDS.CHILD, parent_project_id: IDS.PARENT }
			},
			description: { text: 'DJ Internal is now inside Wayne Strategies' }
		});
		expect(f.deps.setProjectParent).toHaveBeenCalledWith({}, IDS.CHILD, IDS.PARENT);
		const [claim] = f.effects();
		expect(claim).toMatchObject({
			id: proposalCardClaimId(IDS.CARD, 'decide'),
			turn_run_id: IDS.TURN,
			session_id: IDS.SESSION,
			user_id: IDS.USER,
			execution_generation: 2,
			tool_name: 'proposal_card',
			operation_name: 'proposal.project_parent.apply',
			state: 'succeeded',
			downstream_idempotency_supported: false
		});
		expect(claim!.canonical_argument_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(Date.parse(claim!.finished_at)).toBeGreaterThan(Date.parse(claim!.started_at));
		expect(f.toolResult().card_resolution).toMatchObject({ outcome: 'applied' });
	});

	it('refuses a foreign session, a foreign user and forged arguments with 404', async () => {
		const f = fixture();
		expect(
			await resolveProposalCard({ ...f.base, sessionId: IDS.OTHER_SESSION, choice: 'apply' })
		).toMatchObject({ ok: false, status: 404, code: 'CARD_NOT_FOUND' });
		expect(
			await resolveProposalCard({ ...f.base, userId: IDS.OTHER_USER, choice: 'apply' })
		).toMatchObject({ ok: false, status: 404 });
		const forged = fixture({ args: { project_id: IDS.CHILD, parent_project_id: IDS.SOURCE } });
		expect(await resolveProposalCard({ ...forged.base, choice: 'apply' })).toMatchObject({
			ok: false,
			status: 404
		});
		expect(f.deps.setProjectParent).not.toHaveBeenCalled();
		expect(forged.deps.setProjectParent).not.toHaveBeenCalled();
	});

	it('rejects an unknown choice', async () => {
		const f = fixture();
		expect(await resolveProposalCard({ ...f.base, choice: 'combine' })).toMatchObject({
			ok: false,
			status: 400,
			code: 'INVALID_CHOICE'
		});
	});

	it('waits for the turn to finish (409 TURN_IN_PROGRESS, nothing claimed)', async () => {
		const f = fixture({ turnStatus: 'running' });
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: false,
			status: 409,
			code: 'TURN_IN_PROGRESS'
		});
		expect(f.effects()).toHaveLength(0);
	});

	it('expires 24 hours after the card was proposed (410)', async () => {
		const f = fixture({ now: new Date(Date.parse(PROPOSED_AT) + 24 * 60 * 60 * 1000) });
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: false,
			status: 410,
			code: 'CARD_EXPIRED'
		});
		expect(f.effects()).toHaveLength(0);
	});

	it('runs a double click once; the second click gets the first result', async () => {
		const f = fixture();
		const gate = deferred();
		const realSet = f.deps.setProjectParent!;
		f.deps.setProjectParent = vi.fn(async (...args: Parameters<typeof realSet>) => {
			await gate.promise;
			return realSet(...args);
		});
		f.deps.sleep = vi.fn(async () => {
			gate.resolve();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		// A double tap (or a second tab): the same click twice, concurrently.
		const [first, second] = await Promise.all([
			resolveProposalCard({ ...f.base, choice: 'apply' }),
			resolveProposalCard({ ...f.base, choice: 'apply' })
		]);
		expect(f.deps.setProjectParent).toHaveBeenCalledTimes(1);
		expect(first).toMatchObject({ ok: true, alreadyResolved: false });
		expect(second).toMatchObject({
			ok: true,
			alreadyResolved: true,
			resolution: { outcome: 'applied', choice: 'apply' }
		});
		expect(f.effects()).toHaveLength(1);
	});

	it('releases the claim when access is denied, so the card stays usable', async () => {
		const f = fixture();
		f.deps.setProjectParent = vi
			.fn()
			.mockRejectedValueOnce({ message: 'project_parent_admin_required' })
			.mockResolvedValueOnce({
				project_id: IDS.CHILD,
				parent_project_id: IDS.PARENT,
				previous_parent_project_id: null,
				shared_folder_document_id: IDS.FOLDER
			});
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: false,
			status: 403,
			code: 'ACCESS_REQUIRED'
		});
		expect(f.effects()).toHaveLength(0);
		expect(f.toolResult().card_resolution).toBeUndefined();
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: true,
			resolution: { outcome: 'applied' }
		});
	});

	it('settles as stale when the project moved since the card, or the RPC refuses', async () => {
		const moved = fixture({ currentParent: IDS.SOURCE });
		const result = await resolveProposalCard({ ...moved.base, choice: 'apply' });
		expect(result).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'parent_changed' }
		});
		expect(moved.deps.setProjectParent).not.toHaveBeenCalled();
		expect(moved.effects()[0]).toMatchObject({
			state: 'failed',
			failure_code: 'parent_changed'
		});

		const refused = fixture();
		refused.deps.setProjectParent = vi
			.fn()
			.mockRejectedValue({ message: 'project_parent_is_a_child' });
		expect(await resolveProposalCard({ ...refused.base, choice: 'apply' })).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'project_parent_is_a_child' },
			description: {
				text: 'Wayne Strategies is already inside another project, so nothing changed.'
			}
		});
	});

	it('records an unexpected failure as unknown (never released)', async () => {
		const f = fixture();
		f.deps.setProjectParent = vi.fn().mockRejectedValue({ message: 'socket hang up' });
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: true,
			resolution: { outcome: 'unknown' }
		});
		expect(f.effects()[0]).toMatchObject({ state: 'uncertain' });
	});

	it('repairs a missing mirror from the ledger on the next call', async () => {
		const f = fixture();
		await resolveProposalCard({ ...f.base, choice: 'cancel' });
		delete f.toolResult().card_resolution;
		const again = await resolveProposalCard({ ...f.base, choice: 'apply' });
		expect(again).toMatchObject({
			ok: true,
			alreadyResolved: true,
			resolution: { outcome: 'cancelled', choice: 'cancel' }
		});
		expect(f.toolResult().card_resolution).toMatchObject({ outcome: 'cancelled' });
		expect(f.deps.setProjectParent).not.toHaveBeenCalled();
	});

	it('treats a claim stuck for 2 minutes as unknown, filling only a missing mirror', async () => {
		const f = fixture();
		f.effects().push({
			id: proposalCardClaimId(IDS.CARD, 'decide'),
			state: 'started',
			operation_name: 'proposal.project_parent.apply',
			reserved_at: '2026-10-17T12:01:00.000Z',
			started_at: '2026-10-17T12:01:00.001Z',
			finished_at: null,
			downstream_receipt: null
		});
		const result = await resolveProposalCard({ ...f.base, choice: 'apply' });
		expect(result).toMatchObject({
			ok: true,
			alreadyResolved: true,
			resolution: { outcome: 'unknown', choice: 'apply' }
		});
		expect(f.toolResult().card_resolution).toMatchObject({ outcome: 'unknown' });
		expect(f.deps.setProjectParent).not.toHaveBeenCalled();
	});
});

describe('undoProposalCard (nest card)', () => {
	it('restores the previous parent once, with its own claim, and mirrors it', async () => {
		const f = fixture();
		await resolveProposalCard({ ...f.base, choice: 'apply' });
		const undo = await undoProposalCard({ ...f.base });
		expect(undo).toMatchObject({
			ok: true,
			alreadyUndone: false,
			undo: { outcome: 'undone', receipt: { parent_project_id: null } },
			description: { text: 'Undone. DJ Internal is back at the top level.' }
		});
		expect(f.deps.setProjectParent).toHaveBeenLastCalledWith({}, IDS.CHILD, null);
		expect(f.effects().map((row) => row.id)).toEqual([
			proposalCardClaimId(IDS.CARD, 'decide'),
			proposalCardClaimId(IDS.CARD, 'undo')
		]);
		expect(f.effects()[1]).toMatchObject({ operation_name: 'proposal.project_parent.undo' });
		expect(f.toolResult().card_undo).toMatchObject({ outcome: 'undone' });
		const again = await undoProposalCard({ ...f.base });
		expect(again).toMatchObject({ ok: true, alreadyUndone: true });
		expect(f.deps.setProjectParent).toHaveBeenCalledTimes(2);
	});

	it('is stale when the project moved since the click, and refuses unapplied cards', async () => {
		const f = fixture();
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: false,
			status: 409,
			code: 'NOT_UNDOABLE'
		});
		await resolveProposalCard({ ...f.base, choice: 'apply' });
		f.setParent(IDS.SOURCE);
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: true,
			undo: { outcome: 'stale', reason_code: 'parent_changed' }
		});
		expect(f.deps.setProjectParent).toHaveBeenCalledTimes(1);
	});

	it('expires 7 days after the card was applied', async () => {
		const f = fixture();
		await resolveProposalCard({ ...f.base, choice: 'apply' });
		f.setNow(new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000 + 1000));
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: false,
			status: 410,
			code: 'UNDO_EXPIRED'
		});
	});

	it('releases the undo claim when re-attaching needs admin on both', async () => {
		const f = fixture();
		await resolveProposalCard({ ...f.base, choice: 'apply' });
		f.deps.setProjectParent = vi
			.fn()
			.mockRejectedValue({ message: 'project_parent_access_denied' });
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: false,
			status: 403,
			code: 'ACCESS_REQUIRED'
		});
		expect(f.effects()).toHaveLength(1);
	});
});

describe('previewProposalCard', () => {
	it('has no preview for the nest card', async () => {
		const f = fixture();
		expect(await previewProposalCard({ ...f.base, phase: 'decide' })).toMatchObject({
			ok: false,
			status: 400,
			code: 'NO_PREVIEW'
		});
	});
});
