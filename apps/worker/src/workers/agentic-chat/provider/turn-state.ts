// apps/worker/src/workers/agentic-chat/provider/turn-state.ts

import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	ContextGatheringLedger,
	type FastToolExecution,
	type LoadedTaskSchedule,
	type MutationBatch,
	type ToolValidationIssue,
	type TurnContract,
	type TurnContractOutcome,
	bindTurnContractLabels,
	buildMutationBatch,
	buildOrganizeCommissionRepairInstruction,
	buildRoundToolPattern,
	buildWriteLedger,
	classifyReceiptGroundedAssistantDisposition,
	doesToolExecutionRequireUserAction,
	extractReviewedRequestExpectation,
	isControlToolName,
	mergeTurnContracts,
	mutationBatchSha256,
	parseDeclaredTurnContract,
	parseRequestExpectation,
	requestExpectationsMatch,
	resolveTurnContractOutcome,
	serializeMutationBatchForReview,
	serializeTurnContractForDeclaration,
	turnContractCreatesProject
} from '@buildos/agentic-chat-runtime/loop';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderToolRoundInputV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderToolV1,
	type AgenticChatTurnProviderRequestV1 as ClientRequest
} from './contracts';
import type { AgenticChatProviderCapacityLeaseV1 } from './provider-capacity';
import type { AgenticChatReadToolExecutionV1 } from '../tools/tool-execution';
import { reviewedAgenticChatMutationSpecV1 } from '../mutations/tool-catalog';
import {
	buildContractCompletionRequest,
	buildTurnContractWriteCarveOutRequest
} from './review/contract-execution';
import {
	type ClarificationRender,
	type PendingProposalRevision,
	buildContractRevisionRequest,
	readClarificationRender,
	readProposalRevision
} from './review/decision-handling';
import {
	buildPostSemanticDispositionRequest,
	buildSemanticTurnDispositionGateRequest,
	isSemanticDispositionToolName
} from './review/disposition';
import { buildMutationBatchRevisionRequest } from './review/mutation-batch';
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
import { providerError } from './protocol';
import type { DocumentEditPreviewV1 } from './document-edit-preview';
import { TurnCreateReplayGuard, createReplayRepairInstruction } from './create-replay';
import {
	type SurfaceRepairContext,
	buildPartialMutationBatchSynthesisInstruction,
	buildProviderPassBudgetSynthesisInstruction,
	buildValidationRepairExhaustedSynthesisInstruction,
	renderDirectWriteReceipt,
	renderWriteReceiptFallback
} from './repair-policy';
import {
	appendSystemInstruction,
	buildContinuationRequest,
	forceToolFreeRequest,
	getAdmissionContextUsage,
	latestToolPayloadChars
} from './request-builders';
import type { CompletedProviderToolCall } from './stream-tool-calls';
import {
	type TurnPhase,
	type TurnPhaseEvent,
	contractPending,
	dispositionPending,
	nextTurnPhase
} from './turn-phase';
import { contractSha256, validateApprovedTurnContractMutations } from './validation';
import {
	type DirectWriteRouteContext,
	assessDirectWriteBatch,
	collectAttachedProjectAssetIds,
	collectReadResultEntityRefs,
	directWriteContractInstruction,
	selectSingleHitEntityIds
} from './write-routing';

// A reviewer may return a flawed proposal to the acting model at most twice
// per turn. The review after the last allowed revision offers only approve /
// read-only / clarify, so a model that cannot correct itself still ends with
// the user, not in a loop. One revision proved too few: the first correction
// routinely fixes shape (lumped targets) and a second small flaw then had
// nowhere to go but the user.
export const MAX_REVISIONS_PER_TURN = 2;
// Hard ceiling on model calls in one turn, counted at the single provider-pass
// entry (acting passes, repairs, reviews). Per-lane caps still bounded a turn
// only in combination with the wall-clock deadline: independently bounded
// ladders multiplied out to roughly eleven paid passes. At the ceiling the turn
// takes the forced-synthesis path and answers with an honest partial.
export const MAX_PROVIDER_PASSES_PER_TURN = 12;

export type PendingToolRound = {
	calls: readonly NormalizedProviderToolCall[];
	usage: AgenticChatProviderUsageV1 | null;
};

export type ToolRoundStreamState = {
	turnRunId: string;
	release(): void;
	getAdmittedTools(): readonly AgenticChatTurnProviderToolV1[];
	setPendingToolRound(value: PendingToolRound): void;
	getContractRevisionCount(): number;
	/** Count one model call at the single provider-pass entry. */
	recordProviderPass(): void;
	/** The turn has spent its whole provider-pass budget; only synthesis remains. */
	providerPassBudgetExhausted(): boolean;
	/** Receipt-grounded instruction for the answer that ends a capped turn. */
	buildProviderPassBudgetInstruction(): string;
	renderWriteReceiptFallback(introduction?: string): string | null;
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
	/**
	 * Hold a complex write batch for SHA-bound review. Returns the held batch
	 * and its digest, or null when the batch takes the direct lane, the lane is
	 * off, or no reviewer exists.
	 */
	takeWithheldMutationBatch(
		request: ClientRequest,
		calls: readonly CompletedProviderToolCall[]
	):
		| { batch: MutationBatch; sha256: string }
		| { replayRepair: ClientRequest }
		| { replayRefusal: true; fallback: string; finishedReason: 'stop' | 'mutation_unfulfilled' }
		| null;
	getHeldMutationBatch(): {
		batch: MutationBatch;
		calls: readonly CompletedProviderToolCall[];
		sha256: string;
	} | null;
	getBatchRevisionCount(): number;
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
	getRequestExpectation(): TurnContract | null;
	takeRequestCompletionContinuation(request: ClientRequest): ClientRequest | null;
	getRequestCompletionFallback(): string | null;
	validateApprovedMutations(calls: readonly CompletedProviderToolCall[]): ToolValidationIssue[];
	/** Scheduling values this turn's reads loaded, so a no-op reschedule fails validation. */
	getLoadedTaskSchedules(): ReadonlyMap<string, LoadedTaskSchedule>;
	/** Verified document-edit previews by provider call id, for the batch reviewer. */
	recordDocumentEditPreviews(previews: ReadonlyMap<string, DocumentEditPreviewV1>): void;
	getDocumentEditPreviews(): ReadonlyMap<string, DocumentEditPreviewV1>;
	/**
	 * The one way a pass emits prose. Text from different passes is one reply
	 * to the user, so the first text of a pass is separated from the previous
	 * pass's text when that ended mid-line ("Let me check…" + "That task…").
	 */
	textDelta(text: string, continuesPass: boolean): AgenticChatProviderStepV1;
};

/**
 * The lane that streams after a completed tool round. The state decides; the
 * coordinator owns every stream, so it maps each lane onto its generator.
 */
