// apps/worker/src/workers/agentic-chat/fixtureTurnExecutor.ts
import { randomUUID } from 'node:crypto';
import { buildLastTurnContextDraftV1 } from '@buildos/agentic-chat-runtime';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventV1,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type AgenticChatTurnClaimResultV1,
	type AgenticChatTurnJobV1,
	type ChatContextType,
	type ChatToolCall,
	type ChatToolResult,
	type ChatTurnTerminalStatusV1,
	type ContextShiftPayload,
	type JsonObject,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import {
	AgenticChatCancellationError,
	type AgenticChatCancellationObserver
} from './cancellationObserver';
import type { AgenticChatClaimRejectionV1 } from './consumer';
import {
	type AgenticChatExecutionControlPortV1,
	type AgenticChatExecutionIdentityV1,
	type AgenticChatTerminalFinalizeInputV1
} from './executionControl';
import {
	AgenticChatExecutionInputError,
	type AgenticChatExecutionInputPortV1,
	type AgenticChatWorkerExecutionInputV1
} from './executionInput';
import {
	AgenticChatEffectExecutionError,
	type AgenticChatFixtureMutationExecutor
} from './fixtureMutationExecutor';
import {
	AgenticChatPublisherOverloadError,
	type AgenticChatStreamPublisher
} from './streamPublisher';
import {
	type AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1
} from './providerContract';
import {
	type AgenticChatExecutorLifecycleStageV1,
	type AgenticChatExecutorSnapshotStageV1,
	createStableAgenticChatLifecycleTransitionIdV1
} from './lifecycleIdentity';
import {
	type AgenticChatMonotonicClockV1,
	type AgenticChatRuntimeTimingObserverV1,
	AgenticChatRuntimeTimingTracker,
	SYSTEM_AGENTIC_CHAT_MONOTONIC_CLOCK
} from './runtimeTiming';
import {
	type AgenticChatPromptSnapshotPortV1,
	createStableAgenticChatPromptSnapshotIdV1
} from './promptSnapshot';
import { buildAgenticChatAsyncTimingDraftV1 } from './timingPayload';
import {
	type AgenticChatReadToolExecutionV1,
	AgenticChatToolExecutionFenceError,
	type AgenticChatToolExecutionPortV1,
	createStableAgenticChatToolExecutionIdV1
} from './toolExecution';

const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';
const MAX_UI_PROJECTION_EVENTS = 128;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ExecutableClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
type TerminalReceipt = Extract<
	AgenticChatTerminalFinalizeRpcResultV1,
	{ outcome: 'finalized' | 'already_terminal' }
>;

export type AgenticChatFixtureUsageV1 = AgenticChatProviderUsageV1;
export type AgenticChatFixtureProviderStepV1 = AgenticChatProviderStepV1;
export type AgenticChatFixtureProviderPortV1 = AgenticChatProviderPortV1;

export type AgenticChatFixtureReadToolPortV1 = {
	execute(input: {
		toolName: string;
		arguments: JsonObject;
		providerToolCallId: string;
		executionInput: AgenticChatWorkerExecutionInputV1;
		signal: AbortSignal;
	}): Promise<AgenticChatReadToolExecutionV1>;
};

type PublisherPort = Pick<
	AgenticChatStreamPublisher,
	| 'registerTurn'
	| 'appendText'
	| 'publishSemantic'
	| 'flushTurn'
	| 'publishCommittedSemantic'
	| 'publishTerminal'
	| 'getSnapshot'
	| 'unregisterTurn'
	| 'abandonTurn'
>;

type CancellationPort = Pick<AgenticChatCancellationObserver, 'registerTurn' | 'unregisterTurn'>;
type MutationPort = Pick<AgenticChatFixtureMutationExecutor, 'execute'>;

export type AgenticChatFixtureExecutionOutcomeV1 =
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'requeued'
	| 'terminal_reconciled'
	| 'stale_generation'
	| 'effect_reconciliation_required'
	| 'recovery_required';

export type AgenticChatFixtureExecutionResultV1 = {
	outcome: AgenticChatFixtureExecutionOutcomeV1;
	turnRunId: string;
	executionGeneration: number | null;
	terminalStatus: ChatTurnTerminalStatusV1 | null;
	queueReconciled: boolean;
};

type ProjectionState = {
	currentActivity: string;
	semanticEvents: AgentStreamEventV1[];
};

type TerminalContextState = {
	contextShift: ContextShiftPayload | null;
	toolExecutions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
};

type TerminalClaim = Pick<
	ExecutableClaim,
	'turnRunId' | 'queueJobId' | 'sessionId' | 'userId' | 'executionGeneration'
>;

type FinalizeTurnInput = {
	envelope: AgenticChatExecutionIdentityV1;
	claim: TerminalClaim;
	status: ChatTurnTerminalStatusV1;
	finishedReason: string;
	failureCode: string | null;
	usage: AgenticChatFixtureUsageV1 | null;
	projection: ProjectionState;
	publisherRegistered: boolean;
	assistantTextOverride?: string;
	interruptedReason?: string;
	publicError?: string;
	terminalEventContext?: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		terminalContext: TerminalContextState;
		runtimeTiming: AgenticChatRuntimeTimingTracker | null;
	};
};

/**
 * Fenced Agentic Chat execution kernel, first proven by the Phase 2D fixtures.
 * Provider and tool ports remain injected, and no production worker entrypoint
 * imports or starts this executor.
 */
