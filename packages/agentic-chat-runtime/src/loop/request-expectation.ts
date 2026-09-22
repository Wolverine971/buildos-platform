// packages/agentic-chat-runtime/src/loop/request-expectation.ts
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { MutationBatch } from './mutation-batch';
import type { FastToolExecution } from './shared';
import { isWriteLedgerToolExecution } from './tool-classification';
import {
	type TurnContract,
	type TurnContractOutcome,
	parseDeclaredTurnContract,
	resolveTurnContractOutcome,
	serializeTurnContractForDeclaration
} from './turn-contract';
import { buildWriteLedger } from './write-ledger';

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

/**
 * Align a first-approval request expectation with the exact calls approved in
 * the same decision.
 *
 * Approval executes the held calls unchanged, so for an existing target that
 * the approved batch updates, the approved call IS the reviewed change. The
 * 2026-09-22 book loop reviewer demanded `name` on nine plan updates and a
 * retitle of one document, then approved calls that changed only their
 * descriptions/content. Every write succeeded, yet the turn told the user
 * "Done: 1 of 9 updates … could not finish". A required field the approved
 * calls never carry is a self-contradiction of the approval, not unfinished
 * user work.
 *
 * Only `update` outcomes whose every target is updated by this batch are
 * trimmed, and only of fields/values the approved calls do not carry. Targets
 * absent from the batch (later stages) keep the full expectation, and an
 * outcome that still cannot be matched is returned unchanged.
 */
export function reconcileRequestExpectationWithApprovedBatch(
	expectation: TurnContract,
	batch: MutationBatch
): TurnContract {
	const executions: FastToolExecution[] = batch.calls.map((call) => ({
		toolCall: {
			id: call.id,
			type: 'function',
			function: { name: call.name, arguments: call.canonicalArguments }
		},
		result: { tool_call_id: call.id, success: true, result: null }
	}));
	const ledger = buildWriteLedger(executions).filter(
		(entry) => entry.status === 'success' && entry.action === 'update' && entry.entityId
	);
	const fulfilledAlone = (outcome: TurnContractOutcome) =>
		resolveTurnContractOutcome({
			contract: { ...expectation, outcomes: [outcome] },
			toolExecutions: executions
		}).fulfilled;
	let changed = false;
	const outcomes = expectation.outcomes.map((outcome) => {
		if (outcome.action !== 'update' || outcome.targetIds.length === 0) return outcome;
		if (outcome.label || outcome.parentLabel || outcome.srcLabel || outcome.dstLabel)
			return outcome;
		if (fulfilledAlone(outcome)) return outcome;
		const fieldsByTarget = new Map<string, Set<string>>();
		for (const entry of ledger) {
			if (!outcome.targetIds.includes(entry.entityId!)) continue;
			const fields = fieldsByTarget.get(entry.entityId!) ?? new Set<string>();
			for (const field of entry.changedFields ?? []) fields.add(field);
			fieldsByTarget.set(entry.entityId!, fields);
		}
		if (!outcome.targetIds.every((id) => fieldsByTarget.has(id))) return outcome;
		const carriedByAll = (field: string) =>
			outcome.targetIds.every((id) => fieldsByTarget.get(id)!.has(field));
		const trimmed: TurnContractOutcome = {
			...outcome,
			requiredFields: outcome.requiredFields.filter(carriedByAll)
		};
		const changes = outcome.changes?.filter((change) => carriedByAll(change.field));
		if (changes && changes.length > 0) trimmed.changes = changes;
		else delete trimmed.changes;
		const candidate = fulfilledAlone(trimmed)
			? trimmed
			: trimmed.changes
				? (() => {
						const withoutValues = { ...trimmed };
						delete withoutValues.changes;
						return fulfilledAlone(withoutValues) ? withoutValues : null;
					})()
				: null;
		if (!candidate) return outcome;
		changed = true;
		return candidate;
	});
	return changed ? { ...expectation, outcomes } : expectation;
}
