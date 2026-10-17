// apps/web/src/lib/server/proposal-cards/project-combine.handler.ts
//
// The combine card's click and Undo (tasker 122, WP5). The member policy comes
// from the click, never the model. Order (plan §3):
//
// 1. Fresh fold preview; if its visibleDigest differs from what the user saw
//    (`seen_digest`), answer 409 PREVIEW_CHANGED with the fresh view. Nothing
//    is claimed or changed.
// 2. Claim the card.
// 3. "Remove them": remove each person the destination lacks from the source
//    (removeProjectMember, the members route's own checks).
// 4. Preview again with the choice applied; require the same content counts
//    and no blockers.
// 5. Apply with fold_id = uuid(sha256('proposal_fold:' + card)), which makes the
//    apply idempotent. `stale_preview` retries once if the digest still
//    matches; an uncertain failure reads the fold journal to decide.
// 6. Settle with fold_id and the people removed or added.
//
// Once anyone was removed the claim is never released: the card says plainly
// that people lost access even if nothing combined.
import {
	projectCombineContentDigest,
	projectCombineDigest,
	projectCombinePayloadFromImpact,
	projectCombineUndoDigest,
	projectCombineUndoViewFromUnfold,
	type FoldImpactV1,
	type ProjectCombinePersonV1,
	type ProjectCombineProposalPayloadV1,
	type ProjectCombineReceiptV1,
	type UnfoldImpactV1
} from '@buildos/shared-agent-ops/chat-cards/project-combine-card';
import {
	toProjectFoldError,
	type ProjectFoldError,
	type ProjectUnfoldReceiptV1
} from '$lib/server/project-fold/project-fold.service';
import { deterministicUuid } from './claim';
import {
	failure,
	type DecideActionResult,
	type PreparedAction,
	type ProposalCardFailure,
	type ProposalCardHandler,
	type ProposalCardHandlerContext,
	type UndoActionResult
} from './types';

type Ctx = ProposalCardHandlerContext<ProjectCombineProposalPayloadV1>;

/** Deterministic per card: a retried or replayed apply is the same fold. */
export function proposalFoldId(cardId: string): string {
	return deterministicUuid(`proposal_fold:${cardId.toLowerCase()}`);
}

/** Errors that mean "this can't happen any more": the card settles as stale. */
const DEFINITIVE = new Set<ProjectFoldError['code']>([
	'project_missing',
	'destination_archived',
	'source_already_merged',
	'same_project',
	'invalid',
	'unfold_not_found',
	'unfold_already_done',
	'unfold_source_changed'
]);

/** How a fold error answers when nothing has been written. */
function refusal(
	error: ProjectFoldError,
	blockedCode: 'COMBINE_BLOCKED' | 'UNDO_BLOCKED'
): { stale: string } | { failure: ProposalCardFailure } {
	if (DEFINITIVE.has(error.code)) return { stale: error.rpcCode ?? error.code };
	switch (error.code) {
		case 'access_denied':
			return { failure: failure(403, 'ACCESS_REQUIRED', error.message) };
		case 'blocked':
			return {
				failure: failure(409, blockedCode, error.message, { blockers: error.blockers })
			};
		case 'stale_preview':
		case 'invalid_member_addition':
			return {
				failure: failure(
					409,
					'PREVIEW_CHANGED',
					'The projects changed since you looked. Check again. Nothing changed.'
				)
			};
		case 'not_deployed':
		case 'service_only':
			return { failure: failure(503, 'NOT_AVAILABLE', error.message) };
		default:
			return {
				failure: failure(
					500,
					'INTERNAL',
					'Could not check these projects. Nothing changed.'
				)
			};
	}
}

/** A read-only preview failed: nothing to claim or release, just say why. */
function viewFailure(
	error: ProjectFoldError,
	conflictCode: 'COMBINE_BLOCKED' | 'NOT_UNDOABLE'
): ProposalCardFailure {
	if (error.status === 401 || error.status === 403)
		return failure(403, 'ACCESS_REQUIRED', error.message);
	if (error.status === 503) return failure(503, 'NOT_AVAILABLE', error.message);
	if (error.status >= 500) return failure(500, 'INTERNAL', error.message);
	return failure(
		error.status === 404 ? 404 : 409,
		conflictCode,
		error.message,
		error.blockers.length ? { blockers: error.blockers } : undefined
	);
}