export class AgenticChatFixtureTurnExecutor {
	constructor(
		private readonly ports: {
			control: AgenticChatExecutionControlPortV1;
			input: AgenticChatExecutionInputPortV1;
			publisher: PublisherPort;
			cancellation: CancellationPort;
			provider: AgenticChatProviderPortV1;
			promptSnapshots?: AgenticChatPromptSnapshotPortV1;
			readTool: AgenticChatFixtureReadToolPortV1;
			toolExecutions: AgenticChatToolExecutionPortV1;
			mutation: MutationPort;
			createId?: () => string;
			timingClock?: AgenticChatMonotonicClockV1;
			onTimingSnapshot?: AgenticChatRuntimeTimingObserverV1;
			onPromptSnapshotError?: (error: unknown) => void;
		}
	) {}

	/**
	 * Convert a claimed row that fails the local rollout cohort into durable
	 * domain and queue terminal truth. Throwing from a processor-managed queue
	 * would strand the processing row until the chat-specific stalled sweep.
	 */
	async reject(
		job: ProcessingJob<AgenticChatTurnJobV1>,
		rejection: AgenticChatClaimRejectionV1
	): Promise<AgenticChatFixtureExecutionResultV1> {
		let envelope: AgenticChatExecutionIdentityV1;
		try {
			envelope = validateJobEnvelope(job);
		} catch {
			return result('recovery_required', job.data?.turnRunId ?? job.id, null);
		}

		let claim: AgenticChatTurnClaimResultV1;
		try {
			claim = await this.ports.control.claim(envelope);
			validateClaimEnvelope(claim, job);
		} catch {
			return result('recovery_required', envelope.turnRunId, null);
		}
		const generation = claim.executionGeneration;
		if (claim.outcome === 'already_terminal') {
			return this.recover(
				envelope,
				generation,
				'permanent',
				rejection.message,
				null,
				emptyProjection(),
				false
			);
		}
		if (claim.outcome === 'cancel_requested') {
			return this.recover(
				envelope,
				generation,
				'cancelled',
				'Cancellation was accepted before cohort rejection',
				null,
				emptyProjection(),
				false
			);
		}

		return this.finalize({
			envelope,
			claim,
			status: 'failed',
			finishedReason: 'error',
			failureCode: rejection.code,
			usage: null,
			projection: emptyProjection(),
			publisherRegistered: false,
			assistantTextOverride: ''
		});
	}

