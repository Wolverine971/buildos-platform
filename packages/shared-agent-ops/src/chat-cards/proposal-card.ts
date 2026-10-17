// packages/shared-agent-ops/src/chat-cards/proposal-card.ts
//
// The proposal-card rail (tasker 122, WP4/WP5). Chat *proposes* a change on a
// card; the user's click is the only consent. Nothing writes in the worker.
//
// - A propose_* read tool returns a card envelope as its result. The card id is
//   that `chat_tool_executions` row id (stable before the tool runs), so no
//   migration and no second identity.
// - The web renders `client_action` under the reply and resolves the click
//   (POST /api/chat/proposal-cards/[id]). The row is a hint, never the
//   authority: every write runs under the user's own authority, and the
//   resolver re-checks the row against the tool arguments and the turn owner.
// - Single use: resolution rows in `chat_turn_effects` (phase decide / undo).
//   The outcome is mirrored onto this row's result as `card_resolution` /
//   `card_undo` so a reloaded chat and the next turn's history see it.
//
// Every reader here parses structured fields only. Client-safe: no Node imports.
import { code, isRecord, PROPOSAL_CARD_TTL_MS, text, timestamp, uuid } from './card-fields';
import { PROJECT_PARENT_CARD_SPEC } from './project-parent-card';
import { PROJECT_COMBINE_CARD_SPEC } from './project-combine-card';

export {
	PROPOSAL_CARD_TTL_MS,
	PROPOSAL_CARD_UNDO_TTL_MS,
	PROPOSAL_CARD_LIST_LIMIT,
	type ProjectRefV1,
	type ProposalDuplicateCheckRefV1
} from './card-fields';

export const PROPOSAL_CARD_RAIL = 'proposal_v1' as const;
export const PROPOSAL_CARD_READY_STATUS = 'proposal_ready' as const;
export const PROPOSAL_CARD_CLIENT_ACTION_KIND = 'proposal_card' as const;

export const PROPOSAL_CARD_KIND_NAMES = ['project_parent', 'project_combine'] as const;
export type ProposalCardKind = (typeof PROPOSAL_CARD_KIND_NAMES)[number];

export type ProposalCardOutcome = 'applied' | 'cancelled' | 'stale' | 'unknown';
export type ProposalCardUndoOutcome = 'undone' | 'stale' | 'unknown';
/** What a card says now, for the UI and the history note. */
export type ProposalCardState = 'pending' | ProposalCardOutcome | 'undone';

/** What the browser renders. Display data only; the click sends back only the card id and a choice. */
export type ProposalCardClientActionV1<P = unknown> = {
	kind: typeof PROPOSAL_CARD_CLIENT_ACTION_KIND;
	card_kind: ProposalCardKind;
	card_id: string;
	session_id: string;
	expires_at: string;
	payload: P;
};

export type ProposalCardResolutionV1<R = Record<string, unknown>> = {
	version: 1;
	card_id: string;
	kind: ProposalCardKind;
	choice: string;
	outcome: ProposalCardOutcome;
	resolved_at: string;
	/** Machine code for stale/unknown outcomes (an RPC identifier or a resolver code). */
	reason_code: string | null;
	/** Kind-specific record of what was written; may be set on stale too (e.g. members removed). */
	receipt: R | null;
};

export type ProposalCardUndoV1<R = Record<string, unknown>> = {
	version: 1;
	card_id: string;
	kind: ProposalCardKind;
	outcome: ProposalCardUndoOutcome;
	undone_at: string;
	reason_code: string | null;
	receipt: R | null;
};

export type ProposalCardEnvelopeV1<P = unknown> = {
	card_rail: typeof PROPOSAL_CARD_RAIL;
	status: typeof PROPOSAL_CARD_READY_STATUS;
	requires_user_action: true;
	saved: false;
	card_id: string;
	kind: ProposalCardKind;
	client_action: ProposalCardClientActionV1<P>;
	/** What the model sees after compaction (client_action never reaches it). */
	model_view: Record<string, unknown>;
	message: string;
	card_resolution?: ProposalCardResolutionV1;
	card_undo?: ProposalCardUndoV1;
};