function combineView(ctx: Ctx, impact: FoldImpactV1): ProjectCombineProposalPayloadV1 {
	return projectCombinePayloadFromImpact(impact, {
		checkedAt: ctx.deps.now().toISOString(),
		duplicateCheck: ctx.payload.duplicate_check,
		note: ctx.payload.note
	});
}

function previewArgs(ctx: Ctx, memberAdditions: readonly string[] = []) {
	return {
		session: ctx.userClient,
		admin: ctx.admin,
		userId: ctx.userId,
		sourceProjectId: ctx.payload.source.id,
		destinationProjectId: ctx.payload.destination.id,
		memberAdditions
	};
}

type Removal = { memberId: string; actor_id: string; name: string };

/** The source's live member rows for everyone the destination lacks; every one must be removable. */
async function plannedRemovals(
	ctx: Ctx,
	impact: FoldImpactV1
): Promise<{ removals: Removal[] } | { failure: ProposalCardFailure }> {
	const missing = impact.members_missing;
	if (!missing.length) return { removals: [] };
	const notRemovable = failure(
		409,
		'MEMBER_NOT_REMOVABLE',
		'An owner of this project can’t be removed. Choose “Add them” instead. Nothing changed.'
	);
	const { data, error } = await ctx.userClient
		.from('onto_project_members')
		.select('id, actor_id, role_key')
		.eq('project_id', ctx.payload.source.id)
		.in('actor_id', missing)
		.is('removed_at', null);
	if (error)
		return {
			failure: failure(
				500,
				'INTERNAL',
				'Could not load the project’s people. Nothing changed.'
			)
		};
	const rows = (data ?? []) as Array<{ id: string; actor_id: string; role_key: string }>;
	const names = new Map(impact.members.map((member) => [member.actor_id, member.name]));
	const removals: Removal[] = [];
	for (const actorId of missing) {
		const row = rows.find((candidate) => candidate.actor_id === actorId);
		// No row: the source's creator, counted as owner by the fold.
		if (!row || row.role_key === 'owner') return { failure: notRemovable };
		removals.push({
			memberId: row.id,
			actor_id: actorId,
			name: names.get(actorId)?.trim() || 'Someone'
		});
	}
	return { removals };
}

function combineReceipt(
	ctx: Ctx,
	fields: Partial<ProjectCombineReceiptV1> & { members_removed: ProjectCombinePersonV1[] }
): ProjectCombineReceiptV1 {
	return {
		fold_id: fields.fold_id ?? null,
		source_project_id: ctx.payload.source.id,
		destination_project_id: ctx.payload.destination.id,
		folder_document_id: fields.folder_document_id ?? null,
		members_removed: fields.members_removed,
		members_added: fields.members_added ?? [],
		replayed: fields.replayed ?? false
	};
}