	async execute(
		job: ProcessingJob<AgenticChatTurnJobV1>
	): Promise<AgenticChatFixtureExecutionResultV1> {
		let envelope: AgenticChatExecutionIdentityV1;
		try {
			envelope = validateJobEnvelope(job);
		} catch {
			return result('recovery_required', job.data?.turnRunId ?? job.id, null);
		}

		let claim: AgenticChatTurnClaimResultV1;
		try {
			claim = await this.ports.control.claim(envelope);
			validateClaimEnvelope(claim, job);
		} catch {
			return result('recovery_required', envelope.turnRunId, null);
		}

		const generation = claim.executionGeneration;
		if (claim.outcome === 'already_terminal') {
			return this.recover(
				envelope,
				generation,
				'unknown',
				'Claim resolved to existing terminal truth',
				null,
				emptyProjection(),
				false
			);
		}
		if (claim.outcome === 'cancel_requested') {
			return this.recover(
				envelope,
				generation,
				'cancelled',
				'Cancellation was accepted before execution',
				null,
				emptyProjection(),
				false
			);
		}

		const executableClaim = claim as ExecutableClaim;
		const overload = new AbortController();
		let cancellationSignal: AbortSignal;
		try {
			cancellationSignal = this.ports.cancellation.registerTurn({
				turnRunId: claim.turnRunId,
				executionGeneration: generation
			});
		} catch (error) {
			return this.recover(
				envelope,
				generation,
				'transient_infra',
				errorMessage(error),
				null,
				emptyProjection(),
				false
			);
		}
		const combined = combineAbortSignals([job.signal, cancellationSignal, overload.signal]);
		let publisherRegistered = false;
		let executionStarted = false;
		let executionInput: AgenticChatWorkerExecutionInputV1 | null = null;
		let preparedProvider: AgenticChatPreparedProviderInvocationV1 | null = null;
		let usage: AgenticChatFixtureUsageV1 | null = null;
		let finishedReason = 'stop';
		let runtimeTiming: AgenticChatRuntimeTimingTracker | null = null;
		const projection = emptyProjection();
		const terminalContext: TerminalContextState = {
			contextShift: null,
			toolExecutions: []
		};

		try {
			throwIfAborted(combined.signal);
			executionInput = await this.ports.input.load(executableClaim);
			throwIfAborted(combined.signal);

			this.ports.publisher.registerTurn({
				turnRunId: claim.turnRunId,
				queueJobId: claim.queueJobId,
				processingToken: envelope.processingToken,
				userId: claim.userId,
				sessionId: claim.sessionId,
				streamRunId: executionInput.streamRunId,
				clientTurnId: executionInput.clientTurnId,
				executionGeneration: generation,
				onOverload: (error) => overload.abort(error),
				onPersistenceObserved: (observation) => {
					this.captureRuntimeTiming(runtimeTiming, (timing) =>
						timing.observePersistedEvent(observation.persistedAt, observation.eventType)
					);
				}
			});
			publisherRegistered = true;

			if (this.ports.provider.prepare) {
				preparedProvider = await this.ports.provider.prepare({
					executionInput,
					signal: combined.signal
				});
			} else if (!this.ports.provider.stream) {
				throw new AgenticChatProviderExecutionError(
					'provider_not_configured',
					'permanent',
					'Agentic Chat provider has no preparation or fixture stream implementation'
				);
			}
			throwIfAborted(combined.signal);

			// This is the final asynchronous control-plane boundary before the
			// provider call. Provider input validation and capacity reservation have
			// completed, but only `started` below grants network invocation.
			const start = await this.ports.control.begin({
				...envelope,
				executionGeneration: generation
			});
			if (start.outcome !== 'started' || start.invoke_provider !== true) {
				const failureClass: AgenticChatRecoveryFailureClassV1 =
					start.outcome === 'cancel_requested'
						? 'cancelled'
						: start.outcome === 'stale_context'
							? 'stale_context'
							: 'unknown';
				return await this.recover(
					envelope,
					generation,
					failureClass,
					`Provider start denied: ${start.outcome}`,
					this.safeAssistantText(claim.turnRunId, publisherRegistered),
					projection,
					publisherRegistered
				);
			}
			executionStarted = true;
			runtimeTiming = this.createRuntimeTiming({
				turnRunId: claim.turnRunId,
				executionGeneration: generation,
				baseline: executionInput.timingBaseline,
				executionStartedAt: start.execution_started_at
			});
			throwIfAborted(combined.signal);
			await this.publishExecutorLifecycle(
				executionInput,
				projection,
				'acknowledged',
				combined.signal
			);
			await this.publishExecutorSnapshots(executionInput, projection, combined.signal);
			throwIfAborted(combined.signal);

			let finished = false;
			let promptSnapshotAttempted = false;
			const providerStream = preparedProvider
				? preparedProvider.stream()
				: this.ports.provider.stream!({ executionInput, signal: combined.signal });
			for await (const step of iterateWithAbort(providerStream, combined.signal)) {
				if (finished) throw new Error('Fixture provider emitted a step after finish');
				if (step.type === 'text_delta') {
					if (!step.text) throw new Error('Fixture text delta must be nonempty');
					const queued = this.ports.publisher.appendText(claim.turnRunId, step.text);
					await abortable(queued.delivery, combined.signal);
					if (queued.pressureRelieved) {
						await abortable(queued.pressureRelieved, combined.signal);
					}
					if (!promptSnapshotAttempted) {
						promptSnapshotAttempted = true;
						await this.persistPromptSnapshot(
							envelope,
							executionInput,
							preparedProvider
						);
					}
					continue;
				}
				if (step.type === 'semantic') {
					await this.publishSemantic(executionInput, projection, step, combined.signal);
					terminalContext.contextShift =
						extractContextShift(step.eventPayload) ?? terminalContext.contextShift;
					continue;
				}
				if (step.type === 'read_tool') {
					await this.executeReadTool(
						executionInput,
						envelope.processingToken,
						projection,
						terminalContext,
						step,
						combined.signal
					);
					continue;
				}
				if (step.type === 'mutating_tool') {
					await this.executeMutatingTool(
						executionInput,
						envelope.processingToken,
						projection,
						terminalContext,
						step,
						combined.signal
					);
					continue;
				}

				validateFinish(step.finishedReason, step.usage);
				this.captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
				finishedReason = step.finishedReason;
				usage = step.usage;
				finished = true;
			}
			if (!finished) throw new Error('Fixture provider ended without a finish step');
			throwIfAborted(combined.signal);
			await abortable(this.ports.publisher.flushTurn(claim.turnRunId), combined.signal);
			await this.publishExecutorLifecycle(
				executionInput,
				projection,
				'finalizing',
				combined.signal
			);
			throwIfAborted(combined.signal);
			return await this.finalize({
				envelope,
				claim: executableClaim,
				status: 'completed',
				finishedReason,
				failureCode: null,
				usage,
				projection,
				publisherRegistered,
				terminalEventContext: { executionInput, terminalContext, runtimeTiming }
			});
		} catch (error) {
			const failureClass = classifyFailure(error, executionStarted, combined.signal);
			const assistantText = this.safeAssistantText(
				claim.turnRunId,
				publisherRegistered,
				error
			);
			const terminalEventContext =
				executionStarted &&
				executionInput !== null &&
				runtimeTiming !== null &&
				((failureClass === 'cancelled' &&
					assistantText !== null &&
					assistantText.length > 0) ||
					failureClass !== 'cancelled')
					? { executionInput, terminalContext, runtimeTiming }
					: undefined;
			if (terminalEventContext) {
				this.captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
			}
			// Await inside the try/catch/finally scope so publisher cleanup cannot
			// unregister the turn before recovery captures/finalizes its prefix.
			return await this.recover(
				envelope,
				generation,
				failureClass,
				errorMessage(error),
				assistantText,
				projection,
				publisherRegistered,
				cancellationInterruptionReason(error, combined.signal),
				terminalEventContext,
				failureClass === 'cancelled' ? undefined : 'An error occurred while streaming.'
			);
		} finally {
			preparedProvider?.release();
			combined.dispose();
			this.ports.cancellation.unregisterTurn(claim.turnRunId, generation);
			if (publisherRegistered) this.safeUnregisterPublisher(claim.turnRunId);
		}
	}

	private async persistPromptSnapshot(
		envelope: AgenticChatExecutionIdentityV1,
		executionInput: AgenticChatWorkerExecutionInputV1,
		preparedProvider: AgenticChatPreparedProviderInvocationV1 | null
	): Promise<void> {
		const prompt = preparedProvider?.promptSnapshot;
		if (!prompt || !this.ports.promptSnapshots) return;
		try {
			await this.ports.promptSnapshots.persist({
				...envelope,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(
					executionInput.claim.turnRunId
				),
				prompt
			});
		} catch (error) {
			// Prompt snapshots are an observability/evaluation artifact. A failure
			// must be visible to worker telemetry but cannot invalidate text that is
			// already durable and delivered to the user.
			this.ports.onPromptSnapshotError?.(error);
		}
	}