/** A proposal tool that produced no card: blocked, or already in place. */
export type ProposalCardNonCardResultV1 = {
	card_rail: typeof PROPOSAL_CARD_RAIL;
	status: 'blocked' | 'no_change';
	kind: ProposalCardKind;
	reason_code: string;
	message: string;
};

export type ProposalCardSubjectV1 = { role: string; id: string; name: string };

/** The one line a resolved card shows, with an Open link when there is something to open. */
export type ProposalCardDescription = { text: string; href: string | null };

export type ProposalCardKindSpecV1<P, R, U> = {
	kind: ProposalCardKind;
	toolName: string;
	ttlMs: number;
	undoTtlMs: number;
	choices: readonly string[];
	/** Whether this kind has a GET …/preview (Check again) and an undo preview. */
	hasPreview: boolean;
	hasUndoPreview: boolean;
	parsePayload(value: unknown): P | null;
	parseReceipt(value: unknown): R | null;
	parseUndoReceipt(value: unknown): U | null;
	/** The ids in the tool's own arguments must equal the ids in the payload. */
	argumentsMatch(args: unknown, payload: P): boolean;
	/** visibleDigest: ids, counts and codes only (never names or timestamps). */
	digest(payload: P): string;
	modelView(payload: P): Record<string, unknown>;
	subjects(payload: P): ProposalCardSubjectV1[];
	describeResolution(
		resolution: ProposalCardResolutionV1<R>,
		payload: P
	): ProposalCardDescription;
	describeUndo(undo: ProposalCardUndoV1<U>, payload: P): ProposalCardDescription;
	/** The fixed sentence the next chat turn reads about this card's state. */
	noteMeaning(state: ProposalCardState, payload: P, card: ProposalCardEnvelopeV1<P>): string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpec = ProposalCardKindSpecV1<any, any, any>;

/** The kind registry. A kind not listed here cannot be parsed, rendered or resolved. */
export const PROPOSAL_CARD_KINDS = {
	project_parent: PROJECT_PARENT_CARD_SPEC,
	project_combine: PROJECT_COMBINE_CARD_SPEC
} as const satisfies Record<ProposalCardKind, AnySpec>;

export function isProposalCardKind(value: unknown): value is ProposalCardKind {
	return (
		typeof value === 'string' && (PROPOSAL_CARD_KIND_NAMES as readonly string[]).includes(value)
	);
}

export function proposalCardSpec(kind: ProposalCardKind): AnySpec {
	return PROPOSAL_CARD_KINDS[kind] as AnySpec;
}

/** The kind whose tool this is, or null for every other tool. */
export function proposalCardKindForTool(toolName: string): ProposalCardKind | null {
	for (const kind of PROPOSAL_CARD_KIND_NAMES) {
		if (PROPOSAL_CARD_KINDS[kind].toolName === toolName) return kind;
	}
	return null;
}

/** Any proposal-rail result (card or not); keyed on the rail, never on the tool name. */
export function isProposalRailResult(value: unknown): boolean {
	return isRecord(value) && value.card_rail === PROPOSAL_CARD_RAIL;
}

/** A card that is (or was) waiting for the user's click. Cheap: no payload parse. */
export function isProposalCardResult(value: unknown): boolean {
	return (
		isRecord(value) &&
		value.card_rail === PROPOSAL_CARD_RAIL &&
		value.status === PROPOSAL_CARD_READY_STATUS
	);
}

export function proposalCardExpiresAt(
	proposedAt: string | Date,
	ttlMs: number = PROPOSAL_CARD_TTL_MS
): string {
	const start = typeof proposedAt === 'string' ? Date.parse(proposedAt) : proposedAt.getTime();
	return new Date(start + ttlMs).toISOString();
}

export function isProposalCardExpired(
	action: Pick<ProposalCardClientActionV1, 'expires_at'>,
	now: number = Date.now()
): boolean {
	const expiresAt = Date.parse(action.expires_at);
	return !Number.isFinite(expiresAt) || expiresAt <= now;
}

/** visibleDigest(kind, payload): what "Check again" and seen_digest compare. */
export function proposalCardVisibleDigest(kind: ProposalCardKind, payload: unknown): string {
	return proposalCardSpec(kind).digest(payload);
}

const OUTCOMES = new Set<ProposalCardOutcome>(['applied', 'cancelled', 'stale', 'unknown']);
const UNDO_OUTCOMES = new Set<ProposalCardUndoOutcome>(['undone', 'stale', 'unknown']);

export function parseProposalCardResolution(
	value: unknown,
	expected?: { cardId: string; kind: ProposalCardKind }
): ProposalCardResolutionV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const cardId = uuid(value.card_id);
	const kind = isProposalCardKind(value.kind) ? value.kind : null;
	const resolvedAt = timestamp(value.resolved_at);
	const choice = text(value.choice);
	const outcome = value.outcome as ProposalCardOutcome;
	if (!cardId || !kind || !resolvedAt || !choice || !OUTCOMES.has(outcome)) return null;
	if (expected && (expected.cardId.toLowerCase() !== cardId || expected.kind !== kind))
		return null;
	const spec = proposalCardSpec(kind);
	if (!spec.choices.includes(choice)) return null;
	const receipt = value.receipt === null ? null : spec.parseReceipt(value.receipt);
	if (value.receipt !== null && value.receipt !== undefined && !receipt) return null;
	return {
		version: 1,
		card_id: cardId,
		kind,
		choice,
		outcome,
		resolved_at: resolvedAt,
		reason_code: code(value.reason_code),
		receipt: receipt ?? null
	};
}