export type ToolRoundContinuation =
	| {
			lane: 'acting_pass';
			request: ClientRequest;
			usage: AgenticChatProviderUsageV1 | null;
	  }
	| { lane: 'review_exhaustion'; usage: AgenticChatProviderUsageV1 | null }
	| {
			lane: 'turn_contract_review';
			request: ClientRequest;
			availableTools: readonly AgenticChatTurnProviderToolV1[];
			contract: TurnContract;
			contractReviewSha256: string;
			allowDispositionCorrection: boolean;
			usage: AgenticChatProviderUsageV1 | null;
	  }
	| {
			lane: 'approved_batch_execution';
			request: ClientRequest;
			calls: readonly CompletedProviderToolCall[];
			usage: AgenticChatProviderUsageV1 | null;
	  }
	| {
			lane: 'forced_synthesis';
			request: ClientRequest;
			usage: AgenticChatProviderUsageV1 | null;
			clarification: ClarificationRender | null;
	  }
	/** A simple direct write fully landed: its ledger receipt closes the turn without a model pass. */
	| { lane: 'direct_write_receipt'; text: string; usage: AgenticChatProviderUsageV1 | null };

export type ProviderTurnStateInit = {
	/** The base request built at preparation (turn identity and surface context). */
	baseRequest: ClientRequest;
	/** The request the opening pass sends; the continuation base until it changes. */
	initialRequest: ClientRequest;
	admittedTools: readonly AgenticChatTurnProviderToolV1[];
	executionInput: AgenticChatProviderInputV1['executionInput'];
	/** The capacity reservation this invocation holds until release. */
	lease: AgenticChatProviderCapacityLeaseV1;
	/** A distinct reviewer lane exists for this turn. */
	semanticReviewRequired: boolean;
	mutationBatchLaneEnabled: boolean;
	maxProviderRounds: number;
	/**
	 * AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT: a simple direct write that fully
	 * landed closes on ledger receipt text instead of a tool-free model pass.
	 */
	directWriteReceiptTextEnabled?: boolean;
};

type HeldMutationBatch = {
	batch: MutationBatch;
	calls: readonly CompletedProviderToolCall[];
	sha256: string;
};

/**
 * Everything one prepared provider invocation knows about its turn: the phase
 * machine, contract and batch review bindings, read evidence, the write
 * ledger, and the round and pass counters. The coordinator creates one per
 * invocation and hands it to every stream as `ToolRoundStreamState`; tool-round
 * completion (`completeToolRound`) returns the next lane to stream.
 */
export class ProviderTurnState implements ToolRoundStreamState {
	readonly turnRunId: string;

	private readonly baseRequest: ClientRequest;
	private readonly admittedTools: readonly AgenticChatTurnProviderToolV1[];
	private readonly lease: AgenticChatProviderCapacityLeaseV1;
	private readonly semanticReviewRequired: boolean;
	private readonly mutationBatchLaneEnabled: boolean;
	private readonly maxProviderRounds: number;
	private readonly directWriteReceiptTextEnabled: boolean;

	private released = false;
	private streamed = false;
	private pendingToolRound: PendingToolRound | null = null;
	private toolRoundCompleted = false;
	private currentRequest: ClientRequest;
	private nextProviderRound = 2;
	private readOnlyRoundCount = 0;
	private providerPassCount = 0;
	// True when the last prose emitted to the user ended without whitespace
	// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F15).
	private emittedTextOwesSeparator = false;
	// Where the acting model is in the turn. Every precondition below is a
	// phase check; the contract lane keeps only the SHA-bound data next to it.
	// A project-create turn opens on the required gate rather than the surface.
	private phase: TurnPhase;
	// The reviewer may downgrade a declared contract to read-only once per turn.
	private semanticDispositionCorrectionUsed = false;
	private turnContract: TurnContract | null = null;
	private pendingContractReviewSha256: string | null = null;
	private approvedContractSha256: string | null = null;
	private pendingProposalRevision: PendingProposalRevision | null = null;
	private contractRevisionCount = 0;
	// SHA-bound batch approval (Decision 1). The exact calls the acting model
	// proposed are held here while the reviewer judges them, and the SAME
	// call objects execute on approval — nothing is re-proposed, so the
	// executed arguments are the approved arguments by construction (F08).
	private heldMutationBatch: HeldMutationBatch | null = null;
	private pendingBatchReviewSha256: string | null = null;
	private approvedMutationBatch: MutationBatch | null = null;
	// Digests of reviewed batches this turn already executed. A re-proposal of
	// the same bytes is a replay, never a new proposal (2026-09-22 gate, case 1).
	private readonly executedMutationBatchShas = new Set<string>();
	private readonly createReplayGuard = new TurnCreateReplayGuard();
	private createReplayRepairUsed = false;
	private rejectedMutationBatch: MutationBatch | null = null;
	private reviewedBatchExecuted = false;
	private requestCompletionContinuationUsed = false;
	private requestExpectation: TurnContract | null = null;
	private batchRevisionCount = 0;
	// Every completed tool round this turn, so contract labels can bind to the
	// entities created in earlier rounds before later writes are authorized.
	private readonly turnToolExecutions: FastToolExecution[] = [];
	private labelBindings: ReadonlyMap<string, string> = new Map();
	// A surface with no reviewed mutation tool cannot honour a contract. The
	// control tools stay mounted (every web surface ships them and the signed
	// description tells the model to call declare_turn_contract early), but a
	// declaration on such a surface is answered with a read-only continuation
	// instead of two reviewer passes and a doomed write.
	private readonly surfaceCanWrite: boolean;
	// Ids that a read this turn returned as the only entity of their kind
	// (id → kind). Together with the focus entity and the ids the user typed,
	// these are the targets the direct lane may update without a reviewer.
	private readonly turnResolvedEntityIds = new Map<string, string>();
	// Every entity any read returned this turn (id → kind). A user-typed id is
	// trusted only in combination with this: the message proves the words, the
	// read proves the row.
	private readonly turnSeenEntityIds = new Map<string, string>();
	// Scheduling values the turn's reads actually loaded (task id → due/start).
	// A reschedule to one of these changes nothing, so it is rejected before
	// execution instead of succeeding and being reported as a move.
	private readonly turnTaskSchedules = new Map<string, LoadedTaskSchedule>();
	private readonly documentEditPreviews = new Map<string, DocumentEditPreviewV1>();
	private readonly currentUserMessage: unknown;
	// Images the user attached to this message: a structured selection, so
	// naming/filing one of them needs no reviewer (write-routing).
	private readonly attachedAssetIds: Set<string>;
	// The executor clears this memo as soon as any call reaches the write
	// boundary (successful or not), matching the legacy invalidation fence.
	private readonly turnReadMemo = new Map<string, AgenticChatReadToolExecutionV1>();
	private readonly contextGatheringLedger = new ContextGatheringLedger();
	private readonly admissionContextUsage: ReturnType<typeof getAdmissionContextUsage>;

