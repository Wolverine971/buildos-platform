// apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts
//
// A turn's terminal lifecycle: recovery through the control plane, the
// partial-completion lane after durable writes, the terminal finalize with its
// one timing-free retry, committed-event delivery, queue reconciliation, and
// the billing and timing work that must settle before the terminal fence.
import { randomUUID } from 'node:crypto';
import { buildLastTurnContextDraftV1 } from '@buildos/agentic-chat-runtime/context';
import {
	buildAgenticChatCompletionReceiptV1,
	resolveTurnContractOutcome
} from '@buildos/agentic-chat-runtime/loop';
import { contractSha256 } from '../provider/validation';
import { resolveReviewedTurnContractFromExecutions } from './reviewed-turn-contract';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type ChatContextType,
	type ChatTurnTerminalStatusV1,
	type JsonObject
} from '@buildos/shared-types';
import type {
	AgenticChatExecutionIdentityV1,
	AgenticChatTerminalFinalizeInputV1
} from './execution-control';
import type { AgenticChatWorkerExecutionInputV1 } from './execution-input';
import { createStableAgenticChatLifecycleTransitionIdV1 } from './lifecycle-identity';
import type { AgenticChatRuntimeTimingTracker } from '../stream/runtime-timing';
import { buildAgenticChatAsyncTimingDraftV1 } from '../stream/timing-payload';
import type { AgenticChatExecutorEffects } from '../effects/executor-effects';
import { enforceAgenticChatTerminalTextIntegrityV1 } from './terminal-text-integrity';
import type {
	AgenticChatTurnExecutionResultV1,
	AgenticChatTurnExecutorPorts,
	AgenticChatTurnUsageV1,
	ExecutableClaim,
	TerminalClaim,
	TerminalReceipt
} from './executor-contracts';
import {
	type AgenticChatOverheadDeadline,
	canonicalUuid,
	captureRuntimeTiming,
	enqueueAssistantText,
	result,
	safeAssistantText
} from './executor-helpers';
import {
	AGENTIC_CHAT_GENERIC_FAILURE_COPY,
	canonicalErrorMessage,
	reportTerminalControlError
} from './executor-failures';
import { type ProjectionState, type TerminalContextState, toProjectionJson } from './turn-run';

export type FinalizeTurnInput = {
	envelope: AgenticChatExecutionIdentityV1;
	claim: TerminalClaim;
	status: ChatTurnTerminalStatusV1;
	finishedReason: string;
	failureCode: string | null;
	usage: AgenticChatTurnUsageV1 | null;
	projection: ProjectionState;
	publisherRegistered: boolean;
	assistantTextOverride?: string;
	interruptedReason?: string;
	publicError?: string;
	reevaluateConsumptionBilling?: boolean;
	terminalEventContext?: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		terminalContext: TerminalContextState;
		runtimeTiming: AgenticChatRuntimeTimingTracker | null;
	};
	/** The post-start failure a completed partial absorbed; telemetry still counts it. */
	partialFailure?: {
		failureClass: AgenticChatRecoveryFailureClassV1;
		failureCode: string | null;
	};
};

export class AgenticChatTurnFinalizer {
	constructor(
		private readonly ports: Pick<
			AgenticChatTurnExecutorPorts,
			'control' | 'publisher' | 'createId'
		>,
		private readonly effects: AgenticChatExecutorEffects,
		private readonly deadline: AgenticChatOverheadDeadline
	) {}