	private async publishExecutorLifecycle(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		stage: AgenticChatExecutorLifecycleStageV1,
		signal: AbortSignal
	): Promise<void> {
		const message =
			stage === 'acknowledged'
				? 'Request received. Preparing the workspace context...'
				: 'Finalizing the response...';
		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: executionInput.claim.turnRunId,
					stage
				}),
				phase: 'stream',
				eventType: 'turn_phase',
				currentActivity: message,
				eventPayload: {
					type: 'turn_phase',
					turn_phase: stage,
					message
				}
			},
			signal
		);
	}

	private async publishExecutorSnapshots(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		signal: AbortSignal
	): Promise<void> {
		if (executionInput.artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
			return;
		}
		const prepared = executionInput.artifact.prepared;
		await this.publishExecutorSnapshot(
			executionInput,
			projection,
			'session',
			{
				type: 'session',
				session: {
					...prepared.sessionSnapshot,
					id: executionInput.claim.sessionId
				}
			},
			signal
		);
		throwIfAborted(signal);
		await this.publishExecutorSnapshot(
			executionInput,
			projection,
			'context_usage',
			{
				type: 'context_usage',
				usage: prepared.contextUsageSnapshot
			},
			signal
		);
	}

	private async publishExecutorSnapshot(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		stage: AgenticChatExecutorSnapshotStageV1,
		eventPayload: JsonObject,
		signal: AbortSignal
	): Promise<void> {
		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: executionInput.claim.turnRunId,
					stage
				}),
				phase: 'stream',
				eventType: stage,
				currentActivity: 'Request received. Preparing the workspace context...',
				eventPayload
			},
			signal
		);
	}

	private async executeMutatingTool(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'mutating_tool' }>,
		signal: AbortSignal
	): Promise<void> {
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		canonicalUuid(step.logicalOperationId, 'logicalOperationId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');
		if (!canonicalText(step.operationName, 256)) {
			throw new Error('Fixture operation name is invalid');
		}
		if (typeof step.downstreamIdempotencySupported !== 'boolean') {
			throw new Error('Fixture downstream idempotency capability is invalid');
		}

		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.callTransitionId,
				phase: 'tool',
				eventType: 'tool_call',
				currentActivity: `Using ${step.toolName}...`,
				eventPayload: {
					type: 'tool_call',
					tool_call: {
						id: step.providerToolCallId,
						type: 'function',
						function: {
							name: step.toolName,
							arguments: JSON.stringify(step.arguments)
						}
					},
					mutating: true,
					operation_name: step.operationName
				}
			},
			signal
		);
		const mutation = await this.ports.mutation.execute({
			executionInput,
			processingToken,
			step: {
				logicalOperationId: step.logicalOperationId,
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				operationName: step.operationName,
				arguments: step.arguments,
				downstreamIdempotencySupported: step.downstreamIdempotencySupported
			},
			signal
		});
		throwIfAborted(signal);
		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.resultTransitionId,
				phase: 'tool',
				eventType: 'tool_result',
				currentActivity: 'BuildOS is working...',
				eventPayload: {
					type: 'tool_result',
					result: {
						tool_call_id: step.providerToolCallId,
						tool_name: step.toolName,
						success: true,
						mutating: true,
						effect_id: mutation.effectId,
						replayed: mutation.replayed,
						result: mutation.downstreamReceipt
					}
				}
			},
			signal
		);
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: {
				tool_call_id: step.providerToolCallId,
				result: mutation.downstreamReceipt,
				success: true
			}
		});
	}

	private async executeReadTool(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'read_tool' }>,
		signal: AbortSignal
	): Promise<void> {
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');

		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.callTransitionId,
				phase: 'tool',
				eventType: 'tool_call',
				currentActivity: `Using ${step.toolName}...`,
				eventPayload: {
					type: 'tool_call',
					tool_call: {
						id: step.providerToolCallId,
						type: 'function',
						function: {
							name: step.toolName,
							arguments: JSON.stringify(step.arguments)
						}
					}
				}
			},
			signal
		);
		throwIfAborted(signal);
		const toolResult = await abortable(
			this.ports.readTool.execute({
				toolName: step.toolName,
				arguments: step.arguments,
				providerToolCallId: step.providerToolCallId,
				executionInput,
				signal
			}),
			signal
		);
		validateReadToolExecution(toolResult);
		const sequenceIndex = terminalContext.toolExecutions.length + 1;
		await abortable(
			this.ports.toolExecutions.persistRead({
				turnRunId: executionInput.claim.turnRunId,
				queueJobId: executionInput.claim.queueJobId,
				processingToken,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				toolExecutionId: createStableAgenticChatToolExecutionIdV1({
					turnRunId: executionInput.claim.turnRunId,
					sequenceIndex
				}),
				sequenceIndex,
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				arguments: step.arguments,
				execution: toolResult
			}),
			signal
		);
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: toolResult.result,
			success: true,
			...(toolResult.executionTimeMs !== null
				? { duration_ms: toolResult.executionTimeMs }
				: {}),
			...(toolResult.tokensConsumed !== null
				? { tokens_consumed: toolResult.tokensConsumed }
				: {})
		};
		await this.publishSemantic(
			executionInput,
			projection,
			{
				type: 'semantic',
				transitionId: step.resultTransitionId,
				phase: 'tool',
				eventType: 'tool_result',
				currentActivity: 'BuildOS is working...',
				eventPayload: {
					type: 'tool_result',
					result: {
						...chatToolResult,
						affected_entities: toolResult.affectedEntities,
						...(toolResult.toolCategory !== null
							? { tool_category: toolResult.toolCategory }
							: {}),
						...(toolResult.resultCount !== null
							? {
									result_count: toolResult.resultCount,
									zero_result: toolResult.zeroResult
								}
							: {}),
						...(toolResult.requiresUserAction !== null
							? { requires_user_action: toolResult.requiresUserAction }
							: {}),
						tool_name: step.toolName
					}
				}
			},
			signal
		);
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
		});
	}

	private async publishSemantic(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'semantic' }>,
		signal: AbortSignal
	): Promise<void> {
		canonicalUuid(step.transitionId, 'transitionId');
		if (!canonicalText(step.currentActivity, 1_000)) {
			throw new Error('Fixture current activity is invalid');
		}
		if (step.eventPayload.type !== step.eventType) {
			throw new Error('Fixture semantic payload type mismatch');
		}
		const claim = executionInput.claim;
		const sequence = this.ports.publisher.getSnapshot(claim.turnRunId).durableSequence + 1;
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

		try {
			await abortable(
				this.ports.publisher.publishSemantic(claim.turnRunId, {
					transitionId: step.transitionId,
					phase: step.phase,
					eventType: step.eventType,
					projection: toProjectionJson(projection),
					eventPayload: step.eventPayload
				}),
				signal
			);
		} catch (error) {
			projection.semanticEvents = priorEvents;
			projection.currentActivity = priorActivity;
			throw error;
		}
	}

	private async recover(
		envelope: AgenticChatExecutionIdentityV1,
		executionGeneration: number,
		failureClass: AgenticChatRecoveryFailureClassV1,
		message: string,
		assistantText: string | null,
		projection: ProjectionState,
		publisherRegistered: boolean,
		interruptedReason?: string,
		terminalEventContext?: FinalizeTurnInput['terminalEventContext'],
		publicError?: string
	): Promise<AgenticChatFixtureExecutionResultV1> {
		if (executionGeneration < 1) {
			return result('recovery_required', envelope.turnRunId, executionGeneration);
		}
		try {
			const receipt = await this.ports.control.recover({
				...envelope,
				executionGeneration,
				failureClass,
				errorMessage: canonicalErrorMessage(message)
			});
			if (receipt.outcome === 'retry_scheduled' || receipt.outcome === 'already_requeued') {
				return result('requeued', envelope.turnRunId, executionGeneration);
			}
			if (receipt.outcome === 'stale_generation') {
				return result('stale_generation', envelope.turnRunId, executionGeneration);
			}
			if (receipt.outcome === 'effect_reconciliation_required') {
				return result(
					'effect_reconciliation_required',
					envelope.turnRunId,
					executionGeneration
				);
			}
			if (
				receipt.outcome === 'queue_reconciled' ||
				receipt.outcome === 'already_reconciled'
			) {
				return result(
					'terminal_reconciled',
					envelope.turnRunId,
					executionGeneration,
					receipt.status as ChatTurnTerminalStatusV1,
					true
				);
			}

			const claim = {
				turnRunId: receipt.turn_run_id,
				queueJobId: receipt.queue_job_id,
				sessionId: receipt.session_id,
				userId: receipt.user_id,
				executionGeneration: receipt.execution_generation
			};
			return await this.finalize({
				envelope,
				claim,
				status: receipt.outcome === 'finalize_cancelled' ? 'cancelled' : 'failed',
				finishedReason: receipt.outcome === 'finalize_cancelled' ? 'cancelled' : 'error',
				failureCode: receipt.failure_code,
				usage: null,
				projection,
				publisherRegistered,
				assistantTextOverride: assistantText ?? '',
				interruptedReason,
				publicError,
				terminalEventContext
			});
		} catch {
			return result('recovery_required', envelope.turnRunId, executionGeneration);
		}
	}

	private async finalize({
		envelope,
		claim,
		status,
		finishedReason,
		failureCode,
		usage,
		projection,
		publisherRegistered,
		assistantTextOverride,
		interruptedReason,
		publicError,
		terminalEventContext
	}: FinalizeTurnInput): Promise<AgenticChatFixtureExecutionResultV1> {
		let assistantText =
			assistantTextOverride ??
			this.safeAssistantText(claim.turnRunId, publisherRegistered) ??
			'';
		let mayPublishTerminal = publisherRegistered;
		if (publisherRegistered) {
			const snapshot = this.ports.publisher.getSnapshot(claim.turnRunId);
			assistantText = assistantTextOverride ?? snapshot.assistantText;
			if (snapshot.pendingEvents > 0 || snapshot.busy) {
				this.ports.publisher.abandonTurn(claim.turnRunId, 'terminal_convergence');
				mayPublishTerminal = false;
			}
		}
		const shouldPersistMessage =
			status === 'completed' || (status === 'cancelled' && assistantText.length > 0);
		const completedMessageMetadata =
			status === 'completed'
				? ({ completion_status: 'completed', answer_source: 'model' } as const)
				: {};
		const interruptedMessageMetadata =
			status === 'cancelled' && assistantText.length > 0
				? {
						interrupted: true,
						interrupted_reason: interruptedReason ?? 'cancelled',
						finished_reason: 'cancelled',
						partial_tokens: Math.ceil(assistantText.length / 4)
					}
				: {};
		const terminalEventDetails =
			status === 'completed'
				? {
						completion_status: 'completed',
						answer_source: 'model',
						...(usage
							? {
									usage: {
										prompt_tokens: usage.promptTokens,
										completion_tokens: usage.completionTokens,
										total_tokens: usage.totalTokens
									}
								}
							: {})
					}
				: status === 'failed'
					? { usage: { total_tokens: 0 } }
					: { usage: null };
		const includesTerminalEventPair =
			(status === 'completed' || status === 'cancelled') && terminalEventContext;
		const terminalLastTurnContext = includesTerminalEventPair
			? (buildTerminalLastTurnContext(
					terminalEventContext.executionInput,
					assistantText,
					terminalEventContext.terminalContext
				) as unknown as JsonObject)
			: null;
		const includesFailureEventPair = status === 'failed' && terminalEventContext;
		const timingDraft =
			includesTerminalEventPair || includesFailureEventPair
				? this.buildTimingDraft(terminalEventContext.runtimeTiming, finishedReason)
				: null;
		// The rolling context-only RPC remains completion-specific. A cancelled
		// partial uses the new three-event wrapper only when both optional drafts
		// are trustworthy; otherwise it safely falls back to the base terminal CAS.
		const lastTurnContext =
			status === 'cancelled' && timingDraft === null ? null : terminalLastTurnContext;
		const terminalInput: AgenticChatTerminalFinalizeInputV1 = {
			...envelope,
			userId: claim.userId,
			executionGeneration: claim.executionGeneration,
			status,
			finishedReason,
			failureCode,
			assistantMessageId: shouldPersistMessage ? this.createId() : null,
			assistantText,
			assistantMetadata: {
				transport_contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
				turn_run_id: claim.turnRunId,
				execution_generation: claim.executionGeneration,
				worker_runtime: 'agentic_chat_v1',
				tool_round_count: terminalEventContext?.terminalContext.toolExecutions.length
					? 1
					: 0,
				tool_call_count: terminalEventContext?.terminalContext.toolExecutions.length ?? 0,
				...completedMessageMetadata,
				...interruptedMessageMetadata
			},
			promptTokens: status === 'completed' ? (usage?.promptTokens ?? null) : null,
			completionTokens: status === 'completed' ? (usage?.completionTokens ?? null) : null,
			totalTokens: status === 'completed' ? (usage?.totalTokens ?? null) : null,
			projection: toProjectionJson({ ...projection, currentActivity: '' }),
			eventPayload: {
				type: 'done',
				status,
				finished_reason: finishedReason,
				failure_code: failureCode,
				...terminalEventDetails
			},
			lastTurnContext,
			lastTurnContextTransitionId:
				lastTurnContext !== null
					? createStableAgenticChatLifecycleTransitionIdV1({
							turnRunId: claim.turnRunId,
							stage: 'last_turn_context'
						})
					: null,
			timingDraft,
			timingTransitionId:
				timingDraft !== null
					? createStableAgenticChatLifecycleTransitionIdV1({
							turnRunId: claim.turnRunId,
							stage: 'timing'
						})
					: null,
			publicError: includesFailureEventPair
				? (publicError ?? 'An error occurred while streaming.')
				: null,
			errorTransitionId: includesFailureEventPair
				? createStableAgenticChatLifecycleTransitionIdV1({
						turnRunId: claim.turnRunId,
						stage: 'error'
					})
				: null
		};

		let terminal: AgenticChatTerminalFinalizeRpcResultV1;
		try {
			terminal = await this.ports.control.finalize(terminalInput);
		} catch {
			return result('recovery_required', claim.turnRunId, claim.executionGeneration);
		} finally {
			this.completeRuntimeTiming(terminalEventContext?.runtimeTiming ?? null);
		}
		if (terminal.outcome === 'stale_generation') {
			return result('stale_generation', claim.turnRunId, claim.executionGeneration);
		}
		if (terminal.outcome === 'cancel_requested') {
			return this.recover(
				envelope,
				claim.executionGeneration,
				'cancelled',
				'Cancellation won terminal finalization',
				assistantText,
				projection,
				mayPublishTerminal
			);
		}

		if (terminal.outcome === 'finalized' && mayPublishTerminal) {
			try {
				const committedSemanticEvents =
					terminal.preterminal_events ??
					(terminal.preterminal_event ? [terminal.preterminal_event] : []);
				let committedPrefixDelivered = true;
				for (const committedEvent of committedSemanticEvents) {
					const delivery = await this.ports.publisher.publishCommittedSemantic(
						claim.turnRunId,
						committedEvent
					);
					if (
						delivery !== 'broadcast_acknowledged' &&
						delivery !== 'broadcast_sent_reconcile_pending'
					) {
						committedPrefixDelivered = false;
						break;
					}
				}
				if (committedPrefixDelivered) {
					await this.ports.publisher.publishTerminal(
						claim.turnRunId,
						terminal,
						terminalInput.eventPayload
					);
				}
			} catch {
				// Terminal database truth is authoritative; reconnect reconciliation
				// is the required fallback for a failed/mismatched Broadcast.
			}
		}

		const queueReconciled = await this.reconcileTerminalQueue(
			envelope,
			claim.executionGeneration,
			terminal,
			status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'permanent' : 'unknown'
		);
		return result(
			terminal.status,
			claim.turnRunId,
			claim.executionGeneration,
			terminal.status,
			queueReconciled
		);
	}

	private createRuntimeTiming(
		input: Omit<ConstructorParameters<typeof AgenticChatRuntimeTimingTracker>[0], 'clock'>
	): AgenticChatRuntimeTimingTracker | null {
		try {
			return new AgenticChatRuntimeTimingTracker({
				...input,
				clock: this.ports.timingClock ?? SYSTEM_AGENTIC_CHAT_MONOTONIC_CLOCK
			});
		} catch {
			return null;
		}
	}

	private buildTimingDraft(
		tracker: AgenticChatRuntimeTimingTracker | null,
		finishedReason: string
	): JsonObject | null {
		if (!tracker) return null;
		try {
			tracker.markTerminalCallStarted();
			return buildAgenticChatAsyncTimingDraftV1(
				tracker.preterminalSnapshot(),
				finishedReason
			) as unknown as JsonObject;
		} catch {
			// Timing remains an optional observability extension. If its local source
			// becomes untrustworthy, successful completion uses the established atomic
			// context + done wrapper instead of failing the user turn.
			return null;
		}
	}

	private captureRuntimeTiming(
		tracker: AgenticChatRuntimeTimingTracker | null,
		capture: (tracker: AgenticChatRuntimeTimingTracker) => void
	): void {
		if (!tracker) return;
		try {
			capture(tracker);
		} catch {
			// Timing capture must never overturn the provider or terminal result.
		}
	}

	private completeRuntimeTiming(tracker: AgenticChatRuntimeTimingTracker | null): void {
		if (!tracker) return;
		try {
			tracker.markTerminalCallCompleted();
			this.ports.onTimingSnapshot?.(tracker.snapshot());
		} catch {
			// Post-call timing must never overturn authoritative terminal DB truth.
		}
	}

	private async reconcileTerminalQueue(
		envelope: AgenticChatExecutionIdentityV1,
		executionGeneration: number,
		terminal: TerminalReceipt,
		failureClass: AgenticChatRecoveryFailureClassV1
	): Promise<boolean> {
		try {
			if (terminal.outcome === 'finalized' && terminal.status === 'completed') {
				return await this.ports.control.completeQueueJob({
					queueJobId: envelope.queueJobId,
					processingToken: envelope.processingToken,
					result: {
						turnRunId: envelope.turnRunId,
						status: terminal.status,
						terminalEventId: terminal.terminal_event_id
					}
				});
			}
			const recovery = await this.ports.control.recover({
				...envelope,
				executionGeneration,
				failureClass,
				errorMessage: 'Reconcile terminal Agentic Chat queue state'
			});
			return (
				recovery.outcome === 'queue_reconciled' || recovery.outcome === 'already_reconciled'
			);
		} catch {
			return false;
		}
	}

	private safeAssistantText(
		turnRunId: string,
		publisherRegistered: boolean,
		error?: unknown
	): string | null {
		if (error instanceof AgenticChatPublisherOverloadError) return error.assistantText;
		if (!publisherRegistered) return null;
		try {
			return this.ports.publisher.getSnapshot(turnRunId).assistantText;
		} catch {
			return null;
		}
	}

	private safeUnregisterPublisher(turnRunId: string): void {
		try {
			const snapshot = this.ports.publisher.getSnapshot(turnRunId);
			if (snapshot.pendingEvents > 0 || snapshot.busy) {
				this.ports.publisher.abandonTurn(turnRunId, 'executor_cleanup');
			} else {
				this.ports.publisher.unregisterTurn(turnRunId);
			}
		} catch {
			// Already abandoned/unregistered.
		}
	}

	private createId(): string {
		const value = this.ports.createId?.() ?? randomUUID();
		canonicalUuid(value, 'generated id');
		return value;
	}
}

