// apps/worker/src/workers/agentic-chat/provider/review/revision-evidence.ts
import type { MutationBatch } from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';

/** Comparison evidence may invalidate a revision; it can never authorize a mutation. */
export function checkMutationBatchRevisionEvidence(
	argumentsValue: JsonObject,
	batch: MutationBatch
): 'revision_value_unchanged' | 'revision_evidence_invalid' | null {
	const checks = argumentsValue.argument_checks;
	// Structural/prose corrections do not need scalar comparisons. Preserve them.
	if (checks === undefined) return null;
	if (!Array.isArray(checks) || checks.length > 20) return 'revision_evidence_invalid';
	// A revision is contradictory only when EVERY check asks for the value the
	// batch already holds (the Case 2 priority 2 -> 2 hallucination). One stale
	// check next to a real correction used to void the whole revision and, after
	// the single repair, end the turn with its writes half-applied (prod turn
	// b7b18080, 2026-09-23). Checks are never forwarded to the acting model, so
	// a mixed revision reaches it only as the reviewer's reason and correction.
	let unchanged = 0;
	for (const check of checks) {
		if (!check || typeof check !== 'object' || Array.isArray(check))
			return 'revision_evidence_invalid';
		const { call, argument_path: path, required_value: required } = check;
		if (
			typeof call !== 'number' ||
			!Number.isInteger(call) ||
			call < 1 ||
			call > batch.calls.length ||
			!Array.isArray(path) ||
			path.length < 1 ||
			path.length > 8 ||
			path.some((key) => typeof key !== 'string' || key.length < 1 || key.length > 64) ||
			!Object.hasOwn(check, 'required_value') ||
			!(
				required === null ||
				typeof required === 'boolean' ||
				(typeof required === 'number' && Number.isFinite(required)) ||
				(typeof required === 'string' && required.length <= 160)
			)
		)
			return 'revision_evidence_invalid';
		let actual: unknown = JSON.parse(batch.calls[call - 1]!.canonicalArguments);
		for (const key of path as string[]) {
			if (!actual || typeof actual !== 'object' || !Object.hasOwn(actual, key))
				return 'revision_evidence_invalid';
			actual = (actual as Record<string, unknown>)[key];
		}
		if (actual === required) unchanged += 1;
	}
	return checks.length > 0 && unchanged === checks.length ? 'revision_value_unchanged' : null;
}
