// apps/worker/src/workers/agentic-chat/provider/turn-provider.ts

import { createHash } from 'node:crypto';

import {
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	ContextGatheringLedger,
	type FastToolExecution,
	type LoadedTaskSchedule,
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
	isControlToolName,
	mergeTurnContracts,
	parseDeclaredTurnContract,
	resolveTurnContractOutcome,
	sanitizeAssistantFinalText,
	selectReadLoopRepairEscalation,
	turnContractCreatesProject
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
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../tools/execution-adapter';
import type { AgenticChatReadToolExecutionV1 } from '../toolExecution';
import type { AgenticChatLiveVisionResolverPortV1 } from '../liveVision';
import {
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from '../mutationToolCatalog';
import {
	buildContractCompletionRequest,
	buildTurnContractWriteCarveOutRequest
} from './review/contract-execution';
import {
	type ClarificationRender,
	type PendingProposalRevision,
	buildContractRevisionRequest,
	clarificationRenderSatisfied,
	readClarificationRender,
	readProposalRevision,
	renderClarificationText
} from './review/decision-handling';
import { completeTurnContractReviewDecision } from './review/decision-completion';
import {
	buildPostSemanticDispositionRequest,
	buildProjectCreateInitialContractGateRequest,
	buildSemanticTurnDispositionGateRequest,
	callsIncludeSemanticDisposition,
	canRequirePreMutationSemanticDisposition,
	isSemanticDispositionToolName,
	reconcileSemanticDispositionCalls,
	requestOffersSemanticDisposition
} from './review/disposition';
import { buildTurnContractReviewRequest } from './review/turn-contract';
import {
	type AgenticChatFeedbackToolCall as NormalizedProviderToolCall,
	completedProviderCallToChatToolCall,
	feedbackToChatToolResult,
	isFailedToolFeedback,
	isMutationFeedback,
	memoizeCompletedRead,
	resolveMemoServedExecution,
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
	type SurfaceRepairContext,
	buildPartialMutationBatchSynthesisInstruction,
	buildProviderPassBudgetSynthesisInstruction,
	buildRequiredPassProseFallbackRequest,
	buildReviewerMimicryRepairRequest,
	buildUnavailableSkillRepairRequest,
	buildUnavailableSurfaceToolRepairRequest,
	buildValidationRepairExhaustedSynthesisInstruction,
	contextSaturationRepairRank
} from './repair-policy';
import {
	appendSystemInstruction,
	buildBaseProviderRequest,
	buildContinuationRequest,
	buildPromptSnapshot,
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
	type TurnPhase,
	type TurnPhaseEvent,
	contractPending,
	dispositionPending,
	nextTurnPhase
} from './turn-phase';
import {
	callsWithValidationIssues,
	contractSha256,
	validateApprovedTurnContractMutations,
	validateCompletedProviderCalls,
	validationIssuesForCall
} from './validation';
import {
	type DirectWriteRouteContext,
	assessDirectWriteBatch,
	collectReadResultEntityRefs,
	directWriteContractInstruction,
	selectSingleHitEntityIds
} from './write-routing';

const DEFAULT_MAX_PROVIDER_ROUNDS = 16;
const MAX_VALIDATION_REPAIR_ROUNDS = 2;
const MAX_FORCED_SYNTHESIS_RETRIES = 1;
// A reviewer may return a flawed proposal to the acting model at most twice
// per turn. The review after the last allowed revision offers only approve /
// read-only / clarify, so a model that cannot correct itself still ends with
// the user, not in a loop. One revision proved too few: the first correction
// routinely fixes shape (lumped targets) and a second small flaw then had
// nowhere to go but the user.
const MAX_REVISIONS_PER_TURN = 2;
// Hard ceiling on model calls in one turn, counted at the single provider-pass
// entry (acting passes, repairs, reviews). Per-lane caps still bounded a turn
// only in combination with the wall-clock deadline: independently bounded
// ladders multiplied out to roughly eleven paid passes. At the ceiling the turn
// takes the forced-synthesis path and answers with an honest partial.
const MAX_PROVIDER_PASSES_PER_TURN = 12;

type PendingToolRound = {
	calls: readonly NormalizedProviderToolCall[];
	usage: AgenticChatProviderUsageV1 | null;
};

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

type ToolRoundStreamState = {
	turnRunId: string;
	release(): void;
	getAdmittedTools(): readonly AgenticChatTurnProviderToolV1[];
	recordProviderToolCalls(count: number): void;
	getProviderToolCallCount(): number;
	setPendingToolRound(value: PendingToolRound): void;
	getContractRevisionCount(): number;
	/** Count one model call at the single provider-pass entry. */
	recordProviderPass(): void;
	/** The turn has spent its whole provider-pass budget; only synthesis remains. */
	providerPassBudgetExhausted(): boolean;
	/** Receipt-grounded instruction for the answer that ends a capped turn. */
	buildProviderPassBudgetInstruction(): string;
	buildValidationRepairExhaustedInstruction(
		rejected: readonly { toolName: string; errors: readonly string[] }[]
	): string;
	markToolRoundCompleted(): void;
	setCurrentRequest(value: ClientRequest): void;
	resolveMemoServed(call: CompletedProviderToolCall): AgenticChatReadToolExecutionV1 | null;
	/** The phase the acting model is in and whether its contract is approved, for the one-shot surface repair. */
	getSurfaceRepairContext(): SurfaceRepairContext;
	/** Record an executed event in the turn state machine. */
	advance(event: TurnPhaseEvent): void;
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
	/** Scheduling values this turn's reads loaded, so a no-op reschedule fails validation. */
	getLoadedTaskSchedules(): ReadonlyMap<string, LoadedTaskSchedule>;
};

/**
 * Whether a partial answer from a dead synthesis attempt is worth showing. The
 * floor sits just above a disposable lead-in ("Here are", "Let me check"), which
 * is worse than an honest failure because it reads as a complete answer.
 */
function isUsableSynthesisPartial(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length < 20) return false;
	return normalized.split(' ').filter(Boolean).length >= 3;
}

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
			Boolean(this.ports.semanticReviewer),
			input.budget
		);
		const initialRequest = this.ports.semanticReviewer
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

		let released = false;
		let streamed = false;
		let pendingToolRound: PendingToolRound | null = null;
		let toolRoundCompleted = false;
		let currentRequest = initialRequest;
		let nextProviderRound = 2;
		let readOnlyRoundCount = 0;
		let providerToolCallCount = 0;
		let providerPassCount = 0;
		let readLoopRepairRank = 0;
		// Where the acting model is in the turn. Every precondition below is a
		// phase check; the contract lane keeps only the SHA-bound data next to it.
		// A project-create turn opens on the required gate rather than the surface.
		let phase: TurnPhase =
			initialRequest.semanticDispositionGate === true ? 'disposition_gate' : 'opening';
		const advance = (event: TurnPhaseEvent): void => {
			phase = nextTurnPhase(phase, event);
		};
		// The reviewer may downgrade a declared contract to read-only once per turn.
		let semanticDispositionCorrectionUsed = false;
		let turnContract: TurnContract | null = null;
		let pendingContractReviewSha256: string | null = null;
		let approvedContractSha256: string | null = null;
		let pendingProposalRevision: PendingProposalRevision | null = null;
		let contractRevisionCount = 0;
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
				phase !== 'mutating' ||
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
		// What the turn still owes the user when a budget ends it. Declared
		// outcomes no successful write fulfilled, in the contract's own words.
		const unfinishedContractOutcomeDescriptions = (): string[] => {
			if (!turnContract) return [];
			const resolution = resolveTurnContractOutcome({
				contract: turnContract,
				toolExecutions: turnToolExecutions
			});
			if (resolution.fulfilled) return [];
			return turnContract.outcomes
				.filter((_, index) => resolution.outcomes[index]?.fulfilled === false)
				.map((outcome) =>
					[
						outcome.action,
						outcome.entityKind,
						outcome.description ?? outcome.label ?? outcome.targetIds.join(', ')
					]
						.filter((part) => typeof part === 'string' && part.length > 0)
						.join(' ')
				);
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
		// Ids that a read this turn returned as the only entity of their kind
		// (id → kind). Together with the focus entity and the ids the user typed,
		// these are the targets the direct lane may update without a reviewer.
		const turnResolvedEntityIds = new Map<string, string>();
		// Every entity any read returned this turn (id → kind). A user-typed id is
		// trusted only in combination with this: the message proves the words, the
		// read proves the row.
		const turnSeenEntityIds = new Map<string, string>();
		// Scheduling values the turn's reads actually loaded (task id → due/start).
		// A reschedule to one of these changes nothing, so it is rejected before
		// execution instead of succeeding and being reported as a move.
		const turnTaskSchedules = new Map<string, LoadedTaskSchedule>();
		const currentUserMessage = executionInput.requestPayload.message;
		const directWriteContext = (value: ClientRequest): DirectWriteRouteContext => ({
			contextType: value.contextType,
			entityId: value.entityId,
			projectId: value.projectId,
			userMessage: typeof currentUserMessage === 'string' ? currentUserMessage : null,
			resolvedEntityIds: turnResolvedEntityIds,
			turnSeenEntityIds
		});
		// Read evidence and the read memo share one lifetime. Both describe the
		// world before this turn's writes, so a write invalidates both: a stale
		// single-hit id must not authorize a second unreviewed direct write after
		// the row it described has already changed.
		const clearTurnReadEvidence = (): void => {
			turnReadMemo.clear();
			turnResolvedEntityIds.clear();
			turnSeenEntityIds.clear();
			turnTaskSchedules.clear();
		};
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
					if (call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME) {
						// The declared contract is void; the acting model must re-declare
						// through the disposition gate, then pass review again. A typed
						// correction is re-recorded as the declaration when its round
						// returns, so it keeps the contract phase.
						const revision = readProposalRevision(call.arguments);
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						contractRevisionCount += 1;
						pendingProposalRevision = revision;
						advance({
							type: 'review',
							decision:
								revision.correctedContract && semanticReviewRequired
									? 'correct_contract'
									: 'revise_contract'
						});
						continue;
					}
					if (call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME) {
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						advance({ type: 'disposition', decision: 'clarification' });
						continue;
					}
					if (call.name === CANCEL_TURN_CONTRACT_TOOL_NAME) {
						turnContract = null;
						pendingContractReviewSha256 = null;
						approvedContractSha256 = null;
						advance({ type: 'disposition', decision: 'cancel' });
						continue;
					}
					if (call.name === DECLARE_READ_ONLY_TURN_TOOL_NAME) {
						advance({ type: 'review', decision: 'read_only' });
						continue;
					}
					if (call.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) continue;
					// A voluntary complex-write declaration satisfies the gate just as
					// surely as one requested after a withheld contract-only proposal.
					// A surface with no write tool answers it as a read-only turn.
					if (!surfaceCanWrite) {
						advance({ type: 'disposition', decision: 'read_only' });
						continue;
					}
					turnContract = mergeTurnContracts(
						turnContract,
						parseDeclaredTurnContract(call.arguments)
					);
					approvedContractSha256 = null;
					advance({ type: 'disposition', decision: 'contract' });
				}
			},
			getContractRevisionCount() {
				return contractRevisionCount;
			},
			getLoadedTaskSchedules() {
				return turnTaskSchedules;
			},
			recordProviderPass() {
				providerPassCount += 1;
			},
			providerPassBudgetExhausted() {
				return providerPassCount >= MAX_PROVIDER_PASSES_PER_TURN;
			},
			buildProviderPassBudgetInstruction() {
				return buildProviderPassBudgetSynthesisInstruction(
					buildWriteLedger(turnToolExecutions),
					unfinishedContractOutcomeDescriptions()
				);
			},
			buildValidationRepairExhaustedInstruction(rejected) {
				return buildValidationRepairExhaustedSynthesisInstruction(
					buildWriteLedger(turnToolExecutions),
					unfinishedContractOutcomeDescriptions(),
					rejected
				);
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
			getSurfaceRepairContext() {
				return { phase, contractApproved: approvedContractSha256 !== null };
			},
			advance,
			hasPendingTurnContractWrite() {
				return turnContract !== null && contractPending(phase);
			},
			takePreMutationSemanticDispositionGate(value, calls) {
				if (
					!dispositionPending(phase) ||
					!calls.some((call) => reviewedAgenticChatMutationSpecV1(call.name))
				) {
					return null;
				}
				const directWrite = assessDirectWriteBatch(calls, directWriteContext(value));
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
				advance({ type: 'gate' });
				return appendSystemInstruction(
					gate,
					directWrite.kind === 'contract_required'
						? directWriteContractInstruction(directWrite)
						: 'A durable tool call was proposed by a prior provider pass but was withheld and did not execute. Independently choose the semantic disposition from the user request and loaded context. Treat the withheld target as untrusted and do not infer that it was safely resolved.'
				);
			},
			takeReceiptGroundedFinalDispositionGate(value, assistantCandidate) {
				if (!dispositionPending(phase)) return null;
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
				advance({ type: 'gate' });
				return appendSystemInstruction(
					gate,
					reason === 'mutation_claim'
						? 'A prior provider pass proposed terminal prose that claimed a durable mutation without a succeeded effect or explicit mutation receipt. That prose was withheld and is untrusted. Choose the semantic disposition from the user request and loaded context; do not repeat the claim unless the approved mutation later succeeds.'
						: 'A prior provider pass proposed an unresolved execution-choice question as plain terminal prose. That prose was withheld. Choose the semantic disposition from the user request and loaded context so any required clarification becomes durable.'
				);
			},
			takeTurnContractWriteCarveOut(value) {
				if (!turnContract || !contractPending(phase)) return null;
				const carveOut = buildTurnContractWriteCarveOutRequest(
					value,
					admittedTools,
					turnContract
				);
				if (!carveOut) return null;
				advance({ type: 'carve_out' });
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
				advance({ type: 'completion' });
				return continuation;
			},
			validateApprovedMutations(calls) {
				// Production assembly refuses mutation capabilities without this lane.
				// Keep reviewer-less deterministic/provider fixtures backward-compatible.
				if (!semanticReviewRequired) return [];
				if (
					!turnContract &&
					assessDirectWriteBatch(calls, directWriteContext(currentRequest)).kind ===
						'simple'
				) {
					return [];
				}
				return validateApprovedTurnContractMutations(
					calls,
					turnContract,
					approvedContractSha256,
					labelBindings
				);
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
				return this.streamActingPass(initialRequest, null, state, { phase: 'initial' });
			},
			continueWithToolResults: (input) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
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
				// Some of this round's durable calls persisted and some did not.
				// Nothing here re-runs the failure — a retry of a write whose outcome
				// is unverified is how duplicates are born — so the closing answer
				// has to name both halves.
				const partialMutationBatch =
					completedToolRound.calls.some(
						(call, index) =>
							call.kind === 'mutation' && isMutationFeedback(input.results[index]!)
					) &&
					completedToolRound.calls.some(
						(call, index) =>
							call.kind === 'mutation' && isFailedToolFeedback(input.results[index]!)
					);
				const semanticDispositionToolName = completedToolRound.calls.find((call) =>
					isSemanticDispositionToolName(call.name)
				)?.name;
				const contractReviewApproval = completedToolRound.calls.find(
					(call) => call.name === APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME
				);
				if (roundContainsMutation) {
					clearTurnReadEvidence();
					advance({ type: 'tool_round', kind: 'mutation' });
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
					if (
						call.kind === 'read' &&
						!isControlToolName(call.name) &&
						!isMutationFeedback(feedback) &&
						!isFailedToolFeedback(feedback)
					) {
						const refs = collectReadResultEntityRefs(feedback.execution.result);
						for (const ref of refs) {
							const knownKind = turnSeenEntityIds.get(ref.id);
							if (knownKind === undefined || knownKind === 'entity') {
								turnSeenEntityIds.set(ref.id, ref.kind);
							}
							if (ref.schedule) {
								turnTaskSchedules.set(ref.id, {
									...turnTaskSchedules.get(ref.id),
									...ref.schedule
								});
							}
						}
						for (const [id, kind] of selectSingleHitEntityIds(
							refs,
							call.canonicalArguments
						)) {
							turnResolvedEntityIds.set(id, kind);
						}
					}
					return {
						toolCall: completedProviderCallToChatToolCall(call),
						result: feedbackToChatToolResult(call.id, feedback)
					};
				});
				turnToolExecutions.push(...roundExecutions);
				if (roundContainsMutation) refreshLabelBindings();
				const state = buildStreamState();
				const completedToolCalls = roundExecutions.map(({ toolCall }) => toolCall);
				const pattern = buildRoundToolPattern(completedToolCalls);
				for (const op of pattern.readOps) readOps.add(op);
				if (roundContainsMutation) {
					// A mutation round is progress. The read-loop ladder restarts, as
					// its own contract promises ("reset to 0 on any write round"), so
					// reads that preceded the contract cannot force the turn tool-free
					// right after its first write. Control-only rounds (declarations,
					// reviewer decisions) are neither reads nor writes and leave the
					// counters alone.
					readOnlyRoundCount = 0;
					readLoopRepairRank = 0;
				} else if (pattern.readOps.length > 0) {
					readOnlyRoundCount += 1;
					advance({ type: 'tool_round', kind: 'read' });
				} else {
					advance({ type: 'tool_round', kind: 'control' });
				}

				currentRequest = buildContinuationRequest(
					currentRequest,
					completedToolRound.calls,
					input.results
				);
				if (
					roundContainsMutation &&
					(request.contextType === 'project_create' ||
						turnContractCreatesProject(turnContract))
				) {
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
					// A prose-only revision still returns to the acting model through the
					// bounded repair path.
					pendingProposalRevision = null;
					if (proposalRevision.correctedContract && this.ports.semanticReviewer) {
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
					currentRequest = buildContractRevisionRequest(
						currentRequest,
						admittedTools,
						proposalRevision
					);
					pendingToolRound = null;
					toolRoundCompleted = false;
					nextProviderRound += 1;
					return this.streamActingPass(currentRequest, completedToolRound.usage, state, {
						phase: 'continuation'
					});
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
					advance({ type: 'review', decision: 'approve_contract' });
					const approvedExecutionRequest = buildPostSemanticDispositionRequest(
						currentRequest,
						admittedTools,
						DECLARE_TURN_CONTRACT_TOOL_NAME
					);
					// Shell-first execution belongs to the contract, not the surface:
					// a project created from the global surface needs the same narrow
					// create_onto_project pass before any child record can use its id.
					const projectCreateShellRequest =
						approvedExecutionRequest.contextType === 'project_create' ||
						turnContractCreatesProject(turnContract)
							? buildTurnContractWriteCarveOutRequest(
									approvedExecutionRequest,
									admittedTools,
									turnContract
								)
							: null;
					if (projectCreateShellRequest) advance({ type: 'carve_out' });
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
				const forceNoToolSynthesis =
					directSimpleMutationCompleted ||
					ledgerObservation.forceSynthesis ||
					readLoopRepairRank >= READ_LOOP_REPAIR_RANK.must_synthesize;
				const clarificationRequiresToolFreeSynthesis =
					semanticDispositionToolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
				// The clarification the executor accepted is the thing the user has
				// to see. Carry its structured question into the synthesis pass so a
				// prose answer that drops the question cannot silently replace it
				// with a promise to act (2026-09-03 document-edit battery).
				const clarificationRender = clarificationRequiresToolFreeSynthesis
					? readClarificationRender(
							completedToolRound.calls.find(
								(call) => call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME
							)?.arguments ?? {}
						)
					: null;
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
					// A batch that only half landed ends here: the failed call is
					// never re-proposed, so the closing answer is bound to the exact
					// receipts rather than to the batch the model intended. Same
					// receipt-grounded synthesis instruction the pass ceiling uses.
					if (partialMutationBatch) {
						currentRequest = appendSystemInstruction(
							currentRequest,
							buildPartialMutationBatchSynthesisInstruction(
								buildWriteLedger(turnToolExecutions)
							)
						);
					}
				}

				pendingToolRound = null;
				toolRoundCompleted = false;
				nextProviderRound += 1;
				if (
					clarificationRequiresToolFreeSynthesis ||
					(forceNoToolSynthesis && !contractWriteCarveOut && !contractCompletion)
				) {
					if (!clarificationRequiresToolFreeSynthesis) {
						advance({ type: 'budget', limit: 'force_synthesis' });
					}
					return this.streamForcedSynthesis(
						currentRequest,
						completedToolRound.usage,
						state,
						{ clarification: clarificationRender }
					);
				}
				return this.streamActingPass(currentRequest, completedToolRound.usage, state, {
					phase: 'continuation'
				});
			},
			invalidateReadMemo: () => clearTurnReadEvidence(),
			release
		};
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
		let assistantCandidate = '';
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
			holdAssistantTextForTurnContract ||
			(initial && canRequirePreMutationSemanticDisposition(request)) ||
			requestOffersSemanticDisposition(request);
		const toolCalls = createToolCallAccumulator();
		try {
			// The turn has spent its whole model budget. Everything already
			// executed is durable, so the turn ends with an honest partial answer
			// rather than another pass or a raw failure.
			if (state.providerPassBudgetExhausted()) {
				keepLease = true;
				state.advance({ type: 'budget', limit: 'force_synthesis' });
				yield* this.streamForcedSynthesis(
					appendSystemInstruction(request, state.buildProviderPassBudgetInstruction()),
					priorUsage,
					state
				);
				return;
			}
			if (initial) {
				request = await this.resolveLiveVision(request);
				state.setCurrentRequest(request);
			}
			for await (const event of this.providerPass(request, state)) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					if (holdAssistantText) continue;
					yield { type: 'text_delta', text: event.content };
					continue;
				}
				if (event.type === 'reasoning') {
					// Reasoning remains private and never enters assistant text or the
					// public event stream.
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
					if (
						holdAssistantText &&
						!holdAssistantTextForTurnContract &&
						assistantCandidate &&
						!callsIncludeSemanticDisposition(calls)
					) {
						yield { type: 'text_delta', text: assistantCandidate };
					}
					const validationIssues = [
						...validateCompletedProviderCalls(
							calls,
							request,
							state.getAdmittedTools(),
							state.getLoadedTaskSchedules()
						),
						...state.validateApprovedMutations(calls)
					];
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
							yield* this.streamForcedSynthesis(
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
					yield* this.streamForcedSynthesis(
						buildRequiredPassProseFallbackRequest(request, assistantCandidate),
						usage,
						state
					);
					return;
				}
				const receiptGroundedFinalDispositionGate =
					state.takeReceiptGroundedFinalDispositionGate(request, assistantCandidate);
				if (receiptGroundedFinalDispositionGate) {
					state.setCurrentRequest(receiptGroundedFinalDispositionGate);
					keepLease = true;
					yield* this.streamActingPass(
						receiptGroundedFinalDispositionGate,
						usage,
						state,
						continuationOptions
					);
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
						yield { type: 'text_delta', text: assistantCandidate };
					}
				} else if (holdAssistantText && assistantCandidate) {
					yield { type: 'text_delta', text: assistantCandidate };
				}
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
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
		if (state.providerPassBudgetExhausted()) {
			// No budget left to review, so no budget to execute what a review would
			// authorize. End the turn on what is already durable.
			state.advance({ type: 'budget', limit: 'force_synthesis' });
			yield* this.streamForcedSynthesis(
				appendSystemInstruction(request, state.buildProviderPassBudgetInstruction()),
				priorUsage,
				state
			);
			return;
		}
		const allowRevision = state.getContractRevisionCount() < MAX_REVISIONS_PER_TURN;
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
			for await (const event of this.providerPass(reviewRequest, state, reviewer)) {
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
				if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
					fallbackReason =
						'Independent semantic review did not return a control decision.';
				}
			}

			const calls = completeTurnContractReviewDecision({
				actingRequest: request,
				admittedTools: availableTools,
				reviewRequest,
				toolCalls,
				finished,
				finishedReason: reviewFinishedReason,
				fallbackReason,
				contract,
				contractReviewSha256,
				allowRevision
			});
			const normalizedCalls = normalizeCompletedProviderCalls(reviewRequest, calls);
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
				yield buildProviderToolStep(reviewRequest, call, state);
			}
			state.markToolRoundCompleted();
			pendingReviewTool = true;
		} finally {
			if (!pendingReviewTool) state.release();
		}
	}

	private async *streamForcedSynthesis(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState,
		options: { clarification?: ClarificationRender | null } = {}
	): AsyncGenerator<AgenticChatProviderStepV1> {
		const clarification = options.clarification ?? null;
		let currentRequest = forceToolFreeRequest(request);
		let accumulatedUsage = priorUsage;
		try {
			for (let retryCount = 0; retryCount <= MAX_FORCED_SYNTHESIS_RETRIES; retryCount += 1) {
				let finished = false;
				let requestedTools = false;
				let assistantCandidate = '';
				let finishedReason = 'stop';
				let passUsage: AgenticChatProviderUsageV1 | null = null;

				for await (const event of this.providerPass(currentRequest, state)) {
					throwIfAborted(currentRequest.signal);
					if (finished) throw providerError('provider_event_after_done', 'unknown');
					if (event.type === 'text') {
						if (!event.content) throw providerError('provider_empty_text', 'unknown');
						assistantCandidate += event.content;
						continue;
					}
					if (event.type === 'reasoning') continue;
					if (event.type === 'tool_call') {
						// This pass advertises no tools. The stray call is never
						// executed or replayed, but any prose already accumulated is a
						// real answer and is emitted below rather than discarded.
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
						// Everything this turn executed is already durable, and this
						// pass could execute nothing. When the dead attempt still wrote
						// a usable answer, the user gets it and the turn ends degraded
						// rather than failing and discarding work they paid for
						// (people-synthesis timeout, 2026-07-22).
						const recovered = sanitizeAssistantFinalText(assistantCandidate);
						if (isUsableSynthesisPartial(recovered)) {
							yield {
								type: 'text_delta',
								text:
									clarification &&
									!clarificationRenderSatisfied(recovered, clarification)
										? renderClarificationText(clarification)
										: recovered
							};
							state.advance({ type: 'finish' });
							yield {
								type: 'finish',
								finishedReason: 'synthesis_recovered',
								usage: accumulatedUsage
							};
							return;
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
					finished = true;
				}
				if (!finished) throw providerError('provider_missing_done', 'unknown');

				accumulatedUsage = combineUsage(accumulatedUsage, passUsage);
				const finalText = sanitizeAssistantFinalText(assistantCandidate);
				// A clarification pass owes the user the question, not a promise.
				// When the prose dropped it, the structured question is emitted
				// verbatim instead of failing or burning a retry on the same model.
				const emittedText =
					clarification && !clarificationRenderSatisfied(finalText, clarification)
						? renderClarificationText(clarification)
						: finalText;
				if (emittedText) {
					this.ports.capacity.markAvailable(request.turnRunId);
					yield { type: 'text_delta', text: emittedText };
					state.advance({ type: 'finish' });
					yield {
						type: 'finish',
						// The stray call is dropped, so the turn really did end in
						// prose; reporting `tool_calls` here would misname it.
						finishedReason: requestedTools ? 'stop' : finishedReason,
						usage: accumulatedUsage
					};
					return;
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
}
