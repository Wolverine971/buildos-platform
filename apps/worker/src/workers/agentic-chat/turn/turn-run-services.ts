// apps/worker/src/workers/agentic-chat/turn/turn-run-services.ts
//
// The port-bound operations every part of a turn run shares: semantic
// publication into the UI projection, session handoff persistence, tool
// execution observations, and the read-tool ownership fence. One instance per
// executor; all per-turn state arrives as arguments.
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventV1,
	type AgenticChatTurnClaimResultV1,
	type ContextShiftPayload,
	type JsonObject,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from './execution-input';
import {
	AgenticChatReadToolFenceTimeoutError,
	AgenticChatSharedReadToolFenceV1
} from '../tools/read-tool-fence';
import { AgenticChatToolExecutionFenceError } from '../tools/tool-execution';
import { AgenticChatExecutionControlRpcError } from './execution-control';
import { hasTransientDatabaseCode } from './executor-failures';
import { createStableAgenticChatExecutionObservationKeyV1 } from '../effects/execution-observation';
import { abortable, throwIfAborted } from '../shared/abortable-deadline';
import type { AgenticChatExecutorEffects } from '../effects/executor-effects';
import { AgenticChatSessionHandoffProtocolError } from './session-handoff';
import { deriveAgenticChatReadPlanningIdentityV1 } from '../effects/read-planning-telemetry';
import type {
	AgenticChatTurnExecutorPorts,
	AgenticChatTurnProviderStepV1
} from './executor-contracts';
import { type AgenticChatOverheadDeadline, canonicalText, canonicalUuid } from './executor-helpers';
import {
	type AgenticChatExecutableToolStepV1,
	type AgenticChatReadPlanningContextV1,
	type ProjectionState,
	appendProjectionEvent,
	projectionEstimatedBytes,
	removeProjectionEvent,
	toProjectionJson
} from './turn-run';
import {
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES,
	fitAgenticChatStreamPayloadV1
} from '../stream/stream-payload-budget';
import type { AgenticChatSemanticEnqueueResultV1 } from '../stream/stream-publisher';

/**
 * One semantic publication, split at the point the event entered the
 * publisher's per-turn queue. `accepted` is exactly what `publishSemantic`
 * awaits (durable acceptance, then pressure relief) and rejects with the same
 * error. `enqueued` resolves once the event holds its place in the publisher's
 * FIFO, so everything enqueued later persists after it; if the publication fails
 * before that point, `enqueued` rejects with that same error.
 *
 * Ordering contract (pipeline audit S7):
 * - Publications enter the FIFO in call order (the admission tail), and each
 *   enters as soon as the previous one has, unless the publisher is under soft
 *   pressure. They do NOT wait for earlier events to commit, so concurrent
 *   reads start in parallel and the publisher batches their writes.
 * - Sequence numbers, the persisted order, and the projection follow FIFO
 *   order, and the publisher broadcasts nothing before its receipt (durable
 *   before broadcast is unchanged).
 */
export type AgenticChatSemanticPublicationV1 = {
	enqueued: Promise<void>;
	accepted: Promise<void>;
};

export class AgenticChatTurnRunServices {
	/** One in-flight ownership check per turn identity for a burst of parallel reads. */
	private readonly readToolFence: AgenticChatSharedReadToolFenceV1;

	constructor(
		private readonly ports: Pick<
			AgenticChatTurnExecutorPorts,
			'control' | 'publisher' | 'sessionHandoff'
		>,
		private readonly effects: AgenticChatExecutorEffects,
		private readonly deadline: AgenticChatOverheadDeadline
	) {
		this.readToolFence = new AgenticChatSharedReadToolFenceV1(ports.control);
	}