function validateJobEnvelope(
	job: ProcessingJob<AgenticChatTurnJobV1>
): AgenticChatExecutionIdentityV1 {
	canonicalUuid(job.queueRowId, 'queueRowId');
	canonicalUuid(job.processingToken, 'processingToken');
	canonicalUuid(job.data?.turnRunId, 'turnRunId');
	canonicalUuid(job.data?.correlationId, 'correlationId');
	canonicalUuid(job.userId, 'userId');
	return {
		turnRunId: job.data.turnRunId,
		queueJobId: job.queueRowId,
		processingToken: job.processingToken
	};
}

function validateClaimEnvelope(
	claim: AgenticChatTurnClaimResultV1,
	job: ProcessingJob<AgenticChatTurnJobV1>
): void {
	if (
		claim.turnRunId !== job.data.turnRunId ||
		claim.queueJobId !== job.queueRowId ||
		claim.userId !== job.userId ||
		claim.correlationId !== job.data.correlationId
	) {
		throw new Error('Claim receipt does not match the claimed queue envelope');
	}
}

function emptyProjection(): ProjectionState {
	return { currentActivity: 'BuildOS is working...', semanticEvents: [] };
}

function toProjectionJson(projection: ProjectionState): JsonObject {
	return {
		version: UI_PROJECTION_VERSION,
		current_activity: projection.currentActivity,
		semantic_events: projection.semanticEvents.slice() as unknown as JsonObject[]
	};
}