	constructor(init: ProviderTurnStateInit) {
		this.baseRequest = init.baseRequest;
		this.turnRunId = init.baseRequest.turnRunId;
		this.admittedTools = init.admittedTools;
		this.lease = init.lease;
		this.semanticReviewRequired = init.semanticReviewRequired;
		this.mutationBatchLaneEnabled = init.mutationBatchLaneEnabled;
		this.maxProviderRounds = init.maxProviderRounds;
		this.directWriteReceiptTextEnabled = init.directWriteReceiptTextEnabled === true;
		this.currentRequest = init.initialRequest;
		this.phase =
			init.initialRequest.semanticDispositionGate === true ? 'disposition_gate' : 'opening';
		this.surfaceCanWrite = init.admittedTools.some((tool) =>
			reviewedAgenticChatMutationSpecV1(tool.function.name)
		);
		this.currentUserMessage = init.executionInput.requestPayload.message;
		this.attachedAssetIds = collectAttachedProjectAssetIds(
			init.executionInput.requestPayload.attachments
		);
		this.admissionContextUsage = getAdmissionContextUsage(init.executionInput);
	}

	/** Claim the single opening stream of this invocation. */
	claimOpeningStream(): void {
		if (this.released) {
			throw new AgenticChatProviderExecutionError(
				'provider_invocation_released',
				'unknown',
				'Agentic Chat provider invocation was released before streaming'
			);
		}
		if (this.streamed) {
			throw new AgenticChatProviderExecutionError(
				'provider_invocation_reused',
				'unknown',
				'Agentic Chat provider invocation is single-use'
			);
		}
		this.streamed = true;
	}

	release(): void {
		if (this.released) return;
		this.released = true;
		this.lease.release();
	}

	getAdmittedTools(): readonly AgenticChatTurnProviderToolV1[] {
		return this.admittedTools;
	}

	advance(event: TurnPhaseEvent): void {
		this.phase = nextTurnPhase(this.phase, event);
	}

	// Read evidence and the read memo share one lifetime. Both describe the
	// world before this turn's writes, so a write invalidates both: a stale
	// single-hit id must not authorize a second unreviewed direct write after
	// the row it described has already changed.
	clearTurnReadEvidence(): void {
		this.turnReadMemo.clear();
		this.turnResolvedEntityIds.clear();
		this.turnSeenEntityIds.clear();
		this.turnTaskSchedules.clear();
	}

	setPendingToolRound(value: PendingToolRound): void {
		this.pendingToolRound = value;
		for (const call of value.calls) {
			if (call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME) {
				const revision = readProposalRevision(call.arguments);
				if (this.heldMutationBatch) {
					// The held calls are void. The actor proposes new ones
					// with the reviewer's reason in hand and they are
					// reviewed again; the reviewer never authors calls, so
					// it cannot corrupt the arguments it rejected (F04).
					this.rejectedMutationBatch = this.heldMutationBatch.batch;
					this.heldMutationBatch = null;
					this.pendingBatchReviewSha256 = null;
					this.approvedMutationBatch = null;
					this.batchRevisionCount += 1;
					this.pendingProposalRevision = revision;
					this.advance({ type: 'review', decision: 'revise_batch' });
					continue;
				}
				// The declared contract is void; the acting model must re-declare
				// through the disposition gate, then pass review again. A typed
				// correction is re-recorded as the declaration when its round
				// returns, so it keeps the contract phase.
				this.turnContract = null;
				this.pendingContractReviewSha256 = null;
				this.approvedContractSha256 = null;
				this.contractRevisionCount += 1;
				this.pendingProposalRevision = revision;
				this.advance({
					type: 'review',
					decision:
						revision.correctedContract && this.semanticReviewRequired
							? 'correct_contract'
							: 'revise_contract'
				});
				continue;
			}
			if (call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME) {
				this.turnContract = null;
				this.pendingContractReviewSha256 = null;
				this.approvedContractSha256 = null;
				this.heldMutationBatch = null;
				this.pendingBatchReviewSha256 = null;
				this.approvedMutationBatch = null;
				this.advance({ type: 'disposition', decision: 'clarification' });
				continue;
			}
			if (call.name === CANCEL_TURN_CONTRACT_TOOL_NAME) {
				this.turnContract = null;
				this.pendingContractReviewSha256 = null;
				this.approvedContractSha256 = null;
				this.advance({ type: 'disposition', decision: 'cancel' });
				continue;
			}
			if (call.name === DECLARE_READ_ONLY_TURN_TOOL_NAME) {
				this.advance({ type: 'review', decision: 'read_only' });
				continue;
			}
			if (call.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) continue;
			// A voluntary complex-write declaration satisfies the gate just as
			// surely as one requested after a withheld contract-only proposal.
			// A surface with no write tool answers it as a read-only turn.
			if (!this.surfaceCanWrite) {
				this.advance({ type: 'disposition', decision: 'read_only' });
				continue;
			}
			this.turnContract = mergeTurnContracts(
				this.turnContract,
				parseDeclaredTurnContract(call.arguments)
			);
			this.approvedContractSha256 = null;
			this.advance({ type: 'disposition', decision: 'contract' });
		}
	}

	getContractRevisionCount(): number {
		return this.contractRevisionCount;
	}

	getLoadedTaskSchedules(): ReadonlyMap<string, LoadedTaskSchedule> {
		return this.turnTaskSchedules;
	}

	recordDocumentEditPreviews(previews: ReadonlyMap<string, DocumentEditPreviewV1>): void {
		for (const [callId, preview] of previews) this.documentEditPreviews.set(callId, preview);
	}

	getDocumentEditPreviews(): ReadonlyMap<string, DocumentEditPreviewV1> {
		return this.documentEditPreviews;
	}

	textDelta(text: string, continuesPass: boolean): AgenticChatProviderStepV1 {
		const separated =
			!continuesPass && this.emittedTextOwesSeparator && !/^\s/.test(text)
				? `\n\n${text}`
				: text;
		this.emittedTextOwesSeparator = !/\s$/.test(separated);
		return { type: 'text_delta', text: separated };
	}

	recordProviderPass(): void {
		this.providerPassCount += 1;
	}

	providerPassBudgetExhausted(): boolean {
		return this.providerPassCount >= MAX_PROVIDER_PASSES_PER_TURN;
	}

	renderWriteReceiptFallback(introduction?: string): string | null {
		return renderWriteReceiptFallback(
			buildWriteLedger(this.turnToolExecutions),
			this.unfinishedContractOutcomeDescriptions(),
			introduction
		);
	}

