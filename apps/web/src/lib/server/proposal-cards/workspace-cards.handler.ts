// apps/web/src/lib/server/proposal-cards/workspace-cards.handler.ts
//
// The Workspace cards' click and Undo (tasker 146, Phase 2). Chat proposed filing
// loose Workspace items into a project (`workspace_file`) or starting a project from
// them (`workspace_project`); the user's click is the only consent. Everything runs
// through the Workspace's own mover (workspace.service.ts: moveItems / graduateItems,
// one Organize batch, undoable) under the user's session, so a forged card can only do
// what the user could already do from the Workspace shelf.
//
// Order (mirrors the combine card):
// 1. "Not now": dismiss the attached suggestion if it is still open, then settle.
// 2. Re-read the items (still loose in the user's own Workspace) and, for filing, the
//    target; nothing loose any more or a gone target settles the card as stale.
// 3. If the fresh view's visibleDigest differs from what the user saw (`seen_digest`),
//    answer 409 PREVIEW_CHANGED with the fresh view. Nothing is claimed or changed.
// 4. Claim (the resolver), then move or graduate. The claim makes the click single
//    use: a second click waits for this one's outcome instead of moving twice.
// 5. Mark the attached suggestion accepted (best effort: the move stands either way).
//
// Errors the mover raises before writing release the claim (the card stays usable);
// anything unexpected settles as unknown, never as "nothing changed".
import {
	workspaceFileDigest,
	workspaceProjectDigest,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceFileReceiptV1,
	type WorkspaceItemV1,
	type WorkspaceProjectProposalPayloadV1,
	type WorkspaceProjectReceiptV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { OntologyInstantiationError } from '$lib/services/ontology/instantiation.service';
import { OrganizeError } from '$lib/server/organize/organize-service';
import { OrganizeSnapshotError } from '$lib/server/organize/organize-snapshot';
import { WorkspaceError, suggestionProposal } from '$lib/server/workspace/workspace.service';
import {
	failure,
	type DecideActionResult,
	type PreparedAction,
	type ProposalCardFailure,
	type ProposalCardHandler,
	type ProposalCardHandlerContext,
	type UndoActionResult
} from './types';

type WorkspacePayload = WorkspaceFileProposalPayloadV1 | WorkspaceProjectProposalPayloadV1;
type Ctx<P extends WorkspacePayload> = ProposalCardHandlerContext<P>;

const settled = <A extends DecideActionResult | UndoActionResult>(
	outcome: Extract<A, { kind: 'resolved' }>['outcome'],
	reasonCode: string | null,
	receipt: Record<string, unknown> | null = null
) => ({ kind: 'resolved', outcome, reasonCode, receipt }) as Extract<A, { kind: 'resolved' }>;

const released = <A extends DecideActionResult | UndoActionResult>(failed: ProposalCardFailure) =>
	({ kind: 'released', failure: failed }) as A;

// ---------------------------------------------------------------------------
// The mover's errors.

type ErrorAnswer =
	| { kind: 'released'; failure: ProposalCardFailure }
	| { kind: 'stale'; code: string }
	| { kind: 'unknown' };

/**
 * What a mover error means. WorkspaceError, OrganizeError and OrganizeSnapshotError are
 * raised before anything is written (Organize applies in one RPC and re-reads its batch
 * on a lost response), and a failed instantiation cleans up after itself; graduateItems
 * removes the empty project when the move fails. Anything else may have written.
 */
function classify(error: unknown, nothingToDo: string): ErrorAnswer {
	if (
		error instanceof WorkspaceError ||
		error instanceof OrganizeError ||
		error instanceof OrganizeSnapshotError
	) {
		const status = error.status;
		if (status === 401 || status === 403)
			return { kind: 'released', failure: failure(403, 'ACCESS_REQUIRED', error.message) };
		if (status === 404) return { kind: 'stale', code: nothingToDo };
		if (status >= 500)
			return {
				kind: 'released',
				failure: failure(500, 'INTERNAL', `${error.message} Nothing changed.`)
			};
		// 400/409: blocked (a recurring task, a project that changed mid-move). The
		// message is the mover's own user-facing sentence.
		return {
			kind: 'released',
			failure: failure(409, 'MOVE_BLOCKED', `${error.message} Nothing changed.`)
		};
	}
	if (error instanceof OntologyInstantiationError)
		return {
			kind: 'released',
			failure: failure(500, 'INTERNAL', 'Couldn’t start the project. Nothing changed.')
		};
	return { kind: 'unknown' };
}

/** After a mover error: released when nothing was written, else stale or unknown. */
function afterError<A extends DecideActionResult | UndoActionResult>(
	error: unknown,
	nothingToDo: string,
	unknownCode: string
): A {
	const answer = classify(error, nothingToDo);
	if (answer.kind === 'released') return released<A>(answer.failure);
	return {
		kind: 'resolved',
		outcome: answer.kind === 'stale' ? 'stale' : 'unknown',
		reasonCode: answer.kind === 'stale' ? answer.code : unknownCode,
		receipt: null
	} as A;
}

// ---------------------------------------------------------------------------
// Fresh view: the items still loose in the user's own Workspace.

type View<P> = { view: P; digest: string } | { stale: string } | { fail: ProposalCardFailure };

async function looseItems<P extends WorkspacePayload>(
	ctx: Ctx<P>
): Promise<
	{ items: WorkspaceItemV1[]; nested: number } | { stale: string } | { fail: ProposalCardFailure }
> {
	let workspaceId: string;
	try {
		workspaceId = (await ctx.deps.ensureWorkspaceProjectId(ctx.userClient)).toLowerCase();
	} catch {
		return {
			fail: failure(500, 'INTERNAL', 'Could not open your Workspace. Nothing changed.')
		};
	}
	// The card names the user's own Workspace or it is not theirs to act on.
	if (workspaceId !== ctx.payload.workspace.id) return { stale: 'workspace_changed' };
	try {
		const loaded = await ctx.deps.loadWorkspaceItems(ctx.userClient, {
			workspaceProjectId: workspaceId,
			items: ctx.payload.items.map((item) => ({ entity: item.entity, id: item.id }))
		});
		if (!loaded.items.length) return { stale: 'items_moved' };
		return { items: loaded.items, nested: loaded.nested_documents };
	} catch {
		return {
			fail: failure(500, 'INTERNAL', 'Could not check your Workspace. Nothing changed.')
		};
	}
}

type TargetRow = {
	id: string;
	name: string;
	kind: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	merged_into_project_id: string | null;
};

async function fileView(
	ctx: Ctx<WorkspaceFileProposalPayloadV1>
): Promise<View<WorkspaceFileProposalPayloadV1>> {
	const loose = await looseItems(ctx);
	if ('stale' in loose || 'fail' in loose) return loose;
	const { data, error } = await ctx.userClient
		.from('onto_projects')
		.select('id, name, kind, archived_at, deleted_at, merged_into_project_id')
		.eq('id', ctx.payload.target.id)
		.maybeSingle();
	if (error)
		return { fail: failure(500, 'INTERNAL', 'Could not check that project. Nothing changed.') };
	const target = data as TargetRow | null;
	// RLS hides a project the user can no longer open: that reads as gone.
	if (
		!target ||
		target.kind === 'workspace' ||
		target.deleted_at ||
		target.archived_at ||
		target.merged_into_project_id
	)
		return { stale: 'target_unavailable' };
	const view: WorkspaceFileProposalPayloadV1 = {
		...ctx.payload,
		target: { id: ctx.payload.target.id, name: target.name },
		items: loose.items,
		nested_documents: loose.nested,
		checked_at: ctx.deps.now().toISOString()
	};
	return { view, digest: workspaceFileDigest(view) };
}

async function projectView(
	ctx: Ctx<WorkspaceProjectProposalPayloadV1>
): Promise<View<WorkspaceProjectProposalPayloadV1>> {
	const loose = await looseItems(ctx);
	if ('stale' in loose || 'fail' in loose) return loose;
	const view: WorkspaceProjectProposalPayloadV1 = {
		...ctx.payload,
		items: loose.items,
		nested_documents: loose.nested,
		checked_at: ctx.deps.now().toISOString()
	};
	return { view, digest: workspaceProjectDigest(view) };
}

/** Steps 2-3: a stale card settles, a changed one answers with the fresh view. */
function checkSeen<P>(
	fresh: View<P>,
	seenDigest: string | null
): { view: P } | PreparedAction<DecideActionResult> {
	if ('fail' in fresh) return { kind: 'fail', failure: fresh.fail };
	if ('stale' in fresh)
		return { kind: 'settle', result: settled<DecideActionResult>('stale', fresh.stale) };
	if (!seenDigest)
		return {
			kind: 'fail',
			failure: failure(400, 'SEEN_DIGEST_REQUIRED', 'seen_digest is required.')
		};
	if (fresh.digest !== seenDigest)
		return {
			kind: 'fail',
			failure: failure(
				409,
				'PREVIEW_CHANGED',
				'Your Workspace changed since this card. Here is what’s there now. Nothing changed.',
				{ view: fresh.view, digest: fresh.digest }
			)
		};
	return { view: fresh.view };
}

// ---------------------------------------------------------------------------
// The attached suggestion.

/** Answers the suggestion only while it is still open; never fails the click. */
async function answerSuggestion<P extends WorkspacePayload>(
	ctx: Ctx<P>,
	status: 'accepted' | 'dismissed',
	outcome?: Record<string, unknown>
): Promise<boolean> {
	const suggestionId = ctx.payload.suggestion_id;
	if (!suggestionId) return false;
	try {
		const row = await ctx.deps.loadWorkspaceSuggestion(ctx.admin, ctx.userId, suggestionId);
		if (row.status !== 'open') return false;
		await ctx.deps.markWorkspaceSuggestion(
			ctx.admin,
			ctx.userId,
			suggestionId,
			status,
			outcome
		);
		return true;
	} catch (error) {
		console.error('[Workspace card] could not answer the suggestion:', error);
		return false;
	}
}

/** "Not now": dismiss the attached suggestion (as the shelf's Not now does). */
function prepareNotNow<P extends WorkspacePayload>(
	ctx: Ctx<P>,
	receipt: (updated: boolean) => Record<string, unknown>
): PreparedAction<DecideActionResult> {
	if (!ctx.payload.suggestion_id)
		return { kind: 'settle', result: settled<DecideActionResult>('cancelled', null) };
	return {
		kind: 'run',
		run: async () =>
			settled<DecideActionResult>(
				'cancelled',
				null,
				receipt(await answerSuggestion(ctx, 'dismissed'))
			)
	};
}

// ---------------------------------------------------------------------------
// workspace_file

function fileReceipt(
	ctx: Ctx<WorkspaceFileProposalPayloadV1>,
	fields: Partial<WorkspaceFileReceiptV1>
): WorkspaceFileReceiptV1 {
	return {
		target_project_id: ctx.payload.target.id,
		batch_id: fields.batch_id ?? null,
		moved: fields.moved ?? 0,
		suggestion_id: ctx.payload.suggestion_id,
		suggestion_updated: fields.suggestion_updated ?? false
	};
}

const NOT_UNDOABLE = failure(409, 'NOT_UNDOABLE', 'This card can’t be undone. Nothing changed.');

export const workspaceFileHandler: ProposalCardHandler<WorkspaceFileProposalPayloadV1> = {
	async prepareDecide(ctx, { choice, seenDigest }) {
		if (choice === 'cancel')
			return prepareNotNow(ctx, (updated) =>
				fileReceipt(ctx, { suggestion_updated: updated })
			);
		const checked = checkSeen(await fileView(ctx), seenDigest);
		if (!('view' in checked)) return checked;
		const view = checked.view;
		return {
			kind: 'run',
			run: async (): Promise<DecideActionResult> => {
				let moved: Awaited<ReturnType<typeof ctx.deps.moveWorkspaceItems>>;
				try {
					moved = await ctx.deps.moveWorkspaceItems({
						session: ctx.userClient,
						admin: ctx.admin,
						userId: ctx.userId,
						sourceId: view.workspace.id,
						destinationId: view.target.id,
						items: view.items.map((item) => ({ entity: item.entity, id: item.id }))
					});
				} catch (error) {
					return afterError<DecideActionResult>(
						error,
						'items_moved',
						'workspace_move_outcome_unknown'
					);
				}
				const updated = await answerSuggestion(ctx, 'accepted', {
					project_id: view.target.id,
					batch_id: moved.batch_id,
					moved: moved.moved
				});
				return settled<DecideActionResult>(
					'applied',
					null,
					fileReceipt(ctx, {
						batch_id: moved.batch_id,
						moved: moved.moved,
						suggestion_updated: updated
					})
				);
			}
		};
	},

	async prepareUndo(ctx, { resolution }) {
		const receipt = resolution.receipt as WorkspaceFileReceiptV1 | null;
		if (!receipt?.batch_id) return { kind: 'fail', failure: NOT_UNDOABLE };
		const batchId = receipt.batch_id;
		return {
			kind: 'run',
			run: async (): Promise<UndoActionResult> => {
				try {
					const undone = await ctx.deps.undoWorkspaceMove({
						session: ctx.userClient,
						admin: ctx.admin,
						userId: ctx.userId,
						batchId
					});
					return undone
						? settled<UndoActionResult>('undone', null, { batch_id: batchId })
						: settled<UndoActionResult>('stale', 'nothing_to_undo');
				} catch (error) {
					return afterError<UndoActionResult>(
						error,
						'nothing_to_undo',
						'workspace_undo_outcome_unknown'
					);
				}
			}
		};
	}
};

// ---------------------------------------------------------------------------
// workspace_project

function projectReceipt(
	ctx: Ctx<WorkspaceProjectProposalPayloadV1>,
	fields: Partial<WorkspaceProjectReceiptV1>
): WorkspaceProjectReceiptV1 {
	return {
		project_id: fields.project_id ?? null,
		project_name: fields.project_name ?? null,
		batch_id: fields.batch_id ?? null,
		moved: fields.moved ?? 0,
		suggestion_id: ctx.payload.suggestion_id,
		suggestion_updated: fields.suggestion_updated ?? false
	};
}

/** The graduate suggestion's own type_key / description, as /api/workspace/graduate uses them. */
async function suggestionDetails(
	ctx: Ctx<WorkspaceProjectProposalPayloadV1>
): Promise<{ type_key: string | null; description: string | null }> {
	const none = { type_key: null, description: null };
	if (!ctx.payload.suggestion_id) return none;
	try {
		const row = await ctx.deps.loadWorkspaceSuggestion(
			ctx.admin,
			ctx.userId,
			ctx.payload.suggestion_id
		);
		return row.kind === 'graduate' ? suggestionProposal(row) : none;
	} catch {
		return none;
	}
}

export const workspaceProjectHandler: ProposalCardHandler<WorkspaceProjectProposalPayloadV1> = {
	async prepareDecide(ctx, { choice, seenDigest }) {
		if (choice === 'cancel')
			return prepareNotNow(ctx, (updated) =>
				projectReceipt(ctx, { suggestion_updated: updated })
			);
		const checked = checkSeen(await projectView(ctx), seenDigest);
		if (!('view' in checked)) return checked;
		const view = checked.view;
		const details = await suggestionDetails(ctx);
		return {
			kind: 'run',
			run: async (): Promise<DecideActionResult> => {
				let started: Awaited<ReturnType<typeof ctx.deps.graduateWorkspaceItems>>;
				try {
					// The suggestion is answered below, after the move, so a failed
					// answer can never read as a failed graduate.
					started = await ctx.deps.graduateWorkspaceItems({
						session: ctx.userClient,
						admin: ctx.admin,
						userId: ctx.userId,
						name: view.name,
						description: view.description ?? details.description,
						typeKey: details.type_key,
						items: view.items.map((item) => ({ entity: item.entity, id: item.id })),
						suggestionId: null
					});
				} catch (error) {
					return afterError<DecideActionResult>(
						error,
						'items_moved',
						'workspace_graduate_outcome_unknown'
					);
				}
				const updated = await answerSuggestion(ctx, 'accepted', {
					project_id: started.project_id,
					batch_id: started.batch_id,
					moved: started.moved
				});
				return settled<DecideActionResult>(
					'applied',
					null,
					projectReceipt(ctx, {
						project_id: started.project_id,
						project_name: started.project_name,
						batch_id: started.batch_id,
						moved: started.moved,
						suggestion_updated: updated
					})
				);
			}
		};
	},

	async prepareUndo(ctx, { resolution }) {
		const receipt = resolution.receipt as WorkspaceProjectReceiptV1 | null;
		if (!receipt?.batch_id || !receipt.project_id)
			return { kind: 'fail', failure: NOT_UNDOABLE };
		const { batch_id: batchId, project_id: projectId } = receipt;
		return {
			kind: 'run',
			run: async (): Promise<UndoActionResult> => {
				try {
					const result = await ctx.deps.undoWorkspaceGraduate({
						session: ctx.userClient,
						admin: ctx.admin,
						userId: ctx.userId,
						projectId,
						batchId
					});
					if (result.status === 'nothing')
						return settled<UndoActionResult>('stale', 'nothing_to_undo');
					return settled<UndoActionResult>('undone', null, {
						project_id: projectId,
						batch_id: batchId,
						project_removed: result.status === 'undone'
					});
				} catch (error) {
					return afterError<UndoActionResult>(
						error,
						'nothing_to_undo',
						'workspace_undo_outcome_unknown'
					);
				}
			}
		};
	}
};
