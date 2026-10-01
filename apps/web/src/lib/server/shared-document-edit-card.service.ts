// apps/web/src/lib/server/shared-document-edit-card.service.ts
//
// Resolves a click on a chat confirm card for a shared-document edit (project
// hierarchy Phase 2). The click is the only consent: the browser sends the card
// id, its chat session and a choice, never the edit. The edit, its previewed
// document version and every id come from the card's service-only ledger row
// (`chat_turn_effects`, written by the worker when the card was shown).
//
// Single use: the resolution is a second ledger row whose id is derived from
// the card id. Inserting it is the atomic pending -> resolved claim; a second
// click (another tab, a double tap) loses the insert and gets the first
// click's result. The chosen action then runs through the same document update
// the chat uses (`runGatewayWriteOp`, user-scoped, version-guarded), and the
// outcome is recorded on the resolution row and mirrored onto the card's tool
// result so the card stays resolved after reload and the next chat turn learns
// what happened.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, ProjectFamilyV1 } from '@buildos/shared-types';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	SHARED_DOCUMENT_EDIT_CARD_TTL_MS,
	parseSharedDocumentEditCardReceipt,
	parseSharedDocumentEditResolution,
	type SharedDocumentEditCardReceiptV1,
	type SharedDocumentEditChoice,
	type SharedDocumentEditCopyV1,
	type SharedDocumentEditOutcome,
	type SharedDocumentEditResolutionV1
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import { getProjectFamily } from '$lib/services/ontology/project-hierarchy.service';
import { copyInheritedDocument } from './inherited-doc-copy';

type Client = SupabaseClient<Database>;

export type SharedDocumentEditCardFailure = {
	ok: false;
	status: number;
	code:
		| 'CARD_NOT_FOUND'
		| 'CARD_EXPIRED'
		| 'TURN_IN_PROGRESS'
		| 'RESOLUTION_IN_PROGRESS'
		| 'PARENT_WRITE_REQUIRED'
		| 'PROJECT_WRITE_REQUIRED'
		| 'INTERNAL';
	message: string;
};

export type SharedDocumentEditCardResult =
	| { ok: true; resolution: SharedDocumentEditResolutionV1; alreadyResolved: boolean }
	| SharedDocumentEditCardFailure;

export type SharedDocumentEditCardDeps = {
	runGatewayWriteOp: typeof runGatewayWriteOp;
	copyInheritedDocument: typeof copyInheritedDocument;
	getProjectFamily: (client: Client, projectId: string) => Promise<ProjectFamilyV1>;
	sleep: (ms: number) => Promise<void>;
	now: () => Date;
};

const DEFAULT_DEPS: SharedDocumentEditCardDeps = {
	runGatewayWriteOp,
	copyInheritedDocument,
	getProjectFamily,
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now: () => new Date()
};

const RESOLUTION_TOOL_NAME = 'shared_document_edit_card';
const TERMINAL_TURN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const TERMINAL_EFFECT_STATES = new Set(['succeeded', 'failed', 'uncertain']);
/** How long a losing click waits for the winning click to finish. */
const CONCURRENT_WAIT_ATTEMPTS = 20;
const CONCURRENT_WAIT_MS = 250;
/** A claim left unresolved this long crashed mid-way; its outcome is unknown. */
const ABANDONED_CLAIM_MS = 2 * 60 * 1000;

