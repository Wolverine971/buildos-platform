// apps/worker/src/workers/agentic-chat/provider/turn-provider.ts

import type { JsonObject } from '@buildos/shared-types';
import {
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	ContextGatheringLedger,
	type FastToolExecution,
	NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE,
	NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE,
	READ_LOOP_REPAIR_RANK,
	type ToolValidationIssue,
	type TurnContract,
	type TurnContractOutcome,
	bindTurnContractLabels,
	buildOrganizeCommissionRepairInstruction,
	buildReadLoopRepairInstruction,
	buildRoundToolPattern,
	buildWriteLedger,
	classifyReceiptGroundedAssistantDisposition,
	mergeTurnContracts,
	parseDeclaredTurnContract,
	resolveTurnContractOutcome,
	sanitizeAssistantFinalText,
	selectReadLoopRepairEscalation
} from '@buildos/agentic-chat-runtime/loop';
import {
	type AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientPortV1,
	type AgenticChatTurnProviderToolV1,
	type AgenticChatTurnProviderRequestV1 as ClientRequest
} from './contracts';
import { AgenticChatProviderCapacity, AgenticChatProviderCapacityError } from '../providerCapacity';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../readToolIdentity';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../tools/execution-adapter';
import type { AgenticChatReadToolExecutionV1 } from '../toolExecution';
import type { AgenticChatLiveVisionResolverPortV1 } from '../liveVision';
import type { AgenticChatWorkerSupervisorFactoryV1 } from '../workerSupervisor';
import type {
	AgenticChatSupervisorBlockedToolCallV1,
	AgenticChatSupervisorTerminalRequestV1
} from '../workerSupervisorDecisions';
import {
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from '../mutationToolCatalog';
import {
	buildContractCompletionRequest,
	buildTurnContractWriteCarveOutRequest
} from './review/contract-execution';
import {
	type PendingProposalRevision,
	buildContractRevisionRequest,
	buildMutationBatchRevisionRequest,
	readProposalRevision
} from './review/decision-handling';
import {
	completeMutationBatchReviewDecision,
	completeTurnContractReviewDecision
} from './review/decision-completion';
import {
	assertSemanticDispositionCalls,
	buildPostSemanticDispositionRequest,
	buildProjectCreateInitialContractGateRequest,
	buildSemanticTurnDispositionGateRequest,
	callsIncludeSemanticDisposition,
	canRequirePreMutationSemanticDisposition,
	isSemanticDispositionToolName,
	requestOffersSemanticDisposition
} from './review/disposition';
import {
	type PendingMutationBatchReview,
	buildMutationBatchReviewRequest,
	mutationBatchSha256
} from './review/mutation-batch';
import { buildTurnContractReviewRequest } from './review/turn-contract';
import {
	type AgenticChatFeedbackToolCall as NormalizedProviderToolCall,
	completedProviderCallToChatToolCall,
	feedbackToChatToolResult,
	isFailedToolFeedback,
	isMutationFeedback,
	memoizeCompletedRead,
	resolveMemoServedExecution,
	validateReadFeedback,
	validateToolFeedback
} from './feedback';
import {
	canonicalError,
	canonicalFinishedReason,
	normalizeUsage,
	providerError,
	throwIfAborted
} from './protocol';
import { streamBufferedProviderPass } from './provider-pass';
import {
	buildReviewerMimicryRepairRequest,
	buildUnavailableSkillRepairRequest,
	contextSaturationRepairRank
} from './repair-policy';
import {
	appendSystemInstruction,
	buildBaseProviderRequest,
	buildContinuationRequest,
	buildPromptSnapshot,
	buildSynthesisRequest,
	buildValidationRepairRequest,
	combineUsage,
	forceToolFreeRequest,
	getAdmissionContextUsage,
	latestToolPayloadChars
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
	AgenticChatProviderSupervisorRuntime,
	drainSupervisorSteps,
	observeSupervisorDurableToolResults,
	observeSupervisorPreExecutionFailure,
	observeSupervisorToolCalls,
	supervisorUsage
} from './supervisor-runtime';
import {
	callsWithValidationIssues,
	contractSha256,
	validateApprovedTurnContractMutations,
	validateCompletedProviderCalls,
	validationFailureError,
	validationIssuesForCall
} from './validation';
import { assessDirectWriteBatch, directWriteContractInstruction } from './write-routing';

const DEFAULT_MAX_PROVIDER_ROUNDS = 16;
const MAX_VALIDATION_REPAIR_ROUNDS = 2;
const MAX_FORCED_SYNTHESIS_RETRIES = 1;
// A reviewer may return a flawed proposal to the acting model at most twice per
// lane per turn. The review after the last allowed revision offers only
// approve / read-only / clarify, so a model that cannot correct itself still
// ends with the user, not in a loop. One revision proved too few: the first
// correction routinely fixes shape (lumped targets) and a second small flaw
// then had nowhere to go but the user.
const MAX_CONTRACT_REVISIONS_PER_TURN = 2;
const MAX_MUTATION_BATCH_REVISIONS_PER_TURN = 2;

type PendingToolRound = {
	calls: readonly NormalizedProviderToolCall[];
	usage: AgenticChatProviderUsageV1 | null;
};

type ToolRoundStreamState = {
	turnRunId: string;
	supervisor: AgenticChatProviderSupervisorRuntime | null;
	release(): void;
	getAdmittedTools(): readonly AgenticChatTurnProviderToolV1[];
	recordProviderToolCalls(count: number): void;
	getProviderToolCallCount(): number;
	setPendingToolRound(value: PendingToolRound): void;
	getContractRevisionCount(): number;
	getMutationBatchRevisionCount(): number;
	markToolRoundCompleted(): void;
	setCurrentRequest(value: ClientRequest): void;
	resolveMemoServed(call: CompletedProviderToolCall): AgenticChatReadToolExecutionV1 | null;
	hasPendingTurnContractWrite(): boolean;
	takePreMutationSemanticDispositionGate(
		request: ClientRequest,
		calls: readonly CompletedProviderToolCall[]
	): ClientRequest | null;
	takeReceiptGroundedFinalDispositionGate(
		request: ClientRequest,
		assistantCandidate: string
	): ClientRequest | null;
	takeTurnContractWriteCarveOut(request: ClientRequest): ClientRequest | null;
	/** An approved contract still has unfulfilled outcomes after a mutation round. */
	hasIncompleteApprovedContract(): boolean;
	/** One bounded pass that sends the model back to finish the approved contract. */
	takeContractCompletionContinuation(request: ClientRequest): ClientRequest | null;
	validateApprovedMutations(calls: readonly CompletedProviderToolCall[]): ToolValidationIssue[];
	stageMutationBatchReview(
		request: ClientRequest,
		calls: readonly CompletedProviderToolCall[],
		blockedToolCalls: ReadonlyMap<string, AgenticChatSupervisorBlockedToolCallV1>,
		usage: AgenticChatProviderUsageV1 | null
	): PendingMutationBatchReview | null;
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
 */
export class AgenticChatTurnProviderAdapter implements AgenticChatProviderPortV1 {
	constructor(
		private readonly ports: {
			client: AgenticChatTurnProviderClientPortV1;
			/** Distinct model lane that adjudicates proposed write contracts. */
			semanticReviewer?: AgenticChatTurnProviderClientPortV1;
			capacity: AgenticChatProviderCapacity;
			liveVision?: AgenticChatLiveVisionResolverPortV1;
			supervisorFactory?: AgenticChatWorkerSupervisorFactoryV1;
		},
		private readonly retryableFailureCooldownMs = 2_000,
		private readonly maxProviderRounds = DEFAULT_MAX_PROVIDER_ROUNDS,
		private readonly mutationCapabilities: Readonly<
			Partial<AgenticChatProviderMutationCapabilitiesV1>
		> = {}
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
			Boolean(this.ports.semanticReviewer)
		);
		const initialRequest = this.ports.semanticReviewer
			? (buildProjectCreateInitialContractGateRequest(request) ?? request)
			: request;
		const promptSnapshot = buildPromptSnapshot(initialRequest.messages, initialRequest.tools);
		const supervisor = this.ports.supervisorFactory
			? new AgenticChatProviderSupervisorRuntime(this.ports.supervisorFactory(executionInput))
			: null;
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

		let released = false;
		let streamed = false;
		let synthesized = false;
		let continued = false;
		let pendingToolRound: PendingToolRound | null = null;
		let toolRoundCompleted = false;
		let currentRequest = initialRequest;
		let nextProviderRound = 2;
		let readOnlyRoundCount = 0;
		let providerToolCallCount = 0;
		let readLoopRepairRank = 0;
		let mutationRoundReached = false;
		let semanticTurnDispositionGateUsed = false;
		let semanticDispositionCorrectionUsed = false;
		let contractWriteCarveOutUsed = false;
		let contractCompletionContinuationUsed = false;
		let turnContract: TurnContract | null = null;
		let pendingContractReviewSha256: string | null = null;
		let approvedContractSha256: string | null = null;
		let pendingMutationBatchReview: PendingMutationBatchReview | null = null;
		let pendingProposalRevision: PendingProposalRevision | null = null;
		let contractRevisionCount = 0;
		let mutationBatchRevisionCount = 0;
		// Every completed tool round this turn, so contract labels can bind to the
		// entities created in earlier rounds before later writes are authorized.
		const turnToolExecutions: FastToolExecution[] = [];
		let labelBindings: ReadonlyMap<string, string> = new Map();
		const refreshLabelBindings = (): void => {
			labelBindings = turnContract
				? bindTurnContractLabels(turnContract, buildWriteLedger(turnToolExecutions))
				: new Map();
		};
		// A surface with no reviewed mutation tool cannot honour a contract. The
		// control tools stay mounted (every web surface ships them and the signed
		// description tells the model to call declare_turn_contract early), but a
		// declaration on such a surface is answered with a read-only continuation
		// instead of two reviewer passes and a doomed write.
		const surfaceCanWrite = admittedTools.some((tool) =>
			reviewedAgenticChatMutationSpecV1(tool.function.name)
		);
		// After the first mutation round the write carve-out is spent, yet the
		// approved contract may still have outcomes left (create folders, then
		// move documents into them). The live organize failures all ended here:
		// folders created, moves never proposed, prose accepted. One bounded
		// continuation returns the model to the unfinished outcomes.
		const incompleteApprovedContractResolution = () => {
			if (
				!turnContract ||
				!approvedContractSha256 ||
				!mutationRoundReached ||
				contractCompletionContinuationUsed ||
				contractSha256(turnContract) !== approvedContractSha256
			) {
				return null;
			}
			const resolution = resolveTurnContractOutcome({
				contract: turnContract,
				toolExecutions: turnToolExecutions
			});
			if (resolution.fulfilled) return null;
			// Only outcomes no successful write has touched at all are sent back.
			// A partially or unverifiably executed outcome must never be re-run
			// from here: that is how duplicate writes would be born.
			const ledger = buildWriteLedger(turnToolExecutions);
			const touched = (outcome: TurnContractOutcome): boolean =>
				ledger.some(
					(entry) =>
						entry.status === 'success' &&
						Boolean(entry.entityKind) &&
						(outcome.entityKind === 'entity' ||
							entry.entityKind === outcome.entityKind) &&
						(outcome.targetIds.length === 0
							? entry.action === 'create'
							: Boolean(entry.entityId && outcome.targetIds.includes(entry.entityId)))
				);
			const untouched = turnContract.outcomes.some(
				(outcome, index) =>
					resolution.outcomes[index]?.fulfilled === false && !touched(outcome)
			);
			return untouched ? resolution : null;
		};
		const organizeExecutionInstruction = (): string | null => {
			if (!turnContract) return null;
			const organizesDocuments = turnContract.outcomes.some(
				(outcome) =>
					outcome.entityKind === 'document' &&
					(outcome.action === 'move' || outcome.action === 'organize')
			);
			return organizesDocuments
				? buildOrganizeCommissionRepairInstruction(turnToolExecutions)
				: null;
		};
		const semanticReviewRequired = Boolean(this.ports.semanticReviewer);
		const readOps = new Set<string>();
		// The executor clears this memo as soon as any call reaches the write
		// boundary (successful or not), matching the legacy invalidation fence.
		const turnReadMemo = new Map<string, AgenticChatReadToolExecutionV1>();
		const contextGatheringLedger = new ContextGatheringLedger();
		const admissionContextUsage = getAdmissionContextUsage(executionInput);
		const release = () => {
			if (released) return;
			released = true;
			lease.release();
		};
		const buildStreamState = (): ToolRoundStreamState => ({
			turnRunId: request.turnRunId,
			supervisor,
			release,
			getAdmittedTools: () => admittedTools,
			recordProviderToolCalls(count) {
				providerToolCallCount += count;
			},
			getProviderToolCallCount() {
				return providerToolCallCount;
			},
			setPendingToolRound(value) {
				pendingToolRound = value;
				for (const call of value.calls) {
					// A voluntary complex-write declaration satisfies the gate just as
					// surely as one requested after a withheld contract-only proposal.
					if (isSemanticDispositionToolName(call.name)) {
						semanticTurnDispositionGateUsed = true;
					}
					if (call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME) {
						const revision = readProposalRevision(call.arguments);
						if (pendingMutationBatchReview) {
							// The declared contract stays approved while its exact proposed
							// mutation batch returns to the acting model for correction.
							pendingMutationBatchReview = null;
							mutationBatchRevisionCount += 1;
							pendingProposalRevision = { kind: 'mutation_batch', ...revision };
						} else {
							// The declared contract is void; the acting model must re-declare
							// through the disposition gate, then pass review again.
							turnContract = null;
							pendingContractReviewSha256 = null;
							approvedContractSha256 = null;
							contractRevisionCount += 1;
							semanticTurnDispositionGateUsed = false;
							pendingProposalRevision = { kind: 'contract', ...revision };
						}
						continue;
					}
					if (call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME) {
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						pendingMutationBatchReview = null;
						continue;
					}
					if (call.name === CANCEL_TURN_CONTRACT_TOOL_NAME) {
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						pendingMutationBatchReview = null;
						continue;
					}
					if (call.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) continue;
					if (!surfaceCanWrite) continue;
					turnContract = mergeTurnContracts(
						turnContract,
						parseDeclaredTurnContract(call.arguments)
					);
					approvedContractSha256 = null;
				}
			},
			getContractRevisionCount() {
				return contractRevisionCount;
			},
			getMutationBatchRevisionCount() {
				return mutationBatchRevisionCount;
			},
			markToolRoundCompleted() {
				toolRoundCompleted = true;
			},
			setCurrentRequest(value) {
				currentRequest = value;
			},
			resolveMemoServed(call) {
				return resolveMemoServedExecution(turnReadMemo, call);
			},
			hasPendingTurnContractWrite() {
				return Boolean(turnContract && !contractWriteCarveOutUsed && !mutationRoundReached);
			},
			takePreMutationSemanticDispositionGate(value, calls) {
				if (
					semanticTurnDispositionGateUsed ||
					turnContract ||
					mutationRoundReached ||
					!calls.some((call) => reviewedAgenticChatMutationSpecV1(call.name))
				) {
					return null;
				}
				const directWrite = assessDirectWriteBatch(calls, value);
				if (directWrite.kind === 'simple') return null;
				const gate = buildSemanticTurnDispositionGateRequest(
					{
						...value,
						logicalProviderRound: value.logicalProviderRound + 1,
						providerRound: 'synthesis'
					},
					admittedTools
				);
				if (!gate) return null;
				return appendSystemInstruction(
					gate,
					directWrite.kind === 'contract_required'
						? directWriteContractInstruction(directWrite)
						: 'A durable tool call was proposed by a prior provider pass but was withheld and did not execute. Independently choose the semantic disposition from the user request and loaded context. Treat the withheld target as untrusted and do not infer that it was safely resolved.'
				);
			},
			takeReceiptGroundedFinalDispositionGate(value, assistantCandidate) {
				if (semanticTurnDispositionGateUsed || turnContract || mutationRoundReached) {
					return null;
				}
				const reason = classifyReceiptGroundedAssistantDisposition(assistantCandidate);
				if (!reason) return null;
				const gate = buildSemanticTurnDispositionGateRequest(
					{
						...value,
						logicalProviderRound: value.logicalProviderRound + 1,
						providerRound: 'synthesis'
					},
					admittedTools
				);
				if (!gate) return null;
				return appendSystemInstruction(
					gate,
					reason === 'mutation_claim'
						? 'A prior provider pass proposed terminal prose that claimed a durable mutation without a succeeded effect or explicit mutation receipt. That prose was withheld and is untrusted. Choose the semantic disposition from the user request and loaded context; do not repeat the claim unless the approved mutation later succeeds.'
						: 'A prior provider pass proposed an unresolved execution-choice question as plain terminal prose. That prose was withheld. Choose the semantic disposition from the user request and loaded context so any required clarification becomes durable.'
				);
			},
			takeTurnContractWriteCarveOut(value) {
				if (!turnContract || contractWriteCarveOutUsed || mutationRoundReached) {
					return null;
				}
				const carveOut = buildTurnContractWriteCarveOutRequest(
					value,
					admittedTools,
					turnContract
				);
				if (!carveOut) return null;
				contractWriteCarveOutUsed = true;
				const organizeInstruction = organizeExecutionInstruction();
				return organizeInstruction
					? appendSystemInstruction(carveOut, organizeInstruction)
					: carveOut;
			},
			hasIncompleteApprovedContract() {
				return incompleteApprovedContractResolution() !== null;
			},
			takeContractCompletionContinuation(value) {
				const resolution = incompleteApprovedContractResolution();
				if (!resolution || !turnContract) return null;
				const continuation = buildContractCompletionRequest(
					value,
					admittedTools,
					turnContract,
					resolution,
					labelBindings
				);
				if (!continuation) return null;
				contractCompletionContinuationUsed = true;
				return continuation;
			},
			validateApprovedMutations(calls) {
				// Production assembly refuses mutation capabilities without this lane.
				// Keep reviewer-less deterministic/provider fixtures backward-compatible.
				if (!semanticReviewRequired) return [];
				if (
					!turnContract &&
					assessDirectWriteBatch(calls, currentRequest).kind === 'simple'
				) {
					return [];
				}
				return validateApprovedTurnContractMutations(
					calls,
					turnContract,
					approvedContractSha256,
					labelBindings
				);
			},
			stageMutationBatchReview(value, calls, blockedToolCalls, usage) {
				if (
					!semanticReviewRequired ||
					!calls.some((call) => reviewedAgenticChatMutationSpecV1(call.name))
				) {
					return null;
				}
				if (pendingMutationBatchReview) {
					throw providerError('provider_mutation_review_reused', 'permanent');
				}
				if (!turnContract && assessDirectWriteBatch(calls, value).kind === 'simple') {
					return null;
				}
				const batchSha256 = mutationBatchSha256(calls);
				if (!turnContract || !approvedContractSha256) {
					throw providerError('provider_mutation_review_without_contract', 'permanent');
				}
				pendingMutationBatchReview = {
					batchSha256,
					calls,
					blockedToolCalls,
					authorization: {
						contract: turnContract,
						contractSha256: approvedContractSha256,
						labelBindings
					},
					reviewTools: admittedTools,
					request: value,
					usage
				};
				return pendingMutationBatchReview;
			}
		});
		return {
			promptSnapshot,
			stream: () => {
				if (released) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_released',
						'unknown',
						'Agentic Chat provider invocation was released before streaming'
					);
				}
				if (streamed) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_reused',
						'unknown',
						'Agentic Chat provider invocation is single-use'
					);
				}
				streamed = true;
				const state = buildStreamState();
				state.supervisor?.start();
				return this.streamInitial(initialRequest, state);
			},
			synthesize: (feedback) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (!streamed || !pendingToolRound || !toolRoundCompleted) {
					throw providerError('provider_read_synthesis_not_ready', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_synthesis_reused', 'unknown');
				}
				if (continued) {
					throw providerError(
						'provider_read_synthesis_unavailable_after_continuation',
						'unknown'
					);
				}
				if (pendingToolRound.calls.length !== 1) {
					throw providerError('provider_read_synthesis_result_count_invalid', 'unknown');
				}
				const pendingCall = pendingToolRound.calls[0]!;
				if (pendingCall.kind !== 'read') {
					throw providerError('provider_mutating_tool_disabled', 'permanent');
				}
				validateReadFeedback(pendingCall, feedback);
				synthesized = true;
				const state = buildStreamState();
				observeSupervisorDurableToolResults(state, [pendingCall], [feedback]);
				state.supervisor?.observe({
					type: 'tool_round_completed',
					round: 1,
					toolCallsMade: state.getProviderToolCallCount()
				});
				const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
				if (supervisorQuestion) {
					return this.streamSupervisorQuestion(
						supervisorQuestion,
						pendingToolRound.usage,
						state
					);
				}
				const baseSynthesisRequest = buildSynthesisRequest(
					currentRequest,
					pendingCall,
					feedback
				);
				const directives = state.supervisor?.applyProviderDirectives(baseSynthesisRequest);
				const synthesisRequest = directives?.request ?? baseSynthesisRequest;
				return directives?.forceSynthesis
					? this.streamForcedSynthesis(synthesisRequest, pendingToolRound.usage, state)
					: this.streamSynthesis(synthesisRequest, pendingToolRound.usage, state);
			},
			continueWithToolResults: (input) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_continuation_reused', 'unknown');
				}
				if (!streamed || !pendingToolRound || !toolRoundCompleted) {
					throw providerError('provider_read_continuation_not_ready', 'unknown');
				}
				if (input.round !== nextProviderRound) {
					throw providerError('provider_read_continuation_round_mismatch', 'unknown');
				}
				if (input.results.length !== pendingToolRound.calls.length) {
					throw providerError(
						'provider_read_continuation_result_count_invalid',
						'unknown'
					);
				}

				continued = true;
				const completedToolRound = pendingToolRound;
				const roundContainsMutation = completedToolRound.calls.some(
					(call) => call.kind === 'mutation'
				);
				// A contract-free mutation round is the one bounded direct-write lane.
				// Its continuation is tool-free so the model cannot split a complex
				// request into several individually small batches.
				const directSimpleMutationCompleted =
					!turnContract &&
					completedToolRound.calls.some(
						(call, index) =>
							call.kind === 'mutation' && isMutationFeedback(input.results[index]!)
					);
				const semanticDispositionToolName = completedToolRound.calls.find((call) =>
					isSemanticDispositionToolName(call.name)
				)?.name;
				const contractReviewApproval = completedToolRound.calls.find(
					(call) => call.name === APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME
				);
				const mutationBatchReviewApproval = completedToolRound.calls.find(
					(call) => call.name === APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME
				);
				if (roundContainsMutation) {
					turnReadMemo.clear();
					mutationRoundReached = true;
				}
				const roundExecutions = completedToolRound.calls.map((call, index) => {
					const feedback = input.results[index]!;
					validateToolFeedback(call, feedback);
					if (
						!roundContainsMutation &&
						call.kind === 'read' &&
						!isMutationFeedback(feedback) &&
						!isFailedToolFeedback(feedback)
					) {
						memoizeCompletedRead(turnReadMemo, call, feedback.execution);
					}
					return {
						toolCall: completedProviderCallToChatToolCall(call),
						result: feedbackToChatToolResult(call.id, feedback)
					};
				});
				turnToolExecutions.push(...roundExecutions);
				if (roundContainsMutation) refreshLabelBindings();
				const state = buildStreamState();
				observeSupervisorDurableToolResults(state, completedToolRound.calls, input.results);
				state.supervisor?.observe({
					type: 'tool_round_completed',
					round: input.round - 1,
					toolCallsMade: state.getProviderToolCallCount()
				});
				const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
				if (supervisorQuestion) {
					pendingToolRound = null;
					toolRoundCompleted = false;
					return this.streamSupervisorQuestion(
						supervisorQuestion,
						completedToolRound.usage,
						state
					);
				}
				const completedToolCalls = roundExecutions.map(({ toolCall }) => toolCall);
				const pattern = buildRoundToolPattern(completedToolCalls);
				for (const op of pattern.readOps) readOps.add(op);
				if (pattern.readOps.length > 0) readOnlyRoundCount += 1;

				currentRequest = buildContinuationRequest(
					currentRequest,
					completedToolRound.calls,
					input.results
				);
				if (roundContainsMutation && request.contextType === 'project_create') {
					// The shell receipt carries the new project id. Switch surfaces before
					// asking the acting model for another pass so the shell cannot be
					// duplicated and child calls can use that durable id immediately.
					const completionRequest =
						state.takeContractCompletionContinuation(currentRequest);
					if (completionRequest) currentRequest = completionRequest;
				}
				const proposalRevision = pendingProposalRevision;
				if (
					proposalRevision &&
					completedToolRound.calls.some(
						(call) => call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME
					)
				) {
					// A contract reviewer can return a complete typed correction. Record
					// that exact contract and independently review its SHA again without
					// paying the acting model to regenerate the same JSON from prose.
					// Mutation-batch corrections and legacy prose-only contract revisions
					// still return to the acting model through the bounded repair path.
					pendingProposalRevision = null;
					if (
						proposalRevision.kind === 'contract' &&
						proposalRevision.correctedContract &&
						this.ports.semanticReviewer
					) {
						turnContract = proposalRevision.correctedContract;
						approvedContractSha256 = null;
						pendingContractReviewSha256 = contractSha256(turnContract);
						pendingToolRound = null;
						toolRoundCompleted = false;
						nextProviderRound += 1;
						return this.streamTurnContractReview(
							currentRequest,
							admittedTools,
							turnContract,
							pendingContractReviewSha256,
							false,
							completedToolRound.usage,
							state
						);
					}
					currentRequest =
						proposalRevision.kind === 'contract'
							? buildContractRevisionRequest(
									currentRequest,
									admittedTools,
									proposalRevision
								)
							: buildMutationBatchRevisionRequest(
									currentRequest,
									admittedTools,
									proposalRevision
								);
					pendingToolRound = null;
					toolRoundCompleted = false;
					nextProviderRound += 1;
					return this.streamContinuation(currentRequest, completedToolRound.usage, state);
				}
				if (contractReviewApproval) {
					const approvalIndex = completedToolRound.calls.indexOf(contractReviewApproval);
					const approvalFeedback = input.results[approvalIndex];
					const approvalResult =
						approvalFeedback &&
						!isFailedToolFeedback(approvalFeedback) &&
						!isMutationFeedback(approvalFeedback)
							? approvalFeedback.execution.result
							: null;
					if (
						!pendingContractReviewSha256 ||
						contractReviewApproval.arguments.contract_sha256 !==
							pendingContractReviewSha256 ||
						approvalResult?.status !== 'turn_contract_review_approved' ||
						approvalResult.contract_sha256 !== pendingContractReviewSha256 ||
						!turnContract
					) {
						throw providerError(
							'provider_turn_contract_review_identity_mismatch',
							'permanent'
						);
					}
					pendingContractReviewSha256 = null;
					approvedContractSha256 = approvalResult.contract_sha256;
					const approvedExecutionRequest = buildPostSemanticDispositionRequest(
						currentRequest,
						admittedTools,
						DECLARE_TURN_CONTRACT_TOOL_NAME
					);
					const projectCreateShellRequest =
						approvedExecutionRequest.contextType === 'project_create'
							? buildTurnContractWriteCarveOutRequest(
									approvedExecutionRequest,
									admittedTools,
									turnContract
								)
							: null;
					if (projectCreateShellRequest) contractWriteCarveOutUsed = true;
					currentRequest = appendSystemInstruction(
						projectCreateShellRequest ?? approvedExecutionRequest,
						'Independent semantic review approved the exact declared contract. Execute only that contract; do not broaden or substitute its targets or values.'
					);
					const organizeInstruction = organizeExecutionInstruction();
					if (organizeInstruction) {
						currentRequest = appendSystemInstruction(
							currentRequest,
							organizeInstruction
						);
					}
				} else if (
					semanticDispositionToolName === DECLARE_TURN_CONTRACT_TOOL_NAME &&
					!surfaceCanWrite
				) {
					currentRequest = appendSystemInstruction(
						buildPostSemanticDispositionRequest(
							currentRequest,
							admittedTools,
							DECLARE_READ_ONLY_TURN_TOOL_NAME
						),
						'This surface cannot change project data: no write tool is available in this turn. Answer from the loaded reads, and if the user asked for a change, say plainly that it was not made and what they can do instead. Do not call or mention any write tool.'
					);
				} else if (semanticDispositionToolName) {
					if (
						semanticDispositionToolName === DECLARE_READ_ONLY_TURN_TOOL_NAME &&
						pendingContractReviewSha256
					) {
						// A contract reviewer may discover that the acting model mistook
						// future context (for example, research that will inform a later
						// change) for a mutation commissioned in this turn. Void the false
						// contract before independently reviewing the safer read-only
						// disposition; otherwise the stale contract would keep finalization
						// on the mutation path even after the reviewer corrected it.
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						pendingMutationBatchReview = null;
						semanticDispositionCorrectionUsed = true;
					}
					currentRequest = buildPostSemanticDispositionRequest(
						currentRequest,
						admittedTools,
						semanticDispositionToolName
					);
				}
				if (
					semanticDispositionToolName === DECLARE_TURN_CONTRACT_TOOL_NAME &&
					this.ports.semanticReviewer &&
					turnContract
				) {
					pendingToolRound = null;
					toolRoundCompleted = false;
					nextProviderRound += 1;
					pendingContractReviewSha256 = contractSha256(turnContract);
					return this.streamTurnContractReview(
						currentRequest,
						admittedTools,
						turnContract,
						pendingContractReviewSha256,
						!semanticDispositionCorrectionUsed,
						completedToolRound.usage,
						state
					);
				}
				if (mutationBatchReviewApproval) {
					const approvalIndex = completedToolRound.calls.indexOf(
						mutationBatchReviewApproval
					);
					const approvalFeedback = input.results[approvalIndex];
					const approvalResult =
						approvalFeedback &&
						!isFailedToolFeedback(approvalFeedback) &&
						!isMutationFeedback(approvalFeedback)
							? approvalFeedback.execution.result
							: null;
					const reviewedBatch = pendingMutationBatchReview;
					if (
						!reviewedBatch ||
						mutationBatchReviewApproval.arguments.batch_sha256 !==
							reviewedBatch.batchSha256 ||
						approvalResult?.status !== 'mutation_batch_review_approved' ||
						approvalResult.batch_sha256 !== reviewedBatch.batchSha256
					) {
						throw providerError(
							'provider_mutation_batch_review_identity_mismatch',
							'permanent'
						);
					}
					pendingMutationBatchReview = null;
					currentRequest = appendSystemInstruction(
						currentRequest,
						'Independent semantic review approved this exact mutation batch. Execute the SHA-bound calls without rewriting, broadening, or substituting them.'
					);
					pendingToolRound = null;
					toolRoundCompleted = false;
					nextProviderRound += 1;
					return this.streamApprovedMutationBatch(
						{ ...reviewedBatch, usage: completedToolRound.usage },
						state
					);
				}
				const ledgerObservation = contextGatheringLedger.observeToolRound({
					roundExecutions,
					roundPattern: pattern,
					toolRounds: readOnlyRoundCount,
					maxToolRounds: this.maxProviderRounds,
					modelPayloadChars: latestToolPayloadChars(currentRequest),
					liveContextUsage: admissionContextUsage
				});
				if (ledgerObservation.message) {
					currentRequest = appendSystemInstruction(
						currentRequest,
						ledgerObservation.message
					);
				}
				readLoopRepairRank = Math.max(
					readLoopRepairRank,
					contextSaturationRepairRank(ledgerObservation.status.status)
				);
				const roundsRemaining = Math.max(0, this.maxProviderRounds - readOnlyRoundCount);
				const escalation = selectReadLoopRepairEscalation({
					readOnlyRoundCount,
					roundsRemaining
				});
				if (escalation && READ_LOOP_REPAIR_RANK[escalation] > readLoopRepairRank) {
					readLoopRepairRank = READ_LOOP_REPAIR_RANK[escalation];
					currentRequest = appendSystemInstruction(
						currentRequest,
						buildReadLoopRepairInstruction([...readOps].sort(), {
							level: escalation,
							roundsRemaining
						})
					);
				}
				const supervisorDirectives =
					state.supervisor?.applyProviderDirectives(currentRequest);
				if (supervisorDirectives) currentRequest = supervisorDirectives.request;
				if (supervisorDirectives?.forceSynthesis) {
					readLoopRepairRank = Math.max(
						readLoopRepairRank,
						READ_LOOP_REPAIR_RANK.must_synthesize
					);
				}
				const forceNoToolSynthesis =
					directSimpleMutationCompleted ||
					ledgerObservation.forceSynthesis ||
					readLoopRepairRank >= READ_LOOP_REPAIR_RANK.must_synthesize;
				const clarificationRequiresToolFreeSynthesis =
					semanticDispositionToolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
				const contractWriteCarveOut = forceNoToolSynthesis
					? state.takeTurnContractWriteCarveOut(currentRequest)
					: null;
				// Read-loop escalation is monotonic, so a turn that read a lot before
				// its contract is forced tool-free after its first mutation round —
				// exactly where the organize folders were created and the moves never
				// proposed. An approved contract with untouched outcomes gets its one
				// write-only completion pass instead of a tool-free answer.
				const contractCompletion =
					forceNoToolSynthesis && !contractWriteCarveOut
						? state.takeContractCompletionContinuation(currentRequest)
						: null;
				if (contractWriteCarveOut) {
					currentRequest = contractWriteCarveOut;
				} else if (contractCompletion) {
					currentRequest = contractCompletion;
				} else if (forceNoToolSynthesis) {
					currentRequest = forceToolFreeRequest(currentRequest);
				}

				pendingToolRound = null;
				toolRoundCompleted = false;
				nextProviderRound += 1;
				return clarificationRequiresToolFreeSynthesis ||
					(forceNoToolSynthesis && !contractWriteCarveOut && !contractCompletion)
					? this.streamForcedSynthesis(currentRequest, completedToolRound.usage, state)
					: this.streamContinuation(currentRequest, completedToolRound.usage, state);
			},
			invalidateReadMemo: () => turnReadMemo.clear(),
			release
		};
	}

	private providerPass(
		request: ClientRequest,
		client: AgenticChatTurnProviderClientPortV1 = this.ports.client
	) {
		return streamBufferedProviderPass(
			request,
			client,
			this.ports.capacity,
			this.retryableFailureCooldownMs
		);
	}

	private async *streamInitial(
		request: ClientRequest,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForSynthesis = false;
		let streamedText = false;
		let assistantCandidate = '';
		const holdAssistantTextForMutationGate = canRequirePreMutationSemanticDisposition(request);
		// Provider passes are fully buffered upstream, so deferring the text flush
		// to pass end costs no latency. Holding lets a pass that ends in a semantic
		// disposition control call withhold its prose: the post-disposition pass
		// owns the final answer, and flushing both doubled the reply in production.
		const holdAssistantText =
			holdAssistantTextForMutationGate || requestOffersSemanticDisposition(request);
		const toolCalls = createToolCallAccumulator();
		try {
			yield* drainSupervisorSteps(state.supervisor);
			request = await this.resolveLiveVision(request);
			state.setCurrentRequest(request);
			for await (const event of this.providerPass(request)) {
				throwIfAborted(request.signal);
				if (finished) {
					throw providerError('provider_event_after_done', 'unknown');
				}
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					if (holdAssistantText) continue;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') {
					// Reasoning remains private and never enters assistant text or the
					// public event stream in the thin read-only slice.
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
				const usage = normalizeUsage(event.usage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(usage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				// Judge the pass before parsing what it produced. A pass that stopped
				// for any reason other than tool calls left its arguments unfinished,
				// and reporting that as malformed JSON hides a recoverable condition
				// behind a permanent protocol error.
				// Initial project-create requests can now start in a required semantic
				// disposition gate. Reject calls only when tools are actually disabled;
				// both `auto` and `required` are valid tool-enabled initial policies.
				assertToolCallFinishReason(toolCalls, finishedReason, request.toolChoice, 'none');
				const calls = completeToolCalls(toolCalls, request.tools, {
					finishedReason,
					completionBudgetExhausted: finishedReason === 'length'
				});
				finished = true;
				if (calls.length > 0) {
					const unavailableSkillRepair = buildUnavailableSkillRepairRequest(
						request,
						calls,
						state.getAdmittedTools()
					);
					if (unavailableSkillRepair) {
						state.setCurrentRequest(unavailableSkillRepair);
						keepLeaseForSynthesis = true;
						yield* this.streamContinuation(unavailableSkillRepair, usage, state);
						return;
					}
					for (const call of calls) assertAllowlistedCall(call, request.tools);
					assertSemanticDispositionCalls(calls, request.semanticDispositionGate === true);
					const preMutationSemanticDispositionGate =
						state.takePreMutationSemanticDispositionGate(request, calls);
					if (preMutationSemanticDispositionGate) {
						state.setCurrentRequest(preMutationSemanticDispositionGate);
						keepLeaseForSynthesis = true;
						yield* this.streamContinuation(
							preMutationSemanticDispositionGate,
							usage,
							state
						);
						return;
					}
					if (
						holdAssistantText &&
						assistantCandidate &&
						!callsIncludeSemanticDisposition(calls)
					) {
						yield { type: 'text_delta', text: assistantCandidate };
						state.supervisor?.observe({
							type: 'assistant_text_delta',
							chars: assistantCandidate.length
						});
						yield* drainSupervisorSteps(state.supervisor);
					}
					const blockedToolCalls = observeSupervisorToolCalls(state, calls);
					yield* drainSupervisorSteps(state.supervisor);
					const executableCalls = calls.filter((call) => !blockedToolCalls.has(call.id));
					const validationIssues = [
						...validateCompletedProviderCalls(
							executableCalls,
							request,
							state.getAdmittedTools()
						),
						...state.validateApprovedMutations(executableCalls)
					];
					if (validationIssues.length > 0) {
						const invalidCalls = callsWithValidationIssues(calls, validationIssues);
						for (const call of invalidCalls) {
							const callIssues = validationIssuesForCall(call, validationIssues);
							yield buildValidationFailureReadToolStep(
								request.turnRunId,
								call,
								callIssues
							);
							observeSupervisorPreExecutionFailure(
								state,
								call,
								validationFailureError(callIssues),
								request.logicalProviderRound
							);
						}
						const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
						if (supervisorQuestion) {
							yield* this.streamSupervisorQuestion(supervisorQuestion, usage, state);
							continue;
						}
						let repairRequest = buildValidationRepairRequest(
							request,
							invalidCalls,
							validationIssues
						);
						const directives = state.supervisor?.applyProviderDirectives(repairRequest);
						if (directives) repairRequest = directives.request;
						state.setCurrentRequest(repairRequest);
						keepLeaseForSynthesis = true;
						yield* directives?.forceSynthesis
							? this.streamForcedSynthesis(repairRequest, usage, state)
							: this.streamContinuation(repairRequest, usage, state, 1, true);
						continue;
					}
					const mutationBatchReview = state.stageMutationBatchReview(
						request,
						calls,
						blockedToolCalls,
						usage
					);
					if (mutationBatchReview) {
						state.setCurrentRequest(request);
						keepLeaseForSynthesis = true;
						yield* this.streamMutationBatchReview(mutationBatchReview, state);
						return;
					}
					const normalizedCalls = normalizeCompletedProviderCalls(
						request,
						calls,
						blockedToolCalls
					);
					state.setPendingToolRound({
						calls: normalizedCalls,
						usage
					});
					keepLeaseForSynthesis = true;
					yield buildPlanningStep(request, normalizedCalls[0]!.id);
					for (const call of normalizedCalls) {
						yield buildProviderToolStep(request.turnRunId, call, state);
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
				const receiptGroundedFinalDispositionGate =
					state.takeReceiptGroundedFinalDispositionGate(request, assistantCandidate);
				if (receiptGroundedFinalDispositionGate) {
					state.setCurrentRequest(receiptGroundedFinalDispositionGate);
					keepLeaseForSynthesis = true;
					yield* this.streamContinuation(
						receiptGroundedFinalDispositionGate,
						usage,
						state
					);
					return;
				}
				if (holdAssistantText && assistantCandidate) {
					yield { type: 'text_delta', text: assistantCandidate };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: assistantCandidate.length
					});
					yield* drainSupervisorSteps(state.supervisor);
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable(request.turnRunId);
				yield {
					type: 'finish',
					finishedReason,
					usage
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForSynthesis) state.release();
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
	 * A proposed write contract is an untrusted model output. A distinct model
	 * lane reviews the exact contract against the original turn record before
	 * any write tool is restored. Its approve/clarify decision crosses the same
	 * durable tool-result fence as every other control call.
	 */
	private async *streamTurnContractReview(
		request: ClientRequest,
		availableTools: readonly AgenticChatTurnProviderToolV1[],
		contract: TurnContract,
		contractReviewSha256: string,
		allowDispositionCorrection: boolean,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		const reviewer = this.ports.semanticReviewer;
		if (!reviewer) throw providerError('provider_semantic_reviewer_unavailable', 'permanent');
		const allowRevision = state.getContractRevisionCount() < MAX_CONTRACT_REVISIONS_PER_TURN;
		const allowReadOnlyCorrection =
			allowDispositionCorrection && state.getContractRevisionCount() === 0;
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			availableTools,
			contract,
			contractReviewSha256,
			allowReadOnlyCorrection,
			allowRevision
		);
		const toolCalls = createToolCallAccumulator();
		let finished = false;
		let reviewerUsage: AgenticChatProviderUsageV1 | null = null;
		let fallbackReason: string | null = null;
		let reviewFinishedReason: string | null = null;
		let pendingReviewTool = false;
		try {
			yield {
				type: 'semantic',
				transitionId: createStableAgenticChatReadToolTransitionIdV1({
					turnRunId: request.turnRunId,
					// Keyed by attempt as well as content: the acting model may re-declare
					// an identical contract after a revision, and the second review's
					// durable transition must not collide with the first.
					providerToolCallId: `contract-review:${contractReviewSha256}:${request.logicalProviderRound}`,
					stage: 'planning'
				}),
				phase: 'stream',
				eventType: 'agent_state',
				currentActivity: 'Checking the requested change...',
				eventPayload: {
					type: 'agent_state',
					state: 'thinking',
					contextType: request.contextType,
					details: 'Checking the requested change...',
					activity_visibility: 'activity_log',
					semantic_review: { contract_sha256: contractReviewSha256 }
				}
			};
			for await (const event of this.providerPass(reviewRequest, reviewer)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'reasoning' || event.type === 'text') continue;
				if (event.type === 'tool_call') {
					appendToolCallDelta(toolCalls, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					fallbackReason = `Independent semantic review was unavailable: ${canonicalError(event.error)}`;
					break;
				}

				finished = true;
				reviewerUsage = normalizeUsage(event.usage);
				const finishedReason = canonicalFinishedReason(event.finishedReason);
				reviewFinishedReason = finishedReason;
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: reviewRequest.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(reviewerUsage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
					fallbackReason =
						'Independent semantic review did not return a control decision.';
				}
			}

			const calls = completeTurnContractReviewDecision({
				actingRequest: request,
				reviewRequest,
				toolCalls,
				finished,
				finishedReason: reviewFinishedReason,
				fallbackReason,
				contract,
				contractReviewSha256,
				allowRevision
			});
			const blockedToolCalls = observeSupervisorToolCalls(state, calls);
			yield* drainSupervisorSteps(state.supervisor);
			const normalizedCalls = normalizeCompletedProviderCalls(
				reviewRequest,
				calls,
				blockedToolCalls
			);
			state.setPendingToolRound({
				calls: normalizedCalls,
				usage: combineUsage(priorUsage, reviewerUsage)
			});
			// Keep the main agent's request as the continuation base. The durable
			// reviewer call/result is appended by continueWithToolResults, while the
			// reviewer's private system prompt never contaminates the acting model.
			state.setCurrentRequest(request);
			yield buildPlanningStep(reviewRequest, normalizedCalls[0]!.id);
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(request.turnRunId, call, state);
			}
			state.markToolRoundCompleted();
			pendingReviewTool = true;
		} finally {
			if (!pendingReviewTool) state.release();
		}
	}

	/**
	 * A reviewed semantic contract is still not a capability grant. The acting
	 * model can choose concrete values only after reads and prior writes, so a
	 * distinct model reviews each exact proposed mutation batch immediately
	 * before execution. One SHA-bound decision covers the whole parallel batch.
	 */
	private async *streamMutationBatchReview(
		pending: PendingMutationBatchReview,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		const reviewer = this.ports.semanticReviewer;
		if (!reviewer) throw providerError('provider_semantic_reviewer_unavailable', 'permanent');
		const allowRevision =
			state.getMutationBatchRevisionCount() < MAX_MUTATION_BATCH_REVISIONS_PER_TURN;
		const reviewRequest = buildMutationBatchReviewRequest(pending, allowRevision);
		const toolCalls = createToolCallAccumulator();
		let finished = false;
		let reviewerUsage: AgenticChatProviderUsageV1 | null = null;
		let fallbackReason: string | null = null;
		let reviewFinishedReason: string | null = null;
		let pendingReviewTool = false;
		try {
			yield {
				type: 'semantic',
				transitionId: createStableAgenticChatReadToolTransitionIdV1({
					turnRunId: pending.request.turnRunId,
					// Keyed by attempt as well as content (see contract review above).
					providerToolCallId: `mutation-review:${pending.batchSha256}:${pending.request.logicalProviderRound}`,
					stage: 'planning'
				}),
				phase: 'stream',
				eventType: 'agent_state',
				currentActivity: 'Checking the exact changes...',
				eventPayload: {
					type: 'agent_state',
					state: 'thinking',
					contextType: pending.request.contextType,
					details: 'Checking the exact changes...',
					activity_visibility: 'activity_log',
					semantic_review: { mutation_batch_sha256: pending.batchSha256 }
				}
			};
			for await (const event of this.providerPass(reviewRequest, reviewer)) {
				throwIfAborted(pending.request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'reasoning' || event.type === 'text') continue;
				if (event.type === 'tool_call') {
					appendToolCallDelta(toolCalls, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					fallbackReason = `Independent mutation review was unavailable: ${canonicalError(event.error)}`;
					break;
				}

				finished = true;
				reviewerUsage = normalizeUsage(event.usage);
				const finishedReason = canonicalFinishedReason(event.finishedReason);
				reviewFinishedReason = finishedReason;
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: reviewRequest.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(reviewerUsage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
					fallbackReason =
						'Independent mutation review did not return a control decision.';
				}
			}

			const calls = completeMutationBatchReviewDecision({
				actingRequest: pending.request,
				reviewRequest,
				toolCalls,
				finished,
				finishedReason: reviewFinishedReason,
				fallbackReason,
				batchSha256: pending.batchSha256,
				allowRevision
			});
			const blockedToolCalls = observeSupervisorToolCalls(state, calls);
			yield* drainSupervisorSteps(state.supervisor);
			const normalizedCalls = normalizeCompletedProviderCalls(
				reviewRequest,
				calls,
				blockedToolCalls
			);
			state.setPendingToolRound({
				calls: normalizedCalls,
				usage: combineUsage(pending.usage, reviewerUsage)
			});
			// Keep the acting request as the continuation base. The reviewer's
			// private prompt never enters the acting model's conversation.
			state.setCurrentRequest(pending.request);
			yield buildPlanningStep(reviewRequest, normalizedCalls[0]!.id);
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(pending.request.turnRunId, call, state);
			}
			state.markToolRoundCompleted();
			pendingReviewTool = true;
		} finally {
			if (!pendingReviewTool) state.release();
		}
	}

	private async *streamApprovedMutationBatch(
		pending: PendingMutationBatchReview,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let pendingToolExecution = false;
		try {
			const normalizedCalls = normalizeCompletedProviderCalls(
				pending.request,
				pending.calls,
				pending.blockedToolCalls
			);
			state.setPendingToolRound({ calls: normalizedCalls, usage: pending.usage });
			yield buildPlanningStep(pending.request, normalizedCalls[0]!.id);
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(pending.request.turnRunId, call, state);
			}
			state.markToolRoundCompleted();
			pendingToolExecution = true;
		} finally {
			if (!pendingToolExecution) state.release();
		}
	}

	private async *streamContinuation(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState,
		validationRepairRounds = 0,
		emitPlanningSemantic = false
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForContinuation = false;
		let streamedText = false;
		let assistantCandidate = '';
		const holdAssistantTextForTurnContract =
			state.hasPendingTurnContractWrite() ||
			state.hasIncompleteApprovedContract() ||
			request.semanticDispositionGate === true;
		// See streamInitial: prose emitted alongside a semantic disposition call is
		// withheld so the post-disposition pass answers exactly once.
		const holdAssistantText =
			holdAssistantTextForTurnContract || requestOffersSemanticDisposition(request);
		const toolCalls = createToolCallAccumulator();
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for await (const event of this.providerPass(request)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					if (holdAssistantText) continue;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') continue;
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
				// See streamInitial: the finish reason decides whether the assembled
				// arguments can be trusted, so it is consulted before they are parsed.
				assertToolCallFinishReason(toolCalls, finishedReason, request.toolChoice, 'none');
				const calls = completeToolCalls(toolCalls, request.tools, {
					finishedReason,
					completionBudgetExhausted: finishedReason === 'length'
				});
				const passUsage = normalizeUsage(event.usage);
				const aggregateUsage = combineUsage(priorUsage, passUsage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(passUsage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				finished = true;
				if (calls.length > 0) {
					const unavailableSkillRepair = buildUnavailableSkillRepairRequest(
						request,
						calls,
						state.getAdmittedTools()
					);
					if (unavailableSkillRepair) {
						state.setCurrentRequest(unavailableSkillRepair);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							unavailableSkillRepair,
							aggregateUsage,
							state,
							validationRepairRounds,
							emitPlanningSemantic
						);
						return;
					}
					const reviewerMimicryRepair = buildReviewerMimicryRepairRequest(request, calls);
					if (reviewerMimicryRepair) {
						state.setCurrentRequest(reviewerMimicryRepair);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							reviewerMimicryRepair,
							aggregateUsage,
							state,
							validationRepairRounds,
							emitPlanningSemantic
						);
						return;
					}
					for (const call of calls) assertAllowlistedCall(call, request.tools);
					assertSemanticDispositionCalls(calls, request.semanticDispositionGate === true);
					const preMutationSemanticDispositionGate =
						state.takePreMutationSemanticDispositionGate(request, calls);
					if (preMutationSemanticDispositionGate) {
						state.setCurrentRequest(preMutationSemanticDispositionGate);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							preMutationSemanticDispositionGate,
							aggregateUsage,
							state,
							validationRepairRounds,
							emitPlanningSemantic
						);
						return;
					}
					if (
						holdAssistantText &&
						!holdAssistantTextForTurnContract &&
						assistantCandidate &&
						!callsIncludeSemanticDisposition(calls)
					) {
						yield { type: 'text_delta', text: assistantCandidate };
						state.supervisor?.observe({
							type: 'assistant_text_delta',
							chars: assistantCandidate.length
						});
						yield* drainSupervisorSteps(state.supervisor);
					}
					const blockedToolCalls = observeSupervisorToolCalls(state, calls);
					yield* drainSupervisorSteps(state.supervisor);
					const executableCalls = calls.filter((call) => !blockedToolCalls.has(call.id));
					const validationIssues = [
						...validateCompletedProviderCalls(
							executableCalls,
							request,
							state.getAdmittedTools()
						),
						...state.validateApprovedMutations(executableCalls)
					];
					if (validationIssues.length > 0) {
						const invalidCalls = callsWithValidationIssues(calls, validationIssues);
						for (const call of invalidCalls) {
							const callIssues = validationIssuesForCall(call, validationIssues);
							yield buildValidationFailureReadToolStep(
								request.turnRunId,
								call,
								callIssues
							);
							observeSupervisorPreExecutionFailure(
								state,
								call,
								validationFailureError(callIssues),
								request.logicalProviderRound
							);
						}
						const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
						if (supervisorQuestion) {
							yield* this.streamSupervisorQuestion(
								supervisorQuestion,
								aggregateUsage,
								state
							);
							continue;
						}
						if (validationRepairRounds >= MAX_VALIDATION_REPAIR_ROUNDS) {
							throw providerError(
								'provider_tool_validation_repair_exhausted',
								'permanent'
							);
						}
						let repairRequest = buildValidationRepairRequest(
							request,
							invalidCalls,
							validationIssues
						);
						const directives = state.supervisor?.applyProviderDirectives(repairRequest);
						if (directives) repairRequest = directives.request;
						state.setCurrentRequest(repairRequest);
						keepLeaseForContinuation = true;
						yield* directives?.forceSynthesis
							? this.streamForcedSynthesis(repairRequest, aggregateUsage, state)
							: this.streamContinuation(
									repairRequest,
									aggregateUsage,
									state,
									validationRepairRounds + 1,
									emitPlanningSemantic
								);
						continue;
					}
					const mutationBatchReview = state.stageMutationBatchReview(
						request,
						calls,
						blockedToolCalls,
						aggregateUsage
					);
					if (mutationBatchReview) {
						state.setCurrentRequest(request);
						keepLeaseForContinuation = true;
						yield* this.streamMutationBatchReview(mutationBatchReview, state);
						return;
					}
					const normalizedCalls = normalizeCompletedProviderCalls(
						request,
						calls,
						blockedToolCalls
					);
					state.setPendingToolRound({ calls: normalizedCalls, usage: aggregateUsage });
					keepLeaseForContinuation = true;
					if (emitPlanningSemantic) {
						yield buildPlanningStep(request, normalizedCalls[0]!.id);
					}
					for (const call of normalizedCalls) {
						yield buildProviderToolStep(request.turnRunId, call, state);
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
				if (request.toolChoice === 'required') {
					throw providerError('provider_missing_tool_call', 'permanent');
				}
				const receiptGroundedFinalDispositionGate =
					state.takeReceiptGroundedFinalDispositionGate(request, assistantCandidate);
				if (receiptGroundedFinalDispositionGate) {
					state.setCurrentRequest(receiptGroundedFinalDispositionGate);
					keepLeaseForContinuation = true;
					yield* this.streamContinuation(
						receiptGroundedFinalDispositionGate,
						aggregateUsage,
						state,
						validationRepairRounds,
						emitPlanningSemantic
					);
					return;
				}
				if (holdAssistantTextForTurnContract) {
					const carveOutRequest = state.takeTurnContractWriteCarveOut(request);
					if (carveOutRequest) {
						state.setCurrentRequest(carveOutRequest);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							carveOutRequest,
							aggregateUsage,
							state,
							validationRepairRounds,
							emitPlanningSemantic
						);
						return;
					}
					const completionRequest = state.takeContractCompletionContinuation(request);
					if (completionRequest) {
						state.setCurrentRequest(completionRequest);
						keepLeaseForContinuation = true;
						yield* this.streamContinuation(
							completionRequest,
							aggregateUsage,
							state,
							validationRepairRounds,
							emitPlanningSemantic
						);
						return;
					}
					// Nothing more to execute: release the withheld prose so the user
					// still gets the answer exactly once.
					if (assistantCandidate) {
						yield { type: 'text_delta', text: assistantCandidate };
						state.supervisor?.observe({
							type: 'assistant_text_delta',
							chars: assistantCandidate.length
						});
						yield* drainSupervisorSteps(state.supervisor);
					}
				} else if (holdAssistantText && assistantCandidate) {
					yield { type: 'text_delta', text: assistantCandidate };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: assistantCandidate.length
					});
					yield* drainSupervisorSteps(state.supervisor);
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable(request.turnRunId);
				yield { type: 'finish', finishedReason, usage: aggregateUsage };
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForContinuation) state.release();
		}
	}

	private async *streamForcedSynthesis(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let currentRequest = forceToolFreeRequest(request);
		let accumulatedUsage = priorUsage;
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for (let retryCount = 0; retryCount <= MAX_FORCED_SYNTHESIS_RETRIES; retryCount += 1) {
				let finished = false;
				let requestedTools = false;
				let assistantCandidate = '';
				let finishedReason = 'stop';
				let passUsage: AgenticChatProviderUsageV1 | null = null;

				for await (const event of this.providerPass(currentRequest)) {
					throwIfAborted(currentRequest.signal);
					if (finished) throw providerError('provider_event_after_done', 'unknown');
					if (event.type === 'text') {
						if (!event.content) throw providerError('provider_empty_text', 'unknown');
						assistantCandidate += event.content;
						continue;
					}
					if (event.type === 'reasoning') continue;
					if (event.type === 'tool_call') {
						// This pass advertises no tools. Buffer and discard the entire
						// candidate, then give the provider one bounded tool-free retry.
						requestedTools = true;
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

					finishedReason = canonicalFinishedReason(event.finishedReason);
					requestedTools ||=
						finishedReason === 'tool_calls' || finishedReason === 'function_call';
					passUsage = normalizeUsage(event.usage);
					state.supervisor?.observe({
						type: 'llm_pass_completed',
						pass: currentRequest.logicalProviderRound,
						finishedReason,
						usage: supervisorUsage(passUsage)
					});
					yield* drainSupervisorSteps(state.supervisor);
					finished = true;
				}
				if (!finished) throw providerError('provider_missing_done', 'unknown');

				accumulatedUsage = combineUsage(accumulatedUsage, passUsage);
				const finalText = sanitizeAssistantFinalText(assistantCandidate);
				if (!requestedTools) {
					if (finalText) {
						this.ports.capacity.markAvailable(request.turnRunId);
						yield { type: 'text_delta', text: finalText };
						state.supervisor?.observe({
							type: 'assistant_text_delta',
							chars: finalText.length
						});
					}
					state.supervisor?.observe({
						type: 'final_candidate',
						text: finalText,
						finishedReason
					});
					yield* drainSupervisorSteps(state.supervisor);
					if (finalText) {
						yield { type: 'finish', finishedReason, usage: accumulatedUsage };
						return;
					}
				}

				if (retryCount >= MAX_FORCED_SYNTHESIS_RETRIES) {
					throw providerError('provider_forced_synthesis_failed', 'permanent');
				}
				currentRequest = appendSystemInstruction(
					{
						...currentRequest,
						logicalProviderRound: currentRequest.logicalProviderRound + 1,
						providerAttempt: undefined
					},
					requestedTools
						? NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
						: NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE
				);
			}
		} finally {
			state.release();
		}
	}

	private async *streamSupervisorQuestion(
		terminal: Extract<AgenticChatSupervisorTerminalRequestV1, { kind: 'ask_user' }>,
		usage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		try {
			yield* drainSupervisorSteps(state.supervisor);
			this.ports.capacity.markAvailable(state.turnRunId);
			yield {
				type: 'supervisor_question',
				transitionId: terminal.transitionId,
				sequence: terminal.sequence,
				executionGeneration: terminal.executionGeneration,
				reason: terminal.reason,
				question: terminal.question,
				checkpoint: {
					digest: terminal.checkpoint.digest as unknown as JsonObject,
					resumeContext: terminal.checkpoint.resumeContext as JsonObject,
					supervisorDecision: terminal.supervisorDecision
				},
				finishedReason: terminal.finishedReason,
				usage
			};
		} finally {
			state.release();
		}
	}

	private async *streamSynthesis(
		request: ClientRequest,
		initialUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let streamedText = false;
		let assistantCandidate = '';
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for await (const event of this.providerPass(request)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') continue;
				if (event.type === 'tool_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
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
				const usage = normalizeUsage(event.usage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(usage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				finished = true;
				this.ports.capacity.markAvailable(request.turnRunId);
				yield {
					type: 'finish',
					finishedReason,
					usage: combineUsage(initialUsage, usage)
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			state.release();
		}
	}
}
