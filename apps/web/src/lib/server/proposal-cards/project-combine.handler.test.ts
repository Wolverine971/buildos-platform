// apps/web/src/lib/server/proposal-cards/project-combine.handler.test.ts
//
// The combine card through the resolver: a changed preview answers 409 with the
// fresh view and claims nothing; "Remove them" removes, re-previews and applies
// with the card's deterministic fold id; stale_preview retries once; an
// uncertain apply is decided by the fold journal; people removed before a
// failed combine are reported plainly; Undo runs the unfold.
import { describe, expect, it, vi } from 'vitest';
import {
	parseFoldImpactV1,
	projectCombineDigest,
	projectCombinePayloadFromImpact,
	projectCombineUndoDigest,
	projectCombineUndoViewFromUnfold,
	parseUnfoldImpactV1,
	type FoldImpactV1
} from '@buildos/shared-agent-ops/chat-cards/project-combine-card';
import { ProjectFoldError } from '$lib/server/project-fold/project-fold.service';
import {
	previewProposalCard,
	resolveProposalCard,
	undoProposalCard,
	type ProposalCardDeps
} from './proposal-card.service';
import { proposalFoldId } from './project-combine.handler';
import { proposalCardClaimId } from './claim';
import { IDS, NOW, cardRow, fakeDb, turnRow } from './proposal-card.test-helpers';

const DUPLICATE_CHECK = { run_id: IDS.EVENT, root_project_id: IDS.DEST };

function impact(
	options: {
		missing?: string[];
		additions?: string[];
		blockers?: string[];
		tasks?: number;
		token?: string;
		ownerMissing?: boolean;
		sourceName?: string;
	} = {}
): FoldImpactV1 {
	const missing = options.missing ?? [IDS.ALICE];
	return parseFoldImpactV1({
		confirmation_token: options.token ?? 'token-1',
		impact: {
			source: {
				id: IDS.SOURCE,
				name: options.sourceName ?? 'Content Ops',
				archived: false,
				parent_project_id: null
			},
			destination: { id: IDS.DEST, name: 'DJ Internal' },
			folder_title: 'From Content Ops',
			counts: {
				onto_documents: 3,
				onto_tasks: options.tasks ?? 2,
				onto_edges: 1,
				past_events_left_with_source: 0,
				upcoming_standalone_events: 0,
				assignees_removed: missing.length && !(options.additions ?? []).length ? 1 : 0
			},
			members: [
				{ actor_id: IDS.OWNER, name: 'DJ', role_key: 'owner', access: 'admin' },
				{ actor_id: IDS.ALICE, name: 'Alice', role_key: 'editor', access: 'write' }
			],
			members_missing: options.ownerMissing ? [IDS.OWNER, ...missing] : missing,
			member_additions: options.additions ?? [],
			blockers:
				options.blockers ??
				(missing.length && !(options.additions ?? []).length ? ['members_missing'] : []),
			past_events_left_with_source: [],
			upcoming_standalone_events: [],
			connector_grants_not_copied: { project_permissions: 0, oauth_grants_naming_source: 0 }
		},
		info: { repointed: { chat_sessions: 1 } }
	})!;
}

function payloadFrom(value: FoldImpactV1) {
	return projectCombinePayloadFromImpact(value, {
		checkedAt: '2026-10-17T11:59:00.000Z',
		duplicateCheck: DUPLICATE_CHECK,
		note: null
	});
}

const SEEN = projectCombineDigest(payloadFrom(impact()));

