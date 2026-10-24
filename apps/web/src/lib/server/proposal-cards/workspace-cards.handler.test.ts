// apps/web/src/lib/server/proposal-cards/workspace-cards.handler.test.ts
//
// The Workspace cards through the resolver (tasker 146): the click re-reads the items
// as the user, an item that left the Workspace answers 409 with the fresh view and
// claims nothing, the move runs through the Workspace mover once (the claim makes the
// click single use), the attached suggestion is answered after the move and only
// while it is open, "Not now" dismisses it, a mover refusal leaves the card usable,
// and Undo runs the mover's own undo.
import { describe, expect, it, vi } from 'vitest';
import {
	workspaceFileDigest,
	workspaceProjectDigest,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceItemV1,
	type WorkspaceProjectProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { WorkspaceError } from '$lib/server/workspace/workspace.service';
import { OntologyInstantiationError } from '$lib/services/ontology/instantiation.service';
import {
	resolveProposalCard,
	undoProposalCard,
	type ProposalCardDeps
} from './proposal-card.service';
import { proposalCardClaimId } from './claim';
import { IDS, NOW, cardRow, fakeDb, id, turnRow } from './proposal-card.test-helpers';

const WORKSPACE = id(40);
const TARGET = id(41);
const NOTE = id(42);
const TASK = id(43);
const SUGGESTION = id(44);
const BATCH = id(45);
const NEW_PROJECT = id(46);

const ITEMS: WorkspaceItemV1[] = [
	{ entity: 'document', id: NOTE, kind: 'note', title: 'Pricing thought' },
	{ entity: 'task', id: TASK, kind: 'task', title: 'Email Cadre' }
];

function filePayload(
	overrides: Partial<WorkspaceFileProposalPayloadV1> = {}
): WorkspaceFileProposalPayloadV1 {
	return {
		version: 1,
		workspace: { id: WORKSPACE, name: 'Workspace' },
		target: { id: TARGET, name: 'BuildOS' },
		items: ITEMS,
		nested_documents: 0,
		suggestion_id: SUGGESTION,
		reason: null,
		checked_at: '2026-10-17T11:59:00.000Z',
		...overrides
	};
}

function projectPayload(
	overrides: Partial<WorkspaceProjectProposalPayloadV1> = {}
): WorkspaceProjectProposalPayloadV1 {
	return {
		version: 1,
		workspace: { id: WORKSPACE, name: 'Workspace' },
		name: 'Pricing',
		description: null,
		items: ITEMS,
		nested_documents: 0,
		suggestion_id: SUGGESTION,
		checked_at: '2026-10-17T11:59:00.000Z',
		...overrides
	};
}

const itemArgs = ITEMS.map((item) => ({ entity: item.entity, id: item.id }));

function fixture(
	kind: 'workspace_file' | 'workspace_project',
	options: {
		payload?: WorkspaceFileProposalPayloadV1 | WorkspaceProjectProposalPayloadV1;
		live?: WorkspaceItemV1[];
		target?: Record<string, unknown> | null;
		suggestionStatus?: string;
		extra?: Record<string, unknown>;
	} = {}
) {
	const payload =
		options.payload ?? (kind === 'workspace_file' ? filePayload() : projectPayload());
	const args =
		kind === 'workspace_file'
			? {
					items: itemArgs,
					target_project_id: TARGET,
					suggestion_id: payload.suggestion_id ?? undefined
				}
			: {
					name: (payload as WorkspaceProjectProposalPayloadV1).name,
					items: itemArgs,
					suggestion_id: payload.suggestion_id ?? undefined
				};
	const admin = fakeDb({
		chat_tool_executions: [
			cardRow({
				kind,
				toolName:
					kind === 'workspace_file'
						? 'propose_workspace_filing'
						: 'propose_workspace_project',
				payload,
				arguments: args,
				extra: options.extra
			})
		],
		chat_turn_runs: [turnRow()],
		chat_turn_effects: []
	});
	const userDb = fakeDb({
		onto_projects:
			options.target === null
				? []
				: [
						{
							id: TARGET,
							name: 'BuildOS',
							kind: 'project',
							archived_at: null,
							deleted_at: null,
							merged_into_project_id: null,
							...options.target
						}
					]
	});
	const live = options.live ?? ITEMS;
	const deps: Partial<ProposalCardDeps> = {
		ensureWorkspaceProjectId: vi.fn(async () => WORKSPACE),
		loadWorkspaceItems: vi.fn(async () => ({
			items: live,
			missing: [],
			nested_documents: 0
		})),
		moveWorkspaceItems: vi.fn(async (input) => ({
			batch_id: BATCH,
			moved: input.items.length,
			blocked: []
		})),
		undoWorkspaceMove: vi.fn(async () => true),
		graduateWorkspaceItems: vi.fn(async (input) => ({
			project_id: NEW_PROJECT,
			project_name: input.name,
			batch_id: BATCH,
			moved: input.items.length
		})),
		undoWorkspaceGraduate: vi.fn(async () => ({ status: 'undone' as const })),
		loadWorkspaceSuggestion: vi.fn(
			async () =>
				({
					id: SUGGESTION,
					kind: kind === 'workspace_file' ? 'file' : 'graduate',
					status: options.suggestionStatus ?? 'open',
					result: {
						proposal: {
							type_key: 'project.creative.book',
							description: 'From the agent.'
						}
					}
				}) as never
		),
		markWorkspaceSuggestion: vi.fn(async () => {}),
		sleep: vi.fn(async () => {}),
		now: () => NOW
	};
	return {
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

const FILE_SEEN = workspaceFileDigest(filePayload());
const PROJECT_SEEN = workspaceProjectDigest(projectPayload());

describe('Workspace filing card: Choose', () => {
	it('files the items as the user, then accepts the suggestion', async () => {
		const f = fixture('workspace_file');
		const result = await resolveProposalCard({
			...f.base,
			choice: 'apply',
			seenDigest: FILE_SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'applied',
				receipt: {
					target_project_id: TARGET,
					batch_id: BATCH,
					moved: 2,
					suggestion_id: SUGGESTION,
					suggestion_updated: true
				}
			},
			description: { text: 'Filed 2 items into BuildOS', href: `/projects/${TARGET}` }
		});
		expect(f.deps.moveWorkspaceItems).toHaveBeenCalledWith(
			expect.objectContaining({
				session: f.base.userClient,
				userId: IDS.USER,
				sourceId: WORKSPACE,
				destinationId: TARGET,
				items: itemArgs
			})
		);
		expect(f.deps.markWorkspaceSuggestion).toHaveBeenCalledWith(
			f.base.admin,
			IDS.USER,
			SUGGESTION,
			'accepted',
			{ project_id: TARGET, batch_id: BATCH, moved: 2 }
		);
		expect(f.effects()[0]).toMatchObject({
			id: proposalCardClaimId(IDS.CARD, 'decide'),
			operation_name: 'proposal.workspace_file.apply',
			state: 'succeeded'
		});
		expect(f.toolResult().card_resolution.outcome).toBe('applied');

		// A second click is the same answer, never a second move.
		const again = await resolveProposalCard({
			...f.base,
			choice: 'apply',
			seenDigest: FILE_SEEN
		});
		expect(again).toMatchObject({ ok: true, alreadyResolved: true });
		expect(f.deps.moveWorkspaceItems).toHaveBeenCalledTimes(1);
	});

	it('answers 409 with the fresh view when an item left, then files what is left', async () => {
		const f = fixture('workspace_file', { live: [ITEMS[1]!] });
		const first = await resolveProposalCard({
			...f.base,
			choice: 'apply',
			seenDigest: FILE_SEEN
		});
		expect(first).toMatchObject({ ok: false, status: 409, code: 'PREVIEW_CHANGED' });
		const details = (first as { details?: any }).details;
		expect(details.view.items).toEqual([ITEMS[1]]);
		expect(details.digest).toBe(workspaceFileDigest(details.view));
		expect(f.effects()).toHaveLength(0);
		expect(f.deps.moveWorkspaceItems).not.toHaveBeenCalled();

		const second = await resolveProposalCard({
			...f.base,
			choice: 'apply',
			seenDigest: details.digest
		});
		expect(second).toMatchObject({ ok: true, resolution: { outcome: 'applied' } });
		expect(f.deps.moveWorkspaceItems).toHaveBeenCalledWith(
			expect.objectContaining({ items: [{ entity: 'task', id: TASK }] })
		);
	});

	it('settles stale when nothing is loose any more or the project is gone', async () => {
		const gone = fixture('workspace_file', { live: [] });
		expect(
			await resolveProposalCard({ ...gone.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'items_moved' },
			description: { text: 'These items already left the Workspace, so nothing moved.' }
		});
		expect(gone.deps.moveWorkspaceItems).not.toHaveBeenCalled();

		const archived = fixture('workspace_file', {
			target: { archived_at: '2026-10-16T00:00:00Z' }
		});
		expect(
			await resolveProposalCard({ ...archived.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'target_unavailable' }
		});

		const hidden = fixture('workspace_file', { target: null });
		expect(
			await resolveProposalCard({ ...hidden.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'target_unavailable' }
		});
	});

	it("never acts on a Workspace that isn't the user's own", async () => {
		const f = fixture('workspace_file');
		(f.deps.ensureWorkspaceProjectId as ReturnType<typeof vi.fn>).mockResolvedValue(id(99));
		expect(
			await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: true,
			resolution: { outcome: 'stale', reason_code: 'workspace_changed' }
		});
		expect(f.deps.loadWorkspaceItems).not.toHaveBeenCalled();
		expect(f.deps.moveWorkspaceItems).not.toHaveBeenCalled();
	});

	it('requires seen_digest to file', async () => {
		const f = fixture('workspace_file');
		expect(await resolveProposalCard({ ...f.base, choice: 'apply' })).toMatchObject({
			ok: false,
			status: 400,
			code: 'SEEN_DIGEST_REQUIRED'
		});
		expect(f.effects()).toHaveLength(0);
	});

	it('Not now dismisses the open suggestion and moves nothing', async () => {
		const f = fixture('workspace_file');
		expect(await resolveProposalCard({ ...f.base, choice: 'cancel' })).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'cancelled',
				receipt: { suggestion_id: SUGGESTION, suggestion_updated: true, batch_id: null }
			},
			description: { text: 'Not now. Nothing moved.' }
		});
		expect(f.deps.markWorkspaceSuggestion).toHaveBeenCalledWith(
			f.base.admin,
			IDS.USER,
			SUGGESTION,
			'dismissed',
			undefined
		);
		expect(f.deps.moveWorkspaceItems).not.toHaveBeenCalled();

		const answered = fixture('workspace_file', { suggestionStatus: 'accepted' });
		expect(await resolveProposalCard({ ...answered.base, choice: 'cancel' })).toMatchObject({
			ok: true,
			resolution: { outcome: 'cancelled', receipt: { suggestion_updated: false } }
		});
		expect(answered.deps.markWorkspaceSuggestion).not.toHaveBeenCalled();

		const plain = fixture('workspace_file', { payload: filePayload({ suggestion_id: null }) });
		expect(await resolveProposalCard({ ...plain.base, choice: 'cancel' })).toMatchObject({
			ok: true,
			resolution: { outcome: 'cancelled', receipt: null }
		});
		expect(plain.deps.loadWorkspaceSuggestion).not.toHaveBeenCalled();
	});

	it('keeps the card usable when the mover refuses before writing', async () => {
		const f = fixture('workspace_file');
		(f.deps.moveWorkspaceItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new WorkspaceError('Recurring tasks can’t move yet.', 409)
		);
		expect(
			await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: false,
			status: 409,
			code: 'MOVE_BLOCKED',
			message: 'Recurring tasks can’t move yet. Nothing changed.'
		});
		expect(f.effects()).toHaveLength(0);
		expect(f.deps.markWorkspaceSuggestion).not.toHaveBeenCalled();

		(f.deps.moveWorkspaceItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new WorkspaceError('You need edit access to both places to move these.', 403)
		);
		expect(
			await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({ ok: false, status: 403, code: 'ACCESS_REQUIRED' });
		expect(f.effects()).toHaveLength(0);
	});

	it('settles unknown, never released, when the move fails unexpectedly', async () => {
		const f = fixture('workspace_file');
		(f.deps.moveWorkspaceItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('socket hang up')
		);
		expect(
			await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN })
		).toMatchObject({
			ok: true,
			resolution: { outcome: 'unknown', reason_code: 'workspace_move_outcome_unknown' }
		});
		expect(f.effects()[0]).toMatchObject({ state: 'uncertain' });
	});
});