export function parseProposalCardUndo(
	value: unknown,
	expected?: { cardId: string; kind: ProposalCardKind }
): ProposalCardUndoV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const cardId = uuid(value.card_id);
	const kind = isProposalCardKind(value.kind) ? value.kind : null;
	const undoneAt = timestamp(value.undone_at);
	const outcome = value.outcome as ProposalCardUndoOutcome;
	if (!cardId || !kind || !undoneAt || !UNDO_OUTCOMES.has(outcome)) return null;
	if (expected && (expected.cardId.toLowerCase() !== cardId || expected.kind !== kind))
		return null;
	const receipt =
		value.receipt === null ? null : proposalCardSpec(kind).parseUndoReceipt(value.receipt);
	if (value.receipt !== null && value.receipt !== undefined && !receipt) return null;
	return {
		version: 1,
		card_id: cardId,
		kind,
		outcome,
		undone_at: undoneAt,
		reason_code: code(value.reason_code),
		receipt: receipt ?? null
	};
}

export function parseProposalCardClientAction(value: unknown): ProposalCardClientActionV1 | null {
	if (!isRecord(value) || value.kind !== PROPOSAL_CARD_CLIENT_ACTION_KIND) return null;
	const cardKind = isProposalCardKind(value.card_kind) ? value.card_kind : null;
	const cardId = uuid(value.card_id);
	const sessionId = uuid(value.session_id);
	const expiresAt = timestamp(value.expires_at);
	if (!cardKind || !cardId || !sessionId || !expiresAt) return null;
	const payload = proposalCardSpec(cardKind).parsePayload(value.payload);
	if (!payload) return null;
	return {
		kind: PROPOSAL_CARD_CLIENT_ACTION_KIND,
		card_kind: cardKind,
		card_id: cardId,
		session_id: sessionId,
		expires_at: expiresAt,
		payload
	};
}

/** The card envelope with its payload checked by the kind, or null. */
export function parseProposalCardEnvelope(value: unknown): ProposalCardEnvelopeV1 | null {
	if (
		!isProposalCardResult(value) ||
		!isRecord(value) ||
		value.requires_user_action !== true ||
		value.saved !== false
	)
		return null;
	const cardId = uuid(value.card_id);
	const kind = isProposalCardKind(value.kind) ? value.kind : null;
	const action = parseProposalCardClientAction(value.client_action);
	if (!cardId || !kind || !action || action.card_id !== cardId || action.card_kind !== kind)
		return null;
	const expected = { cardId, kind };
	const resolution = parseProposalCardResolution(value.card_resolution, expected);
	const undo = parseProposalCardUndo(value.card_undo, expected);
	return {
		card_rail: PROPOSAL_CARD_RAIL,
		status: PROPOSAL_CARD_READY_STATUS,
		requires_user_action: true,
		saved: false,
		card_id: cardId,
		kind,
		client_action: action,
		model_view: isRecord(value.model_view) ? { ...value.model_view } : {},
		message: typeof value.message === 'string' ? value.message : '',
		...(resolution ? { card_resolution: resolution } : {}),
		...(undo ? { card_undo: undo } : {})
	};
}