async function applyCombine(
	ctx: Ctx,
	plan: {
		base: FoldImpactV1;
		baseView: ProjectCombineProposalPayloadV1;
		removals: Removal[];
		additions: string[];
	}
): Promise<DecideActionResult> {
	const removed: ProjectCombinePersonV1[] = [];
	const stale = (reasonCode: string, foldId: string | null = null): DecideActionResult => ({
		kind: 'resolved',
		outcome: 'stale',
		reasonCode,
		receipt: combineReceipt(ctx, { members_removed: removed, fold_id: foldId })
	});
	/** After a fold error: settled once anyone was removed, else refused or stale. */
	const afterError = (error: ProjectFoldError): DecideActionResult => {
		if (removed.length) return stale(error.rpcCode ?? error.code);
		const answer = refusal(error, 'COMBINE_BLOCKED');
		return 'stale' in answer
			? stale(answer.stale)
			: { kind: 'released', failure: answer.failure };
	};

	// 3. Remove the people the destination lacks, one at a time, as the user.
	for (const removal of plan.removals) {
		let result: Awaited<ReturnType<typeof ctx.deps.removeProjectMember>> | null = null;
		try {
			result = await ctx.deps.removeProjectMember({
				supabase: ctx.userClient,
				userId: ctx.userId,
				projectId: ctx.payload.source.id,
				memberId: removal.memberId
			});
		} catch {
			result = null;
		}
		if (!result?.ok) {
			if (removed.length) return stale('member_removal_failed');
			return {
				kind: 'released',
				failure:
					result?.reason === 'forbidden'
						? failure(
								403,
								'ACCESS_REQUIRED',
								`You need admin access to remove people from ${ctx.payload.source.name}. Nothing changed.`
							)
						: failure(
								409,
								'MEMBER_REMOVAL_FAILED',
								`Couldn’t remove ${removal.name}. Nothing changed. Check again.`
							)
			};
		}
		removed.push({ actor_id: removal.actor_id, name: removal.name });
	}

	// 4. Preview with the choice applied: same content, no blockers.
	let ready = plan.base;
	if (removed.length || plan.additions.length) {
		try {
			ready = await ctx.deps.previewProjectFold(previewArgs(ctx, plan.additions));
		} catch (error) {
			return afterError(toProjectFoldError(error));
		}
		const readyView = combineView(ctx, ready);
		if (
			ready.blockers.length ||
			projectCombineContentDigest(readyView) !== projectCombineContentDigest(plan.baseView)
		) {
			if (removed.length) return stale('preview_changed_after_member_change');
			return {
				kind: 'released',
				failure: failure(
					409,
					'PREVIEW_CHANGED',
					'The projects changed since you looked. Check again. Nothing changed.'
				)
			};
		}
	}

	// 5. Apply, idempotent by fold id.
	const foldId = proposalFoldId(ctx.cardId);
	const names = new Map(ctx.payload.members_missing.map((m) => [m.actor_id, m.name]));
	for (const member of plan.base.members) names.set(member.actor_id, member.name ?? 'Someone');
	const apply = (preview: FoldImpactV1) =>
		ctx.deps.applyProjectFold({
			...previewArgs(ctx, plan.additions),
			confirmationToken: preview.confirmation_token,
			foldId
		});
	const applied = (receipt: {
		folder_document_id: string | null;
		members_added: string[];
		replayed: boolean;
	}): DecideActionResult => ({
		kind: 'resolved',
		outcome: 'applied',
		reasonCode: null,
		receipt: combineReceipt(ctx, {
			fold_id: foldId,
			folder_document_id: receipt.folder_document_id,
			members_removed: removed,
			members_added: receipt.members_added.map((actorId) => ({
				actor_id: actorId,
				name: names.get(actorId) || 'Someone'
			})),
			replayed: receipt.replayed
		})
	});
	/** An apply that may have committed: the fold journal decides. */
	const fromJournal = async (error: ProjectFoldError): Promise<DecideActionResult> => {
		try {
			const manifest = await ctx.deps.readProjectFoldManifest(ctx.admin, ctx.userId, foldId);
			if (manifest?.receipt)
				return applied({
					folder_document_id: manifest.receipt.folder_document_id,
					members_added: manifest.receipt.members_added,
					replayed: true
				});
			if (manifest)
				return applied({
					folder_document_id: manifest.folder_document_id,
					members_added: [],
					replayed: true
				});
		} catch {
			// Fall through: unknown.
		}
		if (error.code === 'idempotency_conflict') return afterError(error);
		return {
			kind: 'resolved',
			outcome: 'unknown',
			reasonCode: 'project_fold_outcome_unknown',
			receipt: combineReceipt(ctx, { members_removed: removed, fold_id: foldId })
		};
	};
	const uncertain = (error: ProjectFoldError) =>
		error.code === 'unknown' ||
		error.code === 'invalid_response' ||
		error.code === 'idempotency_conflict';

	try {
		return applied(await apply(ready));
	} catch (firstError) {
		const error = toProjectFoldError(firstError);
		if (uncertain(error)) return fromJournal(error);
		if (error.code !== 'stale_preview') return afterError(error);
	}
	// stale_preview: something not shown on the card changed (a rename, a
	// timestamp). Retry once when the visible digest still matches.
	let again: FoldImpactV1;
	try {
		again = await ctx.deps.previewProjectFold(previewArgs(ctx, plan.additions));
	} catch (error) {
		return afterError(toProjectFoldError(error));
	}
	if (
		again.blockers.length ||
		projectCombineDigest(combineView(ctx, again)) !==
			projectCombineDigest(combineView(ctx, ready))
	) {
		if (removed.length) return stale('project_fold_stale_preview');
		return {
			kind: 'released',
			failure: failure(
				409,
				'PREVIEW_CHANGED',
				'The projects changed since you looked. Check again. Nothing changed.'
			)
		};
	}
	try {
		return applied(await apply(again));
	} catch (secondError) {
		const error = toProjectFoldError(secondError);
		if (uncertain(error)) return fromJournal(error);
		return afterError(error);
	}
}