	async recover(
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
	): Promise<AgenticChatTurnExecutionResultV1> {
		if (executionGeneration < 1) {
			return result('recovery_required', envelope.turnRunId, executionGeneration);
		}
		// Current-turn usage must settle before billing, including recovery paths.
		// Recovery may retire the generation, so observations must land here too.
		await this.effects.drainPendingEffects(envelope.turnRunId);
		if (consumptionBillingUserId) {
			await this.evaluateConsumptionBilling(consumptionBillingUserId);
		}
		try {
			const receipt = await this.deadline.awaitTerminal('turn recovery', () =>
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
			// Recovery can reclassify the failure (an unsettled effect makes it
			// uncertain_external_commit). Copy chosen for the executor's class,
			// such as "Nothing was changed", must not describe another outcome.
			const terminalPublicError =
				publicError !== undefined && receipt.failure_code !== failureClass
					? AGENTIC_CHAT_GENERIC_FAILURE_COPY
					: publicError;
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
				publicError: terminalPublicError,
				terminalEventContext
			});
		} catch (error) {
			reportTerminalControlError(
				this.effects,
				'recover',
				{ turnRunId: envelope.turnRunId, executionGeneration },
				error
			);
			return result('recovery_required', envelope.turnRunId, executionGeneration);
		}
	}

	/**
	 * Post-start failure after at least one durable write (spent provider
	 * budget, stream error after retry, read or ledger timeout, provider
	 * contract violation). The same terminal text floors as the happy path run
	 * against the tool ledger so the partial disclosure ("Done: 2 of 6 moves.
	 * Not yet moved: ...") is appended, then the turn finalizes `completed` /
	 * `mutation_unfulfilled` with the regular timing draft and `done` event.
	 * Returns null when the terminal text could not be made durable, so the
	 * caller falls back to the failure path.
	 */
	async finalizePartialAfterDurableWrites(params: {
		envelope: AgenticChatExecutionIdentityV1;
		claim: ExecutableClaim;
		executionInput: AgenticChatWorkerExecutionInputV1;
		terminalContext: TerminalContextState;
		runtimeTiming: AgenticChatRuntimeTimingTracker | null;
		projection: ProjectionState;
		publisherRegistered: boolean;
		usage: AgenticChatTurnUsageV1 | null;
		partialFailureClass: AgenticChatRecoveryFailureClassV1;
		partialFailureCode: string | null;
	}): Promise<AgenticChatTurnExecutionResultV1 | null> {
		const { claim, executionInput, terminalContext, runtimeTiming } = params;
		try {
			// The provider signal may be spent; terminal work runs on fresh
			// signals bounded by the overhead deadline like every other terminal step.
			const requestContext = executionInput.requestPayload.context as JsonObject;
			const terminalTextIntegrity = enforceAgenticChatTerminalTextIntegrityV1({
				assistantText:
					safeAssistantText(
						this.ports.publisher,
						claim.turnRunId,
						params.publisherRegistered
					) ?? '',
				finishedReason: 'mutation_unfulfilled',
				contextType:
					typeof requestContext.type === 'string' ? requestContext.type : 'global',
				toolExecutions: terminalContext.toolExecutions
			});
			if (terminalTextIntegrity.correctionDelta) {
				await this.deadline.awaitOverhead(
					new AbortController().signal,
					'budget disclosure append',
					(signal) =>
						enqueueAssistantText(
							this.ports.publisher,
							claim.turnRunId,
							terminalTextIntegrity.correctionDelta!,
							signal
						)
				);
			}
			captureRuntimeTiming(runtimeTiming, (timing) => timing.markProviderFinished());
			captureRuntimeTiming(runtimeTiming, (timing) => timing.markPublisherDrainStarted());
			try {
				await this.deadline.awaitOverhead(
					new AbortController().signal,
					'budget terminal flush',
					() => this.ports.publisher.flushTurn(claim.turnRunId)
				);
			} finally {
				captureRuntimeTiming(runtimeTiming, (timing) =>
					timing.markPublisherDrainCompleted()
				);
			}
			return await this.finalize({
				envelope: params.envelope,
				claim,
				status: 'completed',
				finishedReason: terminalTextIntegrity.finishedReason,
				failureCode: null,
				usage: params.usage,
				projection: params.projection,
				publisherRegistered: params.publisherRegistered,
				assistantTextOverride: terminalTextIntegrity.assistantText,
				reevaluateConsumptionBilling: true,
				terminalEventContext: { executionInput, terminalContext, runtimeTiming },
				partialFailure: {
					failureClass: params.partialFailureClass,
					failureCode: params.partialFailureCode
				}
			});
		} catch {
			// Disclosure or drain could not be made durable in time. The committed
			// effects still exist; the failure path below records the failure
			// exactly as before this completion lane existed.
			return null;
		}
	}

	async finalize({
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
		reevaluateConsumptionBilling = false,
		terminalEventContext,
		partialFailure
	}: FinalizeTurnInput): Promise<AgenticChatTurnExecutionResultV1> {
		let assistantText =
			assistantTextOverride ??
			safeAssistantText(this.ports.publisher, claim.turnRunId, publisherRegistered) ??
			'';
		let mayPublishTerminal = publisherRegistered;
		if (publisherRegistered) {
			const beforeDrain = this.ports.publisher.getSnapshot(claim.turnRunId);
			if (
				!beforeDrain.persistenceRetryPending &&
				(beforeDrain.pendingPersistenceEvents > 0 ||
					beforeDrain.pendingDeliveryEvents > 0 ||
					beforeDrain.busy)
			) {
				try {
					await this.deadline.awaitTerminal(
						'publisher drain before terminal finalization',
						() => this.ports.publisher.flushTurn(claim.turnRunId)
					);
				} catch {
					// Durable terminal truth can still converge through the database. A
					// blocked live-delivery drain is handled by the snapshot/abandon fence.
				}
			}
			const snapshot = this.ports.publisher.getSnapshot(claim.turnRunId);
			assistantText = assistantTextOverride ?? snapshot.assistantText;
			if (snapshot.pendingEvents > 0 || snapshot.busy) {
				this.ports.publisher.abandonTurn(claim.turnRunId, 'terminal_convergence');
				mayPublishTerminal = false;
			}
		}
		// Join detached usage before billing reads current-turn consumption.
		await this.effects.drainPendingEffects(claim.turnRunId);
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
		const turnContract =
			status === 'completed'
				? resolveReviewedTurnContractFromExecutions(
						terminalEventContext?.terminalContext.toolExecutions
					)
				: null;
		const turnOutcome =
			status === 'completed'
				? resolveTurnContractOutcome({
						contract: turnContract,
						toolExecutions: terminalEventContext?.terminalContext.toolExecutions,
						finishedReason
					})
				: null;
		// Tasker 92 C: a versioned, ledger-derived receipt that separates "this
		// batch was approved" from "the verified effects fulfil the whole request".
		// Computed only for completed terminals; cancelled, failed, stale, and
		// pre-start paths leave none. Pure over the ledger, so a finalize replay
		// yields the identical receipt and writes nothing else.
		const completionReceipt =
			status === 'completed' && terminalEventContext
				? buildAgenticChatCompletionReceiptV1({
						contract: turnContract,
						contractSha256: turnContract ? contractSha256(turnContract) : null,
						toolExecutions: terminalEventContext.terminalContext.toolExecutions,
						finishedReason,
						partialFailureClass: partialFailure?.failureClass ?? null
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
				...(turnOutcome
					? {
							outcome_status:
								completionReceipt?.expectation === 'reviewed_request'
									? completionReceipt.request.outcomeStatus
									: turnOutcome.status,
							...(turnContract &&
							completionReceipt?.expectation !== 'reviewed_request'
								? {
										turn_contract: turnContract as unknown as JsonObject,
										turn_contract_outcomes:
											turnOutcome.outcomes as unknown as JsonObject[]
									}
								: {})
						}
					: {}),
				...(completionReceipt
					? { completion_receipt: completionReceipt as unknown as JsonObject }
					: {}),
				tool_round_count: terminalEventContext?.terminalContext.toolRoundCount ?? 0,
				tool_call_count: terminalEventContext?.terminalContext.toolExecutions.length ?? 0,
				...completedMessageMetadata,
				...interruptedMessageMetadata,
				...(partialFailure
					? {
							partial_failure_class: partialFailure.failureClass,
							partial_failure_code: partialFailure.failureCode
						}
					: {})
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
				? (publicError ?? AGENTIC_CHAT_GENERIC_FAILURE_COPY)
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
					const delivery = await this.deadline.awaitTerminal(
						'committed-event delivery',
						() =>
							this.ports.publisher.publishCommittedSemantic(
								claim.turnRunId,
								committedEvent,
								{ committedThroughSequence: terminal.terminal_sequence_index }
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
					await this.deadline.awaitTerminal('terminal delivery', () =>
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
			return await this.deadline.awaitTerminal('terminal finalization', () =>
				this.ports.control.finalize(terminalInput)
			);
		} catch (error) {
			reportTerminalControlError(this.effects, 'finalize', claim, error);
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
				return await this.deadline.awaitTerminal('terminal finalization retry', () =>
					this.ports.control.finalize(stripped)
				);
			} catch (retryError) {
				reportTerminalControlError(this.effects, 'finalize_retry', claim, retryError);
				throw retryError;
			}
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
				return await this.deadline.awaitTerminal('queue completion', () =>
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
			const recovery = await this.deadline.awaitTerminal(
				'terminal queue reconciliation',
				() =>
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

	private completeRuntimeTiming(tracker: AgenticChatRuntimeTimingTracker | null): void {
		if (!tracker) return;
		try {
			tracker.markTerminalCallCompleted();
			this.effects.timingSnapshot(tracker.snapshot());
		} catch {
			// Post-call timing must never overturn authoritative terminal DB truth.
		}
	}

	private async evaluateConsumptionBilling(userId: string): Promise<void> {
		await this.effects.evaluateConsumptionBilling(userId, (evaluate) =>
			this.deadline.awaitTerminal('consumption billing evaluation', evaluate)
		);
	}

	private createId(): string {
		const value = this.ports.createId?.() ?? randomUUID();
		canonicalUuid(value, 'generated id');
		return value;
	}
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