	buildProviderPassBudgetInstruction(): string {
		return buildProviderPassBudgetSynthesisInstruction(
			buildWriteLedger(this.turnToolExecutions),
			this.unfinishedContractOutcomeDescriptions()
		);
	}

	buildValidationRepairExhaustedInstruction(
		rejected: readonly { toolName: string; errors: readonly string[] }[]
	): string {
		return buildValidationRepairExhaustedSynthesisInstruction(
			buildWriteLedger(this.turnToolExecutions),
			this.unfinishedContractOutcomeDescriptions(),
			rejected
		);
	}

	markToolRoundCompleted(): void {
		this.toolRoundCompleted = true;
	}

	setCurrentRequest(value: ClientRequest): void {
		this.currentRequest = value;
	}

	resolveMemoServed(call: CompletedProviderToolCall): AgenticChatReadToolExecutionV1 | null {
		return resolveMemoServedExecution(this.turnReadMemo, call);
	}

	getSurfaceRepairContext(): SurfaceRepairContext {
		return { phase: this.phase, contractApproved: this.approvedContractSha256 !== null };
	}

	hasPendingTurnContractWrite(): boolean {
		return this.turnContract !== null && contractPending(this.phase);
	}

	/**
	 * Hold a complex write for SHA-bound review instead of asking the
	 * acting model to translate it into a contract DSL first.
	 *
	 * The contract lane spent a whole pass here making the model
	 * re-express calls it had already written, in a vocabulary with 18
	 * deterministic rejection reasons, and then spent another pass
	 * making it write the same calls a second time. Both passes are
	 * gone: the proposal IS the artifact under review.
	 */
	takeWithheldMutationBatch(
		value: ClientRequest,
		calls: readonly CompletedProviderToolCall[]
	):
		| { batch: MutationBatch; sha256: string }
		| { replayRepair: ClientRequest }
		| { replayRefusal: true; fallback: string; finishedReason: 'stop' | 'mutation_unfulfilled' }
		| null {
		if (!this.semanticReviewRequired || !this.mutationBatchLaneEnabled) return null;
		if (
			!(
				dispositionPending(this.phase) ||
				this.phase === 'batch_withheld' ||
				(this.phase === 'mutating' && this.reviewedBatchExecuted)
			) ||
			!calls.some((call) => reviewedAgenticChatMutationSpecV1(call.name))
		) {
			return null;
		}
		if (
			!this.reviewedBatchExecuted &&
			assessDirectWriteBatch(calls, this.directWriteContext(value)).kind === 'simple'
		) {
			return null;
		}
		// Only reviewed mutations are held. A batch that mixes reads with
		// writes cannot execute atomically after approval, so the reads
		// are dropped and the model may re-issue them next round.
		const mutationCalls = calls.filter((call) => reviewedAgenticChatMutationSpecV1(call.name));
		const batch = buildMutationBatch(mutationCalls);
		const sha256 = mutationBatchSha256(batch);
		const repeats = this.createReplayGuard.find(mutationCalls);
		const exactBatchReplay = this.executedMutationBatchShas.has(sha256);
		const onlySavedBatch = exactBatchReplay && calls.length === mutationCalls.length;
		const onlySavedCreates =
			repeats.length === calls.length &&
			repeats.every((repeat) => repeat.exactSavedReplay) &&
			new Set(repeats.map((repeat) => repeat.attempts[0]!.callId)).size === calls.length;
		if (exactBatchReplay || repeats.length > 0) {
			const ledger = buildWriteLedger(this.turnToolExecutions);
			const unconfirmed = ledger.some((entry) => entry.status !== 'success');
			// A changed create is a collision, not proof the changed fields
			// were saved. A mixed batch is withheld intact so call_ref/after
			// cannot bind to a removed call. One correction can reuse saved
			// IDs and submit only the still-needed work for fresh review.
			if (
				repeats.length > 0 &&
				!onlySavedBatch &&
				!onlySavedCreates &&
				!unconfirmed &&
				!this.createReplayRepairUsed
			) {
				this.createReplayRepairUsed = true;
				return {
					replayRepair: appendSystemInstruction(
						{
							...value,
							messages: [
								...value.messages,
								{
									role: 'assistant',
									content: `Previous withheld proposal (unexecuted, not authorization or a receipt):\n${JSON.stringify(serializeMutationBatchForReview(buildMutationBatch(calls)))}`
								}
							],
							logicalProviderRound: value.logicalProviderRound + 1,
							providerAttempt: undefined,
							passRole: 'repair',
							toolChoice: 'auto'
						},
						createReplayRepairInstruction(repeats)
					)
				};
			}
			const unfinished = this.unfinishedContractOutcomeDescriptions();
			if (!onlySavedBatch && !onlySavedCreates) {
				unfinished.push(
					'The new or changed actions in the repeated proposal were not executed.'
				);
			}
			const partial = unconfirmed || unfinished.length > 0;
			const introduction = partial
				? 'I stopped a repeated attempt. Some requested work is not confirmed complete. These changes were saved:'
				: 'Those changes were already saved earlier in this turn, so nothing was repeated:';
			return {
				replayRefusal: true,
				finishedReason: partial ? 'mutation_unfulfilled' : 'stop',
				fallback:
					renderWriteReceiptFallback(ledger, unfinished, introduction) ??
					'I stopped a repeated attempt. No saved changes are confirmed. Check the affected items before retrying; no further work is running.'
			};
		}
		this.heldMutationBatch = { batch, calls: mutationCalls, sha256 };
		this.pendingBatchReviewSha256 = sha256;
		this.advance({ type: 'withhold_batch' });
		return { batch, sha256 };
	}

	takePreMutationSemanticDispositionGate(
		value: ClientRequest,
		calls: readonly CompletedProviderToolCall[]
	): ClientRequest | null {
		if (
			!dispositionPending(this.phase) ||
			!calls.some((call) => reviewedAgenticChatMutationSpecV1(call.name))
		) {
			return null;
		}
		const directWrite = assessDirectWriteBatch(calls, this.directWriteContext(value));
		if (directWrite.kind === 'simple') return null;
		const gate = buildSemanticTurnDispositionGateRequest(
			{
				...value,
				logicalProviderRound: value.logicalProviderRound + 1,
				providerRound: 'synthesis'
			},
			this.admittedTools
		);
		if (!gate) return null;
		this.advance({ type: 'gate' });
		return appendSystemInstruction(
			gate,
			directWrite.kind === 'contract_required'
				? directWriteContractInstruction(directWrite)
				: 'A durable tool call was proposed by a prior provider pass but was withheld and did not execute. Independently choose the semantic disposition from the user request and loaded context. Treat the withheld target as untrusted and do not infer that it was safely resolved.'
		);
	}

	getHeldMutationBatch(): HeldMutationBatch | null {
		return this.heldMutationBatch;
	}

