// apps/worker/src/workers/agentic-chat/turn/turn-executor.ts
import { workerSourceProvenance } from '../../../lib/sourceProvenance';
import { hasSuccessfulDurableEffects } from '@buildos/agentic-chat-runtime/loop';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatTurnClaimResultV1,
	type AgenticChatTurnJobV1,
	type JsonObject
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import type { AgenticChatExecutionIdentityV1 } from './execution-control';
import {
	AgenticChatExecutionInputError,
	type AgenticChatWorkerExecutionInputV1
} from './execution-input';
import {
	type AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderToolSynthesisInputV1
} from '../provider/contracts';
import {
	type AgenticChatExecutorLifecycleStageV1,
	type AgenticChatExecutorSnapshotStageV1,
	createStableAgenticChatLifecycleTransitionIdV1
} from './lifecycle-identity';
import {
	AgenticChatRuntimeTimingTracker,
	SYSTEM_AGENTIC_CHAT_MONOTONIC_CLOCK
} from '../stream/runtime-timing';
import { createStableAgenticChatPromptSnapshotIdV1 } from '../effects/prompt-snapshot';
import { abortable, throwIfAborted } from '../shared/abortable-deadline';
import { AgenticChatExecutorEffects } from '../effects/executor-effects';
import { enforceAgenticChatTerminalTextIntegrityV1 } from './terminal-text-integrity';
import {
	compileAgenticChatToolExecutionGraphV1,
	executeAgenticChatToolExecutionGraphV1
} from '../tools/execution-graph';
import { resolveAgenticChatToolExecutionPolicyV1 } from '../tools/execution-policy';
import {
	type AgenticChatTurnExecutionResultV1,
	type AgenticChatTurnExecutorPorts,
	type AgenticChatTurnUsageV1,
	DEFAULT_AGENTIC_CHAT_EXECUTOR_OVERHEAD_TIMEOUT_MS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
	DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS,
	type ExecutableClaim
} from './executor-contracts';
import {
	AgenticChatOverheadDeadline,
	captureRuntimeTiming,
	combineAbortSignals,
	elapsedMs,
	enqueueAssistantText,
	extractContextShift,
	isFailedToolSynthesisInput,
	isSemanticReviewStart,
	iterateWithAbort,
	primeProviderStream,
	providerSchedulingArguments,
	result,
	safeAssistantText,
	validateClaimEnvelope,
	validateFinish,
	validateJobEnvelope
} from './executor-helpers';
import {
	AgenticChatCommittedEffectPersistError,
	PARTIAL_COMPLETION_FAILURE_CLASSES,
	cancellationInterruptionReason,
	classifyFailure,
	errorMessage,
	isExecutionFenceLost,
	logAgenticChatExecutionBoundary,
	logAgenticChatTypedExecutionFailure,
	reportTerminalControlError,
	specificTerminalFailureCode
} from './executor-failures';
import {
	ACKNOWLEDGED_ACTIVITY,
	type AgenticChatPendingToolExecutionV1,
	type AgenticChatReadInvalidationEpochStateV1,
	FINALIZING_ACTIVITY,
	type ProjectionState,
	type TerminalContextState,
	type TurnRun,
	emptyProjection,
	reserveToolSequenceIndex,
	standaloneReadPlanningContext
} from './turn-run';
import { AgenticChatTurnRunServices } from './turn-run-services';
import { AgenticChatTurnFinalizer } from './turn-finalizer';
import { AgenticChatReadToolRunner } from './read-tool-runner';
import { AgenticChatMutationToolRunner } from './mutation-tool-runner';

// The public contract lives in `executor-contracts`; these re-exports keep
// existing importers of this module working.
export {
	AGENTIC_CHAT_MAX_READ_TOOL_PROGRESS_EVENTS,
	DEFAULT_AGENTIC_CHAT_EXECUTOR_OVERHEAD_TIMEOUT_MS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
	DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS
} from './executor-contracts';
export type {
	AgenticChatReadToolPortV1,
	AgenticChatReadToolProgressV1,
	AgenticChatTurnExecutionOutcomeV1,
	AgenticChatTurnExecutionResultV1,
	AgenticChatTurnProviderStepV1,
	AgenticChatTurnUsageV1
} from './executor-contracts';

