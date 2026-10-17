// apps/web/src/lib/server/proposal-cards/claim.ts
//
// Single use for proposal cards (tasker 122): one resolution row per card and
// phase in `chat_turn_effects`, the service-only ledger the shared-document card
// already uses (see shared-document-edit-card.service.ts; not refactored).
//
// - The row id is derived from the card id and phase, so the primary key makes
//   the claim atomic: exactly one click inserts it; a second click (another
//   tab, a double tap) gets 23505 and waits for the first click's result.
// - Rows satisfy every ledger rule (20260801041000…_effect_foundation.sql):
//   inserted `reserved`, moved to `started` before anything is written, then
//   settled `succeeded` / `failed` / `uncertain` with a receipt; timestamps keep
//   reserved <= started <= finished. Turn, session and user come from the card's
//   own turn (the composite foreign key re-checks them).
// - A claim that wrote nothing is deleted (released) so the card stays usable.
// - A claim left unsettled for 2 minutes crashed mid-way: its outcome is unknown.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';

type Client = SupabaseClient<Database>;

export type ProposalClaimPhase = 'decide' | 'undo';

export const PROPOSAL_CLAIM_TOOL_NAME = 'proposal_card';
/** A claim left unsettled this long crashed mid-way; its outcome is unknown. */
export const ABANDONED_CLAIM_MS = 2 * 60 * 1000;
/** How long a losing click waits for the winning click to finish. */
export const CONCURRENT_WAIT_ATTEMPTS = 20;
export const CONCURRENT_WAIT_MS = 250;

const TERMINAL_STATES = new Set(['succeeded', 'failed', 'uncertain']);