/** Deterministic, so the primary key makes the claim single-use. */
export function sharedDocumentEditResolutionId(cardId: string): string {
	const hex = createHash('sha256')
		.update(`shared_document_edit_resolution_v1:${cardId.toLowerCase()}`)
		.digest('hex');
	const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function failure(
	status: number,
	code: SharedDocumentEditCardFailure['code'],
	message: string
): SharedDocumentEditCardFailure {
	return { ok: false, status, code, message };
}

const NOT_FOUND = failure(404, 'CARD_NOT_FOUND', 'This card is not available.');

type CardRow = {
	id: string;
	turn_run_id: string;
	session_id: string;
	user_id: string;
	execution_generation: number;
	tool_name: string;
	operation_name: string;
	state: string;
	finished_at: string | null;
	downstream_receipt: Json | null;
};

type ResolutionRow = {
	state: string;
	reserved_at: string;
	started_at: string | null;
	downstream_receipt: Json | null;
};

/**
 * A ledger timestamp no earlier than any of `stamps`. Database stamps carry
 * microseconds that Date.parse truncates, so the 1 ms margin keeps the
 * ledger's reserved <= started <= finished ordering check satisfied.
 */
function laterOf(...stamps: Array<string | null | undefined>): string {
	const times = stamps.map((stamp) => (stamp ? Date.parse(stamp) : 0)).filter(Number.isFinite);
	return new Date(Math.max(...times) + 1).toISOString();
}

async function loadResolution(admin: Client, resolutionId: string): Promise<ResolutionRow | null> {
	const { data, error } = await admin
		.from('chat_turn_effects')
		.select('state, reserved_at, started_at, downstream_receipt')
		.eq('id', resolutionId)
		.maybeSingle();
	if (error) throw error;
	return (data as ResolutionRow | null) ?? null;
}

/** The recorded result of a finished claim, or null while it is still running. */
function settledResolution(
	row: ResolutionRow,
	card: SharedDocumentEditCardReceiptV1,
	now: Date
): SharedDocumentEditResolutionV1 | null {
	if (TERMINAL_EFFECT_STATES.has(row.state)) {
		return (
			parseSharedDocumentEditResolution(row.downstream_receipt) ??
			buildResolution(card, 'cancel', 'unknown', now.toISOString(), null)
		);
	}
	const claimedAt = Date.parse(row.started_at ?? row.reserved_at);
	return Number.isFinite(claimedAt) && now.getTime() - claimedAt > ABANDONED_CLAIM_MS
		? buildResolution(card, 'cancel', 'unknown', now.toISOString(), null)
		: null;
}

function buildResolution(
	card: SharedDocumentEditCardReceiptV1,
	choice: SharedDocumentEditChoice,
	outcome: SharedDocumentEditOutcome,
	resolvedAt: string,
	copy: SharedDocumentEditCopyV1 | null
): SharedDocumentEditResolutionV1 {
	return {
		version: 1,
		card_id: card.card_id,
		choice,
		outcome,
		resolved_at: resolvedAt,
		document_id: card.pending_edit.document_id,
		document_title: card.client_action.document_title,
		parent_project_id: card.pending_edit.parent_project_id,
		parent_name: card.client_action.parent_name,
		shared_with_count: card.pending_edit.shared_with_count,
		copy
	};
}

type ActionResult =
	| { kind: 'resolved'; outcome: SharedDocumentEditOutcome; copy: SharedDocumentEditCopyV1 | null }
	/** Nothing was written; release the claim so the card stays usable. */
	| { kind: 'released'; failure: SharedDocumentEditCardFailure };

export async function resolveSharedDocumentEditCard(params: {
	cardId: string;
	sessionId: string;
	choice: SharedDocumentEditChoice;
	userId: string;
	/** The signed-in user's client: every document read and write. */
	userClient: Client;
	/** Service role: the service-only ledger only, after ownership is checked. */
	admin: Client;
	deps?: Partial<SharedDocumentEditCardDeps>;
}): Promise<SharedDocumentEditCardResult> {
	const deps: SharedDocumentEditCardDeps = { ...DEFAULT_DEPS, ...params.deps };
	const { admin, userClient, userId, choice } = params;
	const cardId = params.cardId.toLowerCase();

	const { data: cardRow, error: cardError } = await admin
		.from('chat_turn_effects')
		.select(
			'id, turn_run_id, session_id, user_id, execution_generation, tool_name, operation_name, state, finished_at, downstream_receipt'
		)
		.eq('id', cardId)
		.eq('user_id', userId)
		.maybeSingle();
	if (cardError) return failure(500, 'INTERNAL', 'Could not load this card. Nothing changed.');
	const row = cardRow as CardRow | null;
	const card = row ? parseSharedDocumentEditCardReceipt(row.downstream_receipt) : null;
	if (
		!row ||
		!card ||
		row.session_id !== params.sessionId.toLowerCase() ||
		row.tool_name !== 'update_onto_document' ||
		row.operation_name !== 'onto.document.update' ||
		row.state !== 'succeeded' ||
		card.card_id !== row.id ||
		card.client_action.session_id !== row.session_id
	)
		return NOT_FOUND;

	const resolutionId = sharedDocumentEditResolutionId(cardId);
	const waitForSettled = async (): Promise<SharedDocumentEditCardResult> => {
		for (let attempt = 0; attempt < CONCURRENT_WAIT_ATTEMPTS; attempt += 1) {
			const current = await loadResolution(admin, resolutionId);
			// The other click wrote nothing and released the card.
			if (!current)
				return failure(
					409,
					'RESOLUTION_IN_PROGRESS',
					'Another choice on this card didn’t go through. Try again.'
				);
			const settled = settledResolution(current, card, deps.now());
			if (settled) return { ok: true, resolution: settled, alreadyResolved: true };
			await deps.sleep(CONCURRENT_WAIT_MS);
		}
		return failure(
			409,
			'RESOLUTION_IN_PROGRESS',
			'This card is already being applied. Check back in a moment.'
		);
	};

	try {
		const existing = await loadResolution(admin, resolutionId);
		if (existing) return await waitForSettled();
	} catch {
		return failure(500, 'INTERNAL', 'Could not load this card. Nothing changed.');
	}

	const proposedAt = Date.parse(row.finished_at ?? '');
	if (
		!Number.isFinite(proposedAt) ||
		deps.now().getTime() - proposedAt >= SHARED_DOCUMENT_EDIT_CARD_TTL_MS
	)
		return failure(
			410,
			'CARD_EXPIRED',
			'This preview expired after 24 hours. Ask Jev again. Nothing changed.'
		);

	// A card can appear before Jev finishes replying. The turn's own bookkeeping
	// settles its open ledger rows when it ends, so a claim waits for that.
	const { data: turn, error: turnError } = await admin
		.from('chat_turn_runs')
		.select('status')
		.eq('id', row.turn_run_id)
		.eq('user_id', userId)
		.maybeSingle();
	if (turnError) return failure(500, 'INTERNAL', 'Could not load this card. Nothing changed.');
	if (!turn || !TERMINAL_TURN_STATUSES.has(String(turn.status)))
		return failure(
			409,
			'TURN_IN_PROGRESS',
			'Jev is still replying. Choose again when the reply finishes.'
		);

	// Read-only checks first: a missing permission leaves the card open for the
	// other choices; a changed or unshared document resolves it as stale.
	let precheck: { stale: boolean; actorId?: string; childName?: string | null };
	try {
		precheck = await precheckChoice({ choice, card, userId, userClient, deps });
	} catch (error) {
		if (isFailure(error)) return error;
		return failure(500, 'INTERNAL', 'Could not check access. Nothing changed.');
	}

	// The claim: exactly one click inserts this row.
	const { data: claimed, error: claimError } = await admin
		.from('chat_turn_effects')
		.insert({
			id: resolutionId,
			turn_run_id: row.turn_run_id,
			session_id: row.session_id,
			user_id: userId,
			execution_generation: row.execution_generation,
			tool_name: RESOLUTION_TOOL_NAME,
			operation_name: `shared_document_edit.${choice}`,
			canonical_argument_hash: createHash('sha256')
				.update(JSON.stringify({ card_id: cardId, choice }))
				.digest('hex'),
			downstream_idempotency_supported: false
		})
		.select('reserved_at')
		.single();
	if (claimError || !claimed) {
		if ((claimError as { code?: string } | null)?.code === '23505') {
			try {
				return await waitForSettled();
			} catch {
				return failure(500, 'INTERNAL', 'Could not load this card. Nothing changed.');
			}
		}
		return failure(500, 'INTERNAL', 'Could not record your choice. Nothing changed.');
	}
	const startedAt = laterOf(deps.now().toISOString(), claimed.reserved_at);
	const { error: startError } = await admin
		.from('chat_turn_effects')
		.update({ state: 'started', started_at: startedAt })
		.eq('id', resolutionId)
		.eq('state', 'reserved');
	if (startError) {
		await releaseClaim(admin, resolutionId);
		return failure(500, 'INTERNAL', 'Could not record your choice. Nothing changed.');
	}

	let action: ActionResult;
	if (precheck.stale) action = { kind: 'resolved', outcome: 'stale', copy: null };
	else if (choice === 'cancel') action = { kind: 'resolved', outcome: 'cancelled', copy: null };
	else if (choice === 'apply')
		action = await applyToParent({ card, userId, userClient, deps, sessionId: row.session_id });
	else
		action = await copyToChild({
			card,
			userId,
			userClient,
			deps,
			sessionId: row.session_id,
			actorId: precheck.actorId!,
			childName: precheck.childName ?? null
		});

	if (action.kind === 'released') {
		await releaseClaim(admin, resolutionId);
		return action.failure;
	}

	const finishedAt = laterOf(deps.now().toISOString(), startedAt);
	const resolution = buildResolution(card, choice, action.outcome, finishedAt, action.copy);
	await admin
		.from('chat_turn_effects')
		.update({
			state:
				action.outcome === 'unknown'
					? 'uncertain'
					: action.outcome === 'stale'
						? 'failed'
						: 'succeeded',
			finished_at: finishedAt,
			downstream_receipt: resolution as unknown as Json,
			failure_code:
				action.outcome === 'stale'
					? 'shared_document_changed'
					: action.outcome === 'unknown'
						? 'shared_document_outcome_unknown'
						: null
		})
		.eq('id', resolutionId)
		.eq('state', 'started');
	await mirrorResolution(admin, row, resolution);
	return { ok: true, resolution, alreadyResolved: false };
}

function isFailure(value: unknown): value is SharedDocumentEditCardFailure {
	return Boolean(value) && typeof value === 'object' && (value as { ok?: unknown }).ok === false;
}

async function precheckChoice(params: {
	choice: SharedDocumentEditChoice;
	card: SharedDocumentEditCardReceiptV1;
	userId: string;
	userClient: Client;
	deps: SharedDocumentEditCardDeps;
}): Promise<{ stale: boolean; actorId?: string; childName?: string | null }> {
	const { choice, card, userClient, deps } = params;
	const pending = card.pending_edit;
	if (choice === 'cancel') return { stale: false };

	if (choice === 'apply') {
		const family = await deps.getProjectFamily(userClient, pending.child_project_id);
		if (family.parent?.id !== pending.parent_project_id) return { stale: true };
		if (!family.parent.can_write)
			throw failure(
				403,
				'PARENT_WRITE_REQUIRED',
				`You can’t edit documents in ${card.client_action.parent_name}. Copy here still works.`
			);
		return { stale: !(await onShelfAtVersion(family, card, userClient)) };
	}

	const [actor, access, family, child] = await Promise.all([
		userClient.rpc('ensure_actor_for_user', { p_user_id: params.userId }),
		userClient.rpc('current_actor_has_project_member_access', {
			p_project_id: pending.child_project_id,
			p_required_access: 'write'
		}),
		deps.getProjectFamily(userClient, pending.child_project_id),
		userClient
			.from('onto_projects')
			.select('name')
			.eq('id', pending.child_project_id)
			.maybeSingle()
	]);
	if (actor.error || typeof actor.data !== 'string' || access.error)
		throw failure(500, 'INTERNAL', 'Could not check access. Nothing changed.');
	if (access.data !== true)
		throw failure(
			403,
			'PROJECT_WRITE_REQUIRED',
			'You can’t add documents to this project. Nothing changed.'
		);
	if (family.parent?.id !== pending.parent_project_id) return { stale: true };
	return {
		stale: !(await onShelfAtVersion(family, card, userClient)),
		actorId: actor.data,
		childName: typeof child.data?.name === 'string' ? child.data.name : null
	};
}

/** Still on this viewer's shelf, and still exactly the previewed version. */
async function onShelfAtVersion(
	family: ProjectFamilyV1,
	card: SharedDocumentEditCardReceiptV1,
	userClient: Client
): Promise<boolean> {
	const pending = card.pending_edit;
	if (!family.shelf.some((doc) => doc.id === pending.document_id)) return false;
	const { data, error } = await userClient
		.from('onto_documents')
		.select('updated_at')
		.eq('id', pending.document_id)
		.eq('project_id', pending.parent_project_id)
		.is('deleted_at', null)
		.maybeSingle();
	if (error) throw error;
	return data?.updated_at === pending.document_version;
}

async function applyToParent(params: {
	card: SharedDocumentEditCardReceiptV1;
	userId: string;
	userClient: Client;
	sessionId: string;
	deps: SharedDocumentEditCardDeps;
}): Promise<ActionResult> {
	const pending = params.card.pending_edit;
	let result: Awaited<ReturnType<typeof runGatewayWriteOp>>;
	try {
		result = await params.deps.runGatewayWriteOp({
			admin: params.userClient,
			userId: params.userId,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				project_ids: [pending.parent_project_id],
				write_project_ids: [pending.parent_project_id]
			},
			op: 'onto.document.update',
			args: pending.arguments,
			chatSessionId: params.sessionId,
			// Never rebase: the exact previewed version or nothing.
			documentWriteGuard: {
				documentId: pending.document_id,
				projectId: pending.parent_project_id,
				updatedAt: pending.document_version
			}
		});
	} catch {
		return { kind: 'resolved', outcome: 'unknown', copy: null };
	}
	if (result.ok) return { kind: 'resolved', outcome: 'applied', copy: null };
	const code = result.error?.code;
	if (result.error?.details?.confirmation_changed === true || code === 'NOT_FOUND')
		return { kind: 'resolved', outcome: 'stale', copy: null };
	if (code === 'VALIDATION_ERROR') return { kind: 'resolved', outcome: 'stale', copy: null };
	if (code === 'FORBIDDEN')
		return {
			kind: 'released',
			failure: failure(
				403,
				'PARENT_WRITE_REQUIRED',
				`You can’t edit documents in ${params.card.client_action.parent_name}. Copy here still works.`
			)
		};
	return { kind: 'resolved', outcome: 'unknown', copy: null };
}