function undoReceipt(receipt: ProjectUnfoldReceiptV1): Record<string, unknown> {
	return {
		fold_id: receipt.fold_id,
		moved_back: receipt.moved_back,
		staying: receipt.staying,
		folder_removed: receipt.folder_removed,
		parent_restored: receipt.parent_restored,
		members_added_by_fold_stay: receipt.members_added_by_fold_stay,
		replayed: receipt.replayed
	};
}

async function applyUndo(
	ctx: Ctx,
	foldId: string,
	impact: UnfoldImpactV1
): Promise<UndoActionResult> {
	const unfoldArgs = { session: ctx.userClient, admin: ctx.admin, userId: ctx.userId, foldId };
	const after = async (error: ProjectFoldError): Promise<UndoActionResult> => {
		if (error.code === 'unknown' || error.code === 'invalid_response') {
			try {
				const manifest = await ctx.deps.readProjectFoldManifest(
					ctx.admin,
					ctx.userId,
					foldId
				);
				if (manifest?.unfolded_at)
					return {
						kind: 'resolved',
						outcome: 'undone',
						reasonCode: null,
						receipt: { fold_id: foldId, replayed: true }
					};
			} catch {
				// Fall through: unknown.
			}
			return {
				kind: 'resolved',
				outcome: 'unknown',
				reasonCode: 'project_unfold_outcome_unknown',
				receipt: null
			};
		}
		const answer = refusal(error, 'UNDO_BLOCKED');
		return 'stale' in answer
			? { kind: 'resolved', outcome: 'stale', reasonCode: answer.stale, receipt: null }
			: { kind: 'released', failure: answer.failure };
	};
	try {
		const receipt = await ctx.deps.applyProjectUnfold({
			...unfoldArgs,
			confirmationToken: impact.confirmation_token
		});
		return {
			kind: 'resolved',
			outcome: 'undone',
			reasonCode: null,
			receipt: undoReceipt(receipt)
		};
	} catch (firstError) {
		const error = toProjectFoldError(firstError);
		if (error.code !== 'stale_preview') return after(error);
	}
	let again: UnfoldImpactV1;
	try {
		again = await ctx.deps.previewProjectUnfold(unfoldArgs);
	} catch (error) {
		return after(toProjectFoldError(error));
	}
	const now = ctx.deps.now().toISOString();
	if (
		again.blockers.length ||
		projectCombineUndoDigest(projectCombineUndoViewFromUnfold(again, now)) !==
			projectCombineUndoDigest(projectCombineUndoViewFromUnfold(impact, now))
	)
		return {
			kind: 'released',
			failure: failure(
				409,
				'PREVIEW_CHANGED',
				'What would come back changed since you looked. Check again. Nothing changed.'
			)
		};
	try {
		const receipt = await ctx.deps.applyProjectUnfold({
			...unfoldArgs,
			confirmationToken: again.confirmation_token
		});
		return {
			kind: 'resolved',
			outcome: 'undone',
			reasonCode: null,
			receipt: undoReceipt(receipt)
		};
	} catch (secondError) {
		return after(toProjectFoldError(secondError));
	}
}