function providerToolCall(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'read_tool' | 'mutating_tool' }>
): ChatToolCall {
	return {
		id: step.providerToolCallId,
		type: 'function',
		function: {
			name: step.toolName,
			arguments: JSON.stringify(step.arguments)
		}
	};
}

function extractContextShift(payload: JsonObject): ContextShiftPayload | null {
	if (payload.type !== 'context_shift') return null;
	const value = payload.context_shift;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const shift = value as Record<string, unknown>;
	const entityTypes = new Set([
		'workspace',
		'project',
		'task',
		'plan',
		'goal',
		'document',
		'milestone',
		'risk',
		'requirement'
	]);
	if (
		typeof shift.new_context !== 'string' ||
		typeof shift.entity_type !== 'string' ||
		!entityTypes.has(shift.entity_type) ||
		!(shift.entity_id === null || typeof shift.entity_id === 'string') ||
		!(shift.entity_name === null || typeof shift.entity_name === 'string') ||
		!(shift.message === undefined || typeof shift.message === 'string')
	) {
		return null;
	}
	return shift as unknown as ContextShiftPayload;
}

function buildTerminalLastTurnContext(
	executionInput: AgenticChatWorkerExecutionInputV1,
	assistantText: string,
	terminalContext: TerminalContextState
) {
	const requestContext = executionInput.requestPayload.context as JsonObject;
	return buildLastTurnContextDraftV1({
		assistantText,
		userMessage: String(executionInput.requestPayload.message),
		contextType:
			typeof requestContext.type === 'string'
				? (requestContext.type as ChatContextType)
				: 'global',
		entityId: typeof requestContext.entityId === 'string' ? requestContext.entityId : null,
		contextShift: terminalContext.contextShift,
		toolExecutions: terminalContext.toolExecutions
	});
}

