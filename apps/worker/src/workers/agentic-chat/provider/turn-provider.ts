// apps/worker/src/workers/agentic-chat/provider/turn-provider.ts

import { createHash } from 'node:crypto';

import {
	type AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientPortV1,
	type AgenticChatTurnProviderRequestV1 as ClientRequest
} from './contracts';
import { AgenticChatProviderCapacity, AgenticChatProviderCapacityError } from './provider-capacity';
import type { AgenticChatLiveVisionResolverPortV1 } from '../tools/live-vision';
import {
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from '../mutations/tool-catalog';
import {
	buildProjectCreateInitialContractGateRequest,
	callsIncludeSemanticDisposition,
	canRequirePreMutationSemanticDisposition,
	reconcileSemanticDispositionCalls,
	requestOffersSemanticDisposition
} from './review/disposition';
import {
	type ReviewLaneContext,
	streamMutationBatchReview,
	streamReviewExhaustion,
	streamTurnContractReview
} from './review/lanes';
import {
	type ProviderPass,
	startProviderPass,
	streamDirectWriteReceipt,
	streamForcedSynthesis
} from './forced-synthesis';
import { canonicalError, canonicalFinishedReason, normalizeUsage, providerError } from './protocol';
import { throwIfAborted } from '../shared/abortable-deadline';
import type { AgenticChatContextFinderPort } from './chat-context-finder';
import {
	type AgenticChatDocumentEditPreviewPort,
	previewDocumentEditCalls
} from './document-edit-preview';
import type { AgenticChatToolSelectorPort } from './jev-tool-selector';
import { streamBufferedProviderPass } from './provider-pass';
import {
	buildEmptyReplyRepairRequest,
	buildRequiredPassProseFallbackRequest,
	buildReviewerMimicryRepairRequest,
	buildUnavailableSkillRepairRequest,
	buildUnavailableSurfaceToolRepairRequest
} from './repair-policy';
import {
	appendSystemInstruction,
	appendWebResearchRules,
	buildBaseProviderRequest,
	buildPromptSnapshot,
	buildValidationRepairRequest,
	combineUsage
} from './request-builders';
import {
	type CompletedProviderToolCall,
	appendToolCallDelta,
	assertAllowlistedCall,
	assertToolCallFinishReason,
	completeToolCalls,
	createToolCallAccumulator
} from './stream-tool-calls';
import {
	buildPlanningStep,
	buildProviderToolStep,
	buildValidationFailureReadToolStep,
	normalizeCompletedProviderCalls
} from './steps';
import {
	ProviderTurnState,
	type ToolRoundContinuation,
	type ToolRoundStreamState
} from './turn-state';
import {
	callsWithValidationIssues,
	validateCompletedProviderCalls,
	validationIssuesForCall
} from './validation';

export { describeUnappliedWrites } from './review/lanes';

// Matches MAX_PROVIDER_PASSES_PER_TURN (turn-state.ts): a round budget above
// the pass ceiling can never be reached.
const DEFAULT_MAX_PROVIDER_ROUNDS = 12;
const MAX_VALIDATION_REPAIR_ROUNDS = 2;

type ActingPassOptions = {
	/** The opening pass resolves live vision and holds pre-gate prose; continuations do not. */
	phase: 'initial' | 'continuation';
	/** Bounded validation-repair passes already spent on this round. */
	validationRepairRounds?: number;
	/** Last validation failure, independent of call IDs and cosmetic payload changes. */
	previousValidationFailureSha256?: string;
	/** Whether the tool round this pass produces announces itself with a planning step. */
	emitPlanningSemantic?: boolean;
};

/**
 * Production turn-provider boundary. Preparation validates the immutable
 * command and reserves local provider capacity; its returned stream performs
 * the first network call only after the executor wins execution-start.
 *
 * The reviewed surface is the immutable admission artifact intersected with
 * the worker's shared read allowlist and explicit mutation capabilities. The
 * default capability set is empty. One provider response is an execution
 * batch: the executor validates its graph and schedules ready calls, while
 * every durable result still crosses the shared payload and round policies
 * before another provider pass begins.
 *
 * Turn state lives in `ProviderTurnState` (one per invocation); the review
 * lanes and forced synthesis stream from their own modules through
 * `laneContext`, which routes every model call back through `providerPass`.
 */
export class AgenticChatTurnProviderAdapter implements AgenticChatProviderPortV1 {
	/** What the review lanes and forced synthesis need from this coordinator. */
	private readonly laneContext: ReviewLaneContext;

	constructor(
		private readonly ports: {
			client: AgenticChatTurnProviderClientPortV1;
			/** Distinct model lane that adjudicates proposed write contracts. */
			semanticReviewer?: AgenticChatTurnProviderClientPortV1;
			capacity: AgenticChatProviderCapacity;
			liveVision?: AgenticChatLiveVisionResolverPortV1;
			/**
			 * Narrows the opening pass to the schemas this message needs. Continuations
			 * inherit the narrowed list; the one-shot surface repair restores the
			 * admitted surface if the model reaches for an omitted tool.
			 */
			toolSelector?: AgenticChatToolSelectorPort;
			/**
			 * Ranks the project's records for this message on the opening pass, concurrently
			 * with tool selection, and publishes "Working from" chips. Fail-open.
			 */
			contextFinder?: AgenticChatContextFinderPort;
			/**
			 * Dry-runs body-changing document updates before review: a failing edit
			 * returns to the actor without a review round, a passing one reaches the
			 * reviewer with its verified diff. Fail-open.
			 */
			documentEditPreview?: AgenticChatDocumentEditPreviewPort;
		},
		private readonly retryableFailureCooldownMs = 2_000,
		private readonly maxProviderRounds = DEFAULT_MAX_PROVIDER_ROUNDS,
		private readonly mutationCapabilities: Readonly<
			Partial<AgenticChatProviderMutationCapabilitiesV1>
		> = {},
		/**
		 * Migration seam for SHA-bound batch approval (Decision 1). Production
		 * assembly turns it on; the contract-lane fixtures still run the old
		 * ladder so the two can be compared on one battery. DELETE THIS FLAG
		 * and the contract lane with it once the battery confirms the new lane
		 * — it exists to make the cutover reviewable, not to be configurable.
		 */
		private readonly mutationBatchLaneEnabled = false,
		/**
		 * AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT: close a simple direct write that
		 * fully landed on ledger receipt text instead of a tool-free model pass.
		 */
		private readonly directWriteReceiptTextEnabled = false
	) {
		if (
			!Number.isSafeInteger(retryableFailureCooldownMs) ||
			retryableFailureCooldownMs < 1 ||
			retryableFailureCooldownMs > 60_000
		) {
			throw new Error('Read-only provider cooldown must be between 1ms and 60000ms');
		}
		if (!Number.isSafeInteger(maxProviderRounds) || maxProviderRounds < 1) {
			throw new Error('Read-only provider round budget must be a positive safe integer');
		}
		this.laneContext = {
			ports: this.ports,
			retryableFailureCooldownMs: this.retryableFailureCooldownMs,
			providerPass: (request, state, client) => this.providerPass(request, state, client)
		};
	}

	prepare(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1> {
		return Promise.resolve().then(() => this.prepareInvocation(input));
	}

	private prepareInvocation(
		input: AgenticChatProviderInputV1
	): AgenticChatPreparedProviderInvocationV1 {
		throwIfAborted(input.signal);
		const executionInput = input.executionInput;
		const { request, admittedTools } = buildBaseProviderRequest(
			executionInput,
			input.processingToken,
			input.signal,
			this.mutationCapabilities,
			Boolean(this.ports.liveVision),
			Boolean(this.ports.semanticReviewer),
			input.budget,
			this.mutationBatchLaneEnabled
		);
		const initialRequest =
			this.ports.semanticReviewer && !this.mutationBatchLaneEnabled
				? (buildProjectCreateInitialContractGateRequest(request) ?? request)
				: request;
		const promptSnapshot = buildPromptSnapshot(initialRequest.messages, initialRequest.tools);
		let lease;
		try {
			lease = this.ports.capacity.acquire(request.turnRunId);
		} catch (error) {
			if (error instanceof AgenticChatProviderCapacityError) {
				throw new AgenticChatProviderExecutionError(
					'provider_capacity_unavailable',
					'provider_throttle',
					error.message
				);
			}
			throw error;
		}

		const state = new ProviderTurnState({
			baseRequest: request,
			initialRequest,
			admittedTools,
			executionInput,
			lease,
			semanticReviewRequired: Boolean(this.ports.semanticReviewer),
			mutationBatchLaneEnabled: this.mutationBatchLaneEnabled,
			maxProviderRounds: this.maxProviderRounds,
			directWriteReceiptTextEnabled: this.directWriteReceiptTextEnabled
		});
		return {
			promptSnapshot,
			stream: () => {
				state.claimOpeningStream();
				return this.streamActingPass(initialRequest, null, state, { phase: 'initial' });
			},
			continueWithToolResults: (input) =>
				this.streamToolRoundContinuation(state.completeToolRound(input), state),
			invalidateReadMemo: () => state.clearTurnReadEvidence(),
			release: () => state.release()
		};
	}

	/** Stream the lane a completed tool round chose. */
	private streamToolRoundContinuation(
		next: ToolRoundContinuation,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		switch (next.lane) {
			case 'acting_pass':
				return this.streamActingPass(next.request, next.usage, state, {
					phase: 'continuation'
				});
			case 'review_exhaustion':
				return streamReviewExhaustion(next.usage, state);
			case 'turn_contract_review':
				return streamTurnContractReview(
					this.laneContext,
					next.request,
					next.availableTools,
					next.contract,
					next.contractReviewSha256,
					next.allowDispositionCorrection,
					next.usage,
					state
				);
			case 'approved_batch_execution':
				return this.streamApprovedBatchExecution(
					next.request,
					next.calls,
					next.usage,
					state
				);
			case 'forced_synthesis':
				return streamForcedSynthesis(this.laneContext, next.request, next.usage, state, {
					clarification: next.clarification
				});
			case 'direct_write_receipt':
				return streamDirectWriteReceipt(this.laneContext, next.text, next.usage, state);
		}
	}

	/**
	 * The single entry to the model for a turn: acting passes, repairs,
	 * reviewers, and synthesis all come through here, so the global pass budget
	 * is counted in exactly one place.
	 */
	private providerPass(
		request: ClientRequest,
		state: ToolRoundStreamState,
		client: AgenticChatTurnProviderClientPortV1 = this.ports.client
	) {
		state.recordProviderPass();
		return streamBufferedProviderPass(
			request,
			client,
			this.ports.capacity,
			this.retryableFailureCooldownMs
		);
	}

	/**
	 * One acting-model pass. The opening pass and every continuation share this
	 * loop; `options.phase` selects the handful of behaviours that differ:
	 * live-vision resolution and the pre-mutation prose hold belong to the
	 * opening pass, while reviewer-mimicry repair, the required-pass prose
	 * fallback, and contract-driven prose holding belong to continuations.
	 */
	private async *streamActingPass(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState,
		options: ActingPassOptions
	): AsyncGenerator<AgenticChatProviderStepV1> {
		const initial = options.phase === 'initial';
		const validationRepairRounds = options.validationRepairRounds ?? 0;
		// The opening pass always announces its tool round. A continuation
		// announces one only when the round it repairs did; a validation repair
		// inherits this pass's answer, every other repair inherits the raw option.
		const emitPlanningSemantic = initial || (options.emitPlanningSemantic ?? false);
		const continuationOptions: ActingPassOptions = {
			phase: 'continuation',
			validationRepairRounds,
			previousValidationFailureSha256: options.previousValidationFailureSha256,
			emitPlanningSemantic: options.emitPlanningSemantic ?? false
		};
		let finished = false;
		let keepLease = false;
		let streamedText = false;
		let passEmittedText = false;
		let assistantCandidate = '';
		const textDelta = (text: string): AgenticChatProviderStepV1 => {
			const step = state.textDelta(text, passEmittedText);
			passEmittedText = true;
			return step;
		};
		// Provider passes are fully buffered upstream, so deferring the text flush
		// to pass end costs no latency. Holding lets a pass that ends in a semantic
		// disposition control call withhold its prose: the post-disposition pass
		// owns the final answer, and flushing both doubled the reply in production.
		// Contract state can only hold prose after the opening pass; the opening
		// pass instead holds whenever a withheld mutation could send it to the gate.
		const holdAssistantTextForTurnContract =
			!initial &&
			(state.hasPendingTurnContractWrite() ||
				state.hasIncompleteApprovedContract() ||
				request.semanticDispositionGate === true);
		const holdAssistantText =
			state.getRequestCompletionFallback() !== null ||
			holdAssistantTextForTurnContract ||
			(initial && canRequirePreMutationSemanticDisposition(request)) ||
			// A subsequent batch can need review after the disposition controls
			// have left the surface. Keep its unexecuted claims private too.
			(this.mutationBatchLaneEnabled &&
				Boolean(this.ports.semanticReviewer) &&
				request.tools.some((tool) =>
					reviewedAgenticChatMutationSpecV1(tool.function.name)
				)) ||
			requestOffersSemanticDisposition(request);
		const toolCalls = createToolCallAccumulator();
		try {
			// The turn has spent its whole model budget. Everything already
			// executed is durable, so the turn ends with an honest partial answer
			// rather than another pass or a raw failure.
			if (state.providerPassBudgetExhausted()) {
				keepLease = true;
				state.advance({ type: 'budget', limit: 'force_synthesis' });
				yield* streamForcedSynthesis(
					this.laneContext,
					appendSystemInstruction(request, state.buildProviderPassBudgetInstruction()),
					priorUsage,
					state
				);
				return;
			}
			let openingPass: ReturnType<ProviderPass> | null = null;
			if (initial) {
				// Started first so project load + Jev ranking overlap vision and tool selection.
				const finding = this.ports.contextFinder?.find(request) ?? null;
				// If an earlier step throws, the finding is abandoned; never leave it unhandled.
				finding?.catch(() => undefined);
				request = await this.resolveLiveVision(request);
				if (this.ports.toolSelector)
					request = await this.ports.toolSelector.select(request);
				request = appendWebResearchRules(request);
				const found = finding ? await finding : null;
				if (found?.injection) request = appendSystemInstruction(request, found.injection);
				state.setCurrentRequest(request);
				if (found) {
					// The opening request goes out while the executor persists the
					// "Working from" status; the status still reaches it first.
					openingPass = startProviderPass(this.providerPass(request, state));
					yield found.step;
				}
			}
			for await (const event of openingPass ?? this.providerPass(request, state)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					if (holdAssistantText) continue;
					yield textDelta(event.content);
					continue;
				}
				if (event.type === 'tool_call') {
					if (request.toolChoice === 'none') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					appendToolCallDelta(toolCalls, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							request.turnRunId,
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				const finishedReason = canonicalFinishedReason(event.finishedReason);
				// Judge the pass before parsing what it produced. A pass that stopped
				// for any reason other than tool calls left its arguments unfinished,
				// and reporting that as malformed JSON hides a recoverable condition
				// behind a permanent protocol error. Reject calls only when tools are
				// actually disabled; both `auto` and `required` are valid tool-enabled
				// policies (a project-create opening pass starts in a required gate).
				assertToolCallFinishReason(toolCalls, finishedReason, request.toolChoice, 'none');
				let calls: readonly CompletedProviderToolCall[] = completeToolCalls(
					toolCalls,
					request.tools,
					{
						finishedReason,
						completionBudgetExhausted: finishedReason === 'length'
					}
				);
				const passUsage = normalizeUsage(event.usage);
				// The opening pass has no prior usage to fold in; combining with
				// null would erase the pass usage instead of carrying it.
				const usage = initial ? passUsage : combineUsage(priorUsage, passUsage);
				finished = true;
				if (calls.length > 0) {
					const unavailableSkillRepair = buildUnavailableSkillRepairRequest(
						request,
						calls,
						state.getAdmittedTools()
					);
					if (unavailableSkillRepair) {
						state.setCurrentRequest(unavailableSkillRepair);
						keepLease = true;
						yield* this.streamActingPass(
							unavailableSkillRepair,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					const reviewerMimicryRepair = initial
						? null
						: buildReviewerMimicryRepairRequest(request, calls);
					if (reviewerMimicryRepair) {
						state.setCurrentRequest(reviewerMimicryRepair);
						keepLease = true;
						yield* this.streamActingPass(
							reviewerMimicryRepair,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					const surfaceRepair = buildUnavailableSurfaceToolRepairRequest(
						request,
						calls,
						state.getAdmittedTools(),
						state.getSurfaceRepairContext()
					);
					if (surfaceRepair) {
						state.setCurrentRequest(surfaceRepair);
						keepLease = true;
						yield* this.streamActingPass(
							surfaceRepair,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					for (const call of calls) assertAllowlistedCall(call, request.tools);
					const disposition = reconcileSemanticDispositionCalls(
						calls,
						request.semanticDispositionGate === true
					);
					if (disposition.notice) {
						request = appendSystemInstruction(request, disposition.notice);
						state.setCurrentRequest(request);
					}
					calls = disposition.calls;
					const validationIssues = validateCompletedProviderCalls(
						calls,
						request,
						state.getAdmittedTools(),
						state.getLoadedTaskSchedules()
					);
					if (validationIssues.length === 0 && this.ports.documentEditPreview) {
						const previewed = await previewDocumentEditCalls(
							this.ports.documentEditPreview,
							calls,
							request
						);
						throwIfAborted(request.signal);
						validationIssues.push(...previewed.issues);
						state.recordDocumentEditPreviews(previewed.previews);
					}
					if (validationIssues.length === 0) {
						// SHA-bound batch approval takes precedence over the contract
						// gate: the calls the model just wrote are the artifact the
						// reviewer judges, so there is nothing to ask the model for
						// before review and nothing to ask it for after approval.
						const withheldBatch = state.takeWithheldMutationBatch(request, calls);
						if (withheldBatch && 'replayRepair' in withheldBatch) {
							state.setCurrentRequest(withheldBatch.replayRepair);
							keepLease = true;
							yield* this.streamActingPass(
								withheldBatch.replayRepair,
								usage,
								state,
								continuationOptions
							);
							return;
						}
						if (withheldBatch && 'replayRefusal' in withheldBatch) {
							yield textDelta(withheldBatch.fallback);
							this.ports.capacity.markAvailable(request.turnRunId);
							state.advance({ type: 'finish' });
							yield {
								type: 'finish',
								finishedReason: withheldBatch.finishedReason,
								usage
							};
							return;
						}
						if (withheldBatch) {
							keepLease = true;
							yield* streamMutationBatchReview(
								this.laneContext,
								request,
								state.getAdmittedTools(),
								withheldBatch.batch,
								withheldBatch.sha256,
								usage,
								state
							);
							return;
						}
						const preMutationSemanticDispositionGate =
							state.takePreMutationSemanticDispositionGate(request, calls);
						if (preMutationSemanticDispositionGate) {
							state.setCurrentRequest(preMutationSemanticDispositionGate);
							keepLease = true;
							yield* this.streamActingPass(
								preMutationSemanticDispositionGate,
								usage,
								state,
								continuationOptions
							);
							return;
						}
					}
					validationIssues.push(...state.validateApprovedMutations(calls));
					if (validationIssues.length > 0) {
						const invalidCalls = callsWithValidationIssues(calls, validationIssues);
						for (const call of invalidCalls) {
							const callIssues = validationIssuesForCall(call, validationIssues);
							yield buildValidationFailureReadToolStep(request, call, callIssues);
						}
						if (validationRepairRounds >= MAX_VALIDATION_REPAIR_ROUNDS) {
							// The rejected call never ran, so nothing durable depends on
							// it. End on a receipt-grounded prose answer rather than a
							// permanent failure the user sees as a generic stream error.
							state.setCurrentRequest(request);
							keepLease = true;
							state.advance({ type: 'budget', limit: 'force_synthesis' });
							yield* streamForcedSynthesis(
								this.laneContext,
								appendSystemInstruction(
									request,
									state.buildValidationRepairExhaustedInstruction(
										invalidCalls.map((call) => ({
											toolName: call.name,
											errors: validationIssuesForCall(
												call,
												validationIssues
											).flatMap((issue) => issue.errors)
										}))
									)
								),
								usage,
								state
							);
							return;
						}
						const validationFailureSha256 = createHash('sha256')
							.update(
								JSON.stringify(
									validationIssues
										.map((issue) =>
											JSON.stringify([
												issue.toolName,
												issue.op ?? null,
												[...issue.errors].sort()
											])
										)
										.sort()
								)
							)
							.digest('hex');
						// First rejection gets literal feedback on the warm route. Only
						// the same unresolved failure spends the remaining repair on a
						// different route. Removing an empty array is not progress.
						if (validationFailureSha256 === options.previousValidationFailureSha256) {
							this.ports.client.rejectRepeatedInvalidToolResponse?.(request);
						}
						const repairRequest = buildValidationRepairRequest(
							request,
							invalidCalls,
							validationIssues
						);
						state.setCurrentRequest(repairRequest);
						keepLease = true;
						yield* this.streamActingPass(repairRequest, usage, state, {
							phase: 'continuation',
							validationRepairRounds: validationRepairRounds + 1,
							previousValidationFailureSha256: validationFailureSha256,
							emitPlanningSemantic
						});
						continue;
					}
					if (
						holdAssistantText &&
						!holdAssistantTextForTurnContract &&
						assistantCandidate &&
						!callsIncludeSemanticDisposition(calls)
					) {
						yield textDelta(assistantCandidate);
					}
					const normalizedCalls = normalizeCompletedProviderCalls(request, calls);
					state.setPendingToolRound({ calls: normalizedCalls, usage });
					keepLease = true;
					if (emitPlanningSemantic) {
						yield buildPlanningStep(request, normalizedCalls[0]!.id);
					}
					for (const call of normalizedCalls) {
						yield buildProviderToolStep(request, call, state);
					}
					state.markToolRoundCompleted();
					continue;
				}
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError(
						request.toolChoice === 'none'
							? 'provider_tool_call_disabled'
							: 'provider_missing_tool_call',
						request.toolChoice === 'none' ? 'permanent' : 'unknown'
					);
				}
				if (!initial && request.toolChoice === 'required') {
					// A required control pass answered in prose. Nothing durable
					// happened, so the prose becomes a withheld candidate for one
					// tool-free answer instead of a permanent turn failure.
					state.setCurrentRequest(request);
					keepLease = true;
					state.advance({ type: 'budget', limit: 'force_synthesis' });
					yield* streamForcedSynthesis(
						this.laneContext,
						buildRequiredPassProseFallbackRequest(request, assistantCandidate),
						usage,
						state
					);
					return;
				}
				const requestCompletion = state.takeRequestCompletionContinuation(request);
				if (requestCompletion) {
					state.setCurrentRequest(requestCompletion);
					keepLease = true;
					yield* this.streamActingPass(
						requestCompletion,
						usage,
						state,
						continuationOptions
					);
					return;
				}
				const requestFallback = state.getRequestCompletionFallback();
				if (requestFallback) {
					yield textDelta(requestFallback);
					this.ports.capacity.markAvailable(request.turnRunId);
					state.advance({ type: 'finish' });
					yield { type: 'finish', finishedReason: 'mutation_unfulfilled', usage };
					return;
				}
				if (holdAssistantTextForTurnContract) {
					const carveOutRequest = state.takeTurnContractWriteCarveOut(request);
					if (carveOutRequest) {
						state.setCurrentRequest(carveOutRequest);
						keepLease = true;
						yield* this.streamActingPass(
							carveOutRequest,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					const completionRequest = state.takeContractCompletionContinuation(request);
					if (completionRequest) {
						state.setCurrentRequest(completionRequest);
						keepLease = true;
						yield* this.streamActingPass(
							completionRequest,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					// Nothing more to execute: release the withheld prose so the user
					// still gets the answer exactly once.
					if (assistantCandidate) {
						yield textDelta(assistantCandidate);
					}
				} else if (holdAssistantText && assistantCandidate) {
					yield textDelta(assistantCandidate);
				}
				if (!streamedText) {
					// An empty completion after saved writes turned case 2 of the
					// 2026-09-22 gate into a permanent failure. Re-ask once; a second
					// empty reply still fails the pass.
					const emptyReplyRepair = buildEmptyReplyRepairRequest(request);
					if (emptyReplyRepair) {
						state.setCurrentRequest(emptyReplyRepair);
						keepLease = true;
						yield* this.streamActingPass(
							emptyReplyRepair,
							usage,
							state,
							continuationOptions
						);
						return;
					}
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				const unsavedCommissionNotice = state.takeUnsavedCommissionNotice(request);
				if (unsavedCommissionNotice) {
					// Its own paragraph under the answer, whatever this pass emitted.
					yield state.textDelta(unsavedCommissionNotice, false);
				}
				this.ports.capacity.markAvailable(request.turnRunId);
				state.advance({ type: 'finish' });
				yield { type: 'finish', finishedReason, usage };
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLease) state.release();
		}
	}

	private async resolveLiveVision(request: ClientRequest): Promise<ClientRequest> {
		if (!request.liveVisionRequest) return request;
		if (!this.ports.liveVision) {
			throw providerError('provider_live_vision_unavailable', 'permanent');
		}
		const result = await this.ports.liveVision.resolve({
			...request.liveVisionRequest,
			signal: request.signal
		});
		throwIfAborted(request.signal);
		// Admission promised the model raw media for this turn. Continuing with
		// text-only content after every image failed resolution would both violate
		// that contract and invite a confident answer about pixels the model never
		// received.
		if (result.images.length === 0) {
			throw providerError('provider_live_vision_unavailable', 'permanent');
		}

		const messages = request.messages.map((message) => ({ ...message }));
		const currentUserMessage = messages.at(-1);
		if (currentUserMessage?.role !== 'user' || typeof currentUserMessage.content !== 'string') {
			throw providerError('provider_live_vision_message_invalid', 'permanent');
		}
		currentUserMessage.content = [
			{ type: 'text', text: currentUserMessage.content },
			...result.images.map((image) => ({
				type: 'image_url' as const,
				image_url: { url: image.signedUrl, detail: image.detail }
			}))
		];
		return { ...request, messages };
	}

	/**
	 * Execute the approved batch.
	 *
	 * No provider pass runs here. The calls are the ones the acting model
	 * streamed and the reviewer read, byte for byte, so this emits them as a
	 * tool round directly. Approving the batch is the only thing that can put
	 * calls on this path.
	 */
	private async *streamApprovedBatchExecution(
		request: ClientRequest,
		calls: readonly CompletedProviderToolCall[],
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let pendingExecution = false;
		try {
			const executionRequest = appendSystemInstruction(
				request,
				'Independent review approved this executable stage. Use its receipts to determine what succeeded. Continue any remaining work already commissioned by the user (for example, link newly created tasks using their returned IDs); propose that next stage for its own independent review. Never replay successful creates. call_ref/after order calls but do not substitute returned IDs. Correct a failed call only when its receipt proves no effect applied; do not retry uncertain effects. When the requested work is complete, answer from the receipts.'
			);
			const issues = [
				...validateCompletedProviderCalls(
					calls,
					executionRequest,
					state.getAdmittedTools(),
					state.getLoadedTaskSchedules()
				),
				...state.validateApprovedMutations(calls)
			];
			if (issues.length)
				throw providerError('provider_approved_batch_validation_failed', 'permanent');
			const normalizedCalls = normalizeCompletedProviderCalls(executionRequest, [...calls]);
			state.setPendingToolRound({ calls: normalizedCalls, usage: priorUsage });
			state.setCurrentRequest(executionRequest);
			// The executor persists tool_call and its activity before running each call.
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(executionRequest, call, state);
			}
			state.markToolRoundCompleted();
			pendingExecution = true;
		} finally {
			if (!pendingExecution) state.release();
		}
	}
}
