// packages/agentic-chat-runtime/src/loop/mutation-batch.ts
//
// SHA-bound mutation batches: the write protocol that replaced the turn
// contract DSL (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 Decision 1).
//
// The acting model proposes the exact tool calls it wants to run. The harness
// withholds that batch, hashes it, and shows the reviewer the calls and their
// real arguments. On approval the harness executes the SAME held calls, so the
// executed arguments are the approved arguments by construction — the property
// the contract lane lost when the reviewer began approving a natural-language
// description of a batch instead of the batch (F08).
//
// Nothing here parses a DSL. A batch is a list of tool calls; a call is a name
// and its canonical provider arguments. There is no vocabulary for the model to
// get wrong, so there is no rejection class for getting it wrong.

import { createHash } from 'node:crypto';
import type { WriteLedgerEntry } from './write-ledger';

/** One proposed tool call, exactly as the provider streamed it. */
export interface MutationBatchCall {
	/**
	 * Provider tool-call id. Non-deterministic, so it is deliberately excluded
	 * from the review digest; it exists to bind results back to the held call.
	 */
	id: string;
	name: string;
	/**
	 * Canonical provider argument JSON, scheduling sidecars included. This is
	 * the exact text the adapter will execute, which is what makes the digest
	 * meaningful.
	 */
	canonicalArguments: string;
}

export interface MutationBatch {
	version: 1;
	calls: readonly MutationBatchCall[];
}

export const MUTATION_BATCH_VERSION = 1 as const;

/**
 * Assemble a batch from streamed calls. Order is preserved: the model's own
 * ordering plus any `call_ref`/`after` sidecars inside the arguments express
 * dependencies, so ordering is semantic and belongs in the digest.
 */
export function buildMutationBatch(
	calls: readonly { id: string; name: string; canonicalProviderArguments: string }[]
): MutationBatch {
	return {
		version: MUTATION_BATCH_VERSION,
		calls: calls.map((call) => ({
			id: call.id,
			name: call.name,
			canonicalArguments: call.canonicalProviderArguments
		}))
	};
}

/**
 * The reviewed surface of a batch: what the reviewer sees and what the digest
 * covers. Provider call ids are excluded — they change between attempts and
 * carry no meaning — so an identical proposal re-streamed after a retry hashes
 * identically and does not force a second paid review.
 */
export function serializeMutationBatchForReview(
	batch: MutationBatch
): { call: number; tool: string; arguments: string }[] {
	return batch.calls.map((call, index) => ({
		call: index + 1,
		tool: call.name,
		arguments: call.canonicalArguments
	}));
}

/**
 * Digest of the exact proposal. Bound into the reviewer's approval and checked
 * in code, so an approval can never travel to a different batch.
 */
export function mutationBatchSha256(batch: MutationBatch): string {
	const digestInput = JSON.stringify([
		batch.version,
		batch.calls.map((call) => [call.name, call.canonicalArguments])
	]);
	return createHash('sha256').update(digestInput).digest('hex');
}

/** True when two batches are the same proposal, ignoring provider call ids. */
export function mutationBatchesMatch(a: MutationBatch, b: MutationBatch): boolean {
	return mutationBatchSha256(a) === mutationBatchSha256(b);
}

export interface MutationBatchFulfilment {
	/** Approved calls whose write succeeded. */
	executed: readonly MutationBatchCall[];
	/**
	 * Approved calls with no successful write. A failed attempt counts as
	 * unfulfilled: the user asked for the change, not for an attempt.
	 */
	unfulfilled: readonly MutationBatchCall[];
	/** Human-readable remainder, one line per unfulfilled call. */
	descriptions: readonly string[];
}

/**
 * Which approved calls actually landed.
 *
 * Fulfilment under a batch is a count, not an inference: each approved call
 * either produced a successful ledger entry or it did not. The contract lane
 * had to guess this by matching declared postcondition fields against ledger
 * effects, which is where "2 of 6 moves" and the false `mutation_unfulfilled`
 * on a correct no-op both came from.
 */
export function mutationBatchFulfilment(
	batch: MutationBatch | null | undefined,
	ledger: readonly WriteLedgerEntry[]
): MutationBatchFulfilment {
	if (!batch || batch.calls.length === 0) {
		return { executed: [], unfulfilled: [], descriptions: [] };
	}
	// One ledger success may satisfy only one approved call, so a batch that
	// proposes the same call twice needs two successes.
	const remainingSuccesses = new Map<string, number>();
	for (const entry of ledger) {
		if (entry.status !== 'success') continue;
		remainingSuccesses.set(entry.toolName, (remainingSuccesses.get(entry.toolName) ?? 0) + 1);
	}
	const executed: MutationBatchCall[] = [];
	const unfulfilled: MutationBatchCall[] = [];
	for (const call of batch.calls) {
		const available = remainingSuccesses.get(call.name) ?? 0;
		if (available > 0) {
			remainingSuccesses.set(call.name, available - 1);
			executed.push(call);
		} else {
			unfulfilled.push(call);
		}
	}
	return {
		executed,
		unfulfilled,
		descriptions: unfulfilled.map((call) => describeMutationBatchCall(call))
	};
}

/** A short, user-facing name for one call in a batch. */
export function describeMutationBatchCall(call: MutationBatchCall): string {
	const title = readCallDisplayValue(call.canonicalArguments);
	return title ? `${call.name} (${title})` : call.name;
}

const DISPLAY_ARGUMENT_KEYS = ['title', 'name', 'task_id', 'document_id', 'project_id'] as const;
const MAX_DISPLAY_VALUE_CHARS = 80;

function readCallDisplayValue(canonicalArguments: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(canonicalArguments);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;
	for (const key of DISPLAY_ARGUMENT_KEYS) {
		const value = record[key];
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length === 0) continue;
		return trimmed.length > MAX_DISPLAY_VALUE_CHARS
			? `${trimmed.slice(0, MAX_DISPLAY_VALUE_CHARS - 1)}…`
			: trimmed;
	}
	return null;
}

/**
 * Rebuild the approved batch from the durable record the harness wrote when the
 * reviewer approved it. Used by terminal integrity and by any consumer that
 * only has persisted executions (resume, health, the evidence report).
 */
export function parseApprovedMutationBatch(value: unknown): MutationBatch | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.version !== MUTATION_BATCH_VERSION) return null;
	if (!Array.isArray(record.calls)) return null;
	const calls: MutationBatchCall[] = [];
	for (const entry of record.calls) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
		const call = entry as Record<string, unknown>;
		if (typeof call.name !== 'string' || call.name.length === 0) return null;
		if (typeof call.canonicalArguments !== 'string') return null;
		calls.push({
			id: typeof call.id === 'string' ? call.id : '',
			name: call.name,
			canonicalArguments: call.canonicalArguments
		});
	}
	return { version: MUTATION_BATCH_VERSION, calls };
}