async function copyToChild(params: {
	card: SharedDocumentEditCardReceiptV1;
	userId: string;
	userClient: Client;
	sessionId: string;
	actorId: string;
	childName: string | null;
	deps: SharedDocumentEditCardDeps;
}): Promise<ActionResult> {
	const pending = params.card.pending_edit;
	const copied = await params.deps.copyInheritedDocument({
		supabase: params.userClient,
		userId: params.userId,
		actorId: params.actorId,
		projectId: pending.child_project_id,
		parentId: pending.parent_project_id,
		documentId: pending.document_id,
		changeSource: 'chat',
		// The card showed the change against this version; copy exactly it.
		expectedUpdatedAt: pending.document_version
	});
	if (copied.status === 'not_found' || copied.status === 'changed')
		return { kind: 'resolved', outcome: 'stale', copy: null };
	if (copied.status === 'error')
		return {
			kind: 'released',
			failure: failure(500, 'INTERNAL', 'Could not make the copy. Nothing changed.')
		};

	let editApplied = false;
	try {
		const result = await params.deps.runGatewayWriteOp({
			admin: params.userClient,
			userId: params.userId,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				project_ids: [pending.child_project_id],
				write_project_ids: [pending.child_project_id]
			},
			op: 'onto.document.update',
			args: { ...pending.arguments, document_id: copied.document.id },
			chatSessionId: params.sessionId
		});
		editApplied = result.ok;
	} catch {
		editApplied = false;
	}
	return {
		kind: 'resolved',
		outcome: 'copied',
		copy: {
			document_id: copied.document.id,
			project_id: pending.child_project_id,
			project_name: params.childName,
			title: copied.document.title ?? params.card.client_action.document_title,
			edit_applied: editApplied
		}
	};
}

async function releaseClaim(admin: Client, resolutionId: string): Promise<void> {
	await admin
		.from('chat_turn_effects')
		.delete()
		.eq('id', resolutionId)
		.in('state', ['reserved', 'started']);
}

/**
 * Best effort: copy the resolution onto the card's tool result, which is what
 * a reloaded chat renders and what the next turn's history reads. The ledger
 * row above stays the authority; a failed mirror self-heals on the next click.
 */
async function mirrorResolution(
	admin: Client,
	card: Pick<CardRow, 'id' | 'session_id'>,
	resolution: SharedDocumentEditResolutionV1
): Promise<void> {
	try {
		const { data } = await admin
			.from('chat_tool_executions')
			.select('id, result')
			.eq('effect_id', card.id)
			.eq('session_id', card.session_id)
			.maybeSingle();
		const result = data?.result;
		if (!data || !result || typeof result !== 'object' || Array.isArray(result)) return;
		await admin
			.from('chat_tool_executions')
			.update({
				result: { ...result, card_resolution: resolution } as unknown as Json
			})
			.eq('id', data.id);
	} catch {
		// The ledger holds the outcome; see above.
	}
}