/**
 * Fenced production Agentic Chat execution kernel.
 * Provider and tool ports remain injected, and no production worker entrypoint
 * imports or starts this executor.
 */
export class AgenticChatTurnExecutor {
	private readonly providerBudgetMs: number;
	private readonly overheadTimeoutMs: number;
	private readonly maxProviderRounds: number;
	private readonly maxToolCalls: number;
	private readonly maxToolConcurrency: number;
	private readonly concurrentReadsEnabled: boolean;
	private readonly concurrentMutationsEnabled: boolean;

	/** Every never-fatal side effect goes through one facade with one error policy. */
	private readonly effects: AgenticChatExecutorEffects;
	/** Bounds every control-plane step that runs outside the provider budget. */
	private readonly deadline: AgenticChatOverheadDeadline;
	/** Semantic publication, session handoff, tool observations, and the read fence. */
	private readonly services: AgenticChatTurnRunServices;
	/** Recovery, terminal finalization, and queue reconciliation. */
	private readonly finalizer: AgenticChatTurnFinalizer;
	private readonly readTools: AgenticChatReadToolRunner;
	private readonly mutationTools: AgenticChatMutationToolRunner;

	constructor(
		private readonly ports: AgenticChatTurnExecutorPorts,
		options: {
			providerBudgetMs?: number;
			overheadTimeoutMs?: number;
			maxProviderRounds?: number;
			maxToolCalls?: number;
			maxToolConcurrency?: number;
			concurrentReadsEnabled?: boolean;
			concurrentMutationsEnabled?: boolean;
		} = {}
	) {
		this.effects = new AgenticChatExecutorEffects(ports);
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
		this.maxToolConcurrency =
			options.maxToolConcurrency ?? DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY;
		if (!Number.isSafeInteger(this.maxToolConcurrency) || this.maxToolConcurrency < 1) {
			throw new Error('Agentic Chat tool concurrency must be a positive safe integer');
		}
		// The staged rollout completed in production. Keep explicit false values as
		// a deterministic serial-control seam, but make the reviewed graph policy
		// the normal runtime behavior instead of depending on deployment flags.
		this.concurrentReadsEnabled = options.concurrentReadsEnabled ?? true;
		this.concurrentMutationsEnabled = options.concurrentMutationsEnabled ?? true;
		this.deadline = new AgenticChatOverheadDeadline(this.overheadTimeoutMs);
		this.services = new AgenticChatTurnRunServices(ports, this.effects, this.deadline);
		this.finalizer = new AgenticChatTurnFinalizer(ports, this.effects, this.deadline);
		this.readTools = new AgenticChatReadToolRunner(ports, this.services);
		this.mutationTools = new AgenticChatMutationToolRunner(ports, this.services);
	}

