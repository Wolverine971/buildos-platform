// apps/worker/src/workers/agentic-chat/provider/write-routing.ts
import { reviewedAgenticChatMutationSpecV1 } from '../mutationToolCatalog';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export const MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN = 3;

export type DirectWriteBatchAssessment =
	| { kind: 'not_a_write' }
	| {
			kind: 'simple';
			mutationCount: number;
	  }
	| {
			kind: 'contract_required';
			reason:
				| 'mixed_tool_batch'
				| 'mutation_count_exceeded'
				| 'operation_requires_contract'
				| 'ordered_or_dependent_batch';
			mutationCount: number;
	  };

/**
 * Deterministic floor for the acting model's write-route declaration.
 *
 * Direct mutation calls declare a simple request. The worker accepts that
 * declaration only for one small, independent, internally classified batch.
 * A turn contract declares the complex route and remains independently
 * reviewed. Natural-language ambiguity stays the acting model's semantic
 * responsibility; exact schemas, adapters, RLS, and confirmation policies
 * remain authoritative at execution.
 */
export function assessDirectWriteBatch(
	calls: readonly CompletedProviderToolCall[]
): DirectWriteBatchAssessment {
	const mutationCalls = calls.filter((call) => reviewedAgenticChatMutationSpecV1(call.name));
	if (mutationCalls.length === 0) return { kind: 'not_a_write' };
	if (mutationCalls.length !== calls.length) {
		return {
			kind: 'contract_required',
			reason: 'mixed_tool_batch',
			mutationCount: mutationCalls.length
		};
	}
	if (mutationCalls.length > MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN) {
		return {
			kind: 'contract_required',
			reason: 'mutation_count_exceeded',
			mutationCount: mutationCalls.length
		};
	}
	if (
		mutationCalls.some(
			(call) => reviewedAgenticChatMutationSpecV1(call.name)?.directWriteClass !== 'ordinary'
		)
	) {
		return {
			kind: 'contract_required',
			reason: 'operation_requires_contract',
			mutationCount: mutationCalls.length
		};
	}
	if (
		mutationCalls.some(
			(call) =>
				call.scheduling && (call.scheduling.callRef || call.scheduling.after.length > 0)
		)
	) {
		return {
			kind: 'contract_required',
			reason: 'ordered_or_dependent_batch',
			mutationCount: mutationCalls.length
		};
	}
	return { kind: 'simple', mutationCount: mutationCalls.length };
}

export function directWriteContractInstruction(
	assessment: Extract<DirectWriteBatchAssessment, { kind: 'contract_required' }>
): string {
	const reason = (() => {
		switch (assessment.reason) {
			case 'mixed_tool_batch':
				return 'The proposal mixed durable mutations with other calls.';
			case 'mutation_count_exceeded':
				return `The proposal contains ${assessment.mutationCount} mutations; the direct lane permits at most ${MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN}.`;
			case 'operation_requires_contract':
				return 'At least one proposed operation is destructive, organizational, high-impact, or otherwise contract-only.';
			case 'ordered_or_dependent_batch':
				return 'The proposal contains explicit ordering or dependencies.';
		}
	})();
	return [
		'A prior mutation proposal was withheld and no mutation executed.',
		reason,
		'This is a complex write request. Declare the complete outcome set with declare_turn_contract before proposing any mutation.',
		'Request clarification instead only when a required user choice is genuinely unresolved. Do not narrate this routing correction to the user.'
	].join(' ');
}