export const projectCombineHandler: ProposalCardHandler<ProjectCombineProposalPayloadV1> = {
	async prepareDecide(ctx, { choice, seenDigest }): Promise<PreparedAction<DecideActionResult>> {
		if (choice === 'cancel')
			return {
				kind: 'settle',
				result: { kind: 'resolved', outcome: 'cancelled', reasonCode: null, receipt: null }
			};
		if (!seenDigest)
			return {
				kind: 'fail',
				failure: failure(400, 'SEEN_DIGEST_REQUIRED', 'seen_digest is required to combine.')
			};

		// 1. Fresh preview; compare with what the user saw.
		let base: FoldImpactV1;
		try {
			base = await ctx.deps.previewProjectFold(previewArgs(ctx));
		} catch (error) {
			const answer = refusal(toProjectFoldError(error), 'COMBINE_BLOCKED');
			return 'stale' in answer
				? {
						kind: 'settle',
						result: {
							kind: 'resolved',
							outcome: 'stale',
							reasonCode: answer.stale,
							receipt: null
						}
					}
				: { kind: 'fail', failure: answer.failure };
		}
		const baseView = combineView(ctx, base);
		const digest = projectCombineDigest(baseView);
		const fresh = { view: baseView, digest };
		if (digest !== seenDigest)
			return {
				kind: 'fail',
				failure: failure(
					409,
					'PREVIEW_CHANGED',
					'The projects changed since you looked. Here is the latest. Nothing changed.',
					fresh
				)
			};
		if (baseView.blockers.length)
			return {
				kind: 'fail',
				failure: failure(
					409,
					'COMBINE_BLOCKED',
					'This combine is blocked until the listed items are cleared. Nothing changed.',
					fresh
				)
			};
		const missing = base.members_missing;
		if (choice === 'combine' && missing.length)
			return {
				kind: 'fail',
				failure: failure(
					409,
					'MEMBER_CHOICE_REQUIRED',
					'Choose whether to remove or add the people the destination lacks. Nothing changed.',
					fresh
				)
			};
		let removals: Removal[] = [];
		if (choice === 'combine_remove_members') {
			const planned = await plannedRemovals(ctx, base);
			if ('failure' in planned)
				return { kind: 'fail', failure: { ...planned.failure, details: fresh } };
			removals = planned.removals;
		}
		const additions = choice === 'combine_add_members' ? [...missing] : [];
		return {
			kind: 'run',
			run: () => applyCombine(ctx, { base, baseView, removals, additions })
		};
	},

	async prepareUndo(ctx, { resolution, seenDigest }): Promise<PreparedAction<UndoActionResult>> {
		const receipt = resolution.receipt as ProjectCombineReceiptV1 | null;
		if (!receipt?.fold_id)
			return {
				kind: 'fail',
				failure: failure(409, 'NOT_UNDOABLE', 'This card can’t be undone. Nothing changed.')
			};
		if (!seenDigest)
			return {
				kind: 'fail',
				failure: failure(400, 'SEEN_DIGEST_REQUIRED', 'seen_digest is required to undo.')
			};
		const foldId = receipt.fold_id;
		let impact: UnfoldImpactV1;
		try {
			impact = await ctx.deps.previewProjectUnfold({
				session: ctx.userClient,
				admin: ctx.admin,
				userId: ctx.userId,
				foldId
			});
		} catch (error) {
			const answer = refusal(toProjectFoldError(error), 'UNDO_BLOCKED');
			return 'stale' in answer
				? {
						kind: 'settle',
						result: {
							kind: 'resolved',
							outcome: 'stale',
							reasonCode: answer.stale,
							receipt: null
						}
					}
				: { kind: 'fail', failure: answer.failure };
		}
		const view = projectCombineUndoViewFromUnfold(impact, ctx.deps.now().toISOString());
		const digest = projectCombineUndoDigest(view);
		if (digest !== seenDigest)
			return {
				kind: 'fail',
				failure: failure(
					409,
					'PREVIEW_CHANGED',
					'What would come back changed since you looked. Here is the latest. Nothing changed.',
					{ view, digest }
				)
			};
		if (view.blockers.length)
			return {
				kind: 'fail',
				failure: failure(
					409,
					'UNDO_BLOCKED',
					'Undo is blocked right now. Nothing changed.',
					{ view, digest }
				)
			};
		return { kind: 'run', run: () => applyUndo(ctx, foldId, impact) };
	},

	async preview(ctx) {
		try {
			const view = combineView(ctx, await ctx.deps.previewProjectFold(previewArgs(ctx)));
			return { ok: true, view, digest: projectCombineDigest(view) };
		} catch (error) {
			return viewFailure(toProjectFoldError(error), 'COMBINE_BLOCKED');
		}
	},

	async undoPreview(ctx, resolution) {
		const receipt = resolution.receipt as ProjectCombineReceiptV1 | null;
		if (!receipt?.fold_id) return failure(409, 'NOT_UNDOABLE', 'This card can’t be undone.');
		try {
			const impact = await ctx.deps.previewProjectUnfold({
				session: ctx.userClient,
				admin: ctx.admin,
				userId: ctx.userId,
				foldId: receipt.fold_id
			});
			const view = projectCombineUndoViewFromUnfold(impact, ctx.deps.now().toISOString());
			return { ok: true, view, digest: projectCombineUndoDigest(view) };
		} catch (error) {
			return viewFailure(toProjectFoldError(error), 'NOT_UNDOABLE');
		}
	}
};