	async publishSemantic(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'semantic' }>,
		signal: AbortSignal
	): Promise<void> {
		await this.startSemantic(executionInput, projection, step, signal).accepted;
	}

	/**
	 * `publishSemantic` for a caller that may overlap independent work with the
	 * durable write once the event is queued. The caller must still await
	 * `accepted` before anything that depends on the event being durable.
	 * Step validation throws synchronously, before any state changes.
	 */
	startSemantic(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'semantic' }>,
		signal: AbortSignal
	): AgenticChatSemanticPublicationV1 {
		canonicalUuid(step.transitionId, 'transitionId');
		if (!canonicalText(step.currentActivity, 1_000)) {
			throw new Error('Fixture current activity is invalid');
		}
		if (step.eventPayload.type !== step.eventType) {
			throw new Error('Fixture semantic payload type mismatch');
		}
		// One large read must never fail the turn (audit B4): the durable event
		// row keeps as much of the payload as its bound allows, with a marker,
		// and the full result stays in the tool-execution ledger row.
		const eventPayload = fitAgenticChatStreamPayloadV1(
			step.eventPayload,
			AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES
		).value;
		const claim = executionInput.claim;
		// Waiting for admission is abortable: a cancelled caller enqueues nothing,
		// so skipping its place cannot reorder the publications that do enqueue.
		const tail = projection.semanticAdmissionTail;
		const admitted = Promise.resolve()
			.then(() => abortable(tail, signal))
			.then(() => {
				throwIfAborted(signal);
				const snapshot = this.ports.publisher.getSnapshot(claim.turnRunId);
				// Queued text batches and semantic events precede this one and each
				// consume a durable sequence. Reserve past that prefix before
				// enqueueing below; delivery-only backlog already holds its sequences.
				const sequence = snapshot.durableSequence + snapshot.pendingPersistenceEvents + 1;
				const event = {
					...eventPayload,
					contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
					event_id: createAgentStreamEventIdV1(
						claim.turnRunId,
						claim.executionGeneration,
						sequence
					),
					stream_run_id: executionInput.streamRunId,
					client_turn_id: executionInput.clientTurnId,
					session_id: claim.sessionId,
					turn_run_id: claim.turnRunId,
					execution_generation: claim.executionGeneration,
					sequence_index: sequence,
					phase: step.phase,
					event_type: step.eventType,
					durable: true
				} as AgentStreamEventV1;
				const rollback = {
					eventId: event.event_id,
					priorActivity: projection.currentActivity
				};
				appendProjectionEvent(projection, event, step.currentActivity, step.transitionId);
				try {
					const queued = this.ports.publisher.enqueueSemantic(claim.turnRunId, {
						transitionId: step.transitionId,
						phase: step.phase,
						eventType: step.eventType,
						projection: toProjectionJson(projection),
						projectionBytes: projectionEstimatedBytes(projection),
						eventPayload
					});
					void queued.delivery.catch(() => undefined);
					return { queued, rollback };
				} catch (error) {
					removeProjectionEvent(
						projection,
						rollback.eventId,
						step.transitionId,
						rollback.priorActivity
					);
					throw error;
				}
			});
		// The next publication may enqueue once this one holds its FIFO place and
		// the publisher has room; a failure here never blocks later callers.
		projection.semanticAdmissionTail = admitted.then(
			({ queued }) => queued.pressureRelieved ?? undefined,
			() => undefined
		);
		const enqueued = admitted.then(() => undefined);
		const accepted = admitted.then(({ queued, rollback }) =>
			this.awaitSemanticAcceptance(projection, step, queued, rollback, signal)
		);
		// Callers that await these still see the error. A caller can stop after
		// `enqueued` rejects without ever awaiting `accepted` (the live read runner
		// does), and an unhandled rejection exits the worker process with every
		// turn on it (review 2026-10-17, P0).
		void enqueued.catch(() => undefined);
		void accepted.catch(() => undefined);
		return { enqueued, accepted };
	}

	private async awaitSemanticAcceptance(
		projection: ProjectionState,
		step: Extract<AgenticChatTurnProviderStepV1, { type: 'semantic' }>,
		queued: AgenticChatSemanticEnqueueResultV1,
		rollback: { eventId: string; priorActivity: string },
		signal: AbortSignal
	): Promise<void> {
		let durablyAccepted = false;
		try {
			await abortable(queued.accepted, signal);
			durablyAccepted = true;
			if (queued.pressureRelieved) {
				await abortable(queued.pressureRelieved, signal);
			}
		} catch (error) {
			// An event that is not durable must not reach a later projection: a
			// terminal projection carrying it would reuse its sequence number.
			if (!durablyAccepted) {
				removeProjectionEvent(
					projection,
					rollback.eventId,
					step.transitionId,
					rollback.priorActivity
				);
			}
			throw error;
		}
	}

	async persistSessionHandoff(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		contextShift: ContextShiftPayload
	): Promise<void> {
		const projectId = contextShift.new_context === 'project' ? contextShift.entity_id : null;
		if (
			contextShift.new_context === 'project' &&
			(contextShift.entity_type !== 'project' || projectId === null)
		) {
			throw new AgenticChatSessionHandoffProtocolError(
				'project shift does not identify a project'
			);
		}
		const claim = executionInput.claim;
		await this.ports.sessionHandoff.persist(
			{
				turnRunId: claim.turnRunId,
				queueJobId: claim.queueJobId,
				processingToken,
				userId: claim.userId,
				sessionId: claim.sessionId,
				executionGeneration: claim.executionGeneration,
				contextType: contextShift.new_context,
				entityId: contextShift.entity_id,
				projectId
			},
			// Session persistence is the delivery prerequisite. Cancellation must
			// not leave a subsequently published context shift ahead of that state.
			new AbortController().signal
		);
	}

	/** Detached from the tool critical path; joined by `drainPendingEffects` before the terminal fence. */
	observeToolExecution(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		step: AgenticChatExecutableToolStepV1,
		sequenceIndex: number,
		planning: AgenticChatReadPlanningContextV1,
		eventType: 'tool_execution_started' | 'tool_execution_ended',
		payload: JsonObject,
		signal: AbortSignal
	): void {
		const identity =
			step.type === 'read_tool'
				? deriveAgenticChatReadPlanningIdentityV1({
						toolName: step.toolName,
						arguments: step.arguments,
						...(step.decidedBy ? { decidedBy: step.decidedBy } : {}),
						rejectedBeforeExecution: Boolean(step.validationFailure)
					})
				: {
						executionClass: step.type === 'mutating_tool' ? 'mutation' : 'rejected',
						exactReadKey: null,
						resourceKey: null
					};
		const planningPayload: JsonObject = {
			logical_provider_round: step.logicalProviderRound,
			tool_batch_index: planning.toolBatchIndex,
			graph_layer_index: planning.graphLayerIndex,
			graph_layer_width: planning.graphLayerWidth,
			read_epoch: planning.readEpoch,
			execution_class: identity.executionClass,
			memo_served: step.type === 'read_tool' && Boolean(step.memoServed),
			...(planning.graphPlanSha256 ? { graph_plan_sha256: planning.graphPlanSha256 } : {}),
			...(identity.exactReadKey ? { exact_read_key: identity.exactReadKey } : {}),
			...(identity.resourceKey ? { resource_key: identity.resourceKey } : {})
		};
		this.effects.observeToolExecution(
			{
				turnRunId: executionInput.claim.turnRunId,
				queueJobId: executionInput.claim.queueJobId,
				processingToken,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				observationKey: createStableAgenticChatExecutionObservationKeyV1({
					turnRunId: executionInput.claim.turnRunId,
					scope: `tool:${sequenceIndex}`,
					boundary: eventType
				}),
				phase: 'tool',
				eventType,
				payload: { ...payload, ...planningPayload }
			},
			signal
		);
	}

	async assertCurrentReadToolFence(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		throwIfAborted(signal);
		const identity = {
			turnRunId: executionInput.claim.turnRunId,
			queueJobId: executionInput.claim.queueJobId,
			processingToken
		};
		let receipt: AgenticChatTurnClaimResultV1;
		try {
			receipt = await this.checkReadToolFence(identity, signal);
		} catch (error) {
			if (!isRetryableReadToolFenceFailure(error) || signal.aborted) throw error;
			// Case 13 of the 2026-09-24 gate: one statement timeout on this check
			// failed four reads and the whole turn while the database recovered
			// seconds later. The check is read-only, so one retry after a short
			// pause is always safe; parallel callers that retry together share
			// the second check through the single-flight fence.
			await abortableDelay(readToolFenceRetryDelayMs(this.deadline.timeoutMs), signal);
			receipt = await this.checkReadToolFence(identity, signal);
		}
		if (receipt.outcome === 'cancel_requested') {
			throw new AgenticChatToolExecutionFenceError('cancel_requested', 'cancelled');
		}
		if (receipt.outcome === 'already_terminal') {
			throw new AgenticChatToolExecutionFenceError('already_terminal', 'unknown');
		}
		if (
			receipt.outcome !== 'matching_current_claim' ||
			receipt.turnRunId !== executionInput.claim.turnRunId ||
			receipt.queueJobId !== executionInput.claim.queueJobId ||
			receipt.sessionId !== executionInput.claim.sessionId ||
			receipt.userId !== executionInput.claim.userId ||
			receipt.correlationId !== executionInput.claim.correlationId ||
			receipt.executionGeneration !== executionInput.claim.executionGeneration ||
			receipt.inputArtifactId !== executionInput.claim.inputArtifactId ||
			receipt.userMessageId !== executionInput.claim.userMessageId
		) {
			throw new AgenticChatToolExecutionFenceError('stale_generation', 'unknown');
		}
		throwIfAborted(signal);
	}

	private checkReadToolFence(
		identity: { turnRunId: string; queueJobId: string; processingToken: string },
		signal: AbortSignal
	): Promise<AgenticChatTurnClaimResultV1> {
		return this.deadline.awaitOverhead(
			signal,
			'read-tool fence claim',
			(deadlineSignal) => this.readToolFence.claim(identity, deadlineSignal),
			() => new AgenticChatReadToolFenceTimeoutError(this.deadline.timeoutMs)
		);
	}
}

/** One tenth of the overhead deadline, at most 1 s: 1 s in production. */
function readToolFenceRetryDelayMs(overheadTimeoutMs: number): number {
	return Math.max(1, Math.min(1_000, Math.ceil(overheadTimeoutMs / 10)));
}

/**
 * The ownership check may be retried when it never produced an answer (its
 * own deadline fired) or the database answered with a failure that retrying
 * can fix. A receipt that names another generation, a cancellation, or lost
 * ownership is an answer and is never retried.
 */
function isRetryableReadToolFenceFailure(error: unknown): boolean {
	return (
		error instanceof AgenticChatReadToolFenceTimeoutError ||
		(error instanceof AgenticChatExecutionControlRpcError && hasTransientDatabaseCode(error))
	);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	return abortable(
		new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, ms);
			signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
		}),
		signal
	);
}
