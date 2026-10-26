// apps/web/src/lib/server/proposal-cards/proposal-card.service.ts
//
// Resolves clicks on chat proposal cards (tasker 122, plan §1): Choose, Undo,
// and the read-only Check again / undo previews. The click is the only
// consent; the browser sends the card id, its chat session, a choice and the
// digest of what it showed, never what to change.
//
// The card is the `chat_tool_executions` row its propose_* tool wrote. That
// row is a hint, never the authority:
//   1. load it by id AND session (admin client, ledger tables only);
//   2. its envelope must parse for a registered kind and match the row (tool
//      name, success, card id, session, and the ids in the tool's own
//      arguments);
//   3. its turn must belong to the signed-in user (404 otherwise) and be
//      finished (409 TURN_IN_PROGRESS);
//   4. 24 h to decide, 7 d to undo (410);
//   5. the kind handler re-checks everything with the user's own session and
//      every write runs under the user's authority (setProjectParent with the
//      session client; fold RPCs with the session user's id, SQL re-checking
//      admin). A forged row can only do what the user could already do.
//
// Single use and outcome: claim.ts (resolution rows in chat_turn_effects).
// Mirroring: the outcome is copied onto the tool row's result as
// `card_resolution` / `card_undo` (read-modify-write); any later call repairs
// a missing or different mirror from the ledger.
import type { Json } from '@buildos/shared-types';
import {
	parseProposalCardEnvelope,
	parseProposalCardResolution,
	parseProposalCardUndo,
	proposalCardSpec,
	type ProposalCardDescription,
	type ProposalCardEnvelopeV1,
	type ProposalCardOutcome,
	type ProposalCardResolutionV1,
	type ProposalCardUndoOutcome,
	type ProposalCardUndoV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import {
	getProjectFamily,
	setProjectParent
} from '$lib/services/ontology/project-hierarchy.service';
import {
	applyProjectFold,
	applyProjectUnfold,
	previewProjectFold,
	previewProjectUnfold,
	readProjectFoldManifest
} from '$lib/server/project-fold/project-fold.service';
import { removeProjectMember } from '$lib/server/project-members/remove-member';
import { ensureWorkspaceProjectId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { loadWorkspaceItemsV1 } from '@buildos/agentic-chat-runtime/tools';
import {
	graduateItems,
	loadOwnSuggestion,
	markSuggestion,
	moveItems,
	undoGraduate,
	undoMoveBatch
} from '$lib/server/workspace/workspace.service';
import {
	claimChoice,
	insertClaim,
	laterOf,
	loadClaim,
	proposalCardClaimId,
	releaseClaim,
	settleClaim,
	settledClaim,
	waitForSettledClaim,
	type ProposalClaimPhase,
	type SettledClaim
} from './claim';
import { PROPOSAL_CARD_HANDLERS } from './registry';
import {
	failure,
	isProposalCardFailure,
	type Client,
	type DecideActionResult,
	type ProposalCardDeps,
	type ProposalCardFailure,
	type ProposalCardHandlerContext,
	type ProposalCardView,
	type UndoActionResult
} from './types';

export type { ProposalCardDeps, ProposalCardFailure, ProposalCardView } from './types';

const DEFAULT_DEPS: ProposalCardDeps = {
	getProjectFamily,
	setProjectParent,
	previewProjectFold,
	applyProjectFold,
	readProjectFoldManifest,
	previewProjectUnfold,
	applyProjectUnfold,
	removeProjectMember,
	ensureWorkspaceProjectId: (client) => ensureWorkspaceProjectId(client as never),
	loadWorkspaceItems: loadWorkspaceItemsV1,
	moveWorkspaceItems: moveItems,
	undoWorkspaceMove: undoMoveBatch,
	graduateWorkspaceItems: graduateItems,
	undoWorkspaceGraduate: undoGraduate,
	loadWorkspaceSuggestion: loadOwnSuggestion,
	markWorkspaceSuggestion: markSuggestion,
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now: () => new Date()
};

const TERMINAL_TURN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const NOT_FOUND = failure(404, 'CARD_NOT_FOUND', 'This card is not available.');
const LOAD_FAILED = failure(500, 'INTERNAL', 'Could not load this card. Nothing changed.');
const IN_PROGRESS = failure(
	409,
	'RESOLUTION_IN_PROGRESS',
	'This card is already being applied. Check back in a moment.'
);
const RELEASED = failure(
	409,
	'RESOLUTION_IN_PROGRESS',
	'Another choice on this card didn’t go through. Try again.'
);

type ToolRow = {
	id: string;
	session_id: string;
	turn_run_id: string | null;
	tool_name: string;
	success: boolean;
	arguments: Json;
	result: Json | null;
	created_at: string | null;
};

type TurnRow = {
	id: string;
	session_id: string;
	user_id: string;
	status: string;
	execution_generation: number;
};

type LoadedCard = { row: ToolRow; card: ProposalCardEnvelopeV1; turn: TurnRow };

type CallParams = {
	cardId: string;
	sessionId: string;
	userId: string;
	/** The signed-in user's client: every product read and write. */
	userClient: Client;
	/** Service role: the ledger tables, after ownership is checked, and the service-only fold RPCs. */
	admin: Client;
	deps?: Partial<ProposalCardDeps>;
};

async function loadCard(params: CallParams): Promise<LoadedCard | ProposalCardFailure> {
	const { admin } = params;
	const { data, error } = await admin
		.from('chat_tool_executions')
		.select('id, session_id, turn_run_id, tool_name, success, arguments, result, created_at')
		.eq('id', params.cardId.toLowerCase())
		.eq('session_id', params.sessionId.toLowerCase())
		.maybeSingle();
	if (error) return LOAD_FAILED;
	const row = data as ToolRow | null;
	if (!row || !row.turn_run_id || row.success !== true) return NOT_FOUND;
	const card = parseProposalCardEnvelope(row.result);
	if (!card) return NOT_FOUND;
	const spec = proposalCardSpec(card.kind);
	if (
		row.tool_name !== spec.toolName ||
		card.card_id !== row.id.toLowerCase() ||
		card.client_action.session_id !== row.session_id.toLowerCase() ||
		!spec.argumentsMatch(row.arguments, card.client_action.payload)
	)
		return NOT_FOUND;
	// The tool row has no owner column: its turn is the ownership check.
	const { data: turn, error: turnError } = await admin
		.from('chat_turn_runs')
		.select('id, session_id, user_id, status, execution_generation')
		.eq('id', row.turn_run_id)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (turnError) return LOAD_FAILED;
	const turnRow = turn as TurnRow | null;
	if (!turnRow || turnRow.session_id !== row.session_id) return NOT_FOUND;
	return { row, card, turn: turnRow };
}

function context(
	loaded: LoadedCard,
	params: CallParams,
	deps: ProposalCardDeps
): ProposalCardHandlerContext<unknown> {
	return {
		cardId: loaded.card.card_id,
		sessionId: loaded.row.session_id,
		card: loaded.card,
		payload: loaded.card.client_action.payload,
		userId: params.userId,
		userClient: params.userClient,
		admin: params.admin,
		deps
	};
}

// ---------------------------------------------------------------------------
// Reading a phase's claim, and keeping the mirror in step with it.

type PhaseState<V> =
	| { kind: 'none' }
	| { kind: 'running' }
	| { kind: 'released' }
	| { kind: 'settled'; value: V };

function unknownChoice(loaded: LoadedCard, settled: SettledClaim): string {
	const spec = proposalCardSpec(loaded.card.kind);
	const choice = claimChoice(settled.row);
	return choice && spec.choices.includes(choice) ? choice : 'cancel';
}

function decisionFrom(
	loaded: LoadedCard,
	settled: SettledClaim,
	now: Date
): ProposalCardResolutionV1 {
	const expected = { cardId: loaded.card.card_id, kind: loaded.card.kind };
	if (!settled.abandoned) {
		const parsed = parseProposalCardResolution(settled.receipt, expected);
		if (parsed) return parsed;
	} else if (loaded.card.card_resolution) {
		// The settle write failed but the mirror landed: it holds the real result.
		return loaded.card.card_resolution;
	}
	return {
		version: 1,
		card_id: loaded.card.card_id,
		kind: loaded.card.kind,
		choice: unknownChoice(loaded, settled),
		outcome: 'unknown',
		resolved_at: settled.row.finished_at ?? now.toISOString(),
		reason_code: 'proposal_card_outcome_unknown',
		receipt: null
	};
}

function undoFrom(loaded: LoadedCard, settled: SettledClaim, now: Date): ProposalCardUndoV1 {
	const expected = { cardId: loaded.card.card_id, kind: loaded.card.kind };
	if (!settled.abandoned) {
		const parsed = parseProposalCardUndo(settled.receipt, expected);
		if (parsed) return parsed;
	} else if (loaded.card.card_undo) {
		return loaded.card.card_undo;
	}
	return {
		version: 1,
		card_id: loaded.card.card_id,
		kind: loaded.card.kind,
		outcome: 'unknown',
		undone_at: settled.row.finished_at ?? now.toISOString(),
		reason_code: 'proposal_card_outcome_unknown',
		receipt: null
	};
}

type MirrorField = 'card_resolution' | 'card_undo';

/**
 * Best effort read-modify-write of the outcome onto the card's tool result,
 * which is what a reloaded chat renders and what the next turn's history reads.
 * The ledger stays the authority; a failed mirror self-heals on the next call.
 */
async function writeMirror(
	admin: Client,
	rowId: string,
	field: MirrorField,
	value: ProposalCardResolutionV1 | ProposalCardUndoV1
): Promise<void> {
	try {
		const { data } = await admin
			.from('chat_tool_executions')
			.select('id, result')
			.eq('id', rowId)
			.maybeSingle();
		const result = (data as { result?: Json | null } | null)?.result;
		if (!result || typeof result !== 'object' || Array.isArray(result)) return;
		await admin
			.from('chat_tool_executions')
			.update({ result: { ...result, [field]: value } as unknown as Json })
			.eq('id', rowId);
	} catch {
		// The ledger holds the outcome; see above.
	}
}

/** A settled ledger row wins over the mirror; an abandoned claim only fills a missing mirror. */
async function repairMirror(
	admin: Client,
	loaded: LoadedCard,
	field: MirrorField,
	value: ProposalCardResolutionV1 | ProposalCardUndoV1,
	abandoned: boolean
): Promise<void> {
	const current =
		field === 'card_resolution' ? loaded.card.card_resolution : loaded.card.card_undo;
	if (current && (abandoned || JSON.stringify(current) === JSON.stringify(value))) return;
	await writeMirror(admin, loaded.row.id, field, value);
}

async function readPhase<V extends ProposalCardResolutionV1 | ProposalCardUndoV1>(
	loaded: LoadedCard,
	phase: ProposalClaimPhase,
	params: CallParams,
	deps: ProposalCardDeps,
	options: { wait: boolean }
): Promise<PhaseState<V>> {
	const claimId = proposalCardClaimId(loaded.card.card_id, phase);
	const row = await loadClaim(params.admin, claimId);
	if (!row) return { kind: 'none' };
	let settled = settledClaim(row, deps.now());
	if (!settled && options.wait) {
		const waited = await waitForSettledClaim(params.admin, claimId, deps);
		if (waited.kind === 'released') return { kind: 'released' };
		if (waited.kind === 'settled') settled = waited.settled;
	}
	if (!settled) return { kind: 'running' };
	const value = (
		phase === 'decide'
			? decisionFrom(loaded, settled, deps.now())
			: undoFrom(loaded, settled, deps.now())
	) as V;
	await repairMirror(
		params.admin,
		loaded,
		phase === 'decide' ? 'card_resolution' : 'card_undo',
		value,
		settled.abandoned
	);
	return { kind: 'settled', value };
}

function settlement(outcome: ProposalCardOutcome | ProposalCardUndoOutcome, reason: string | null) {
	if (outcome === 'unknown')
		return { state: 'uncertain' as const, failureCode: 'proposal_card_outcome_unknown' };
	if (outcome === 'stale')
		return { state: 'failed' as const, failureCode: reason ?? 'proposal_card_stale' };
	return { state: 'succeeded' as const, failureCode: null };
}

// ---------------------------------------------------------------------------
// Choose.

export type ProposalCardResolveResult =
	| {
			ok: true;
			resolution: ProposalCardResolutionV1;
			alreadyResolved: boolean;
			/** The line the card shows now. */
			description: ProposalCardDescription;
	  }
	| ProposalCardFailure;

export async function resolveProposalCard(
	params: CallParams & { choice: string; seenDigest?: string | null }
): Promise<ProposalCardResolveResult> {
	const deps: ProposalCardDeps = { ...DEFAULT_DEPS, ...params.deps };
	const loaded = await loadCard(params);
	if (isProposalCardFailure(loaded)) return loaded;
	const { card, row, turn } = loaded;
	const spec = proposalCardSpec(card.kind);
	if (!spec.choices.includes(params.choice))
		return failure(400, 'INVALID_CHOICE', `choice must be one of: ${spec.choices.join(', ')}`);

	const settledResult = (
		state: PhaseState<ProposalCardResolutionV1>
	): ProposalCardResolveResult =>
		state.kind === 'settled'
			? {
					ok: true,
					resolution: state.value,
					alreadyResolved: true,
					description: spec.describeResolution(state.value, card.client_action.payload)
				}
			: state.kind === 'released'
				? RELEASED
				: IN_PROGRESS;

	let existing: PhaseState<ProposalCardResolutionV1>;
	try {
		existing = await readPhase(loaded, 'decide', params, deps, { wait: true });
	} catch {
		return LOAD_FAILED;
	}
	if (existing.kind !== 'none') return settledResult(existing);

	const proposedAt = Date.parse(row.created_at ?? '');
	if (!Number.isFinite(proposedAt) || deps.now().getTime() - proposedAt >= spec.ttlMs)
		return failure(
			410,
			'CARD_EXPIRED',
			'This card expired after 24 hours. Ask again. Nothing changed.'
		);
	// A card can appear before the reply finishes; a click waits for the turn.
	if (!TERMINAL_TURN_STATUSES.has(String(turn.status)))
		return failure(
			409,
			'TURN_IN_PROGRESS',
			'The chat is still replying. Choose again when the reply finishes.'
		);

	const handler = PROPOSAL_CARD_HANDLERS[card.kind];
	let prepared: Awaited<ReturnType<typeof handler.prepareDecide>>;
	try {
		prepared = await handler.prepareDecide(context(loaded, params, deps), {
			choice: params.choice,
			seenDigest: params.seenDigest ?? null
		});
	} catch {
		return failure(500, 'INTERNAL', 'Could not check this card. Nothing changed.');
	}
	if (prepared.kind === 'fail') return prepared.failure;

	const attempt = await insertClaim(
		params.admin,
		{
			cardId: card.card_id,
			phase: 'decide',
			turnRunId: turn.id,
			sessionId: row.session_id,
			userId: params.userId,
			executionGeneration: turn.execution_generation,
			operationName: `proposal.${card.kind}.${params.choice}`,
			argumentFields: { choice: params.choice }
		},
		deps.now()
	);
	if (attempt.kind === 'taken') {
		try {
			return settledResult(await readPhase(loaded, 'decide', params, deps, { wait: true }));
		} catch {
			return LOAD_FAILED;
		}
	}
	if (attempt.kind === 'error')
		return failure(500, 'INTERNAL', 'Could not record your choice. Nothing changed.');

	let action: DecideActionResult;
	if (prepared.kind === 'settle') action = prepared.result;
	else {
		try {
			action = await prepared.run();
		} catch {
			// A write may have started: never release on an unexpected throw.
			action = {
				kind: 'resolved',
				outcome: 'unknown',
				reasonCode: 'proposal_card_outcome_unknown',
				receipt: null
			};
		}
	}
	if (action.kind === 'released') {
		await releaseClaim(params.admin, attempt.claimId);
		return action.failure;
	}

	const finishedAt = laterOf(deps.now().toISOString(), attempt.startedAt);
	const built: ProposalCardResolutionV1 = {
		version: 1,
		card_id: card.card_id,
		kind: card.kind,
		choice: params.choice,
		outcome: action.outcome,
		resolved_at: finishedAt,
		reason_code: action.reasonCode,
		receipt: action.receipt
	};
	// What the ledger and mirror hold must parse back the same way.
	const resolution =
		parseProposalCardResolution(JSON.parse(JSON.stringify(built)), {
			cardId: card.card_id,
			kind: card.kind
		}) ?? built;
	const { state, failureCode } = settlement(resolution.outcome, resolution.reason_code);
	await settleClaim(params.admin, attempt.claimId, {
		state,
		finishedAt,
		receipt: resolution as unknown as Json,
		failureCode
	});
	await writeMirror(params.admin, row.id, 'card_resolution', resolution);
	return {
		ok: true,
		resolution,
		alreadyResolved: false,
		description: spec.describeResolution(resolution, card.client_action.payload)
	};
}

// ---------------------------------------------------------------------------
// Undo.

export type ProposalCardUndoResult =
	| {
			ok: true;
			undo: ProposalCardUndoV1;
			alreadyUndone: boolean;
			description: ProposalCardDescription;
	  }
	| ProposalCardFailure;

const NOT_UNDOABLE = failure(409, 'NOT_UNDOABLE', 'Only an applied card can be undone.');

/** The applied decision an undo needs, or the failure that says why not. */
async function appliedDecision(
	loaded: LoadedCard,
	params: CallParams,
	deps: ProposalCardDeps
): Promise<ProposalCardResolutionV1 | ProposalCardFailure> {
	let decided: PhaseState<ProposalCardResolutionV1>;
	try {
		decided = await readPhase(loaded, 'decide', params, deps, { wait: false });
	} catch {
		return LOAD_FAILED;
	}
	if (decided.kind === 'running') return IN_PROGRESS;
	if (decided.kind !== 'settled' || decided.value.outcome !== 'applied') return NOT_UNDOABLE;
	return decided.value;
}

function undoExpired(
	resolution: ProposalCardResolutionV1,
	loaded: LoadedCard,
	deps: ProposalCardDeps
): ProposalCardFailure | null {
	const appliedAt = Date.parse(resolution.resolved_at);
	const ttl = proposalCardSpec(loaded.card.kind).undoTtlMs;
	return !Number.isFinite(appliedAt) || deps.now().getTime() - appliedAt >= ttl
		? failure(410, 'UNDO_EXPIRED', 'Undo is available for 7 days. Nothing changed.')
		: null;
}

export async function undoProposalCard(
	params: CallParams & { seenDigest?: string | null }
): Promise<ProposalCardUndoResult> {
	const deps: ProposalCardDeps = { ...DEFAULT_DEPS, ...params.deps };
	const loaded = await loadCard(params);
	if (isProposalCardFailure(loaded)) return loaded;
	const { card, row, turn } = loaded;
	const spec = proposalCardSpec(card.kind);

	const settledResult = (state: PhaseState<ProposalCardUndoV1>): ProposalCardUndoResult =>
		state.kind === 'settled'
			? {
					ok: true,
					undo: state.value,
					alreadyUndone: true,
					description: spec.describeUndo(state.value, card.client_action.payload)
				}
			: state.kind === 'released'
				? RELEASED
				: IN_PROGRESS;

	const resolution = await appliedDecision(loaded, params, deps);
	if (isProposalCardFailure(resolution)) return resolution;
	let existing: PhaseState<ProposalCardUndoV1>;
	try {
		existing = await readPhase(loaded, 'undo', params, deps, { wait: true });
	} catch {
		return LOAD_FAILED;
	}
	if (existing.kind !== 'none') return settledResult(existing);
	const expired = undoExpired(resolution, loaded, deps);
	if (expired) return expired;

	const handler = PROPOSAL_CARD_HANDLERS[card.kind];
	let prepared: Awaited<ReturnType<typeof handler.prepareUndo>>;
	try {
		prepared = await handler.prepareUndo(context(loaded, params, deps), {
			resolution,
			seenDigest: params.seenDigest ?? null
		});
	} catch {
		return failure(500, 'INTERNAL', 'Could not check this card. Nothing changed.');
	}
	if (prepared.kind === 'fail') return prepared.failure;

	const attempt = await insertClaim(
		params.admin,
		{
			cardId: card.card_id,
			phase: 'undo',
			turnRunId: turn.id,
			sessionId: row.session_id,
			userId: params.userId,
			executionGeneration: turn.execution_generation,
			operationName: `proposal.${card.kind}.undo`,
			argumentFields: { resolved_at: resolution.resolved_at }
		},
		deps.now()
	);
	if (attempt.kind === 'taken') {
		try {
			return settledResult(await readPhase(loaded, 'undo', params, deps, { wait: true }));
		} catch {
			return LOAD_FAILED;
		}
	}
	if (attempt.kind === 'error')
		return failure(500, 'INTERNAL', 'Could not record your choice. Nothing changed.');

	let action: UndoActionResult;
	if (prepared.kind === 'settle') action = prepared.result;
	else {
		try {
			action = await prepared.run();
		} catch {
			action = {
				kind: 'resolved',
				outcome: 'unknown',
				reasonCode: 'proposal_card_outcome_unknown',
				receipt: null
			};
		}
	}
	if (action.kind === 'released') {
		await releaseClaim(params.admin, attempt.claimId);
		return action.failure;
	}

	const finishedAt = laterOf(deps.now().toISOString(), attempt.startedAt);
	const built: ProposalCardUndoV1 = {
		version: 1,
		card_id: card.card_id,
		kind: card.kind,
		outcome: action.outcome,
		undone_at: finishedAt,
		reason_code: action.reasonCode,
		receipt: action.receipt
	};
	const undo =
		parseProposalCardUndo(JSON.parse(JSON.stringify(built)), {
			cardId: card.card_id,
			kind: card.kind
		}) ?? built;
	const { state, failureCode } = settlement(undo.outcome, undo.reason_code);
	await settleClaim(params.admin, attempt.claimId, {
		state,
		finishedAt,
		receipt: undo as unknown as Json,
		failureCode
	});
	await writeMirror(params.admin, row.id, 'card_undo', undo);
	return {
		ok: true,
		undo,
		alreadyUndone: false,
		description: spec.describeUndo(undo, card.client_action.payload)
	};
}

// ---------------------------------------------------------------------------
// Check again / undo preview (read-only: no claim, no write).

export async function previewProposalCard(
	params: CallParams & { phase: ProposalClaimPhase }
): Promise<ProposalCardView | ProposalCardFailure> {
	const deps: ProposalCardDeps = { ...DEFAULT_DEPS, ...params.deps };
	const loaded = await loadCard(params);
	if (isProposalCardFailure(loaded)) return loaded;
	const spec = proposalCardSpec(loaded.card.kind);
	const handler = PROPOSAL_CARD_HANDLERS[loaded.card.kind];
	const ctx = context(loaded, params, deps);
	const noPreview = failure(400, 'NO_PREVIEW', 'This card has no preview.');

	if (params.phase === 'decide') {
		if (!spec.hasPreview || !handler.preview) return noPreview;
		let decided: PhaseState<ProposalCardResolutionV1>;
		try {
			decided = await readPhase(loaded, 'decide', params, deps, { wait: false });
		} catch {
			return LOAD_FAILED;
		}
		if (decided.kind === 'running') return IN_PROGRESS;
		if (decided.kind === 'settled')
			return failure(409, 'ALREADY_RESOLVED', 'This card was already decided.', {
				resolution: decided.value
			});
		const proposedAt = Date.parse(loaded.row.created_at ?? '');
		if (!Number.isFinite(proposedAt) || deps.now().getTime() - proposedAt >= spec.ttlMs)
			return failure(410, 'CARD_EXPIRED', 'This card expired after 24 hours. Ask again.');
		return handler.preview(ctx);
	}

	if (!spec.hasUndoPreview || !handler.undoPreview) return noPreview;
	const resolution = await appliedDecision(loaded, params, deps);
	if (isProposalCardFailure(resolution)) return resolution;
	let undone: PhaseState<ProposalCardUndoV1>;
	try {
		undone = await readPhase(loaded, 'undo', params, deps, { wait: false });
	} catch {
		return LOAD_FAILED;
	}
	if (undone.kind === 'running') return IN_PROGRESS;
	if (undone.kind === 'settled')
		return failure(409, 'ALREADY_RESOLVED', 'This card was already undone.', {
			undo: undone.value
		});
	const expired = undoExpired(resolution, loaded, deps);
	if (expired) return expired;
	return handler.undoPreview(ctx, resolution);
}