/** A UUID (v5 layout) from sha256(seed): deterministic, so it can be a primary key or idempotency key. */
export function deterministicUuid(seed: string): string {
	const hex = createHash('sha256').update(seed).digest('hex');
	const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function proposalCardClaimId(cardId: string, phase: ProposalClaimPhase): string {
	return deterministicUuid(`proposal_card_resolution_v1:${cardId.toLowerCase()}:${phase}`);
}

export type ProposalClaimRow = {
	id: string;
	state: string;
	operation_name: string;
	reserved_at: string;
	started_at: string | null;
	finished_at: string | null;
	downstream_receipt: Json | null;
};

export async function loadClaim(admin: Client, claimId: string): Promise<ProposalClaimRow | null> {
	const { data, error } = await admin
		.from('chat_turn_effects')
		.select(
			'id, state, operation_name, reserved_at, started_at, finished_at, downstream_receipt'
		)
		.eq('id', claimId)
		.maybeSingle();
	if (error) throw error;
	return (data as ProposalClaimRow | null) ?? null;
}

/** The choice recorded in `proposal.{kind}.{choice}` (a structured name, not prose). */
export function claimChoice(row: Pick<ProposalClaimRow, 'operation_name'>): string | null {
	const parts = row.operation_name.split('.');
	return parts.length === 3 && parts[0] === 'proposal' ? parts[2]! : null;
}

export type SettledClaim = {
	/** The recorded result, or null when the claim was abandoned (or its receipt is unreadable). */
	receipt: Json | null;
	abandoned: boolean;
	row: ProposalClaimRow;
};

/** A finished claim's result, an abandoned claim, or null while it is still running. */
export function settledClaim(row: ProposalClaimRow, now: Date): SettledClaim | null {
	if (TERMINAL_STATES.has(row.state))
		return { receipt: row.downstream_receipt ?? null, abandoned: false, row };
	const claimedAt = Date.parse(row.started_at ?? row.reserved_at);
	return Number.isFinite(claimedAt) && now.getTime() - claimedAt > ABANDONED_CLAIM_MS
		? { receipt: null, abandoned: true, row }
		: null;
}

export type WaitResult =
	| { kind: 'settled'; settled: SettledClaim }
	/** The other click wrote nothing and released the card. */
	| { kind: 'released' }
	| { kind: 'running' };

export async function waitForSettledClaim(
	admin: Client,
	claimId: string,
	deps: { sleep: (ms: number) => Promise<void>; now: () => Date }
): Promise<WaitResult> {
	for (let attempt = 0; attempt < CONCURRENT_WAIT_ATTEMPTS; attempt += 1) {
		const current = await loadClaim(admin, claimId);
		if (!current) return { kind: 'released' };
		const settled = settledClaim(current, deps.now());
		if (settled) return { kind: 'settled', settled };
		await deps.sleep(CONCURRENT_WAIT_MS);
	}
	return { kind: 'running' };
}

/**
 * A ledger timestamp no earlier than any of `stamps`. Database stamps carry
 * microseconds that Date.parse truncates, so the 1 ms margin keeps the
 * ledger's reserved <= started <= finished ordering check satisfied.
 */
export function laterOf(...stamps: Array<string | null | undefined>): string {
	const times = stamps.map((stamp) => (stamp ? Date.parse(stamp) : 0)).filter(Number.isFinite);
	return new Date(Math.max(...times) + 1).toISOString();
}

export type ClaimScope = {
	cardId: string;
	phase: ProposalClaimPhase;
	turnRunId: string;
	sessionId: string;
	userId: string;
	executionGeneration: number;
	/** `proposal.{kind}.{choice}` (decide) or `proposal.{kind}.undo`. */
	operationName: string;
	/** Hashed into canonical_argument_hash with the card id and phase. */
	argumentFields: Record<string, unknown>;
};

export type ClaimAttempt =
	| { kind: 'claimed'; claimId: string; startedAt: string }
	/** Another click holds (or held) this claim. */
	| { kind: 'taken'; claimId: string }
	| { kind: 'error'; claimId: string };

/** Insert the claim (the atomic pending -> resolving step) and mark it started. */
export async function insertClaim(
	admin: Client,
	scope: ClaimScope,
	now: Date
): Promise<ClaimAttempt> {
	const claimId = proposalCardClaimId(scope.cardId, scope.phase);
	const { data: claimed, error } = await admin
		.from('chat_turn_effects')
		.insert({
			id: claimId,
			turn_run_id: scope.turnRunId,
			session_id: scope.sessionId,
			user_id: scope.userId,
			execution_generation: scope.executionGeneration,
			tool_name: PROPOSAL_CLAIM_TOOL_NAME,
			operation_name: scope.operationName,
			canonical_argument_hash: createHash('sha256')
				.update(
					JSON.stringify({
						card_id: scope.cardId.toLowerCase(),
						phase: scope.phase,
						...scope.argumentFields
					})
				)
				.digest('hex'),
			downstream_idempotency_supported: false
		})
		.select('reserved_at')
		.single();
	if (error || !claimed) {
		return (error as { code?: string } | null)?.code === '23505'
			? { kind: 'taken', claimId }
			: { kind: 'error', claimId };
	}
	const startedAt = laterOf(now.toISOString(), (claimed as { reserved_at: string }).reserved_at);
	const { error: startError } = await admin
		.from('chat_turn_effects')
		.update({ state: 'started', started_at: startedAt })
		.eq('id', claimId)
		.eq('state', 'reserved');
	if (startError) {
		await releaseClaim(admin, claimId);
		return { kind: 'error', claimId };
	}
	return { kind: 'claimed', claimId, startedAt };
}

/** Delete a claim that wrote nothing, so the card stays usable. */
export async function releaseClaim(admin: Client, claimId: string): Promise<void> {
	await admin
		.from('chat_turn_effects')
		.delete()
		.eq('id', claimId)
		.in('state', ['reserved', 'started']);
}

export type ClaimSettlement = {
	state: 'succeeded' | 'failed' | 'uncertain';
	finishedAt: string;
	receipt: Json;
	failureCode: string | null;
};

/**
 * Record the outcome. Returns false when the write failed; the caller still
 * mirrors the result, and a later resolver call reads the mirror while the
 * ledger row is stuck (it then counts as abandoned).
 */
export async function settleClaim(
	admin: Client,
	claimId: string,
	settlement: ClaimSettlement
): Promise<boolean> {
	const write = () =>
		admin
			.from('chat_turn_effects')
			.update({
				state: settlement.state,
				finished_at: settlement.finishedAt,
				downstream_receipt: settlement.receipt,
				failure_code: settlement.failureCode
			})
			.eq('id', claimId)
			.eq('state', 'started');
	const first = await write();
	if (!first.error) return true;
	const second = await write();
	return !second.error;
}