export function parseProposalCardNonCardResult(value: unknown): ProposalCardNonCardResultV1 | null {
	if (!isRecord(value) || value.card_rail !== PROPOSAL_CARD_RAIL) return null;
	if (value.status !== 'blocked' && value.status !== 'no_change') return null;
	const kind = isProposalCardKind(value.kind) ? value.kind : null;
	const reasonCode = code(value.reason_code);
	if (!kind || !reasonCode) return null;
	return {
		card_rail: PROPOSAL_CARD_RAIL,
		status: value.status,
		kind,
		reason_code: reasonCode,
		message: typeof value.message === 'string' ? value.message : ''
	};
}

/** Worker side: the card result a propose_* tool returns. */
export function buildProposalCardEnvelopeV1<P>(input: {
	kind: ProposalCardKind;
	cardId: string;
	sessionId: string;
	proposedAt: string | Date;
	payload: P;
	message: string;
}): ProposalCardEnvelopeV1<P> {
	const spec = proposalCardSpec(input.kind);
	const cardId = input.cardId.toLowerCase();
	return {
		card_rail: PROPOSAL_CARD_RAIL,
		status: PROPOSAL_CARD_READY_STATUS,
		requires_user_action: true,
		saved: false,
		card_id: cardId,
		kind: input.kind,
		client_action: {
			kind: PROPOSAL_CARD_CLIENT_ACTION_KIND,
			card_kind: input.kind,
			card_id: cardId,
			session_id: input.sessionId.toLowerCase(),
			expires_at: proposalCardExpiresAt(input.proposedAt, spec.ttlMs),
			payload: input.payload
		},
		model_view: spec.modelView(input.payload),
		message: input.message
	};
}

/** Worker side: a proposal tool's result when no card is shown. */
export function buildProposalCardNonCardResultV1(input: {
	kind: ProposalCardKind;
	status: 'blocked' | 'no_change';
	reasonCode: string;
	message: string;
}): ProposalCardNonCardResultV1 {
	return {
		card_rail: PROPOSAL_CARD_RAIL,
		status: input.status,
		kind: input.kind,
		reason_code: input.reasonCode,
		message: input.message
	};
}

/** Where the card stands: an undo outranks the decision it undid. */
export function proposalCardState(card: ProposalCardEnvelopeV1): ProposalCardState {
	if (card.card_undo?.outcome === 'undone') return 'undone';
	return card.card_resolution?.outcome ?? 'pending';
}

export function describeProposalCardResolution(
	card: ProposalCardEnvelopeV1,
	resolution: ProposalCardResolutionV1
): ProposalCardDescription {
	return proposalCardSpec(card.kind).describeResolution(resolution, card.client_action.payload);
}

export function describeProposalCardUndo(
	card: ProposalCardEnvelopeV1,
	undo: ProposalCardUndoV1
): ProposalCardDescription {
	return proposalCardSpec(card.kind).describeUndo(undo, card.client_action.payload);
}

export {
	PROJECT_PARENT_CARD_SPEC,
	PROJECT_PARENT_TOOL_NAME,
	PROJECT_PARENT_CHOICES,
	type ProjectParentChoice,
	type ProjectParentEffectCode,
	type ProjectParentProposalPayloadV1,
	type ProjectParentReceiptV1
} from './project-parent-card';
export {
	PROJECT_COMBINE_CARD_SPEC,
	PROJECT_COMBINE_TOOL_NAME,
	PROJECT_COMBINE_CHOICES,
	parseFoldImpactV1,
	parseUnfoldImpactV1,
	projectCombinePayloadFromImpact,
	projectCombineUndoViewFromUnfold,
	projectCombineDigest,
	projectCombineContentDigest,
	projectCombineUndoDigest,
	classifyFoldBlocker,
	type FoldImpactV1,
	type UnfoldImpactV1,
	type ProjectCombineChoice,
	type ProjectCombineProposalPayloadV1,
	type ProjectCombineReceiptV1,
	type ProjectCombineUndoReceiptV1,
	type ProjectCombineUndoViewV1
} from './project-combine-card';
