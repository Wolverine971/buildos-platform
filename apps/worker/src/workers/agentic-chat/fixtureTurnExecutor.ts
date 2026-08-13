// apps/worker/src/workers/agentic-chat/fixtureTurnExecutor.ts
import { randomUUID } from 'node:crypto';
import { buildLastTurnContextDraftV1 } from '@buildos/agentic-chat-runtime';
import {
	extractContextShiftPayload,
	resolveFastChatTurnOutcome,
	type FastChatTurnIntent
} from '@buildos/agentic-chat-runtime/loop';
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
	canonicalizeAgenticChatJson,
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
	type AgenticChatProviderFailedToolSynthesisInputV1,
	type AgenticChatProviderMutationSynthesisInputV1,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderReadSynthesisInputV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderToolSynthesisInputV1,
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
	AgenticChatToolExecutionTimeoutError,
	createStableAgenticChatToolExecutionIdV1
} from './toolExecution';
import {
	AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from './executionObservation';
import { runWithAbortableDeadline } from './abortableDeadline';
import { createStableAgenticChatReadToolTransitionIdV1 } from './readToolIdentity';
import {
	AgenticChatSupervisorCheckpointFenceError,
	type AgenticChatSupervisorCheckpointPortV1,
	AgenticChatSupervisorCheckpointTimeoutError,
	createStableAgenticChatSupervisorCheckpointIdV1
} from './supervisorCheckpoint';
import type { AgenticChatResearchCapturePortV1 } from './researchCapture';
import type { AgenticChatStatedFutureCapturePortV1 } from './statedFutureCapture';
import { enforceAgenticChatTerminalTextIntegrityV1 } from './terminalTextIntegrity';
import type { AgenticChatConsumptionBillingPortV1 } from './consumptionBilling';

const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';
const MAX_UI_PROJECTION_EVENTS = 128;
export const DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS = 150_000;
export const DEFAULT_AGENTIC_CHAT_EXECUTOR_OVERHEAD_TIMEOUT_MS = 10_000;
// Keep aligned with the legacy web loop defaults
// (apps/web/src/lib/services/agentic-chat-v2/limits.ts FASTCHAT_LIMITS).
export const DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS = 16;
export const DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS = 40;
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
	/** Provider rounds that completed at least one tool execution. */
	toolRoundCount: number;
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
	supervisorQuestionCheckpointId?: string;
	reevaluateConsumptionBilling?: boolean;
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
	private readonly providerBudgetMs: number;
	private readonly overheadTimeoutMs: number;
	private readonly maxProviderRounds: number;
	private readonly maxToolCalls: number;

	constructor(
		private readonly ports: {
			control: AgenticChatExecutionControlPortV1;
			input: AgenticChatExecutionInputPortV1;
			publisher: PublisherPort;
			cancellation: CancellationPort;
			provider: AgenticChatProviderPortV1;
			promptSnapshots?: AgenticChatPromptSnapshotPortV1;
			executionObservations?: AgenticChatExecutionObservationPortV1;
			readTool: AgenticChatFixtureReadToolPortV1;
			toolExecutions: AgenticChatToolExecutionPortV1;
			supervisorCheckpoints: AgenticChatSupervisorCheckpointPortV1;
			mutation: MutationPort;
			researchCapture?: AgenticChatResearchCapturePortV1;
			statedFutureCapture?: AgenticChatStatedFutureCapturePortV1;
			consumptionBilling?: AgenticChatConsumptionBillingPortV1;
			createId?: () => string;
			timingClock?: AgenticChatMonotonicClockV1;
			onTimingSnapshot?: AgenticChatRuntimeTimingObserverV1;
			onPromptSnapshotError?: (error: unknown) => void;
			onExecutionObservationError?: (error: unknown) => void;
			onResearchCaptureError?: (error: unknown) => void;
			onStatedFutureCaptureError?: (error: unknown) => void;
			onConsumptionBillingError?: (error: unknown) => void;
			onTerminalControlError?: (report: {
				stage: 'finalize' | 'finalize_retry' | 'recover';
				turnRunId: string;
				executionGeneration: number;
				error: unknown;
			}) => void;
		},
		options: {
			providerBudgetMs?: number;
			overheadTimeoutMs?: number;
			maxProviderRounds?: number;
			maxToolCalls?: number;
		} = {}
	) {
		this.providerBudgetMs = options.providerBudgetMs ?? DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS;
		if (!Number.isSafeInteger(this.providerBudgetMs) || this.providerBudgetMs < 1) {
			throw new Error('Agentic Chat provider budget must be a positive safe integer');
		}
		this.overheadTimeoutMs =
			options.overheadTimeoutMs ?? DEFAULT_AGENTIC_CHAT_EXECUTOR_OVERHEAD_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.overheadTimeoutMs) || this.overheadTimeoutMs < 1) {
			throw new Error(
				'Agentic Chat executor overhead timeout must be a positive safe integer'
			);
		}
		this.maxProviderRounds = options.maxProviderRounds ?? DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS;
		if (!Number.isSafeInteger(this.maxProviderRounds) || this.maxProviderRounds < 1) {
			throw new Error('Agentic Chat provider round budget must be a positive safe integer');
		}
		this.maxToolCalls = options.maxToolCalls ?? DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS;
		if (!Number.isSafeInteger(this.maxToolCalls) || this.maxToolCalls < 1) {
			throw new Error('Agentic Chat tool-call budget must be a positive safe integer');
		}
	}

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
			claim = await this.awaitTerminal('turn claim', () =>
				this.ports.control.claim(envelope)
			);
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
			claim = await this.awaitTerminal('turn claim', () =>
				this.ports.control.claim(envelope)
			);
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
		const providerBudget = new AbortController();
		const combined = combineAbortSignals([
			job.signal,
			cancellationSignal,
			overload.signal,
			providerBudget.signal
		]);
		let providerBudgetTimer: NodeJS.Timeout | null = null;
		let publisherRegistered = false;
		let executionStarted = false;
		let executionInput: AgenticChatWorkerExecutionInputV1 | null = null;
		let preparedProvider: AgenticChatPreparedProviderInvocationV1 | null = null;
		let usage: AgenticChatFixtureUsageV1 | null = null;
		let finishedReason = 'stop';
		let supervisorQuestionCheckpointId: string | undefined;
		let runtimeTiming: AgenticChatRuntimeTimingTracker | null = null;
		const projection = emptyProjection();
		const terminalContext: TerminalContextState = {
			contextShift: null,
			toolExecutions: [],
			toolRoundCount: 0
		};

		try {
			throwIfAborted(combined.signal);
			executionInput = await this.awaitOverhead(combined.signal, 'execution input load', () =>
				this.ports.input.load(executableClaim)
			);
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
				preparedProvider = await this.awaitOverhead(
					combined.signal,
					'provider preparation',
					(deadlineSignal) =>
						this.ports.provider.prepare!({
							executionInput: executionInput!,
							processingToken: envelope.processingToken,
							signal: deadlineSignal
						})
				);
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
			const start = await this.awaitOverhead(combined.signal, 'provider start fence', () =>
				this.ports.control.begin({
					...envelope,
					executionGeneration: generation
				})
			);
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
			providerBudgetTimer = setTimeout(() => {
				providerBudget.abort(
					new AgenticChatProviderExecutionError(
						'provider_budget_exhausted',
						'timeout_post_start',
						`Agentic Chat provider budget exhausted after ${this.providerBudgetMs}ms`
					)
				);
			}, this.providerBudgetMs);
			providerBudgetTimer.unref?.();
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
			const pendingToolResults: AgenticChatProviderToolSynthesisInputV1[] = [];
			let synthesisStarted = false;
			let toolCallCount = 0;
			let continuationRounds = 0;
			let roundHadToolExecution = false;
			const markToolExecution = () => {
				if (roundHadToolExecution) return;
				roundHadToolExecution = true;
				terminalContext.toolRoundCount += 1;
			};
			let providerStream: AsyncIterable<AgenticChatProviderStepV1> = preparedProvider
				? preparedProvider.stream()
				: this.ports.provider.stream!({
						executionInput,
						processingToken: envelope.processingToken,
						signal: combined.signal
					});
			while (!finished) {
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
								preparedProvider,
								combined.signal
							);
						}
						continue;
					}
					if (step.type === 'semantic') {
						await this.publishSemantic(
							executionInput,
							projection,
							step,
							combined.signal
						);
						terminalContext.contextShift =
							extractContextShift(step.eventPayload) ?? terminalContext.contextShift;
						continue;
					}
					if (step.type === 'supervisor_evaluation') {
						logAgenticChatSupervisorEvaluation(job, executionInput, step);
						continue;
					}
					if (step.type === 'supervisor_question') {
						if (pendingToolResults.length > 0) {
							throw new AgenticChatProviderExecutionError(
								'provider_supervisor_question_before_tool_feedback',
								'unknown',
								'Supervisor question arrived before durable tool feedback was returned'
							);
						}
						validateSupervisorQuestion(step, generation);
						if (!promptSnapshotAttempted) {
							promptSnapshotAttempted = true;
							await this.persistPromptSnapshot(
								envelope,
								executionInput,
								preparedProvider,
								combined.signal
							);
						}
						const checkpointId = createStableAgenticChatSupervisorCheckpointIdV1({
							turnRunId: claim.turnRunId,
							executionGeneration: generation,
							supervisorTransitionId: step.transitionId
						});
						const checkpoint = await this.ports.supervisorCheckpoints.persist(
							{
								...envelope,
								userId: claim.userId,
								sessionId: claim.sessionId,
								executionGeneration: generation,
								checkpointId,
								supervisorTransitionId: step.transitionId,
								sequence: step.sequence,
								reason: step.reason,
								question: step.question,
								digest: step.checkpoint.digest,
								resumeContext: step.checkpoint.resumeContext,
								supervisorDecision: step.checkpoint.supervisorDecision
							},
							combined.signal
						);
						supervisorQuestionCheckpointId = checkpoint.checkpointId;
						await this.publishSemantic(
							executionInput,
							projection,
							buildSupervisorWaitingStep(step),
							combined.signal
						);
						const queued = this.ports.publisher.appendText(
							claim.turnRunId,
							step.question
						);
						await abortable(queued.delivery, combined.signal);
						if (queued.pressureRelieved) {
							await abortable(queued.pressureRelieved, combined.signal);
						}
						this.captureRuntimeTiming(runtimeTiming, (timing) =>
							timing.markProviderFinished()
						);
						finishedReason = step.finishedReason;
						usage = step.usage;
						finished = true;
						continue;
					}
					if (step.type === 'pre_execution_tool_failure') {
						if (
							preparedProvider?.synthesize &&
							!preparedProvider.continueWithToolResults
						) {
							throw new AgenticChatProviderExecutionError(
								'provider_pre_execution_failure_bridge_disabled',
								'permanent',
								'Pre-execution tool failures require the multi-result continuation bridge'
							);
						}
						if (!promptSnapshotAttempted) {
							promptSnapshotAttempted = true;
							await this.persistPromptSnapshot(
								envelope,
								executionInput,
								preparedProvider,
								combined.signal
							);
						}
						toolCallCount += 1;
						if (toolCallCount > this.maxToolCalls) {
							throw new AgenticChatProviderExecutionError(
								'provider_tool_call_budget_exceeded',
								'permanent',
								`Agentic Chat provider exceeded its ${this.maxToolCalls} tool-call budget`
							);
						}
						pendingToolResults.push(
							await this.executePreExecutionToolFailure(
								executionInput,
								envelope.processingToken,
								projection,
								terminalContext,
								step,
								markToolExecution,
								combined.signal
							)
						);
						continue;
					}
					if (step.type === 'read_tool') {
						if (!promptSnapshotAttempted) {
							promptSnapshotAttempted = true;
							await this.persistPromptSnapshot(
								envelope,
								executionInput,
								preparedProvider,
								combined.signal
							);
						}
						if (
							preparedProvider?.synthesize &&
							!preparedProvider.continueWithToolResults &&
							(synthesisStarted || pendingToolResults.length > 0)
						) {
							throw new AgenticChatProviderExecutionError(
								'provider_read_round_limit_exceeded',
								'permanent',
								'Agentic Chat production provider supports exactly one bounded read call'
							);
						}
						toolCallCount += 1;
						if (toolCallCount > this.maxToolCalls) {
							throw new AgenticChatProviderExecutionError(
								'provider_tool_call_budget_exceeded',
								'permanent',
								`Agentic Chat provider exceeded its ${this.maxToolCalls} tool-call budget`
							);
						}
						const readResult = await this.executeReadTool(
							job,
							executionInput,
							envelope.processingToken,
							projection,
							terminalContext,
							step,
							markToolExecution,
							combined.signal
						);
						if (readResult) {
							pendingToolResults.push(readResult);
						}
						continue;
					}
					if (step.type === 'mutating_tool') {
						if (
							preparedProvider?.synthesize &&
							!preparedProvider.continueWithToolResults
						) {
							throw new AgenticChatProviderExecutionError(
								'provider_mutating_tool_disabled',
								'permanent',
								'Mutating tools require the multi-result provider continuation bridge'
							);
						}
						if (!promptSnapshotAttempted) {
							promptSnapshotAttempted = true;
							await this.persistPromptSnapshot(
								envelope,
								executionInput,
								preparedProvider,
								combined.signal
							);
						}
						toolCallCount += 1;
						if (toolCallCount > this.maxToolCalls) {
							throw new AgenticChatProviderExecutionError(
								'provider_tool_call_budget_exceeded',
								'permanent',
								`Agentic Chat provider exceeded its ${this.maxToolCalls} tool-call budget`
							);
						}
						preparedProvider?.invalidateReadMemo?.();
						const mutationResult = await this.executeMutatingTool(
							executionInput,
							envelope.processingToken,
							projection,
							terminalContext,
							step,
							markToolExecution,
							combined.signal
						);
						pendingToolResults.push(mutationResult);
						continue;
					}

					const finishedWithUnreturnedToolResults =
						pendingToolResults.length > 0 &&
						(preparedProvider?.continueWithToolResults !== undefined ||
							(preparedProvider?.synthesize !== undefined && !synthesisStarted));
					if (finishedWithUnreturnedToolResults) {
						throw new AgenticChatProviderExecutionError(
							'provider_finished_before_read_synthesis',
							'unknown',
							'Provider finished before the durable tool result was synthesized'
						);
					}
					validateFinish(step.finishedReason, step.usage);
					finishedReason = step.finishedReason;
					usage = step.usage;
					finished = true;
				}
				if (finished) break;
				if (preparedProvider?.continueWithToolResults) {
					if (pendingToolResults.length === 0) {
						throw new Error('Fixture provider ended without a finish step');
					}
					throwIfAborted(combined.signal);
					continuationRounds += 1;
					if (continuationRounds > this.maxProviderRounds) {
						throw new AgenticChatProviderExecutionError(
							'provider_round_budget_exceeded',
							'permanent',
							`Agentic Chat provider exceeded its ${this.maxProviderRounds} tool-round budget`
						);
					}
					const roundResults = pendingToolResults.splice(0, pendingToolResults.length);
					await logAgenticChatExecutionBoundary(job, executionInput, {
						stage: 'tool_round',
						state: 'started',
						providerToolCallId: roundResults[0]!.providerToolCallId,
						toolName: roundResults[0]!.toolName
					});
					try {
						providerStream = preparedProvider.continueWithToolResults({
							round: continuationRounds + 1,
							results: roundResults
						});
					} catch (error) {
						await logAgenticChatExecutionBoundary(job, executionInput, {
							stage: 'tool_round',
							state: 'failed',
							providerToolCallId: roundResults[0]!.providerToolCallId,
							toolName: roundResults[0]!.toolName,
							error
						});
						throw error;
					}
					roundHadToolExecution = false;
					continue;
				}
				if (
					pendingToolResults.length > 0 &&
					preparedProvider?.synthesize &&
					!synthesisStarted
				) {
					throwIfAborted(combined.signal);
					const synthesisFeedback = pendingToolResults[0]!;
					if (
						isMutationSynthesisInput(synthesisFeedback) ||
						isFailedToolSynthesisInput(synthesisFeedback)
					) {
						throw new AgenticChatProviderExecutionError(
							'provider_mutating_tool_disabled',
							'permanent',
							'Mutating tools require the multi-result provider continuation bridge'
						);
					}
					await logAgenticChatExecutionBoundary(job, executionInput, {
						stage: 'synthesis',
						state: 'started',
						providerToolCallId: synthesisFeedback.providerToolCallId,
						toolName: synthesisFeedback.toolName
					});
					try {
						providerStream = preparedProvider.synthesize(synthesisFeedback);
					} catch (error) {
						await logAgenticChatExecutionBoundary(job, executionInput, {
							stage: 'synthesis',
							state: 'failed',
							providerToolCallId: synthesisFeedback.providerToolCallId,
							toolName: synthesisFeedback.toolName,
							error
						});
						throw error;
					}
					pendingToolResults.length = 0;
					synthesisStarted = true;
					roundHadToolExecution = false;
					continue;
				}
				throw new Error('Fixture provider ended without a finish step');
			}
			throwIfAborted(combined.signal);
			const requestContext = executionInput.requestPayload.context as JsonObject;
			const terminalTextIntegrity = enforceAgenticChatTerminalTextIntegrityV1({
				assistantText: this.safeAssistantText(claim.turnRunId, publisherRegistered) ?? '',
				finishedReason,
				contextType:
					typeof requestContext.type === 'string' ? requestContext.type : 'global',
				userMessage: String(executionInput.requestPayload.message),
				toolExecutions: terminalContext.toolExecutions
			});
			finishedReason = terminalTextIntegrity.finishedReason;
			if (terminalTextIntegrity.correctionDelta) {
				const queued = this.ports.publisher.appendText(
					claim.turnRunId,
					terminalTextIntegrity.correctionDelta
				);
				await abortable(queued.delivery, combined.signal);
				if (queued.pressureRelieved) {
					await abortable(queued.pressureRelieved, combined.signal);
				}
			}
			// Terminal text guards can append one deterministic correction. Keep that
			// write inside the provider-authority interval so persisted stream timing
			// never observes assistant text after authority has been relinquished.
			this.captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
			await abortable(this.ports.publisher.flushTurn(claim.turnRunId), combined.signal);
			await this.captureResearch(executionInput, envelope.processingToken, combined.signal);
			await this.captureStatedFuture(
				executionInput,
				envelope.processingToken,
				combined.signal
			);
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
				assistantTextOverride: terminalTextIntegrity.assistantText,
				supervisorQuestionCheckpointId,
				reevaluateConsumptionBilling: true,
				terminalEventContext: { executionInput, terminalContext, runtimeTiming }
			});
		} catch (error) {
			const failureClass = classifyFailure(error, executionStarted, combined.signal);
			const terminalFailureCode = specificTerminalFailureCode(error, combined.signal);
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
				failureClass === 'cancelled' ? undefined : 'An error occurred while streaming.',
				terminalFailureCode,
				executionStarted ? claim.userId : null
			);
		} finally {
			if (providerBudgetTimer) clearTimeout(providerBudgetTimer);
			preparedProvider?.release();
			combined.dispose();
			this.ports.cancellation.unregisterTurn(claim.turnRunId, generation);
			if (publisherRegistered) this.safeUnregisterPublisher(claim.turnRunId);
		}
	}

	private async captureResearch(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		if (!this.ports.researchCapture) return;
		try {
			await this.ports.researchCapture.capture({ executionInput, processingToken, signal });
		} catch (error) {
			this.ports.onResearchCaptureError?.(error);
		}
		throwIfAborted(signal);
	}

	private async captureStatedFuture(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		if (!this.ports.statedFutureCapture) return;
		try {
			await this.ports.statedFutureCapture.capture({
				executionInput,
				processingToken,
				signal
			});
		} catch (error) {
			this.ports.onStatedFutureCaptureError?.(error);
		}
		throwIfAborted(signal);
	}

	private async persistPromptSnapshot(
		envelope: AgenticChatExecutionIdentityV1,
		executionInput: AgenticChatWorkerExecutionInputV1,
		preparedProvider: AgenticChatPreparedProviderInvocationV1 | null,
		signal: AbortSignal
	): Promise<void> {
		const prompt = preparedProvider?.promptSnapshot;
		if (!prompt || !this.ports.promptSnapshots) return;
		try {
			await abortable(
				this.ports.promptSnapshots.persist({
					...envelope,
					userId: executionInput.claim.userId,
					executionGeneration: executionInput.claim.executionGeneration,
					promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(
						executionInput.claim.turnRunId
					),
					prompt
				}),
				signal
			);
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
				? resolveAcknowledgementMessage(executionInput)
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
		const acknowledgementMessage = resolveAcknowledgementMessage(executionInput);
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
				currentActivity: acknowledgementMessage,
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
		markToolExecution: () => void,
		signal: AbortSignal
	): Promise<
		AgenticChatProviderMutationSynthesisInputV1 | AgenticChatProviderFailedToolSynthesisInputV1
	> {
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
					}
				}
			},
			signal
		);
		let mutation;
		try {
			mutation = await this.ports.mutation.execute({
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
		} catch (error) {
			if (
				!(error instanceof AgenticChatEffectExecutionError) ||
				error.failureClass !== 'permanent'
			) {
				throw error;
			}
			return this.persistKnownMutationFailure(
				executionInput,
				processingToken,
				projection,
				terminalContext,
				step,
				error,
				markToolExecution,
				signal
			);
		}
		const telemetry = deriveFixtureMutationTelemetry(step, mutation.downstreamReceipt);
		const sequenceIndex = terminalContext.toolExecutions.length + 1;
		// A committed effect must become durable telemetry even if cancellation
		// arrives after the irreversible boundary. The ledger adapter owns its own
		// bounded deadline; a fresh signal prevents user cancellation from hiding
		// an already-committed mutation receipt.
		await this.ports.toolExecutions.persistMutation(
			{
				turnRunId: executionInput.claim.turnRunId,
				queueJobId: executionInput.claim.queueJobId,
				processingToken,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				effectId: mutation.effectId,
				canonicalArgumentHash: mutation.canonicalArgumentHash,
				toolExecutionId: createStableAgenticChatToolExecutionIdV1({
					turnRunId: executionInput.claim.turnRunId,
					sequenceIndex
				}),
				sequenceIndex,
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				operationName: step.operationName,
				arguments: step.arguments,
				executionTimeMs: telemetry.executionTimeMs,
				tokensConsumed: telemetry.tokensConsumed,
				requiresUserAction: telemetry.requiresUserAction,
				affectedEntities: telemetry.affectedEntities
			},
			new AbortController().signal
		);
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: mutation.downstreamReceipt,
			success: true
		};
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
		});
		markToolExecution();
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
						tool_category: fixtureMutationToolCategory(step),
						gateway_op: step.operationName,
						requires_user_action: telemetry.requiresUserAction,
						affected_entities: telemetry.affectedEntities,
						effect_id: mutation.effectId,
						replayed: mutation.replayed,
						result: mutation.downstreamReceipt
					}
				}
			},
			signal
		);
		const contextShift = extractContextShiftPayload(chatToolResult);
		if (contextShift) {
			terminalContext.contextShift = contextShift;
			await this.publishSemantic(
				executionInput,
				projection,
				{
					type: 'semantic',
					transitionId: createStableAgenticChatReadToolTransitionIdV1({
						turnRunId: executionInput.claim.turnRunId,
						providerToolCallId: step.providerToolCallId,
						stage: 'context_shift'
					}),
					phase: 'tool',
					eventType: 'context_shift',
					currentActivity: 'BuildOS is working...',
					eventPayload: {
						type: 'context_shift',
						context_shift: { ...contextShift } satisfies JsonObject
					}
				},
				signal
			);
		}
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			execution: {
				result: mutation.downstreamReceipt,
				executionTimeMs: telemetry.executionTimeMs,
				tokensConsumed: telemetry.tokensConsumed,
				affectedEntities: telemetry.affectedEntities,
				toolCategory: fixtureMutationToolCategory(step),
				resultCount: null,
				zeroResult: null,
				requiresUserAction: telemetry.requiresUserAction
			},
			mutation: {
				effectId: mutation.effectId,
				logicalOperationId: step.logicalOperationId,
				operationName: step.operationName,
				replayed: mutation.replayed
			}
		};
	}

	private async persistKnownMutationFailure(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'mutating_tool' }>,
		error: AgenticChatEffectExecutionError,
		markToolExecution: () => void,
		signal: AbortSignal
	): Promise<AgenticChatProviderFailedToolSynthesisInputV1> {
		const failureMessage = errorMessage(error);
		const toolCategory = fixtureMutationToolCategory(step);
		const sequenceIndex = terminalContext.toolExecutions.length + 1;
		// The effect executor has already reconciled this attempt to durable
		// `failed`. Persist its failed tool row with an independent bounded signal
		// so a known outcome can never be mistaken for an uncertain commit.
		await this.ports.toolExecutions.persistFailure(
			{
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
				toolCategory,
				error: failureMessage
			},
			new AbortController().signal
		);
		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error: failureMessage
		};
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
		});
		markToolExecution();
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
						...chatToolResult,
						affected_entities: [],
						tool_category: toolCategory,
						tool_name: step.toolName,
						gateway_op: step.operationName,
						effect_id: error.effectId
					}
				}
			},
			signal
		);
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			failure: {
				kind: 'known_execution_failure',
				error: failureMessage,
				toolCategory,
				modelPayload: { error: failureMessage }
			}
		};
	}

	private async executePreExecutionToolFailure(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'pre_execution_tool_failure' }>,
		markToolExecution: () => void,
		signal: AbortSignal
	): Promise<AgenticChatProviderFailedToolSynthesisInputV1> {
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');
		if (!canonicalText(step.failure.error, 4_000)) {
			throw new Error('Fixture pre-execution failure error is invalid');
		}
		if (step.failure.toolCategory !== null && !canonicalText(step.failure.toolCategory, 128)) {
			throw new Error('Fixture pre-execution failure tool category is invalid');
		}
		const recovery = step.failure.modelPayload.supervisor_recovery;
		if (
			step.failure.kind !== 'supervisor_block' ||
			step.failure.modelPayload.error !== step.failure.error ||
			!isJsonRecord(recovery) ||
			recovery.blocked_exact_retry !== true
		) {
			throw new Error('Fixture supervisor block payload is invalid');
		}
		canonicalizeAgenticChatJson(step.failure.modelPayload);
		await this.assertCurrentReadToolFence(executionInput, processingToken, signal);

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
		const sequenceIndex = terminalContext.toolExecutions.length + 1;
		await abortable(
			this.ports.toolExecutions.persistFailure(
				{
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
					toolCategory: step.failure.toolCategory,
					error: step.failure.error
				},
				signal
			),
			signal
		);

		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error: step.failure.error
		};
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
		});
		markToolExecution();
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
						...chatToolResult,
						affected_entities: [],
						...(step.failure.toolCategory !== null
							? { tool_category: step.failure.toolCategory }
							: {}),
						tool_name: step.toolName
					}
				}
			},
			signal
		);

		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			failure: step.failure
		};
	}

	private async executeReadTool(
		job: Pick<ProcessingJob, 'log'>,
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'read_tool' }>,
		markToolExecution: () => void,
		signal: AbortSignal
	): Promise<AgenticChatProviderReadSynthesisInputV1 | null> {
		canonicalUuid(step.callTransitionId, 'callTransitionId');
		canonicalUuid(step.resultTransitionId, 'resultTransitionId');
		if (!canonicalText(step.providerToolCallId, 512)) {
			throw new Error('Fixture provider tool-call id is invalid');
		}
		if (!canonicalText(step.toolName, 256)) throw new Error('Fixture tool name is invalid');
		await this.assertCurrentReadToolFence(executionInput, processingToken, signal);

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
		const sequenceIndex = terminalContext.toolExecutions.length + 1;
		if (step.validationFailure) {
			return this.persistReadValidationFailure(
				executionInput,
				processingToken,
				projection,
				terminalContext,
				step,
				sequenceIndex,
				signal
			);
		}
		const readStartedAt = Date.now();
		await this.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			'tool_execution_started',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex
			},
			signal
		);
		let toolResult: AgenticChatReadToolExecutionV1;
		if (step.memoServed) {
			toolResult = step.memoServed;
			validateReadToolExecution(toolResult);
			validateMemoServedExecution(toolResult);
		} else {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'read_op',
				state: 'started',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName
			});
			try {
				toolResult = await abortable(
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
			} catch (error) {
				await logAgenticChatExecutionBoundary(job, executionInput, {
					stage: 'read_op',
					state: 'failed',
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					durationMs: elapsedMs(readStartedAt),
					error
				});
				await this.observeToolExecution(
					executionInput,
					processingToken,
					step,
					sequenceIndex,
					'tool_execution_ended',
					{
						tool_name: step.toolName,
						provider_tool_call_id: step.providerToolCallId,
						sequence_index: sequenceIndex,
						status: signal.aborted ? 'aborted' : 'failure',
						duration_ms: elapsedMs(readStartedAt),
						error_code: executionErrorCode(error, signal)
					},
					signal
				);
				throw error;
			}
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'read_op',
				state: 'finished',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(readStartedAt)
			});
		}
		const ledgerStartedAt = Date.now();
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'ledger_persist',
			state: 'started',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName
		});
		try {
			await abortable(
				this.ports.toolExecutions.persistRead(
					{
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
					},
					signal
				),
				signal
			);
		} catch (error) {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'ledger_persist',
				state: 'failed',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(ledgerStartedAt),
				error
			});
			await this.observeToolExecution(
				executionInput,
				processingToken,
				step,
				sequenceIndex,
				'tool_execution_ended',
				{
					tool_name: step.toolName,
					provider_tool_call_id: step.providerToolCallId,
					sequence_index: sequenceIndex,
					status: signal.aborted ? 'aborted' : 'failure',
					duration_ms: elapsedMs(readStartedAt),
					error_code: executionErrorCode(error, signal)
				},
				signal
			);
			throw error;
		}
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'ledger_persist',
			state: 'finished',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			durationMs: elapsedMs(ledgerStartedAt)
		});
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
		// Once the ledger RPC acknowledges persistence, terminal recovery must
		// describe that durable row even if observation or public publication
		// fails afterward.
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
		});
		markToolExecution();
		await this.observeToolExecution(
			executionInput,
			processingToken,
			step,
			sequenceIndex,
			'tool_execution_ended',
			{
				tool_name: step.toolName,
				provider_tool_call_id: step.providerToolCallId,
				sequence_index: sequenceIndex,
				status: 'success',
				duration_ms: step.memoServed ? 0 : elapsedMs(readStartedAt),
				error_code: null
			},
			signal
		);
		const resultPublishStartedAt = Date.now();
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'tool_result_publish',
			state: 'started',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName
		});
		try {
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
			const contextShift = extractContextShiftPayload(chatToolResult);
			if (contextShift) {
				terminalContext.contextShift = contextShift;
				await this.publishSemantic(
					executionInput,
					projection,
					{
						type: 'semantic',
						transitionId: createStableAgenticChatReadToolTransitionIdV1({
							turnRunId: executionInput.claim.turnRunId,
							providerToolCallId: step.providerToolCallId,
							stage: 'context_shift'
						}),
						phase: 'tool',
						eventType: 'context_shift',
						currentActivity: 'BuildOS is working...',
						eventPayload: {
							type: 'context_shift',
							context_shift: { ...contextShift } satisfies JsonObject
						}
					},
					signal
				);
			}
		} catch (error) {
			await logAgenticChatExecutionBoundary(job, executionInput, {
				stage: 'tool_result_publish',
				state: 'failed',
				providerToolCallId: step.providerToolCallId,
				toolName: step.toolName,
				durationMs: elapsedMs(resultPublishStartedAt),
				error
			});
			throw error;
		}
		await logAgenticChatExecutionBoundary(job, executionInput, {
			stage: 'tool_result_publish',
			state: 'finished',
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			durationMs: elapsedMs(resultPublishStartedAt)
		});
		return {
			providerToolCallId: step.providerToolCallId,
			toolName: step.toolName,
			arguments: step.arguments,
			execution: toolResult
		};
	}

	private async persistReadValidationFailure(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		projection: ProjectionState,
		terminalContext: TerminalContextState,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'read_tool' }>,
		sequenceIndex: number,
		signal: AbortSignal
	): Promise<null> {
		const failure = step.validationFailure;
		if (!failure) throw new Error('Fixture validation failure payload is missing');
		if (!canonicalText(failure.error, 4_000)) {
			throw new Error('Fixture validation failure error is invalid');
		}
		if (failure.toolCategory !== null && !canonicalText(failure.toolCategory, 128)) {
			throw new Error('Fixture validation failure tool category is invalid');
		}
		await abortable(
			this.ports.toolExecutions.persistFailure(
				{
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
					toolCategory: failure.toolCategory,
					error: failure.error
				},
				signal
			),
			signal
		);

		const chatToolResult: ChatToolResult = {
			tool_call_id: step.providerToolCallId,
			result: null,
			success: false,
			error: failure.error
		};
		// Validation failures are separate legacy-visible attempts even when the
		// repaired successor is yielded by the same adapter generator.
		terminalContext.toolRoundCount += 1;
		terminalContext.toolExecutions.push({
			toolCall: providerToolCall(step),
			result: chatToolResult
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
						...chatToolResult,
						affected_entities: [],
						...(failure.toolCategory !== null
							? { tool_category: failure.toolCategory }
							: {}),
						tool_name: step.toolName
					}
				}
			},
			signal
		);
		return null;
	}

	private async observeToolExecution(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		step: Extract<AgenticChatFixtureProviderStepV1, { type: 'read_tool' }>,
		sequenceIndex: number,
		eventType: 'tool_execution_started' | 'tool_execution_ended',
		payload: JsonObject,
		signal: AbortSignal
	): Promise<void> {
		if (!this.ports.executionObservations) return;
		try {
			await runWithAbortableDeadline({
				parentSignal: signal,
				timeoutMs: AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
				createTimeoutError: () =>
					new Error('Agentic Chat tool execution observation timed out'),
				run: (deadlineSignal) =>
					this.ports.executionObservations!.observe(
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
							payload
						},
						deadlineSignal
					)
			});
		} catch (error) {
			try {
				this.ports.onExecutionObservationError?.(error);
			} catch {
				// Private observability must remain bounded and cannot alter the turn.
			}
		}
	}

	private async assertCurrentReadToolFence(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		throwIfAborted(signal);
		const receipt = await this.awaitOverhead(signal, 'read-tool fence claim', () =>
			this.ports.control.claim({
				turnRunId: executionInput.claim.turnRunId,
				queueJobId: executionInput.claim.queueJobId,
				processingToken
			})
		);
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
		publicError?: string,
		terminalFailureCode?: string,
		consumptionBillingUserId: string | null = null
	): Promise<AgenticChatFixtureExecutionResultV1> {
		if (executionGeneration < 1) {
			return result('recovery_required', envelope.turnRunId, executionGeneration);
		}
		if (consumptionBillingUserId) {
			await this.evaluateConsumptionBilling(consumptionBillingUserId);
		}
		try {
			const receipt = await this.awaitTerminal('turn recovery', () =>
				this.ports.control.recover({
					...envelope,
					executionGeneration,
					failureClass,
					errorMessage: canonicalErrorMessage(message)
				})
			);
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
			const failureCode =
				receipt.outcome === 'finalize_failed' &&
				terminalFailureCode &&
				receipt.failure_code === failureClass
					? terminalFailureCode
					: receipt.failure_code;
			return await this.finalize({
				envelope,
				claim,
				status: receipt.outcome === 'finalize_cancelled' ? 'cancelled' : 'failed',
				finishedReason: receipt.outcome === 'finalize_cancelled' ? 'cancelled' : 'error',
				failureCode,
				usage: null,
				projection,
				publisherRegistered,
				assistantTextOverride: assistantText ?? '',
				interruptedReason,
				publicError,
				terminalEventContext
			});
		} catch (error) {
			this.reportTerminalControlError(
				'recover',
				{ turnRunId: envelope.turnRunId, executionGeneration },
				error
			);
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
		supervisorQuestionCheckpointId,
		reevaluateConsumptionBilling = false,
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
		if (reevaluateConsumptionBilling) {
			await this.evaluateConsumptionBilling(claim.userId);
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
		const frozenTurnIntent =
			status === 'completed'
				? terminalEventContext?.executionInput.artifact.prepared.turnIntent
				: undefined;
		const turnOutcome = frozenTurnIntent
			? resolveFastChatTurnOutcome({
					intent: frozenTurnIntent as FastChatTurnIntent,
					toolExecutions: terminalEventContext?.terminalContext.toolExecutions,
					finishedReason
				})
			: null;
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
				...(frozenTurnIntent && turnOutcome
					? {
							outcome_status: turnOutcome.status,
							turn_intent: toLegacyTurnIntentMetadata(frozenTurnIntent)
						}
					: {}),
				tool_round_count: terminalEventContext?.terminalContext.toolRoundCount ?? 0,
				tool_call_count: terminalEventContext?.terminalContext.toolExecutions.length ?? 0,
				...(supervisorQuestionCheckpointId
					? {
							supervisor_question_checkpoint: {
								checkpoint_id: supervisorQuestionCheckpointId,
								failed: false
							}
						}
					: {}),
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
			terminal = await this.finalizeWithTimingFallback(terminalInput, claim);
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
					const delivery = await this.awaitTerminal('committed-event delivery', () =>
						this.ports.publisher.publishCommittedSemantic(
							claim.turnRunId,
							committedEvent
						)
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
					await this.awaitTerminal('terminal delivery', () =>
						this.ports.publisher.publishTerminal(
							claim.turnRunId,
							terminal,
							terminalInput.eventPayload
						)
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

	private awaitOverhead<T>(
		parentSignal: AbortSignal,
		label: string,
		run: (signal: AbortSignal) => PromiseLike<T>
	): Promise<T> {
		return runWithAbortableDeadline({
			parentSignal,
			timeoutMs: this.overheadTimeoutMs,
			createTimeoutError: () =>
				new Error(
					`Agentic Chat ${label} exceeded its ${this.overheadTimeoutMs}ms overhead deadline`
				),
			run
		});
	}

	private awaitTerminal<T>(label: string, run: () => PromiseLike<T>): Promise<T> {
		return this.awaitOverhead(new AbortController().signal, label, run);
	}

	private async evaluateConsumptionBilling(userId: string): Promise<void> {
		if (!this.ports.consumptionBilling) return;
		try {
			await this.awaitTerminal('consumption billing evaluation', () =>
				this.ports.consumptionBilling!.evaluate(userId)
			);
		} catch (error) {
			try {
				this.ports.onConsumptionBillingError?.(error);
			} catch {
				// Billing telemetry must never overturn authoritative terminal truth.
			}
		}
	}

	/**
	 * Timing is optional observability that must never cost the user their
	 * terminal state (production turn 1422ffc3 was abandoned to the stalled
	 * sweeper when the timing validator rejected a draft). A failed finalize
	 * that carried a timing draft is retried exactly once without timing —
	 * dropping the surfaces the RPC contract ties to timing — before the
	 * failure propagates to recovery.
	 */
	private async finalizeWithTimingFallback(
		terminalInput: AgenticChatTerminalFinalizeInputV1,
		claim: { turnRunId: string; executionGeneration: number }
	): Promise<AgenticChatTerminalFinalizeRpcResultV1> {
		try {
			return await this.awaitTerminal('terminal finalization', () =>
				this.ports.control.finalize(terminalInput)
			);
		} catch (error) {
			this.reportTerminalControlError('finalize', claim, error);
			if (terminalInput.timingDraft === null) throw error;
			const stripped: AgenticChatTerminalFinalizeInputV1 = {
				...terminalInput,
				timingDraft: null,
				timingTransitionId: null,
				...(terminalInput.status === 'cancelled'
					? { lastTurnContext: null, lastTurnContextTransitionId: null }
					: {}),
				...(terminalInput.status === 'failed'
					? { publicError: null, errorTransitionId: null }
					: {})
			};
			try {
				return await this.awaitTerminal('terminal finalization retry', () =>
					this.ports.control.finalize(stripped)
				);
			} catch (retryError) {
				this.reportTerminalControlError('finalize_retry', claim, retryError);
				throw retryError;
			}
		}
	}

	private reportTerminalControlError(
		stage: 'finalize' | 'finalize_retry' | 'recover',
		claim: { turnRunId: string; executionGeneration: number },
		error: unknown
	): void {
		try {
			this.ports.onTerminalControlError?.({
				stage,
				turnRunId: claim.turnRunId,
				executionGeneration: claim.executionGeneration,
				error
			});
		} catch {
			// Terminal-control observability must never overturn terminal truth.
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
				return await this.awaitTerminal('queue completion', () =>
					this.ports.control.completeQueueJob({
						queueJobId: envelope.queueJobId,
						processingToken: envelope.processingToken,
						result: {
							turnRunId: envelope.turnRunId,
							status: terminal.status,
							terminalEventId: terminal.terminal_event_id
						}
					})
				);
			}
			const recovery = await this.awaitTerminal('terminal queue reconciliation', () =>
				this.ports.control.recover({
					...envelope,
					executionGeneration,
					failureClass,
					errorMessage: 'Reconcile terminal Agentic Chat queue state'
				})
			);
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

function toLegacyTurnIntentMetadata(
	intent: NonNullable<AgenticChatWorkerExecutionInputV1['artifact']['prepared']['turnIntent']>
): JsonObject {
	return {
		version: intent.version,
		requiresWrite: intent.requiresWrite,
		action: intent.action,
		entityKind: intent.entityKind,
		operations: intent.operations as unknown as JsonObject[],
		source: intent.source,
		originalRequestText: intent.originalRequestText,
		originatingTurnRunId: intent.originatingTurnRunId,
		clearPending: intent.clearPending
	};
}

function resolveAcknowledgementMessage(executionInput: AgenticChatWorkerExecutionInputV1): string {
	const context = executionInput.requestPayload.context;
	const rawContextType =
		context && typeof context === 'object' && !Array.isArray(context)
			? (context as JsonObject).type
			: null;
	const contextType =
		rawContextType === 'project_audit' || rawContextType === 'project_forecast'
			? 'project'
			: rawContextType === 'general'
				? 'global'
				: rawContextType;
	const scope =
		contextType === 'project'
			? 'project'
			: contextType === 'daily_brief'
				? 'brief'
				: 'workspace';
	return `Request received. Preparing the ${scope} context...`;
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
	step: Extract<
		AgenticChatFixtureProviderStepV1,
		{ type: 'read_tool' | 'mutating_tool' | 'pre_execution_tool_failure' }
	>
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

function deriveFixtureMutationTelemetry(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'mutating_tool' }>,
	downstreamReceipt: JsonObject | null
): {
	executionTimeMs: number | null;
	tokensConsumed: number | null;
	requiresUserAction: boolean;
	affectedEntities: JsonObject[];
} {
	const requiresUserAction = findRequiresUserAction(downstreamReceipt) ?? false;
	return {
		executionTimeMs: null,
		tokensConsumed: null,
		requiresUserAction,
		affectedEntities: deriveFixtureMutationAffectedEntities(step, downstreamReceipt)
	};
}

function fixtureMutationToolCategory(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'mutating_tool' }>
): string {
	return step.operationName.startsWith('onto.') || step.toolName.includes('_onto_')
		? 'ontology_action'
		: 'action';
}

function deriveFixtureMutationAffectedEntities(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'mutating_tool' }>,
	downstreamReceipt: JsonObject | null
): JsonObject[] {
	if (!downstreamReceipt || findRequiresUserAction(downstreamReceipt) === true) return [];
	const operation = mutationOperation(step.toolName, step.operationName);
	const kind = mutationEntityKind(step.toolName, step.operationName);
	if (!operation || !kind) return [];

	const candidate = downstreamReceipt[kind];
	const entity = isJsonRecord(candidate) ? candidate : downstreamReceipt;
	const id = firstText(
		entity.id,
		entity[`${kind}_id`],
		step.arguments[`${kind}_id`],
		step.arguments.id
	);
	if (!id) return [];
	const projectId =
		kind === 'project'
			? id
			: firstText(
					entity.project_id,
					entity.projectId,
					step.arguments.project_id,
					step.arguments.projectId
				);
	const title = firstText(entity.title, entity.name, step.arguments.title, step.arguments.name);
	const url =
		kind === 'project'
			? `/projects/${id}`
			: projectId
				? kind === 'document'
					? `/projects/${projectId}?doc=${id}`
					: `/projects/${projectId}?entity=${encodeURIComponent(kind)}&entity_id=${id}`
				: null;
	return [{ kind, id, title, projectId, operation, url }];
}

function mutationEntityKind(toolName: string, operationName: string): string | null {
	const operationMatch = operationName.match(
		/^onto\.([a-z_]+)\.(?:create|update|delete|move|link)$/
	);
	if (operationMatch?.[1]) return operationMatch[1].replace(/s$/, '');
	const toolMatch = toolName.match(/^(?:create|update|delete|move)_onto_([a-z_]+)$/);
	return toolMatch?.[1]?.replace(/s$/, '') ?? null;
}

function mutationOperation(toolName: string, operationName: string): string | null {
	const source = `${operationName}:${toolName}`;
	if (source.includes('.create') || toolName.startsWith('create_')) return 'created';
	if (source.includes('.update') || toolName.startsWith('update_')) return 'updated';
	if (source.includes('.delete') || toolName.startsWith('delete_')) return 'deleted';
	if (source.includes('.move') || toolName.startsWith('move_')) return 'moved';
	if (source.includes('.link') || toolName.includes('link_')) return 'linked';
	return null;
}

function findRequiresUserAction(value: unknown, depth = 0): boolean | null {
	if (!isJsonRecord(value) || depth > 2) return null;
	const direct = value.requires_user_action ?? value.requiresUserAction;
	if (typeof direct === 'boolean') return direct;
	return (
		findRequiresUserAction(value.result, depth + 1) ??
		findRequiresUserAction(value.data, depth + 1)
	);
}

function isJsonRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
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

function validateSupervisorQuestion(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'supervisor_question' }>,
	executionGeneration: number
): void {
	canonicalUuid(step.transitionId, 'supervisor transition id');
	if (
		step.executionGeneration !== executionGeneration ||
		!Number.isSafeInteger(step.sequence) ||
		step.sequence < 1 ||
		step.finishedReason !== 'supervisor_question' ||
		!canonicalText(step.reason, 256) ||
		!canonicalText(step.question, 4_000)
	) {
		throw new Error('Fixture supervisor question identity or text is invalid');
	}
	validateFinish(step.finishedReason, step.usage);
	const { digest, resumeContext, supervisorDecision } = step.checkpoint;
	if (
		!isJsonRecord(digest) ||
		!isJsonRecord(resumeContext) ||
		!isJsonRecord(supervisorDecision) ||
		supervisorDecision.action !== 'ask_user' ||
		supervisorDecision.reason !== step.reason ||
		supervisorDecision.question !== step.question ||
		!isJsonRecord(supervisorDecision.checkpoint) ||
		canonicalizeAgenticChatJson(supervisorDecision.checkpoint) !==
			canonicalizeAgenticChatJson({ digest, resumeContext })
	) {
		throw new Error('Fixture supervisor question checkpoint payload is inconsistent');
	}
}

function buildSupervisorWaitingStep(
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'supervisor_question' }>
): Extract<AgenticChatFixtureProviderStepV1, { type: 'semantic' }> {
	const contextType = step.checkpoint.digest.contextType;
	if (typeof contextType !== 'string' || !canonicalText(contextType, 128)) {
		throw new Error('Fixture supervisor question context type is invalid');
	}
	return {
		type: 'semantic',
		transitionId: step.transitionId,
		phase: 'stream',
		eventType: 'agent_state',
		currentActivity: 'Waiting on your direction to continue.',
		eventPayload: {
			type: 'agent_state',
			state: 'waiting_on_user',
			contextType,
			details: 'Waiting on your direction to continue.'
		}
	};
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

function validateMemoServedExecution(execution: AgenticChatReadToolExecutionV1): void {
	if (
		execution.executionTimeMs !== 0 ||
		execution.requiresUserAction === true ||
		execution.result.served_from_turn_memo !== true ||
		!canonicalText(execution.result.repeat_read_notice, 2_000)
	) {
		throw new Error('Fixture memo-served read execution is invalid');
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
	if (error instanceof AgenticChatToolExecutionTimeoutError) return error.failureClass;
	if (error instanceof AgenticChatSupervisorCheckpointFenceError) return error.failureClass;
	if (error instanceof AgenticChatSupervisorCheckpointTimeoutError) return error.failureClass;
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

function specificTerminalFailureCode(error: unknown, signal: AbortSignal): string | undefined {
	const reason = signal.aborted ? signal.reason : error;
	const candidate = reason ?? error;
	if (candidate instanceof AgenticChatToolExecutionTimeoutError) return candidate.code;
	if (candidate instanceof AgenticChatSupervisorCheckpointTimeoutError) return candidate.code;
	if (
		candidate instanceof AgenticChatProviderExecutionError &&
		(candidate.code === 'provider_budget_exhausted' ||
			candidate.code === 'provider_no_assistant_text' ||
			candidate.code === 'read_tool_timeout' ||
			candidate.code === 'provider_round_budget_exceeded' ||
			candidate.code === 'provider_tool_call_budget_exceeded')
	) {
		return candidate.code;
	}
	return undefined;
}

function executionErrorCode(error: unknown, signal: AbortSignal): string {
	const reason = signal.aborted ? signal.reason : error;
	if (
		reason &&
		typeof reason === 'object' &&
		typeof (reason as { code?: unknown }).code === 'string'
	) {
		return String((reason as { code: string }).code).slice(0, 128);
	}
	if (reason instanceof Error && reason.name) return reason.name.slice(0, 128);
	return 'unknown';
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

type AgenticChatExecutionBoundaryStage =
	| 'read_op'
	| 'ledger_persist'
	| 'tool_result_publish'
	| 'synthesis'
	| 'tool_round';

function logAgenticChatSupervisorEvaluation(
	job: Pick<ProcessingJob, 'log'>,
	executionInput: AgenticChatWorkerExecutionInputV1,
	step: Extract<AgenticChatFixtureProviderStepV1, { type: 'supervisor_evaluation' }>
): void {
	canonicalUuid(step.transitionId, 'transitionId');
	if (!canonicalText(step.reason, 1_000)) {
		throw new Error('Fixture supervisor evaluation reason is invalid');
	}
	if (!Number.isSafeInteger(step.sequence) || step.sequence < 1) {
		throw new Error('Fixture supervisor evaluation sequence is invalid');
	}
	if (
		!Number.isSafeInteger(step.executionGeneration) ||
		step.executionGeneration !== executionInput.claim.executionGeneration
	) {
		throw new Error('Fixture supervisor evaluation generation is invalid');
	}
	const record = {
		event: 'agentic_chat_supervisor_eval_flagged',
		turn_run_id: executionInput.claim.turnRunId,
		queue_job_id: executionInput.claim.queueJobId,
		execution_generation: step.executionGeneration,
		transition_id: step.transitionId,
		sequence: step.sequence,
		reason: step.reason
	};
	try {
		void job.log(JSON.stringify(record)).catch(() => undefined);
	} catch {
		// Legacy eval flags are diagnostic only and cannot alter the turn.
	}
}

function logAgenticChatExecutionBoundary(
	job: Pick<ProcessingJob, 'log'>,
	executionInput: AgenticChatWorkerExecutionInputV1,
	input: {
		stage: AgenticChatExecutionBoundaryStage;
		state: 'started' | 'finished' | 'failed';
		providerToolCallId: string;
		toolName: string;
		durationMs?: number;
		error?: unknown;
	}
): Promise<void> {
	const failure = executionBoundaryFailure(input.error);
	const record = {
		event: 'agentic_chat_execution_boundary',
		stage: input.stage,
		state: input.state,
		turn_run_id: executionInput.claim.turnRunId,
		queue_job_id: executionInput.claim.queueJobId,
		execution_generation: executionInput.claim.executionGeneration,
		provider_tool_call_id: input.providerToolCallId,
		tool_name: input.toolName,
		...(input.durationMs !== undefined ? { duration_ms: input.durationMs } : {}),
		...failure
	};
	try {
		void job.log(JSON.stringify(record)).catch(() => undefined);
	} catch {
		// Diagnostic logging must never become part of the execution boundary.
	}
	return Promise.resolve();
}

function executionBoundaryFailure(error: unknown): Record<string, string> {
	if (error === undefined) return {};
	const candidate =
		error && typeof error === 'object'
			? (error as { code?: unknown; failureClass?: unknown; name?: unknown })
			: {};
	const code = canonicalBoundaryLabel(candidate.code, 128);
	const failureClass = canonicalBoundaryLabel(candidate.failureClass, 128);
	const errorName = canonicalBoundaryLabel(
		candidate.name ?? (error instanceof Error ? error.name : typeof error),
		128
	);
	return {
		...(code ? { error_code: code } : {}),
		...(failureClass ? { failure_class: failureClass } : {}),
		...(errorName ? { error_name: errorName } : {})
	};
}

function canonicalBoundaryLabel(value: unknown, maximum: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized && normalized.length <= maximum ? normalized : null;
}

function elapsedMs(startedAt: number): number {
	return Math.min(2_147_483_647, Math.max(0, Date.now() - startedAt));
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

function isMutationSynthesisInput(
	input: AgenticChatProviderToolSynthesisInputV1
): input is AgenticChatProviderMutationSynthesisInputV1 {
	return 'mutation' in input;
}

function isFailedToolSynthesisInput(
	input: AgenticChatProviderToolSynthesisInputV1
): input is AgenticChatProviderFailedToolSynthesisInputV1 {
	return 'failure' in input;
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
