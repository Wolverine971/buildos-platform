// apps/web/src/lib/server/proposal-cards/types.ts
//
// Shared shapes for the proposal-card resolver (proposal-card.service.ts) and
// its kind handlers (registry.ts). Kept apart so handlers and the registry
// never import each other at runtime.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProjectFamilyV1, ProjectSetParentResultV1 } from '@buildos/shared-types';
import type {
	ProposalCardEnvelopeV1,
	ProposalCardOutcome,
	ProposalCardResolutionV1,
	ProposalCardUndoOutcome
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import type {
	applyProjectFold,
	applyProjectUnfold,
	previewProjectFold,
	previewProjectUnfold,
	readProjectFoldManifest
} from '$lib/server/project-fold/project-fold.service';
import type { removeProjectMember } from '$lib/server/project-members/remove-member';

export type Client = SupabaseClient<Database>;

export type ProposalCardFailureCode =
	| 'CARD_NOT_FOUND'
	| 'INVALID_CHOICE'
	| 'CARD_EXPIRED'
	| 'UNDO_EXPIRED'
	| 'TURN_IN_PROGRESS'
	| 'RESOLUTION_IN_PROGRESS'
	| 'SEEN_DIGEST_REQUIRED'
	| 'PREVIEW_CHANGED'
	| 'COMBINE_BLOCKED'
	| 'UNDO_BLOCKED'
	| 'MEMBER_CHOICE_REQUIRED'
	| 'MEMBER_NOT_REMOVABLE'
	| 'MEMBER_REMOVAL_FAILED'
	| 'NOT_UNDOABLE'
	| 'ALREADY_RESOLVED'
	| 'NO_PREVIEW'
	| 'ACCESS_REQUIRED'
	| 'NOT_AVAILABLE'
	| 'INTERNAL';

export type ProposalCardFailure = {
	ok: false;
	status: number;
	code: ProposalCardFailureCode;
	message: string;
	/** e.g. the fresh view and digest on PREVIEW_CHANGED. */
	details?: Record<string, unknown>;
};

export function failure(
	status: number,
	code: ProposalCardFailureCode,
	message: string,
	details?: Record<string, unknown>
): ProposalCardFailure {
	return { ok: false, status, code, message, ...(details ? { details } : {}) };
}

export function isProposalCardFailure(value: unknown): value is ProposalCardFailure {
	return Boolean(value) && typeof value === 'object' && (value as { ok?: unknown }).ok === false;
}

export type ProposalCardDeps = {
	getProjectFamily: (client: Client, projectId: string) => Promise<ProjectFamilyV1>;
	setProjectParent: (
		client: Client,
		projectId: string,
		parentProjectId: string | null
	) => Promise<ProjectSetParentResultV1>;
	previewProjectFold: typeof previewProjectFold;
	applyProjectFold: typeof applyProjectFold;
	readProjectFoldManifest: typeof readProjectFoldManifest;
	previewProjectUnfold: typeof previewProjectUnfold;
	applyProjectUnfold: typeof applyProjectUnfold;
	removeProjectMember: typeof removeProjectMember;
	sleep: (ms: number) => Promise<void>;
	now: () => Date;
};

export type ProposalCardHandlerContext<P> = {
	cardId: string;
	sessionId: string;
	card: ProposalCardEnvelopeV1<P>;
	payload: P;
	userId: string;
	/** The signed-in user's client: every product read and write runs as them. */
	userClient: Client;
	/** Service role: ledger tables and the service-only fold RPCs (with the user's id). */
	admin: Client;
	deps: ProposalCardDeps;
};

export type ProposalReceipt = Record<string, unknown> | null;

export type DecideActionResult =
	| {
			kind: 'resolved';
			outcome: ProposalCardOutcome;
			reasonCode: string | null;
			receipt: ProposalReceipt;
	  }
	/** Nothing was written; the claim is released and the card stays usable. */
	| { kind: 'released'; failure: ProposalCardFailure };

export type UndoActionResult =
	| {
			kind: 'resolved';
			outcome: ProposalCardUndoOutcome;
			reasonCode: string | null;
			receipt: ProposalReceipt;
	  }
	| { kind: 'released'; failure: ProposalCardFailure };

/**
 * A handler's read-only checks decide what the click does before any claim:
 * refuse (no claim), settle at once (claim then record, e.g. cancel or stale),
 * or run the write after the claim.
 */
export type PreparedAction<A> =
	| { kind: 'fail'; failure: ProposalCardFailure }
	| { kind: 'settle'; result: Extract<A, { kind: 'resolved' }> }
	| { kind: 'run'; run: () => Promise<A> };

export type ProposalCardView = { ok: true; view: Record<string, unknown>; digest: string };

export type ProposalCardHandler<P> = {
	prepareDecide(
		ctx: ProposalCardHandlerContext<P>,
		input: { choice: string; seenDigest: string | null }
	): Promise<PreparedAction<DecideActionResult>>;
	prepareUndo(
		ctx: ProposalCardHandlerContext<P>,
		input: { resolution: ProposalCardResolutionV1; seenDigest: string | null }
	): Promise<PreparedAction<UndoActionResult>>;
	/** GET …/preview (Check again). Kinds without one answer NO_PREVIEW. */
	preview?(ctx: ProposalCardHandlerContext<P>): Promise<ProposalCardView | ProposalCardFailure>;
	/** GET …/undo-preview. */
	undoPreview?(
		ctx: ProposalCardHandlerContext<P>,
		resolution: ProposalCardResolutionV1
	): Promise<ProposalCardView | ProposalCardFailure>;
};