function fixture(previews: FoldImpactV1[] = [impact()]) {
	const admin = fakeDb({
		chat_tool_executions: [
			cardRow({
				kind: 'project_combine',
				toolName: 'propose_project_combine',
				payload: payloadFrom(impact()),
				arguments: { source_project_id: IDS.SOURCE, destination_project_id: IDS.DEST }
			})
		],
		chat_turn_runs: [turnRow()],
		chat_turn_effects: []
	});
	const userDb = fakeDb({
		onto_project_members: [
			{
				id: IDS.ALICE_MEMBER,
				project_id: IDS.SOURCE,
				actor_id: IDS.ALICE,
				role_key: 'editor',
				removed_at: null
			}
		]
	});
	const queue = [...previews];
	const deps: Partial<ProposalCardDeps> = {
		previewProjectFold: vi.fn(async () => queue.shift() ?? previews.at(-1)!),
		applyProjectFold: vi.fn(async (input) => ({
			fold_id: input.foldId,
			source_project_id: IDS.SOURCE,
			destination_project_id: IDS.DEST,
			folder_document_id: IDS.FOLDER,
			members_added: [...(input.memberAdditions ?? [])],
			replayed: false,
			unfolded_at: null
		})),
		readProjectFoldManifest: vi.fn(async () => null),
		removeProjectMember: vi.fn(async (input) => ({
			ok: true as const,
			memberId: input.memberId,
			removed: {
				id: input.memberId,
				actor_id: IDS.ALICE,
				role_key: 'editor',
				access: 'write'
			}
		})),
		previewProjectUnfold: vi.fn(),
		applyProjectUnfold: vi.fn(),
		sleep: vi.fn(async () => {}),
		now: () => NOW
	};
	return {
		admin,
		deps,
		base: {
			cardId: IDS.CARD,
			sessionId: IDS.SESSION,
			userId: IDS.USER,
			userClient: userDb.client,
			admin: admin.client,
			deps
		},
		effects: () => admin.tables.chat_turn_effects!,
		toolResult: () => admin.tables.chat_tool_executions![0]!.result
	};
}

/** After the people are removed, the preview has no members_missing. */
const cleared = (overrides: Parameters<typeof impact>[0] = {}) =>
	impact({ missing: [], token: 'token-2', ...overrides });