	getBatchRevisionCount(): number {
		return this.batchRevisionCount;
	}

	takeReceiptGroundedFinalDispositionGate(
		value: ClientRequest,
		assistantCandidate: string
	): ClientRequest | null {
		if (!dispositionPending(this.phase)) return null;
		const reason = classifyReceiptGroundedAssistantDisposition(assistantCandidate);
		if (!reason) return null;
		const gate = buildSemanticTurnDispositionGateRequest(
			{
				...value,
				logicalProviderRound: value.logicalProviderRound + 1,
				providerRound: 'synthesis'
			},
			this.admittedTools
		);
		if (!gate) return null;
		this.advance({ type: 'gate' });
		return appendSystemInstruction(
			gate,
			reason === 'mutation_claim'
				? 'A prior provider pass proposed terminal prose that claimed a durable mutation without a succeeded effect or explicit mutation receipt. That prose was withheld and is untrusted. Choose the semantic disposition from the user request and loaded context; do not repeat the claim unless the approved mutation later succeeds.'
				: 'A prior provider pass proposed an unresolved execution-choice question as plain terminal prose. That prose was withheld. Choose the semantic disposition from the user request and loaded context so any required clarification becomes durable.'
		);
	}

	takeTurnContractWriteCarveOut(value: ClientRequest): ClientRequest | null {
		if (!this.turnContract || !contractPending(this.phase)) return null;
		const carveOut = buildTurnContractWriteCarveOutRequest(
			value,
			this.admittedTools,
			this.turnContract
		);
		if (!carveOut) return null;
		this.advance({ type: 'carve_out' });
		const organizeInstruction = this.organizeExecutionInstruction();
		return organizeInstruction
			? appendSystemInstruction(carveOut, organizeInstruction)
			: carveOut;
	}

	hasIncompleteApprovedContract(): boolean {
		return this.incompleteApprovedContractResolution() !== null;
	}

	takeContractCompletionContinuation(value: ClientRequest): ClientRequest | null {
		const resolution = this.incompleteApprovedContractResolution();
		if (!resolution || !this.turnContract) return null;
		const continuation = buildContractCompletionRequest(
			value,
			this.admittedTools,
			this.turnContract,
			resolution,
			this.labelBindings
		);
		if (!continuation) return null;
		this.advance({ type: 'completion' });
		return continuation;
	}

	getRequestExpectation(): TurnContract | null {
		return this.requestExpectation;
	}

	takeRequestCompletionContinuation(value: ClientRequest): ClientRequest | null {
		const expectation = this.requestExpectation;
		if (
			!this.reviewedBatchExecuted ||
			!expectation ||
			this.requestCompletionContinuationUsed ||
			this.phase !== 'mutating' ||
			value.toolChoice !== 'auto'
		)
			return null;
		const remaining = this.unfinishedContractOutcomeDescriptions();
		if (!remaining.length) return null;
		const ledger = buildWriteLedger(this.turnToolExecutions);
		// An uncertain/failed write must not become a blind retry.
		if (ledger.some((entry) => entry.status !== 'success')) return null;
		this.requestCompletionContinuationUsed = true;
		return appendSystemInstruction(
			{
				...value,
				logicalProviderRound: value.logicalProviderRound + 1,
				providerAttempt: undefined,
				passRole: 'repair',
				toolChoice: 'auto'
			},
			[
				'The proposed final answer was withheld: the original request still has unfulfilled outcomes.',
				`Frozen completion checklist (not write permission): ${JSON.stringify(serializeTurnContractForDeclaration(expectation))}`,
				`Still unfulfilled: ${JSON.stringify(remaining)}.`,
				'Use the successful execution receipts and returned IDs already in the conversation. Complete only missing work; never repeat saved creates or retry uncertain writes. Any new mutation must pass the normal independent batch review. Do not change the checklist to match what happened.',
				'If you cannot complete the missing work safely, say what remains undone. Do not claim the entire request is complete.'
			].join('\n')
		);
	}

	getRequestCompletionFallback(): string | null {
		if (!this.reviewedBatchExecuted) return null;
		const expectation = this.requestExpectation;
		const remaining = this.unfinishedContractOutcomeDescriptions();
		if (expectation && remaining.length === 0) return null;
		const introduction = expectation
			? 'Some requested work is still unfinished. These changes were saved:'
			: 'I can confirm the saved changes below, but could not verify that the entire request is complete:';
		return (
			renderWriteReceiptFallback(
				buildWriteLedger(this.turnToolExecutions),
				remaining,
				introduction
			) ??
			`No saved changes are confirmed. ${remaining.length ? `Still pending: ${remaining.join('; ')}.` : 'The entire request could not be verified.'}`
		);
	}

	validateApprovedMutations(calls: readonly CompletedProviderToolCall[]): ToolValidationIssue[] {
		// Production assembly refuses mutation capabilities without this lane.
		// Keep reviewer-less deterministic/provider fixtures backward-compatible.
		if (!this.semanticReviewRequired) return [];
		// An approved batch is authorized by identity, not by re-deriving
		// permission from a description: these are the same call objects
		// the reviewer read, so the check is that the batch still hashes
		// to what was approved.
		if (this.approvedMutationBatch) {
			return mutationBatchSha256(buildMutationBatch([...calls])) ===
				mutationBatchSha256(this.approvedMutationBatch)
				? []
				: calls.map((call) => ({
						toolCall: completedProviderCallToChatToolCall(call),
						toolName: call.name,
						errors: [
							`Mutation ${call.name} is not part of the independently approved batch. Do not execute it; either finish from the approved calls or propose a new batch for independent review.`
						]
					}));
		}
		if (
			!this.turnContract &&
			assessDirectWriteBatch(calls, this.directWriteContext(this.currentRequest)).kind ===
				'simple'
		) {
			return [];
		}
		return validateApprovedTurnContractMutations(
			calls,
			this.turnContract,
			this.approvedContractSha256,
			this.labelBindings
		);
	}

