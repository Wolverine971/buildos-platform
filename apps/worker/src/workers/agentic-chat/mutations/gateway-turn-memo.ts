// apps/worker/src/workers/agentic-chat/mutations/gateway-turn-memo.ts
//
// One gateway lookup memo per turn execution, shared by every adapter that
// writes through the gateway. Each write builds a fresh gateway context, so
// without it a five-task batch resolved the actor ten times and the project
// summaries and timezone five times each (tasker 101). Sharing matters for
// correctness too: a project created by one adapter must clear the project
// summaries another adapter would otherwise reuse.

import type { GatewayLookupMemo } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';

/** Longer than the worker's turn hard cap, so a live turn never loses its memo. */
const TURN_MEMO_TTL_MS = 10 * 60_000;
/** The worker is long-lived; bound the registry instead of growing it. */
const TURN_MEMO_LIMIT = 256;

const turnMemos = new Map<string, { expiresAt: number; memo: GatewayLookupMemo }>();

export function gatewayMemoForTurn(
	claim: { turnRunId: string; executionGeneration: number },
	now: number = Date.now()
): GatewayLookupMemo {
	// A recovered turn runs under a new generation and starts from fresh lookups.
	const key = `${claim.turnRunId}:${claim.executionGeneration}`;
	const existing = turnMemos.get(key);
	if (existing && existing.expiresAt > now) return existing.memo;
	for (const [candidate, entry] of turnMemos) {
		if (entry.expiresAt <= now) turnMemos.delete(candidate);
	}
	if (turnMemos.size >= TURN_MEMO_LIMIT) turnMemos.clear();
	const memo: GatewayLookupMemo = {};
	turnMemos.set(key, { expiresAt: now + TURN_MEMO_TTL_MS, memo });
	return memo;
}
