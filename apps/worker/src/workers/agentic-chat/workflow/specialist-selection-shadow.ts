// apps/worker/src/workers/agentic-chat/workflow/specialist-selection-shadow.ts
import { randomUUID } from 'node:crypto';
import type { JevDecider } from '@buildos/smart-llm';
import type { SpecialistSnapshotV2 } from '@buildos/agentic-chat-runtime/specialists';
import { runWithAbortableDeadline } from '../shared/abortable-deadline';
import type { AgenticChatWorkflowPreparedTurnV1 } from './workflow-runner-port';
import type { AgenticChatWorkflowStoreClient } from './workflow-store';
import {
	SPECIALIST_SHADOW_POLICY,
	buildSpecialistShadowInput,
	interpretSpecialistShadow,
	selectionHash,
	unavailableShadow
} from './specialist-selection-policy';

export type SpecialistShadowObservation = {
	prepared: Pick<
		AgenticChatWorkflowPreparedTurnV1,
		'envelope' | 'claim' | 'request' | 'context' | 'deadlines'
	>;
	snapshot?: SpecialistSnapshotV2;
	signal: AbortSignal;
};
export type SpecialistShadowObserver = (input: SpecialistShadowObservation) => Promise<void>;

/** Optional audit lane. It never returns a selection to the workflow runner. */
export class JevSpecialistSelectionShadow {
	constructor(
		private readonly options: {
			client: Pick<AgenticChatWorkflowStoreClient, 'rpc'>;
			decider: JevDecider;
			specialistWorkflowsEnabled?: boolean;
			documentReadToolsEnabled?: boolean;
			onError?: (code: string) => void;
		}
	) {}

	observe: SpecialistShadowObserver = async ({ prepared, snapshot, signal }) => {
		signal.throwIfAborted();
		const remaining =
			Math.min(
				prepared.deadlines.invocationDeadlineAtMs,
				Date.parse(prepared.deadlines.workflowDeadlineAt ?? '') || Infinity
			) - Date.now();
		if (remaining < 8000) return;
		try {
			const input = buildSpecialistShadowInput({
				question: prepared.request.request.message,
				context: prepared.context,
				snapshot,
				specialistWorkflowsEnabled: this.options.specialistWorkflowsEnabled,
				documentReadToolsEnabled: this.options.documentReadToolsEnabled
			});
			const attemptToken = randomUUID();
			const begin = await this.rpc(
				'begin_agentic_chat_specialist_shadow_v1',
				{
					p_turn_run_id: prepared.claim.turnRunId,
					p_queue_job_id: prepared.claim.queueJobId,
					p_processing_token: prepared.envelope.processingToken,
					p_execution_generation: prepared.claim.executionGeneration,
					p_attempt_token: attemptToken,
					p_input: input,
					p_input_hash: selectionHash(input)
				},
				signal
			);
			// A lost permit response or an existing attempt must never lead to another call.
			if (begin.outcome !== 'started') return;
			signal.throwIfAborted();
			let result;
			try {
				const decision = await runWithAbortableDeadline({
					parentSignal: signal,
					timeoutMs: SPECIALIST_SHADOW_POLICY.timeoutMs,
					createTimeoutError: () => new Error('shadow_timeout'),
					run: (childSignal) =>
						this.options.decider.decide(input.request, {
							signal: childSignal,
							timeoutMs: SPECIALIST_SHADOW_POLICY.timeoutMs
						})
				});
				result = interpretSpecialistShadow(input, decision);
			} catch {
				// No exception text or raw provider response is retained.
				result = unavailableShadow(
					input,
					signal.aborted ? 'cancelled' : 'timeout_or_provider_error'
				);
			}
			signal.throwIfAborted();
			await this.rpc(
				'finish_agentic_chat_specialist_shadow_v1',
				{
					p_turn_run_id: prepared.claim.turnRunId,
					p_attempt_token: attemptToken,
					p_result: result,
					p_result_hash: selectionHash(result)
				},
				signal
			);
		} catch {
			// Audit failures don't break a review. A durable pending row truthfully means
			// no final observation; its cost/outcome may be unknown and it is never retried.
			signal.throwIfAborted();
			this.options.onError?.('specialist_shadow_unavailable');
		}
	};

	private rpc(name: string, args: Record<string, unknown>, signal: AbortSignal) {
		return runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: 600,
			createTimeoutError: () => new Error('shadow_storage_timeout'),
			run: async (childSignal) => {
				const query = this.options.client.rpc(name, args) as ReturnType<
					AgenticChatWorkflowStoreClient['rpc']
				> & {
					abortSignal?: (
						signal: AbortSignal
					) => ReturnType<AgenticChatWorkflowStoreClient['rpc']>;
				};
				const response = await (query.abortSignal?.(childSignal) ?? query);
				if (response.error || !response.data || typeof response.data !== 'object')
					throw new Error('shadow_storage_error');
				return response.data as { outcome: string };
			}
		});
	}
}