describe('combine card: Choose', () => {
	it('answers 409 PREVIEW_CHANGED with the fresh view when the preview moved, claiming nothing', async () => {
		const f = fixture([impact({ tasks: 5 })]);
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({ ok: false, status: 409, code: 'PREVIEW_CHANGED' });
		const details = (result as { details?: any }).details;
		expect(details.view.counts.tasks).toBe(5);
		expect(details.digest).toBe(projectCombineDigest(details.view));
		expect(f.effects()).toHaveLength(0);
		expect(f.deps.removeProjectMember).not.toHaveBeenCalled();
		expect(f.deps.applyProjectFold).not.toHaveBeenCalled();
	});

	it('requires seen_digest and a member choice when people would lose access', async () => {
		const f = fixture();
		expect(
			await resolveProposalCard({ ...f.base, choice: 'combine_add_members' })
		).toMatchObject({
			ok: false,
			status: 400,
			code: 'SEEN_DIGEST_REQUIRED'
		});
		expect(
			await resolveProposalCard({ ...f.base, choice: 'combine', seenDigest: SEEN })
		).toMatchObject({ ok: false, status: 409, code: 'MEMBER_CHOICE_REQUIRED' });
		expect(f.effects()).toHaveLength(0);
	});

	it('removes the people, previews again, then applies with the card fold id', async () => {
		const f = fixture([impact(), cleared()]);
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'applied',
				choice: 'combine_remove_members',
				receipt: {
					fold_id: proposalFoldId(IDS.CARD),
					folder_document_id: IDS.FOLDER,
					members_removed: [{ actor_id: IDS.ALICE, name: 'Alice' }],
					members_added: []
				}
			},
			description: { text: 'Combined Content Ops into DJ Internal · removed Alice' }
		});
		expect(f.deps.removeProjectMember).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: IDS.SOURCE,
				memberId: IDS.ALICE_MEMBER,
				userId: IDS.USER
			})
		);
		expect(f.deps.previewProjectFold).toHaveBeenCalledTimes(2);
		expect(f.deps.applyProjectFold).toHaveBeenCalledWith(
			expect.objectContaining({
				confirmationToken: 'token-2',
				foldId: proposalFoldId(IDS.CARD),
				memberAdditions: [],
				userId: IDS.USER
			})
		);
		expect(f.effects()[0]).toMatchObject({
			id: proposalCardClaimId(IDS.CARD, 'decide'),
			operation_name: 'proposal.project_combine.combine_remove_members',
			state: 'succeeded'
		});
		expect(f.toolResult().card_resolution.receipt.fold_id).toBe(proposalFoldId(IDS.CARD));
	});

	it('adds the people instead when asked', async () => {
		const f = fixture([impact(), impact({ additions: [IDS.ALICE], token: 'token-2' })]);
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_add_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'applied',
				receipt: {
					members_added: [{ actor_id: IDS.ALICE, name: 'Alice' }],
					members_removed: []
				}
			}
		});
		expect(f.deps.removeProjectMember).not.toHaveBeenCalled();
		expect(f.deps.applyProjectFold).toHaveBeenCalledWith(
			expect.objectContaining({ memberAdditions: [IDS.ALICE], confirmationToken: 'token-2' })
		);
	});

	it('refuses to remove an owner before claiming anything', async () => {
		const f = fixture([impact({ ownerMissing: true })]);
		const seen = projectCombineDigest(payloadFrom(impact({ ownerMissing: true })));
		expect(
			await resolveProposalCard({
				...f.base,
				choice: 'combine_remove_members',
				seenDigest: seen
			})
		).toMatchObject({ ok: false, status: 409, code: 'MEMBER_NOT_REMOVABLE' });
		expect(f.effects()).toHaveLength(0);
	});

	it('retries a stale_preview once when the digest still matches', async () => {
		const f = fixture([
			impact(),
			cleared(),
			cleared({ token: 'token-3', sourceName: 'Renamed' })
		]);
		f.deps.applyProjectFold = vi
			.fn()
			.mockRejectedValueOnce(
				new ProjectFoldError('stale_preview', 'changed', 409, 'project_fold_stale_preview')
			)
			.mockImplementationOnce(async (input) => ({
				fold_id: input.foldId,
				source_project_id: IDS.SOURCE,
				destination_project_id: IDS.DEST,
				folder_document_id: IDS.FOLDER,
				members_added: [],
				replayed: false,
				unfolded_at: null
			}));
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({ ok: true, resolution: { outcome: 'applied' } });
		expect(f.deps.applyProjectFold).toHaveBeenCalledTimes(2);
		expect((f.deps.applyProjectFold as any).mock.calls[1][0].confirmationToken).toBe('token-3');
	});

	it('does not retry when the content changed, and reports removed people plainly', async () => {
		const f = fixture([impact(), cleared(), cleared({ token: 'token-3', tasks: 9 })]);
		f.deps.applyProjectFold = vi
			.fn()
			.mockRejectedValue(
				new ProjectFoldError('stale_preview', 'changed', 409, 'project_fold_stale_preview')
			);
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'stale',
				receipt: { members_removed: [{ actor_id: IDS.ALICE, name: 'Alice' }] }
			},
			description: {
				text: 'Not combined. Alice was already removed from Content Ops before it stopped. Nothing else changed.'
			}
		});
		expect(f.deps.applyProjectFold).toHaveBeenCalledTimes(1);
		expect(f.effects()[0]).toMatchObject({ state: 'failed' });
	});

	it('releases the claim when the fold is blocked and nobody was removed', async () => {
		const f = fixture([impact(), impact({ additions: [IDS.ALICE], token: 'token-2' })]);
		f.deps.applyProjectFold = vi
			.fn()
			.mockRejectedValue(
				new ProjectFoldError('blocked', 'blocked', 409, 'project_fold_blocked', [
					'standalone_events_not_supported'
				])
			);
		expect(
			await resolveProposalCard({
				...f.base,
				choice: 'combine_add_members',
				seenDigest: SEEN
			})
		).toMatchObject({
			ok: false,
			status: 409,
			code: 'COMBINE_BLOCKED',
			details: { blockers: ['standalone_events_not_supported'] }
		});
		expect(f.effects()).toHaveLength(0);
	});

	it('decides an uncertain apply from the fold journal (idempotent by fold id)', async () => {
		const f = fixture([impact(), cleared()]);
		f.deps.applyProjectFold = vi
			.fn()
			.mockRejectedValue(new ProjectFoldError('unknown', 'network', 500));
		f.deps.readProjectFoldManifest = vi.fn(async (_admin, _user, foldId: string) => ({
			fold_id: foldId,
			source_project_id: IDS.SOURCE,
			destination_project_id: IDS.DEST,
			folder_document_id: IDS.FOLDER,
			receipt: {
				fold_id: foldId,
				source_project_id: IDS.SOURCE,
				destination_project_id: IDS.DEST,
				folder_document_id: IDS.FOLDER,
				members_added: [],
				replayed: false,
				unfolded_at: null
			},
			unfolded_at: null,
			unfold_receipt: null
		}));
		const result = await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'applied',
				receipt: { replayed: true, fold_id: proposalFoldId(IDS.CARD) }
			}
		});
		expect(f.deps.readProjectFoldManifest).toHaveBeenCalledWith(
			f.base.admin,
			IDS.USER,
			proposalFoldId(IDS.CARD)
		);
		// A second click replays the recorded outcome without touching the fold.
		const again = await resolveProposalCard({ ...f.base, choice: 'combine', seenDigest: SEEN });
		expect(again).toMatchObject({
			ok: true,
			alreadyResolved: true,
			resolution: { outcome: 'applied' }
		});
		expect(f.deps.applyProjectFold).toHaveBeenCalledTimes(1);
	});

	it('records unknown when the journal has no fold either', async () => {
		const f = fixture([impact({ missing: [] })]);
		f.deps.applyProjectFold = vi
			.fn()
			.mockRejectedValue(new ProjectFoldError('unknown', 'network', 500));
		const seen = projectCombineDigest(payloadFrom(impact({ missing: [] })));
		expect(
			await resolveProposalCard({ ...f.base, choice: 'combine', seenDigest: seen })
		).toMatchObject({ ok: true, resolution: { outcome: 'unknown' } });
		expect(f.effects()[0]).toMatchObject({ state: 'uncertain' });
	});

	it('Check again returns the fresh view and digest without claiming', async () => {
		const f = fixture([impact({ tasks: 4 })]);
		const preview = await previewProposalCard({ ...f.base, phase: 'decide' });
		expect(preview).toMatchObject({ ok: true, view: { counts: { tasks: 4 } } });
		expect((preview as any).digest).toBe(projectCombineDigest((preview as any).view));
		expect(f.effects()).toHaveLength(0);
	});
});

