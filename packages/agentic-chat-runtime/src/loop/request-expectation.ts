// packages/agentic-chat-runtime/src/loop/request-expectation.ts
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import { isWriteLedgerToolExecution } from './tool-classification';
import {
	type TurnContract,
	parseDeclaredTurnContract,
	serializeTurnContractForDeclaration
} from './turn-contract';

/** Reuse the outcome matcher, without granting a checklist any write authority. */
export function parseRequestExpectation(value: unknown): TurnContract | null {
	return parseDeclaredTurnContract(value);
}

export function requestExpectationsMatch(a: TurnContract, b: TurnContract): boolean {
	return (
		canonicalizeAgenticChatJson(serializeTurnContractForDeclaration(a)) ===
		canonicalizeAgenticChatJson(serializeTurnContractForDeclaration(b))
	);
}

/**
 * Only the first durable batch approval, before any write, can establish the
 * request expectation. Later approvals must never shrink it to the work done.
 * Old approvals without this field remain unverified, rather than acquiring an
 * expectation retrospectively. The result must echo the reviewed arguments.
 */
export function extractReviewedRequestExpectation(
	executions: readonly FastToolExecution[] | null | undefined
): TurnContract | null {
	for (const execution of executions ?? []) {
		if (isWriteLedgerToolExecution(execution)) return null;
		if (execution.toolCall.function.name !== 'approve_mutation_batch_review') continue;
		if (!execution.result.success) continue;
		const result = execution.result.result;
		if (result?.status !== 'mutation_batch_review_approved') continue;
		try {
			const args = JSON.parse(execution.toolCall.function.arguments);
			if (
				!args ||
				typeof args.batch_sha256 !== 'string' ||
				!/^[a-f0-9]{64}$/.test(args.batch_sha256) ||
				result.batch_sha256 !== args.batch_sha256
			)
				return null;
			const proposed = parseRequestExpectation(args.request_expectation);
			const persisted = parseRequestExpectation(result.request_expectation);
			return proposed && persisted && requestExpectationsMatch(proposed, persisted)
				? persisted
				: null;
		} catch {
			return null;
		}
	}
	return null;
}