function validateFinish(reason: string, usage: AgenticChatFixtureUsageV1 | null): void {
	if (!canonicalText(reason, 256)) throw new Error('Fixture finished reason is invalid');
	if (!usage) return;
	for (const value of [usage.promptTokens, usage.completionTokens, usage.totalTokens]) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error('Fixture usage is invalid');
		}
	}
	if (usage.totalTokens !== usage.promptTokens + usage.completionTokens) {
		throw new Error('Fixture total token usage is inconsistent');
	}
}

function validateReadToolExecution(execution: AgenticChatReadToolExecutionV1): void {
	if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
		throw new Error('Fixture read-tool execution is invalid');
	}
	if (
		!execution.result ||
		typeof execution.result !== 'object' ||
		Array.isArray(execution.result)
	) {
		throw new Error('Fixture read-tool result is invalid');
	}
	if (!Array.isArray(execution.affectedEntities)) {
		throw new Error('Fixture read-tool affected entities are invalid');
	}
	if (
		execution.affectedEntities.some(
			(entity) => !entity || typeof entity !== 'object' || Array.isArray(entity)
		)
	) {
		throw new Error('Fixture read-tool affected entities are invalid');
	}
	for (const [label, value] of [
		['executionTimeMs', execution.executionTimeMs],
		['tokensConsumed', execution.tokensConsumed],
		['resultCount', execution.resultCount]
	] as const) {
		if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
			throw new Error(`Fixture read-tool ${label} is invalid`);
		}
	}
	if (execution.toolCategory !== null && !canonicalText(execution.toolCategory, 128)) {
		throw new Error('Fixture read-tool category is invalid');
	}
	if (execution.zeroResult !== null && typeof execution.zeroResult !== 'boolean') {
		throw new Error('Fixture read-tool zero-result evidence is invalid');
	}
	if (
		(execution.resultCount === null) !== (execution.zeroResult === null) ||
		(execution.resultCount !== null && execution.zeroResult !== (execution.resultCount === 0))
	) {
		throw new Error('Fixture read-tool result-count evidence is inconsistent');
	}
	if (
		execution.requiresUserAction !== null &&
		typeof execution.requiresUserAction !== 'boolean'
	) {
		throw new Error('Fixture read-tool user-action evidence is invalid');
	}
}