describe('combine card: Undo', () => {
	const unfold = (returning: Record<string, number> = { onto_documents: 3, onto_tasks: 2 }) =>
		parseUnfoldImpactV1({
			confirmation_token: 'unfold-token',
			impact: {
				fold_id: proposalFoldId(IDS.CARD),
				source: { id: IDS.SOURCE, name: 'Content Ops' },
				destination: { id: IDS.DEST, name: 'DJ Internal' },
				returning,
				staying: [],
				documents_filed_in_source: 3,
				folder_removed: true,
				members_added_by_fold_stay: [],
				tasks_to_reconcile: 0,
				source_restore: {
					unarchive: true,
					parent_project_id: null,
					parent_not_restored: false
				},
				blockers: []
			}
		})!;

	it('previews and applies the unfold with the seen digest', async () => {
		const f = fixture([impact(), cleared()]);
		await resolveProposalCard({
			...f.base,
			choice: 'combine_remove_members',
			seenDigest: SEEN
		});
		f.deps.previewProjectUnfold = vi.fn(async () => unfold());
		f.deps.applyProjectUnfold = vi.fn(async () => ({
			fold_id: proposalFoldId(IDS.CARD),
			moved_back: 5,
			staying: 0,
			folder_removed: true,
			parent_restored: false,
			members_added_by_fold_stay: 0,
			replayed: false
		}));
		const preview = await previewProposalCard({ ...f.base, phase: 'undo' });
		expect(preview).toMatchObject({ ok: true, view: { returning_total: 5 } });
		const digest = (preview as any).digest as string;
		expect(digest).toBe(
			projectCombineUndoDigest(projectCombineUndoViewFromUnfold(unfold(), 'x'))
		);

		const changed = await undoProposalCard({ ...f.base, seenDigest: 'f'.repeat(64) });
		expect(changed).toMatchObject({ ok: false, status: 409, code: 'PREVIEW_CHANGED' });
		expect(f.deps.applyProjectUnfold).not.toHaveBeenCalled();

		const undo = await undoProposalCard({ ...f.base, seenDigest: digest });
		expect(undo).toMatchObject({
			ok: true,
			undo: {
				outcome: 'undone',
				receipt: { moved_back: 5, fold_id: proposalFoldId(IDS.CARD) }
			},
			description: { text: 'Undone. Content Ops is back.' }
		});
		expect(f.deps.applyProjectUnfold).toHaveBeenCalledWith(
			expect.objectContaining({
				foldId: proposalFoldId(IDS.CARD),
				confirmationToken: 'unfold-token',
				userId: IDS.USER
			})
		);
		expect(f.effects()[1]).toMatchObject({
			id: proposalCardClaimId(IDS.CARD, 'undo'),
			state: 'succeeded'
		});
		expect(f.toolResult().card_undo).toMatchObject({ outcome: 'undone' });
	});
});