	/**
	 * Fold one executed tool round into the turn and choose the lane that
	 * streams next. Throws, synchronously, when the round does not bind to the
	 * pending provider round or a reviewer approval does not bind to what it
	 * reviewed.
	 */
	completeToolRound(input: AgenticChatProviderToolRoundInputV1): ToolRoundContinuation {
		if (this.released) {
			throw providerError('provider_invocation_released', 'unknown');
		}
		if (!this.streamed || !this.pendingToolRound || !this.toolRoundCompleted) {
			throw providerError('provider_read_continuation_not_ready', 'unknown');
		}
		if (input.round !== this.nextProviderRound) {
			throw providerError('provider_read_continuation_round_mismatch', 'unknown');
		}
		if (input.results.length !== this.pendingToolRound.calls.length) {
			throw providerError('provider_read_continuation_result_count_invalid', 'unknown');
		}

		const completedToolRound = this.pendingToolRound;
		const roundContainsMutation = completedToolRound.calls.some(
			(call) => call.kind === 'mutation'
		);
		// A contract-free mutation round is the one bounded direct-write lane.
		// Its continuation is tool-free so the model cannot split a complex
		// request into several individually small batches.
		const reviewedMutationCompleted =
			roundContainsMutation && this.approvedMutationBatch !== null;
		const directSimpleMutationCompleted =
			!this.turnContract &&
			!reviewedMutationCompleted &&
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
		const batchReviewApproval = completedToolRound.calls.find(
			(call) => call.name === APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME
		);
		if (roundContainsMutation) {
			this.clearTurnReadEvidence();
			this.advance({ type: 'tool_round', kind: 'mutation' });
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
				memoizeCompletedRead(this.turnReadMemo, call, feedback.execution);
			}
			if (
				call.kind === 'read' &&
				!isControlToolName(call.name) &&
				!isMutationFeedback(feedback) &&
				!isFailedToolFeedback(feedback)
			) {
				const refs = collectReadResultEntityRefs(feedback.execution.result);
				for (const ref of refs) {
					const knownKind = this.turnSeenEntityIds.get(ref.id);
					if (knownKind === undefined || knownKind === 'entity') {
						this.turnSeenEntityIds.set(ref.id, ref.kind);
					}
					if (ref.schedule) {
						this.turnTaskSchedules.set(ref.id, {
							...this.turnTaskSchedules.get(ref.id),
							...ref.schedule
						});
					}
				}
				for (const [id, kind] of selectSingleHitEntityIds(refs, call.canonicalArguments)) {
					this.turnResolvedEntityIds.set(id, kind);
				}
			}
			return {
				toolCall: completedProviderCallToChatToolCall(call),
				result: feedbackToChatToolResult(call.id, feedback)
			};
		});
		this.turnToolExecutions.push(...roundExecutions);
		this.requestExpectation = extractReviewedRequestExpectation(this.turnToolExecutions);
		this.createReplayGuard.record(roundExecutions);
		if (roundContainsMutation) this.refreshLabelBindings();
		if (reviewedMutationCompleted) {
			if (this.approvedMutationBatch) {
				this.executedMutationBatchShas.add(mutationBatchSha256(this.approvedMutationBatch));
			}
			this.reviewedBatchExecuted = true;
			this.approvedMutationBatch = null;
			this.heldMutationBatch = null;
		}
		const completedToolCalls = roundExecutions.map(({ toolCall }) => toolCall);
		const pattern = buildRoundToolPattern(completedToolCalls);
		if (roundContainsMutation) {
			// A mutation round is progress. The read-loop ladder restarts, as
			// its own contract promises ("reset to 0 on any write round"), so
			// reads that preceded the contract cannot force the turn tool-free
			// right after its first write. Control-only rounds (declarations,
			// reviewer decisions) are neither reads nor writes and leave the
			// counters alone.
			this.readOnlyRoundCount = 0;
		} else if (pattern.readOps.length > 0) {
			this.readOnlyRoundCount += 1;
			this.advance({ type: 'tool_round', kind: 'read' });
		} else {
			this.advance({ type: 'tool_round', kind: 'control' });
		}

		this.currentRequest = buildContinuationRequest(
			this.currentRequest,
			completedToolRound.calls,
			input.results
		);
		if (
			roundContainsMutation &&
			(this.baseRequest.contextType === 'project_create' ||
				turnContractCreatesProject(this.turnContract))
		) {
			// The shell receipt carries the new project id. Switch surfaces before
			// asking the acting model for another pass so the shell cannot be
			// duplicated and child calls can use that durable id immediately.
			const completionRequest = this.takeContractCompletionContinuation(this.currentRequest);
			if (completionRequest) {
				this.currentRequest = completionRequest;
			} else if (
				this.turnContract &&
				this.unfinishedContractOutcomeDescriptions().length === 0 &&
				buildWriteLedger(this.turnToolExecutions).some(
					(entry) =>
						entry.status === 'success' && entry.toolName === 'create_onto_project'
				)
			) {
				// The shell is durable and every declared outcome is fulfilled:
				// answer tool-free so create_onto_project cannot be called twice
				// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F39). A null completion
				// continuation alone is not proof: it is also null for touched-but-
				// unfulfilled child outcomes, which must keep their write surface.
				this.currentRequest = forceToolFreeRequest(this.currentRequest);
			}
		}
		const proposalRevision = this.pendingProposalRevision;
		if (
			proposalRevision &&
			this.phase === 'reading' &&
			!this.turnContract &&
			completedToolRound.calls.some(
				(call) => call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME
			)
		) {
			// A rejected batch returns to the acting model with the reason.
			// It proposes new calls; those are withheld and reviewed again.
			const rejected = this.rejectedMutationBatch;
			if (!rejected) throw providerError('provider_rejected_batch_missing', 'permanent');
			this.rejectedMutationBatch = null;
			this.pendingProposalRevision = null;
			this.currentRequest = buildMutationBatchRevisionRequest(
				this.currentRequest,
				this.admittedTools,
				proposalRevision,
				rejected
			);
			this.pendingToolRound = null;
			this.toolRoundCompleted = false;
			this.nextProviderRound += 1;
			if (this.batchRevisionCount > MAX_REVISIONS_PER_TURN) {
				return { lane: 'review_exhaustion', usage: completedToolRound.usage };
			}
			return {
				lane: 'acting_pass',
				request: this.currentRequest,
				usage: completedToolRound.usage
			};
		}
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
			this.pendingProposalRevision = null;
			if (proposalRevision.correctedContract && this.semanticReviewRequired) {
				const correctedContract = proposalRevision.correctedContract;
				this.turnContract = correctedContract;
				this.approvedContractSha256 = null;
				const correctedContractSha256 = contractSha256(correctedContract);
				this.pendingContractReviewSha256 = correctedContractSha256;
				this.pendingToolRound = null;
				this.toolRoundCompleted = false;
				this.nextProviderRound += 1;
				return {
					lane: 'turn_contract_review',
					request: this.currentRequest,
					availableTools: this.admittedTools,
					contract: correctedContract,
					contractReviewSha256: correctedContractSha256,
					allowDispositionCorrection: false,
					usage: completedToolRound.usage
				};
			}
			this.currentRequest = buildContractRevisionRequest(
				this.currentRequest,
				this.admittedTools,
				proposalRevision
			);
			this.pendingToolRound = null;
			this.toolRoundCompleted = false;
			this.nextProviderRound += 1;
			return {
				lane: 'acting_pass',
				request: this.currentRequest,
				usage: completedToolRound.usage
			};
		}
		if (batchReviewApproval) {
			const approvalIndex = completedToolRound.calls.indexOf(batchReviewApproval);
			const approvalFeedback = input.results[approvalIndex];
			const approvalResult =
				approvalFeedback &&
				!isFailedToolFeedback(approvalFeedback) &&
				!isMutationFeedback(approvalFeedback)
					? approvalFeedback.execution.result
					: null;
			// Fail closed on any drift between what was reviewed, what was
			// approved, and what is held. The held calls are the only thing
			// that can execute, so an approval that does not bind to them
			// must not become permission to run anything.
			if (
				!this.pendingBatchReviewSha256 ||
				!this.heldMutationBatch ||
				this.heldMutationBatch.sha256 !== this.pendingBatchReviewSha256 ||
				batchReviewApproval.arguments.batch_sha256 !== this.pendingBatchReviewSha256 ||
				approvalResult?.status !== 'mutation_batch_review_approved' ||
				approvalResult.batch_sha256 !== this.pendingBatchReviewSha256
			) {
				throw providerError(
					'provider_mutation_batch_review_identity_mismatch',
					'permanent'
				);
			}
			const approved = this.heldMutationBatch;
			const proposedExpectation = parseRequestExpectation(
				batchReviewApproval.arguments.request_expectation
			);
			const persistedExpectation = parseRequestExpectation(
				approvalResult.request_expectation
			);
			if (
				proposedExpectation &&
				(!persistedExpectation ||
					!requestExpectationsMatch(proposedExpectation, persistedExpectation))
			) {
				throw providerError('provider_request_expectation_identity_mismatch', 'permanent');
			}
			this.pendingBatchReviewSha256 = null;
			this.approvedMutationBatch = approved.batch;
			this.advance({ type: 'review', decision: 'approve_batch' });
			this.pendingToolRound = null;
			this.toolRoundCompleted = false;
			this.nextProviderRound += 1;
			// No acting pass between approval and execution: the reviewed
			// calls run exactly as reviewed. This is the property the
			// contract lane could not have, because it asked the model to
			// write the executing calls after the review (F08).
			return {
				lane: 'approved_batch_execution',
				request: this.currentRequest,
				calls: approved.calls,
				usage: completedToolRound.usage
			};
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
			const turnContract = this.turnContract;
			if (
				!this.pendingContractReviewSha256 ||
				contractReviewApproval.arguments.contract_sha256 !==
					this.pendingContractReviewSha256 ||
				approvalResult?.status !== 'turn_contract_review_approved' ||
				approvalResult.contract_sha256 !== this.pendingContractReviewSha256 ||
				!turnContract
			) {
				throw providerError('provider_turn_contract_review_identity_mismatch', 'permanent');
			}
			this.pendingContractReviewSha256 = null;
			this.approvedContractSha256 = approvalResult.contract_sha256;
			this.advance({ type: 'review', decision: 'approve_contract' });
			const approvedExecutionRequest = buildPostSemanticDispositionRequest(
				this.currentRequest,
				this.admittedTools,
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
							this.admittedTools,
							turnContract
						)
					: null;
			if (projectCreateShellRequest) this.advance({ type: 'carve_out' });
			this.currentRequest = appendSystemInstruction(
				projectCreateShellRequest ?? approvedExecutionRequest,
				'Independent semantic review approved the exact declared contract. Execute only that contract; do not broaden or substitute its targets or values.'
			);
			const organizeInstruction = this.organizeExecutionInstruction();
			if (organizeInstruction) {
				this.currentRequest = appendSystemInstruction(
					this.currentRequest,
					organizeInstruction
				);
			}
		} else if (
			semanticDispositionToolName === DECLARE_TURN_CONTRACT_TOOL_NAME &&
			!this.surfaceCanWrite
		) {
			this.currentRequest = appendSystemInstruction(
				buildPostSemanticDispositionRequest(
					this.currentRequest,
					this.admittedTools,
					DECLARE_READ_ONLY_TURN_TOOL_NAME
				),
				'This surface cannot change project data: no write tool is available in this turn. Answer from the loaded reads, and if the user asked for a change, say plainly that it was not made and what they can do instead. Do not call or mention any write tool.'
			);
		} else if (semanticDispositionToolName) {
			if (
				semanticDispositionToolName === DECLARE_READ_ONLY_TURN_TOOL_NAME &&
				this.pendingContractReviewSha256
			) {
				// A contract reviewer may discover that the acting model mistook
				// future context (for example, research that will inform a later
				// change) for a mutation commissioned in this turn. Void the false
				// contract before independently reviewing the safer read-only
				// disposition; otherwise the stale contract would keep finalization
				// on the mutation path even after the reviewer corrected it.
				this.turnContract = null;
				this.pendingContractReviewSha256 = null;
				this.approvedContractSha256 = null;
				this.semanticDispositionCorrectionUsed = true;
			}
			this.currentRequest = buildPostSemanticDispositionRequest(
				this.currentRequest,
				this.admittedTools,
				semanticDispositionToolName
			);
		}
		const declaredContract = this.turnContract;
		if (
			semanticDispositionToolName === DECLARE_TURN_CONTRACT_TOOL_NAME &&
			this.semanticReviewRequired &&
			declaredContract
		) {
			this.pendingToolRound = null;
			this.toolRoundCompleted = false;
			this.nextProviderRound += 1;
			const declaredContractSha256 = contractSha256(declaredContract);
			this.pendingContractReviewSha256 = declaredContractSha256;
			return {
				lane: 'turn_contract_review',
				request: this.currentRequest,
				availableTools: this.admittedTools,
				contract: declaredContract,
				contractReviewSha256: declaredContractSha256,
				allowDispositionCorrection: !this.semanticDispositionCorrectionUsed,
				usage: completedToolRound.usage
			};
		}
		const ledgerObservation = this.contextGatheringLedger.observeToolRound({
			roundExecutions,
			roundPattern: pattern,
			toolRounds: this.readOnlyRoundCount,
			maxToolRounds: this.maxProviderRounds,
			modelPayloadChars: latestToolPayloadChars(this.currentRequest),
			liveContextUsage: this.admissionContextUsage
		});
		// The ledger is the one read-saturation ladder: novelty, the
		// read-round count floor and the round budget produce at most one
		// system message per round, and its status never steps down
		// between write rounds.
		if (ledgerObservation.message) {
			this.currentRequest = appendSystemInstruction(
				this.currentRequest,
				ledgerObservation.message
			);
		}
		const forceNoToolSynthesis =
			directSimpleMutationCompleted ||
			(reviewedMutationCompleted && partialMutationBatch) ||
			ledgerObservation.forceSynthesis;
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
			? this.takeTurnContractWriteCarveOut(this.currentRequest)
			: null;
		// Read-loop escalation is monotonic, so a turn that read a lot before
		// its contract is forced tool-free after its first mutation round —
		// exactly where the organize folders were created and the moves never
		// proposed. An approved contract with untouched outcomes gets its one
		// write-only completion pass instead of a tool-free answer.
		const contractCompletion =
			forceNoToolSynthesis && !contractWriteCarveOut
				? this.takeContractCompletionContinuation(this.currentRequest)
				: null;
		if (contractWriteCarveOut) {
			this.currentRequest = contractWriteCarveOut;
		} else if (contractCompletion) {
			this.currentRequest = contractCompletion;
		} else if (forceNoToolSynthesis) {
			this.currentRequest = forceToolFreeRequest(this.currentRequest);
			// A batch that only half landed ends here: the failed call is
			// never re-proposed, so the closing answer is bound to the exact
			// receipts rather than to the batch the model intended. Same
			// receipt-grounded synthesis instruction the pass ceiling uses.
			if (partialMutationBatch) {
				this.currentRequest = appendSystemInstruction(
					this.currentRequest,
					buildPartialMutationBatchSynthesisInstruction(
						buildWriteLedger(this.turnToolExecutions)
					)
				);
			}
		}

		this.pendingToolRound = null;
		this.toolRoundCompleted = false;
		this.nextProviderRound += 1;
		if (
			clarificationRequiresToolFreeSynthesis ||
			(forceNoToolSynthesis && !contractWriteCarveOut && !contractCompletion)
		) {
			if (!clarificationRequiresToolFreeSynthesis) {
				this.advance({ type: 'budget', limit: 'force_synthesis' });
			}
			const directWriteReceipt =
				directSimpleMutationCompleted &&
				!partialMutationBatch &&
				!clarificationRequiresToolFreeSynthesis
					? this.directWriteReceiptText(completedToolRound.calls, roundExecutions)
					: null;
			if (directWriteReceipt) {
				return {
					lane: 'direct_write_receipt',
					text: directWriteReceipt,
					usage: completedToolRound.usage
				};
			}
			return {
				lane: 'forced_synthesis',
				request: this.currentRequest,
				usage: completedToolRound.usage,
				clarification: clarificationRender
			};
		}
		return {
			lane: 'acting_pass',
			request: this.currentRequest,
			usage: completedToolRound.usage
		};
	}

	/**
	 * The receipt that replaces the closing model pass after a simple direct
	 * write, or null when the model may still owe the user an answer. Decided
	 * from structured turn state only; neither the user's nor the model's words
	 * are read here, so anything prose would have to settle keeps the pass.
	 */
	private directWriteReceiptText(
		calls: readonly NormalizedProviderToolCall[],
		roundExecutions: readonly FastToolExecution[]
	): string | null {
		if (!this.directWriteReceiptTextEnabled) return null;
		// No contract, reviewer checklist, or reviewed stage governs the turn.
		if (this.turnContract || this.requestExpectation || this.reviewedBatchExecuted) return null;
		// The write round is the turn's only tool round: no read result the model
		// has not yet reported on, and no earlier attempt that failed.
		if (this.turnToolExecutions.length !== roundExecutions.length) return null;
		// The model saw the user's images this turn and may owe a description.
		if (this.baseRequest.liveVisionRequest) return null;
		if (calls.some((call) => call.kind !== 'mutation')) return null;
		// A result that asks the user something reaches them through the model.
		if (roundExecutions.some((execution) => doesToolExecutionRequireUserAction(execution))) {
			return null;
		}
		const ledger = buildWriteLedger(this.turnToolExecutions);
		// One receipt per call: a skipped duplicate or an unledgered tool keeps the pass.
		if (ledger.length !== calls.length) return null;
		return renderDirectWriteReceipt(ledger);
	}

	private refreshLabelBindings(): void {
		this.labelBindings = this.turnContract
			? bindTurnContractLabels(this.turnContract, buildWriteLedger(this.turnToolExecutions))
			: new Map();
	}

	// After the first mutation round the write carve-out is spent, yet the
	// approved contract may still have outcomes left (create folders, then
	// move documents into them). The live organize failures all ended here:
	// folders created, moves never proposed, prose accepted. One bounded
	// continuation returns the model to the unfinished outcomes.
	private incompleteApprovedContractResolution() {
		const turnContract = this.turnContract;
		if (
			!turnContract ||
			!this.approvedContractSha256 ||
			this.phase !== 'mutating' ||
			contractSha256(turnContract) !== this.approvedContractSha256
		) {
			return null;
		}
		const resolution = resolveTurnContractOutcome({
			contract: turnContract,
			toolExecutions: this.turnToolExecutions
		});
		if (resolution.fulfilled) return null;
		// Only outcomes no successful write has touched at all are sent back.
		// A partially or unverifiably executed outcome must never be re-run
		// from here: that is how duplicate writes would be born.
		const ledger = buildWriteLedger(this.turnToolExecutions);
		const touched = (outcome: TurnContractOutcome): boolean =>
			ledger.some(
				(entry) =>
					entry.status === 'success' &&
					Boolean(entry.entityKind) &&
					(outcome.entityKind === 'entity' || entry.entityKind === outcome.entityKind) &&
					(outcome.targetIds.length === 0
						? entry.action === 'create'
						: Boolean(entry.entityId && outcome.targetIds.includes(entry.entityId)))
			);
		const untouched = turnContract.outcomes.some(
			(outcome, index) => resolution.outcomes[index]?.fulfilled === false && !touched(outcome)
		);
		return untouched ? resolution : null;
	}

	// What the turn still owes the user when a budget ends it. Declared
	// outcomes no successful write fulfilled, in the contract's own words.
	private unfinishedContractOutcomeDescriptions(): string[] {
		const expectation = this.requestExpectation ?? this.turnContract;
		if (!expectation) return [];
		const resolution = resolveTurnContractOutcome({
			contract: expectation,
			toolExecutions: this.turnToolExecutions
		});
		if (resolution.fulfilled) return [];
		return expectation.outcomes
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
	}

	private organizeExecutionInstruction(): string | null {
		if (!this.turnContract) return null;
		const organizesDocuments = this.turnContract.outcomes.some(
			(outcome) =>
				outcome.entityKind === 'document' &&
				(outcome.action === 'move' || outcome.action === 'organize')
		);
		return organizesDocuments
			? buildOrganizeCommissionRepairInstruction(this.turnToolExecutions)
			: null;
	}

	private directWriteContext(value: ClientRequest): DirectWriteRouteContext {
		return {
			contextType: value.contextType,
			entityId: value.entityId,
			projectId: value.projectId,
			userMessage:
				typeof this.currentUserMessage === 'string' ? this.currentUserMessage : null,
			resolvedEntityIds: this.turnResolvedEntityIds,
			turnSeenEntityIds: this.turnSeenEntityIds,
			attachedAssetIds: this.attachedAssetIds
		};
	}
}