describe('Workspace filing card: Undo', () => {
	it('puts the batch back and says so', async () => {
		const f = fixture('workspace_file');
		await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN });
		const result = await undoProposalCard({ ...f.base });
		expect(result).toMatchObject({
			ok: true,
			undo: { outcome: 'undone', receipt: { batch_id: BATCH } },
			description: { text: 'Undone. The items are back in your Workspace.' }
		});
		expect(f.deps.undoWorkspaceMove).toHaveBeenCalledWith(
			expect.objectContaining({
				session: f.base.userClient,
				batchId: BATCH,
				userId: IDS.USER
			})
		);
	});

	it('settles stale when there is nothing left to put back', async () => {
		const f = fixture('workspace_file');
		(f.deps.undoWorkspaceMove as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
		await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: FILE_SEEN });
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: true,
			undo: { outcome: 'stale', reason_code: 'nothing_to_undo' }
		});
	});

	it('refuses to undo a card that never moved anything', async () => {
		const f = fixture('workspace_file');
		await resolveProposalCard({ ...f.base, choice: 'cancel' });
		expect(await undoProposalCard({ ...f.base })).toMatchObject({
			ok: false,
			code: 'NOT_UNDOABLE'
		});
		expect(f.deps.undoWorkspaceMove).not.toHaveBeenCalled();
	});
});

