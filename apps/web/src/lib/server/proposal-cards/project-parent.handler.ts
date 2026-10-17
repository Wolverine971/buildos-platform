// apps/web/src/lib/server/proposal-cards/project-parent.handler.ts
//
// The nest card's click and Undo (tasker 122, WP4). Every read and write goes
// through the signed-in user's client: `onto_project_family_v1` and
// `onto_project_set_parent_atomic` decide access from auth.uid(), so a forged
// card can only do what the user could already do from "Move under…".
import type {
	ProjectParentProposalPayloadV1,
	ProjectParentReceiptV1
} from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
import {
	hierarchyErrorApiCode,
	toProjectHierarchyError,
	type ProjectHierarchyErrorCode
} from '$lib/services/ontology/project-hierarchy.service';
import {
	failure,
	type DecideActionResult,
	type PreparedAction,
	type ProposalCardHandler,
	type ProposalCardHandlerContext,
	type UndoActionResult
} from './types';

type Ctx = ProposalCardHandlerContext<ProjectParentProposalPayloadV1>;

/** The RPC says the target no longer allows this: the card is settled as stale. */
const STALE_CODES = new Set<ProjectHierarchyErrorCode>([
	'parent_self',
	'parent_is_a_child',
	'has_children',
	'not_found',
	'parent_not_found'
]);
const ACCESS_CODES = new Set<ProjectHierarchyErrorCode>(['access_denied', 'parent_admin_required']);

function receiptOf(result: {
	project_id: string;
	parent_project_id: string | null;
	previous_parent_project_id: string | null;
	shared_folder_document_id: string | null;
}): ProjectParentReceiptV1 {
	return {
		project_id: result.project_id,
		parent_project_id: result.parent_project_id,
		previous_parent_project_id: result.previous_parent_project_id,
		shared_folder_document_id: result.shared_folder_document_id
	};
}

/**
 * Where the project sits now, as the user sees it (the family RPC checks
 * access). A parent the user can't open reads as "changed", which is stale.
 */
async function currentParent(
	ctx: Ctx
): Promise<{ parentId: string | null } | { stale: string } | { fail: ReturnType<typeof failure> }> {
	try {
		const family = await ctx.deps.getProjectFamily(ctx.userClient, ctx.payload.project.id);
		return { parentId: family.parent?.id ?? null };
	} catch (error) {
		const mapped = toProjectHierarchyError(error);
		if (mapped.status === 401 || mapped.status === 403)
			return { fail: failure(mapped.status, 'ACCESS_REQUIRED', mapped.message) };
		if (mapped.code === 'not_found') return { stale: 'project_not_found' };
		return {
			fail: failure(500, 'INTERNAL', 'Could not check this project. Nothing changed.')
		};
	}
}

/** Map a set-parent failure after the claim: access keeps the card open; the rest settle it. */
function setParentFailure<A extends DecideActionResult | UndoActionResult>(
	error: unknown,
	accessMessage?: string
): A {
	const mapped = toProjectHierarchyError(error);
	if (ACCESS_CODES.has(mapped.code))
		return {
			kind: 'released',
			failure: failure(
				mapped.status === 401 ? 401 : 403,
				'ACCESS_REQUIRED',
				accessMessage ?? mapped.message
			)
		} as A;
	if (STALE_CODES.has(mapped.code))
		return {
			kind: 'resolved',
			outcome: 'stale',
			reasonCode: hierarchyErrorApiCode(mapped),
			receipt: null
		} as A;
	return {
		kind: 'resolved',
		outcome: 'unknown',
		reasonCode: 'project_parent_outcome_unknown',
		receipt: null
	} as A;
}

export const projectParentHandler: ProposalCardHandler<ProjectParentProposalPayloadV1> = {
	async prepareDecide(ctx, { choice }): Promise<PreparedAction<DecideActionResult>> {
		if (choice === 'cancel')
			return {
				kind: 'settle',
				result: { kind: 'resolved', outcome: 'cancelled', reasonCode: null, receipt: null }
			};
		const payload = ctx.payload;
		const current = await currentParent(ctx);
		if ('fail' in current) return { kind: 'fail', failure: current.fail };
		if ('stale' in current)
			return {
				kind: 'settle',
				result: {
					kind: 'resolved',
					outcome: 'stale',
					reasonCode: current.stale,
					receipt: null
				}
			};
		if (current.parentId !== (payload.from_parent?.id ?? null))
			return {
				kind: 'settle',
				result: {
					kind: 'resolved',
					outcome: 'stale',
					reasonCode: 'parent_changed',
					receipt: null
				}
			};
		return {
			kind: 'run',
			run: async () => {
				try {
					const result = await ctx.deps.setProjectParent(
						ctx.userClient,
						payload.project.id,
						payload.to_parent?.id ?? null
					);
					return {
						kind: 'resolved',
						outcome: 'applied',
						reasonCode: null,
						receipt: receiptOf(result)
					};
				} catch (error) {
					return setParentFailure<DecideActionResult>(error);
				}
			}
		};
	},

	async prepareUndo(ctx, { resolution }): Promise<PreparedAction<UndoActionResult>> {
		const receipt = resolution.receipt as ProjectParentReceiptV1 | null;
		if (!receipt || receipt.project_id !== ctx.payload.project.id)
			return {
				kind: 'fail',
				failure: failure(409, 'NOT_UNDOABLE', 'This card can’t be undone. Nothing changed.')
			};
		const current = await currentParent(ctx);
		if ('fail' in current) return { kind: 'fail', failure: current.fail };
		// Only put it back if nothing moved it since the click.
		if ('stale' in current || current.parentId !== receipt.parent_project_id)
			return {
				kind: 'settle',
				result: {
					kind: 'resolved',
					outcome: 'stale',
					reasonCode: 'stale' in current ? current.stale : 'parent_changed',
					receipt: null
				}
			};
		const accessMessage = ctx.payload.undo_needs_admin_on_both
			? 'Putting it back inside the previous project needs admin access to both projects.'
			: undefined;
		return {
			kind: 'run',
			run: async () => {
				try {
					const result = await ctx.deps.setProjectParent(
						ctx.userClient,
						receipt.project_id,
						receipt.previous_parent_project_id
					);
					return {
						kind: 'resolved',
						outcome: 'undone',
						reasonCode: null,
						receipt: receiptOf(result)
					};
				} catch (error) {
					return setParentFailure<UndoActionResult>(error, accessMessage);
				}
			}
		};
	}
};