function classifyFailure(
	error: unknown,
	executionStarted: boolean,
	signal: AbortSignal
): AgenticChatRecoveryFailureClassV1 {
	// Once an irreversible effect reports uncertainty, a concurrent cancellation
	// cannot downgrade the recovery classification to ordinary cancellation.
	if (error instanceof AgenticChatEffectExecutionError) return error.failureClass;
	if (error instanceof AgenticChatToolExecutionFenceError) return error.failureClass;
	if (error instanceof AgenticChatProviderExecutionError) return error.failureClass;
	const reason = signal.aborted ? signal.reason : error;
	if (reason instanceof AgenticChatCancellationError) return 'cancelled';
	if (reason instanceof AgenticChatPublisherOverloadError) return 'publisher_overload';
	if (error instanceof AgenticChatExecutionInputError) {
		if (error.code === 'database_error') return 'transient_infra';
		if (error.code === 'artifact_expired') return 'stale_context';
		return 'permanent';
	}
	if (signal.aborted) return executionStarted ? 'timeout_post_start' : 'timeout_pre_start';
	return executionStarted ? 'unknown' : 'transient_infra';
}

function cancellationInterruptionReason(error: unknown, signal: AbortSignal): string | undefined {
	const reason = signal.aborted ? signal.reason : error;
	return reason instanceof AgenticChatCancellationError && canonicalText(reason.cancelReason, 256)
		? reason.cancelReason
		: undefined;
}

function canonicalErrorMessage(message: string): string {
	const normalized = message.trim().slice(0, 2_000);
	return normalized || 'Agentic Chat fixture execution failed';
}

function errorMessage(error: unknown): string {
	return canonicalErrorMessage(error instanceof Error ? error.message : String(error));
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	throwIfAborted(signal);
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason ?? new Error('Execution aborted'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

async function* iterateWithAbort<T>(
	source: AsyncIterable<T>,
	signal: AbortSignal
): AsyncGenerator<T> {
	const iterator = source[Symbol.asyncIterator]();
	try {
		while (true) {
			const next = await abortable(iterator.next(), signal);
			if (next.done) return;
			yield next.value;
		}
	} finally {
		if (iterator.return) void Promise.resolve(iterator.return()).catch(() => undefined);
	}
}

function combineAbortSignals(signals: AbortSignal[]): {
	signal: AbortSignal;
	dispose(): void;
} {
	const controller = new AbortController();
	const listeners = new Map<AbortSignal, () => void>();
	for (const signal of signals) {
		const listener = () => {
			if (!controller.signal.aborted) controller.abort(signal.reason);
		};
		listeners.set(signal, listener);
		if (signal.aborted) listener();
		else signal.addEventListener('abort', listener, { once: true });
	}
	return {
		signal: controller.signal,
		dispose() {
			for (const [signal, listener] of listeners) {
				signal.removeEventListener('abort', listener);
			}
		}
	};
}

function result(
	outcome: AgenticChatFixtureExecutionOutcomeV1,
	turnRunId: string,
	executionGeneration: number | null,
	terminalStatus: ChatTurnTerminalStatusV1 | null = null,
	queueReconciled = false
): AgenticChatFixtureExecutionResultV1 {
	return { outcome, turnRunId, executionGeneration, terminalStatus, queueReconciled };
}
