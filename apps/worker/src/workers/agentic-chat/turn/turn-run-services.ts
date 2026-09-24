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
	MAX_UI_PROJECTION_EVENTS,
	type ProjectionState,
	toProjectionJson
} from './turn-run';

/**
 * One semantic publication, split at the point the event entered the
 * publisher's per-turn queue. `accepted` is exactly what `publishSemantic`
 * awaits (durable acceptance, then pressure relief) and rejects with the same
 * error. `enqueued` resolves once the event holds its place in the publisher's
 * FIFO, so everything enqueued later persists after it; if the publication fails
 * before that point, `enqueued` rejects with that same error.
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
		let markEnqueued!: () => void;
		let failBeforeEnqueue!: (error: unknown) => void;
		const enqueued = new Promise<void>((resolve, reject) => {
			markEnqueued = resolve;
			failBeforeEnqueue = reject;
		});
		const publication = projection.semanticPublishTail.then(async () => {
			throwIfAborted(signal);
			const claim = executionInput.claim;
			const snapshot = this.ports.publisher.getSnapshot(claim.turnRunId);
			// Queued text batches precede this semantic event and each consume a
			// durable sequence. Reserve past that prefix before enqueueing below;
			// delivery-only backlog has already consumed its durable sequences.
			const sequence = snapshot.durableSequence + snapshot.pendingPersistenceEvents + 1;
			const event = {
				...step.eventPayload,
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
			const priorActivity = projection.currentActivity;
			const priorEvents = projection.semanticEvents.slice();
			projection.currentActivity = step.currentActivity;
			projection.semanticEvents.push(event);
			if (projection.semanticEvents.length > MAX_UI_PROJECTION_EVENTS) {
				projection.semanticEvents.shift();
			}

			let durablyAccepted = false;
			try {
				const queued = this.ports.publisher.enqueueSemantic(claim.turnRunId, {
					transitionId: step.transitionId,
					phase: step.phase,
					eventType: step.eventType,
					projection: toProjectionJson(projection),
					eventPayload: step.eventPayload
				});
				markEnqueued();
				void queued.delivery.catch(() => undefined);
				await abortable(queued.accepted, signal);
				durablyAccepted = true;
				if (queued.pressureRelieved) {
					await abortable(queued.pressureRelieved, signal);
				}
			} catch (error) {
				if (!durablyAccepted) {
					projection.semanticEvents = priorEvents;
					projection.currentActivity = priorActivity;
				}
				throw error;
			}
		});
		projection.semanticPublishTail = publication.catch(() => undefined);
		// A no-op once `enqueued` has resolved: only a pre-enqueue failure reaches it.
		void publication.catch(failBeforeEnqueue);
		void enqueued.catch(() => undefined);
		return { enqueued, accepted: publication };
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
						...(step.decidedBy ? { decidedBy: step.decidedBy } : {})
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