describe('Workspace start-a-project card', () => {
	it("starts the project with the suggestion's type, then accepts the suggestion", async () => {
		const f = fixture('workspace_project');
		const result = await resolveProposalCard({
			...f.base,
			choice: 'apply',
			seenDigest: PROJECT_SEEN
		});
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'applied',
				receipt: {
					project_id: NEW_PROJECT,
					project_name: 'Pricing',
					batch_id: BATCH,
					moved: 2,
					suggestion_updated: true
				}
			},
			description: { text: 'Started Pricing with 2 items', href: `/projects/${NEW_PROJECT}` }
		});
		expect(f.deps.graduateWorkspaceItems).toHaveBeenCalledWith(
			expect.objectContaining({
				session: f.base.userClient,
				name: 'Pricing',
				description: 'From the agent.',
				typeKey: 'project.creative.book',
				items: itemArgs,
				// Answered after the move, never inside it.
				suggestionId: null
			})
		);
		expect(f.deps.markWorkspaceSuggestion).toHaveBeenCalledWith(
			f.base.admin,
			IDS.USER,
			SUGGESTION,
			'accepted',
			{ project_id: NEW_PROJECT, batch_id: BATCH, moved: 2 }
		);
	});

	it('releases the claim when the project could not be created', async () => {
		const f = fixture('workspace_project');
		(f.deps.graduateWorkspaceItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new OntologyInstantiationError('insert failed')
		);
		expect(
			await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: PROJECT_SEEN })
		).toMatchObject({ ok: false, code: 'INTERNAL' });
		expect(f.effects()).toHaveLength(0);
	});

	it('undoes, keeping a project something else was added to', async () => {
		const f = fixture('workspace_project');
		(f.deps.undoWorkspaceGraduate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			status: 'items_back_project_kept'
		});
		await resolveProposalCard({ ...f.base, choice: 'apply', seenDigest: PROJECT_SEEN });
		const result = await undoProposalCard({ ...f.base });
		expect(result).toMatchObject({
			ok: true,
			undo: {
				outcome: 'undone',
				receipt: { project_id: NEW_PROJECT, batch_id: BATCH, project_removed: false }
			}
		});
		expect((result as { description: { text: string } }).description.text).toContain(
			'Pricing stays'
		);
		expect(f.deps.undoWorkspaceGraduate).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: NEW_PROJECT, batchId: BATCH })
		);
	});
});
