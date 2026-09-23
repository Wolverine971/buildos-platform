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
import type { JsonObject } from '@buildos/shared-types';

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
): { call: number; tool: string; arguments: JsonObject }[] {
	return batch.calls.map((call, index) => ({
		call: index + 1,
		tool: call.name,
		// Render actual JSON values, not an escaped JSON string inside JSON.
		// The immutable canonical text still binds approval and execution below.
		arguments: JSON.parse(call.canonicalArguments) as JsonObject
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