	async execute(
		job: ProcessingJob<AgenticChatTurnJobV1>
	): Promise<AgenticChatTurnExecutionResultV1> {
		let envelope: AgenticChatExecutionIdentityV1;
		try {
			envelope = validateJobEnvelope(job);
		} catch {
			return result('recovery_required', job.data?.turnRunId ?? job.id, null);
		}

		let claim: AgenticChatTurnClaimResultV1;
		try {
			claim = await this.claimWithReadback(envelope);
			validateClaimEnvelope(claim, job);
		} catch {
			return result('recovery_required', envelope.turnRunId, null);
		}

		const generation = claim.executionGeneration;
		if (claim.outcome === 'already_terminal') {
			return this.finalizer.recover(
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
			return this.finalizer.recover(
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
			return this.finalizer.recover(
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
		// Aborts only the provider request started ahead of the durable prelude.
		const speculativeProviderAbort = new AbortController();
		const combined = combineAbortSignals([
			job.signal,
			cancellationSignal,
			overload.signal,
			providerBudget.signal
		]);
		let providerBudgetTimer: NodeJS.Timeout | null = null;
		// Conservative until the start fence: the budget timer arms after `begin`,
		// so the real deadline is never earlier than this pre-start estimate.
		let providerBudgetDeadlineAtMs = Date.now() + this.providerBudgetMs;
		let publisherRegistered = false;
		let executionStarted = false;
		let executionInput: AgenticChatWorkerExecutionInputV1 | null = null;
		let preparedProvider: AgenticChatPreparedProviderInvocationV1 | null = null;
		let usage: AgenticChatTurnUsageV1 | null = null;
		let finishedReason = 'stop';
		let runtimeTiming: AgenticChatRuntimeTimingTracker | null = null;
		const projection = emptyProjection();
		const terminalContext: TerminalContextState = {
			contextShift: null,
			toolExecutions: [],
			nextToolSequenceIndex: 1,
			toolExecutionSequenceByCallId: new Map(),
			toolRoundCount: 0,
			permanentMutationFailures: { byTool: new Map(), byCall: new Map() }
		};

		try {
			throwIfAborted(combined.signal);
			try {
				executionInput = await this.deadline.awaitOverhead(
					combined.signal,
					'execution input load',
					() => this.ports.input.load(executableClaim)
				);
			} catch (error) {
				// Tasker 86: a raw v4 request has no prepared prompt. When workflow
				// preparation is wired, it owns the claimed turn from here; otherwise
				// the original refusal keeps the existing permanent-failure path.
				if (
					this.ports.rawWorkflow &&
					error instanceof AgenticChatExecutionInputError &&
					error.code === 'raw_workflow_input_requires_preparation'
				) {
					return await this.ports.rawWorkflow.execute({
						envelope,
						claim: executableClaim,
						signal: combined.signal,
						invocationDeadlineAtMs: providerBudgetDeadlineAtMs
					});
				}
				throw error;
			}
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
				acceptedAt: executionInput.timingBaseline.admittedAt,
				onOverload: (error) => overload.abort(error),
				onPersistenceObserved: (observation) => {
					captureRuntimeTiming(runtimeTiming, (timing) =>
						timing.observePersistedEvent(observation.persistedAt, observation.eventType)
					);
				},
				onDeliveryObserved: (observation) => {
					captureRuntimeTiming(runtimeTiming, (timing) =>
						timing.observePublisherDelivery(observation)
					);
				}
			});
			publisherRegistered = true;
			// Do not add Realtime subscription latency to the provider path. The hint
			// asks the browser to reconcile queued -> running; durable watchdog
			// reconciliation remains authoritative if Broadcast is unavailable.
			void this.ports.publisher.publishReconcileHint(claim.turnRunId);

			if (this.ports.provider.prepare) {
				preparedProvider = await this.deadline.awaitOverhead(
					combined.signal,
					'provider preparation',
					(deadlineSignal) => {
						// `prepare` receives the conservative pre-start deadline; it is
						// re-anchored when the budget timer arms after the start fence.
						// The speculative abort only fires when the pre-provider
						// persists fail after the provider request already started.
						const prepareInput: AgenticChatProviderInputV1 = {
							executionInput: executionInput!,
							processingToken: envelope.processingToken,
							signal: AbortSignal.any([
								deadlineSignal,
								speculativeProviderAbort.signal
							]),
							budget: { deadlineAtMs: providerBudgetDeadlineAtMs }
						};
						return this.ports.provider.prepare!(prepareInput);
					}
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
			const start = await this.deadline.awaitOverhead(
				combined.signal,
				'provider start fence',
				() =>
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
				return await this.finalizer.recover(
					envelope,
					generation,
					failureClass,
					`Provider start denied: ${start.outcome}`,
					safeAssistantText(this.ports.publisher, claim.turnRunId, publisherRegistered),
					projection,
					publisherRegistered
				);
			}
			executionStarted = true;
			providerBudgetDeadlineAtMs = Date.now() + this.providerBudgetMs;
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
			// The durable acknowledgement and the two prepared snapshots are three
			// sequential persists. Start them first, then start the provider so the
			// model request overlaps them instead of waiting behind them.
			// Ordering: no provider step is consumed until all three are durably
			// accepted, so the publisher receives exactly the pre-overlap enqueue
			// order and sequence numbers. Failure: a prelude rejection is rethrown
			// from this same boundary, before any provider output is applied and
			// without touching the turn signal, after aborting the speculative
			// provider request, so recovery classifies it exactly as before.
			const acceptedPrelude = (async () => {
				await this.publishExecutorLifecycle(
					executionInput!,
					projection,
					'acknowledged',
					combined.signal
				);
				await this.publishExecutorSnapshots(executionInput!, projection, combined.signal);
			})();
			void acceptedPrelude.catch(() => undefined);

			let finished = false;
			const pendingToolResults: AgenticChatProviderToolSynthesisInputV1[] = [];
			const pendingToolExecutions: AgenticChatPendingToolExecutionV1[] = [];
			let toolCallCount = 0;
			let continuationRounds = 0;
			const readInvalidationEpoch: AgenticChatReadInvalidationEpochStateV1 = { value: 0 };
			let roundHadToolExecution = false;
			const markToolExecution = () => {
				if (roundHadToolExecution) return;
				roundHadToolExecution = true;
				terminalContext.toolRoundCount += 1;
			};
			const turnRun: TurnRun = {
				job,
				executionInput,
				processingToken: envelope.processingToken,
				projection,
				terminalContext,
				readInvalidationEpoch,
				markToolExecution
			};
			const legacyStreamInput: AgenticChatProviderInputV1 = {
				executionInput,
				processingToken: envelope.processingToken,
				signal: combined.signal,
				budget: { deadlineAtMs: providerBudgetDeadlineAtMs }
			};
			const prepared = preparedProvider;
			const primedStream = primeProviderStream<AgenticChatProviderStepV1>(() =>
				prepared ? prepared.stream() : this.ports.provider.stream!(legacyStreamInput)
			);
			try {
				await acceptedPrelude;
				throwIfAborted(combined.signal);
			} catch (error) {
				speculativeProviderAbort.abort(error);
				primedStream.cancel();
				throw error;
			}
			// `stream()` itself failing was raised here before the overlap existed.
			if (!primedStream.created.ok) throw primedStream.created.error;
			let providerStream: AsyncIterable<AgenticChatProviderStepV1> = primedStream.stream;
			// The snapshot RPC takes the turn row's exclusive lock for its whole
			// transaction. Dispatching it here lets it overlap the first model
			// request instead of the first tool batch, whose ownership checks
			// need that same lock (case 14, 2026-09-21 gate).
			this.persistPromptSnapshot(envelope, executionInput, preparedProvider, combined.signal);
			while (!finished) {
				for await (const step of iterateWithAbort(providerStream, combined.signal)) {
					captureRuntimeTiming(runtimeTiming, (timing) =>
						timing.markSemanticReviewFinishedIfPending()
					);
					if (finished) throw new Error('Fixture provider emitted a step after finish');
					if (step.type === 'text_delta') {
						if (!step.text) throw new Error('Fixture text delta must be nonempty');
						await enqueueAssistantText(
							this.ports.publisher,
							claim.turnRunId,
							step.text,
							combined.signal
						);
						continue;
					}
					if (step.type === 'semantic') {
						const contextShift = extractContextShift(step.eventPayload);
						if (contextShift) {
							await this.services.persistSessionHandoff(
								executionInput,
								envelope.processingToken,
								contextShift
							);
						}
						await this.services.publishSemantic(
							executionInput,
							projection,
							step,
							combined.signal
						);
						terminalContext.contextShift = contextShift ?? terminalContext.contextShift;
						if (isSemanticReviewStart(step)) {
							captureRuntimeTiming(runtimeTiming, (timing) =>
								timing.markSemanticReviewStarted()
							);
						}
						continue;
					}
					if (step.type === 'read_tool') {
						toolCallCount += 1;
						if (toolCallCount > this.maxToolCalls) {
							throw new AgenticChatProviderExecutionError(
								'provider_tool_call_budget_exceeded',
								'permanent',
								`Agentic Chat provider exceeded its ${this.maxToolCalls} tool-call budget`
							);
						}
						const sequenceIndex = reserveToolSequenceIndex(terminalContext, step);
						if (step.validationFailure) {
							await this.readTools.execute(
								turnRun,
								step,
								sequenceIndex,
								standaloneReadPlanningContext(
									continuationRounds + 1,
									readInvalidationEpoch.value
								),
								combined.signal
							);
						} else if (!preparedProvider?.continueWithToolResults) {
							const readResult = await this.readTools.execute(
								turnRun,
								step,
								sequenceIndex,
								standaloneReadPlanningContext(
									continuationRounds + 1,
									readInvalidationEpoch.value
								),
								combined.signal
							);
							if (readResult) pendingToolResults.push(readResult);
						} else {
							pendingToolExecutions.push({ step, sequenceIndex });
						}
						continue;
					}
					if (step.type === 'mutating_tool') {
						toolCallCount += 1;
						if (toolCallCount > this.maxToolCalls) {
							throw new AgenticChatProviderExecutionError(
								'provider_tool_call_budget_exceeded',
								'permanent',
								`Agentic Chat provider exceeded its ${this.maxToolCalls} tool-call budget`
							);
						}
						const sequenceIndex = reserveToolSequenceIndex(terminalContext, step);
						if (!preparedProvider?.continueWithToolResults) {
							preparedProvider?.invalidateReadMemo?.();
							pendingToolResults.push(
								await this.mutationTools.execute(
									turnRun,
									step,
									sequenceIndex,
									standaloneReadPlanningContext(
										continuationRounds + 1,
										readInvalidationEpoch.value
									),
									combined.signal
								)
							);
						} else {
							pendingToolExecutions.push({ step, sequenceIndex });
						}
						continue;
					}

					const finishedWithUnreturnedToolResults =
						(pendingToolResults.length > 0 || pendingToolExecutions.length > 0) &&
						preparedProvider?.continueWithToolResults !== undefined;
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
				if (pendingToolExecutions.length > 0) {
					const batchResults = await this.executePendingToolBatch(
						turnRun,
						pendingToolExecutions.splice(0, pendingToolExecutions.length),
						continuationRounds + 1,
						preparedProvider,
						combined.signal
					);
					pendingToolResults.push(...batchResults);
				}
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
				throw new Error('Fixture provider ended without a finish step');
			}
			throwIfAborted(combined.signal);
			const requestContext = executionInput.requestPayload.context as JsonObject;
			const terminalTextIntegrity = enforceAgenticChatTerminalTextIntegrityV1({
				assistantText:
					safeAssistantText(this.ports.publisher, claim.turnRunId, publisherRegistered) ??
					'',
				finishedReason,
				contextType:
					typeof requestContext.type === 'string' ? requestContext.type : 'global',
				toolExecutions: terminalContext.toolExecutions
			});
			finishedReason = terminalTextIntegrity.finishedReason;
			if (terminalTextIntegrity.correctionDelta) {
				await enqueueAssistantText(
					this.ports.publisher,
					claim.turnRunId,
					terminalTextIntegrity.correctionDelta,
					combined.signal
				);
			}
			// Terminal text guards can append one deterministic correction. Keep that
			// write inside the provider-authority interval so persisted stream timing
			// never observes assistant text after authority has been relinquished.
			captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
			captureRuntimeTiming(runtimeTiming, (timing) => timing.markPublisherDrainStarted());
			try {
				await abortable(this.ports.publisher.flushTurn(claim.turnRunId), combined.signal);
			} finally {
				captureRuntimeTiming(runtimeTiming, (timing) =>
					timing.markPublisherDrainCompleted()
				);
			}
			if (preparedProvider?.automaticDomainCapture !== 'disabled') {
				await this.captureResearch(
					executionInput,
					envelope.processingToken,
					combined.signal
				);
				await this.captureStatedFuture(
					executionInput,
					envelope.processingToken,
					combined.signal
				);
			}
			await this.publishExecutorLifecycle(
				executionInput,
				projection,
				'finalizing',
				combined.signal
			);
			throwIfAborted(combined.signal);
			return await this.finalizer.finalize({
				envelope,
				claim: executableClaim,
				status: 'completed',
				finishedReason,
				failureCode: null,
				usage,
				projection,
				publisherRegistered,
				assistantTextOverride: terminalTextIntegrity.assistantText,
				reevaluateConsumptionBilling: true,
				terminalEventContext: { executionInput, terminalContext, runtimeTiming }
			});
		} catch (error) {
			const failureClass = classifyFailure(error, executionStarted, combined.signal);
			logAgenticChatTypedExecutionFailure(
				job,
				claim,
				error,
				failureClass,
				combined.signal,
				executionStarted
			);
			const terminalFailureCode = specificTerminalFailureCode(error, combined.signal);
			// A post-start failure after durable writes is a partial result, not a
			// failure: the effects are real and the pending contract carries
			// forward. Finalize as completed with the partial disclosure instead of
			// "An error occurred while streaming." Cancellation, worker shutdown,
			// publisher overload, stale context, and uncertain effects keep the
			// failure path (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F56).
			if (
				executionStarted &&
				executionInput !== null &&
				PARTIAL_COMPLETION_FAILURE_CLASSES.has(failureClass) &&
				!isExecutionFenceLost(error) &&
				!(error instanceof AgenticChatCommittedEffectPersistError) &&
				!cancellationSignal.aborted &&
				!job.signal.aborted &&
				!overload.signal.aborted &&
				hasSuccessfulDurableEffects(terminalContext.toolExecutions)
			) {
				const completed = await this.finalizer.finalizePartialAfterDurableWrites({
					envelope,
					claim: executableClaim,
					executionInput,
					terminalContext,
					runtimeTiming,
					projection,
					publisherRegistered,
					usage,
					partialFailureClass: failureClass,
					partialFailureCode: terminalFailureCode ?? null
				});
				if (completed) return completed;
			}
			const assistantText = safeAssistantText(
				this.ports.publisher,
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
				captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
			}
			// Await inside the try/catch/finally scope so publisher cleanup cannot
			// unregister the turn before recovery captures/finalizes its prefix.
			return await this.finalizer.recover(
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
			if (executionInput) {
				this.ports.readTool.completeTurnSecurityState?.(
					executionInput.claim.userId,
					executionInput.claim.turnRunId
				);
			}
			if (publisherRegistered) this.safeUnregisterPublisher(claim.turnRunId);
		}
	}

	private async captureResearch(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		await this.effects.captureResearch({ executionInput, processingToken, signal });
		throwIfAborted(signal);
	}

	private async captureStatedFuture(
		executionInput: AgenticChatWorkerExecutionInputV1,
		processingToken: string,
		signal: AbortSignal
	): Promise<void> {
		await this.effects.captureStatedFuture({ executionInput, processingToken, signal });
		throwIfAborted(signal);
	}

	/** Detached before the first provider request; joined by `drainPendingEffects` before the terminal fence. */
	private persistPromptSnapshot(
		envelope: AgenticChatExecutionIdentityV1,
		executionInput: AgenticChatWorkerExecutionInputV1,
		preparedProvider: AgenticChatPreparedProviderInvocationV1 | null,
		signal: AbortSignal
	): void {
		const prompt = preparedProvider?.promptSnapshot;
		if (!prompt) return;
		this.effects.persistPromptSnapshot(
			{
				...envelope,
				userId: executionInput.claim.userId,
				executionGeneration: executionInput.claim.executionGeneration,
				promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(
					executionInput.claim.turnRunId
				),
				prompt
			},
			signal
		);
	}

	private async publishExecutorLifecycle(
		executionInput: AgenticChatWorkerExecutionInputV1,
		projection: ProjectionState,
		stage: AgenticChatExecutorLifecycleStageV1,
		signal: AbortSignal
	): Promise<void> {
		const message = stage === 'acknowledged' ? ACKNOWLEDGED_ACTIVITY : FINALIZING_ACTIVITY;
		await this.services.publishSemantic(
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
					workerProvenance: workerSourceProvenance ? { ...workerSourceProvenance } : null,
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
		await this.services.publishSemantic(
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
				currentActivity: ACKNOWLEDGED_ACTIVITY,
				eventPayload
			},
			signal
		);
	}

	private async executePendingToolBatch(
		turnRun: TurnRun,
		pending: readonly AgenticChatPendingToolExecutionV1[],
		providerRound: number,
		preparedProvider: AgenticChatPreparedProviderInvocationV1 | null,
		signal: AbortSignal
	): Promise<AgenticChatProviderToolSynthesisInputV1[]> {
		const { job, executionInput, readInvalidationEpoch } = turnRun;
		const pendingByCallId = new Map(
			pending.map((entry) => [entry.step.providerToolCallId, entry] as const)
		);
		// The adapter must see the whole provider batch before any calls begin.
		// Otherwise a web call could race a same-batch private read and pass the
		// turn-level egress gate before the read marks the state as tainted.
		this.ports.readTool.prepareTurnToolBatchSecurity?.({
			userId: executionInput.claim.userId,
			turnRunId: executionInput.claim.turnRunId,
			toolNames: pending.map(({ step }) => step.toolName)
		});
		let graph;
		try {
			graph = compileAgenticChatToolExecutionGraphV1({
				batchId: `${executionInput.claim.turnRunId}:provider-round:${providerRound}`,
				maxCalls: this.maxToolCalls,
				calls: pending.map(({ step }, providerCallIndex) => {
					const kind = step.type === 'mutating_tool' ? 'mutation' : 'read';
					const policy = resolveAgenticChatToolExecutionPolicyV1({
						toolName: step.toolName,
						kind,
						arguments: step.arguments,
						concurrentReadsEnabled: this.concurrentReadsEnabled,
						concurrentMutationsEnabled: this.concurrentMutationsEnabled
					});
					return {
						providerCallIndex,
						providerToolCallId: step.providerToolCallId,
						toolName: step.toolName,
						kind,
						executionPolicy: policy.executionPolicy,
						resources: policy.resources,
						arguments: providerSchedulingArguments(step)
					};
				})
			});
		} catch (error) {
			throw new AgenticChatProviderExecutionError(
				'provider_tool_execution_graph_invalid',
				'permanent',
				errorMessage(error)
			);
		}

		const batchStartedAt = Date.now();
		const graphLayerByCallId = new Map(
			graph.layers.flatMap((layer) =>
				layer.providerToolCallIds.map(
					(providerToolCallId) =>
						[
							providerToolCallId,
							{ index: layer.index, width: layer.providerToolCallIds.length }
						] as const
				)
			)
		);
		const run =
			await executeAgenticChatToolExecutionGraphV1<AgenticChatProviderToolSynthesisInputV1>({
				graph,
				maxConcurrency: this.maxToolConcurrency,
				signal,
				isSuccessfulResult: (feedback) => !isFailedToolSynthesisInput(feedback),
				onBeforeLayer: ({ containsMutation }) => {
					if (containsMutation) {
						preparedProvider?.invalidateReadMemo?.();
					}
				},
				executeCall: (call, callSignal) => {
					const entry = pendingByCallId.get(call.providerToolCallId);
					if (!entry)
						throw new Error(`Tool execution batch lost ${call.providerToolCallId}`);
					const step = { ...entry.step, arguments: call.arguments };
					const graphLayer = graphLayerByCallId.get(call.providerToolCallId);
					if (!graphLayer) {
						throw new Error(
							`Tool execution graph lost layer metadata for ${call.providerToolCallId}`
						);
					}
					const planning = {
						toolBatchIndex: providerRound,
						graphPlanSha256: graph.canonicalPlanSha256,
						graphLayerIndex: graphLayer.index,
						graphLayerWidth: graphLayer.width,
						readEpoch: readInvalidationEpoch.value
					};
					if (step.type === 'read_tool') {
						return this.readTools.execute(
							turnRun,
							step,
							entry.sequenceIndex,
							planning,
							callSignal
						) as Promise<AgenticChatProviderToolSynthesisInputV1>;
					}
					return this.mutationTools.execute(
						turnRun,
						step,
						entry.sequenceIndex,
						planning,
						callSignal
					);
				}
			});

		try {
			void job
				.log(
					JSON.stringify({
						event: 'agentic_chat_tool_execution_graph',
						turn_run_id: executionInput.claim.turnRunId,
						provider_round: providerRound,
						plan_sha256: graph.canonicalPlanSha256,
						call_count: graph.calls.length,
						layer_count: graph.layers.length,
						layer_widths: graph.layers.map((layer) => layer.providerToolCallIds.length),
						explicit_dependency_count: graph.edges.filter(
							(edge) => edge.source === 'model_after'
						).length,
						worker_serialization_count: graph.edges.filter(
							(edge) => edge.source === 'worker_conflict'
						).length,
						failed_call_count: run.results.filter(
							(result) => result.status === 'failed' || result.status === 'rejected'
						).length,
						skipped_call_count: run.results.filter(
							(result) => result.status === 'skipped'
						).length,
						max_observed_concurrency: run.maxObservedConcurrency,
						requested_mode: graph.edges.some((edge) => edge.source === 'model_after')
							? 'explicit_dependencies'
							: 'parallel_default',
						call_timings: run.callTimings.map((timing) => ({
							provider_tool_call_id: timing.providerToolCallId,
							layer_index: timing.layerIndex,
							started_offset_ms: timing.startedOffsetMs,
							duration_ms: timing.durationMs
						})),
						graph_execution_ms: run.actualExecutionMs,
						estimated_serial_execution_ms: run.estimatedSerialExecutionMs,
						parallel_savings_ms: run.parallelSavingsMs,
						actual_critical_path_ms: elapsedMs(batchStartedAt)
					})
				)
				.catch(() => undefined);
		} catch {
			// Best-effort scheduling telemetry must never affect execution truth.
		}

		const feedback: AgenticChatProviderToolSynthesisInputV1[] = [];
		for (const result of run.results) {
			const entry = pendingByCallId.get(result.providerToolCallId);
			if (!entry) throw new Error(`Tool execution result lost ${result.providerToolCallId}`);
			if (result.status === 'fulfilled' || result.status === 'failed') {
				feedback.push(result.value);
				continue;
			}
			if (result.status === 'rejected') throw result.error;
			if (result.reason === 'cancelled') {
				throwIfAborted(signal);
				throw new Error('Tool execution batch was cancelled without an aborted signal');
			}
			feedback.push(
				await this.mutationTools.persistDependencyFailure(
					turnRun,
					entry.step,
					entry.sequenceIndex,
					result.blockedBy,
					(() => {
						const layer = graphLayerByCallId.get(result.providerToolCallId);
						if (!layer) {
							throw new Error(
								`Tool execution graph lost layer metadata for ${result.providerToolCallId}`
							);
						}
						return {
							toolBatchIndex: providerRound,
							graphPlanSha256: graph.canonicalPlanSha256,
							graphLayerIndex: layer.index,
							graphLayerWidth: layer.width,
							readEpoch: readInvalidationEpoch.value
						};
					})(),
					signal
				)
			);
		}
		return feedback;
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

	/**
	 * A claim commits under the turn lock even when its response is lost or
	 * outlives the overhead deadline. In the 2026-09-15 combined gate a 12s
	 * pooler stall parked a committed claim until the 420s stalled-job sweep.
	 * Claim is idempotent for the queue processing token: a replay returns the
	 * committed generation as `matching_current_claim`, with `executionMayStart`
	 * true until the start fence. One readback restores the lost receipt; if it
	 * fails too, stalled recovery remains the fallback.
	 */
	private async claimWithReadback(
		envelope: AgenticChatExecutionIdentityV1
	): Promise<AgenticChatTurnClaimResultV1> {
		try {
			return await this.deadline.awaitTerminal('turn claim', (signal) =>
				this.ports.control.claim(envelope, signal)
			);
		} catch (error) {
			reportTerminalControlError(
				this.effects,
				'claim',
				{ turnRunId: envelope.turnRunId, executionGeneration: null },
				error
			);
		}
		try {
			return await this.deadline.awaitTerminal('turn claim readback', (signal) =>
				this.ports.control.claim(envelope, signal)
			);
		} catch (error) {
			reportTerminalControlError(
				this.effects,
				'claim_readback',
				{ turnRunId: envelope.turnRunId, executionGeneration: null },
				error
			);
			throw error;
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
}
