// apps/worker/src/workers/agentic-chat/provider/contracts.ts

import type {
	AgentStreamEventPhaseV1,
	AgenticChatRecoveryFailureClassV1,
	JsonObject
} from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from '../turn/execution-input';
import type { AgenticChatLiveVisionResolveInputV1 } from '../tools/live-vision';
import type { AgenticChatReadToolExecutionV1 } from '../tools/tool-execution';

export type AgenticChatProviderUsageV1 = {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
};

export type AgenticChatTurnProviderContentPartV1 =
	| { type: 'text'; text: string }
	| {
			type: 'image_url';
			image_url: { url: string; detail: 'auto' | 'low' | 'high' };
	  };

export type AgenticChatTurnProviderMessageV1 = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | AgenticChatTurnProviderContentPartV1[];
	tool_calls?: JsonObject[];
	tool_call_id?: string;
};

export type AgenticChatTurnProviderToolV1 = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: JsonObject;
	};
};

export type AgenticChatTurnProviderClientEventV1 =
	| { type: 'text'; content: string }
	| {
			type: 'done';
			finishedReason?: string;
			usage?: {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
				prompt_tokens?: number;
				completion_tokens?: number;
				total_tokens?: number;
			};
	  }
	| { type: 'tool_call'; toolCall: unknown }
	| {
			type: 'error';
			error: string;
			retryable: boolean;
			/**
			 * Why a retryable error was raised when the reason is not provider
			 * pressure. A truncated tool call (arguments cut off, or a finish reason
			 * that contradicts the streamed calls) is retried on another route but
			 * must not degrade the turn's capacity window the way a 429 does.
			 * `dispatch_denied` means a dispatch gate refused the physical request
			 * before any network I/O; it is never produced without a gate.
			 */
			cause?: 'tool_arguments_truncated' | 'slow_stream' | 'dispatch_denied';
	  };

/** One physical HTTP request the client is about to send (Tasker 87 dispatch hook). */
export type AgenticChatProviderDispatchRequestV1 = {
	routeId: string;
	routeKind: 'openrouter' | 'openai_compatible';
	/** Model this request names, after per-turn route health. */
	model: string;
	/** Provider-internal fallbacks carried inside the same HTTP request. */
	fallbackModels: readonly string[];
	/** Exact UTF-8 bytes of the serialized request body. */
	serializedRequestBytes: number;
	/** The `max_tokens` value actually sent. */
	maxOutputTokens: number;
};

export type AgenticChatProviderDispatchUsageV1 = {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	reasoningTokens: number | null;
	cachedPromptTokens: number | null;
	/** Provider-reported USD cost, when the provider reported one. */
	costUsd: number | null;
	modelUsed: string | null;
};

/**
 * What the client can prove about one physical request after it ended.
 * `provider_error_response`: a non-2xx HTTP response before any stream.
 * `stream_ended`: a response stream was accepted and has closed (any status).
 * `no_provider_receipt`: the request may have crossed the provider boundary
 * without a response (timeout, network failure, abort before headers).
 */
export type AgenticChatProviderDispatchReceiptV1 = {
	kind: 'provider_error_response' | 'stream_ended' | 'no_provider_receipt';
	httpStatus: number | null;
	requestId: string | null;
	usage: AgenticChatProviderDispatchUsageV1 | null;
};

export type AgenticChatProviderDispatchPermitV1 = {
	/** Records the physical outcome exactly once. Never throws; settlement is asynchronous. */
	settle(receipt: AgenticChatProviderDispatchReceiptV1): void;
};

/**
 * Admission for each physical provider request. The client calls `admit` after it
 * serializes a request and before any network I/O; a rejection means no request is sent.
 */
export type AgenticChatProviderDispatchGateV1 = {
	/** OpenRouter `provider.max_price`, in USD per million tokens and USD per request. */
	readonly providerMaxPrice: { prompt: number; completion: number; request: number };
	admit(
		request: AgenticChatProviderDispatchRequestV1,
		signal: AbortSignal
	): Promise<AgenticChatProviderDispatchPermitV1>;
};

/** A dispatch gate refused a physical request; nothing was sent. */
export class AgenticChatProviderDispatchDeniedError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatProviderDispatchDeniedError';
	}
}

/**
 * Remaining wall-clock budget for the whole turn, set by the executor. Each
 * network attempt derives its own timeout from it so that one slow pass cannot
 * consume the entire budget and leave later passes to die at the wall.
 */
export type AgenticChatProviderBudgetV1 = {
	deadlineAtMs: number;
};

export type AgenticChatProviderPassRoleV1 =
	| 'acting'
	| 'contract_review'
	| 'mutation_review'
	| 'research_review'
	| 'repair'
	| 'final_response';

export type AgenticChatTurnProviderClientRequestV1 = {
	messages: readonly AgenticChatTurnProviderMessageV1[];
	tools: readonly AgenticChatTurnProviderToolV1[];
	toolChoice: 'none' | 'auto' | 'required';
	userId: string;
	sessionId: string;
	turnRunId: string;
	streamRunId: string;
	clientTurnId: string;
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	queueJobId: string;
	processingToken: string;
	executionGeneration: number;
	providerRound: 'initial' | 'synthesis';
	logicalProviderRound: number;
	/** Optional per-pass ceiling; the client also enforces its configured maximum. */
	maxOutputTokens?: number;
	/**
	 * Explicit reasoning budget. `low` for bounded workflow passes; `none` turns
	 * thinking off (the only control DeepSeek V4.1 Flash honors on OpenRouter —
	 * it ignores `effort`). Ordinary calls keep their policy.
	 */
	reasoningEffort?: 'low' | 'none';
	passRole?: AgenticChatProviderPassRoleV1;
	providerAttempt?: number;
	/** Only the atomic pass buffer may opt in, while its single retry remains. */
	allowSlowStreamRecovery?: boolean;
	/** The atomic buffer's last existing attempt; no further retry will follow. */
	finalBufferedAttempt?: boolean;
	/** Turn-level deadline; absent for fixtures and legacy callers. */
	budget?: AgenticChatProviderBudgetV1;
	/** Durable per-request reservation (workflow v1 only). Absent on the ordinary path. */
	dispatchGate?: AgenticChatProviderDispatchGateV1;
	/** Host-authorized document specialist surface; requires durable dispatch metering. */
	workflowToolPolicy?: 'bounded_document_read_v1';
	signal: AbortSignal;
};

export type AgenticChatTurnProviderClientPortV1 = {
	stream(
		input: AgenticChatTurnProviderClientRequestV1
	): AsyncIterable<AgenticChatTurnProviderClientEventV1>;
	/** Avoid the completed response's route on the next already-budgeted repair. Does not retry. */
	rejectRepeatedInvalidToolResponse?(input: AgenticChatTurnProviderClientRequestV1): void;
};

/** Internal request state shared by the provider coordinator and extracted helpers. */
export type AgenticChatTurnProviderRequestV1 = AgenticChatTurnProviderClientRequestV1 & {
	liveVisionRequest?: Omit<AgenticChatLiveVisionResolveInputV1, 'signal'>;
	/**
	 * Mounted tools the schema selector must keep, chosen from structured turn
	 * facts (e.g. project images attached to this message), never message text.
	 */
	toolSelectionPins?: readonly string[];
	semanticDispositionGate?: boolean;
	unavailableSkillRepairAttempted?: boolean;
	/** One bounded re-ask after a completion that carried neither text nor tool calls. */
	emptyReplyRepairAttempted?: boolean;
};

/**
 * Which decision-maker authored a control-tool call. Reviewer lanes and harness
 * fallbacks are distinct models/paths from the acting model; recording the
 * author on the durable row is what lets a later investigation attribute a
 * clarification or approval without joining provider usage logs by timestamp.
 */
export type AgenticChatControlDecisionAuthorV1 =
	| 'acting_model'
	| 'contract_reviewer'
	| 'mutation_batch_reviewer'
	| 'harness_review_fallback'
	| 'harness_candidate_gate';

export type AgenticChatProviderToolSchedulingV1 = {
	/** Stable model-authored identity scoped to one provider tool-call response. */
	callRef: string | null;
	/** Same-response call refs that must finish successfully before this call starts. */
	after: readonly string[];
};

type AgenticChatProviderScheduledToolStepV1 = {
	/** Logical model pass that authored this call; preserved through execution telemetry. */
	logicalProviderRound: number;
	/** Worker protocol metadata; never forwarded to a domain adapter. */
	scheduling?: AgenticChatProviderToolSchedulingV1;
};

export type AgenticChatProviderStepV1 =
	| { type: 'text_delta'; text: string }
	| {
			type: 'semantic';
			transitionId: string;
			phase: AgentStreamEventPhaseV1;
			eventType: string;
			currentActivity: string;
			eventPayload: JsonObject;
	  }
	| (AgenticChatProviderScheduledToolStepV1 & {
			type: 'read_tool';
			callTransitionId: string;
			resultTransitionId: string;
			providerToolCallId: string;
			toolName: string;
			arguments: JsonObject;
			/** Present on control-tool calls; absent on ordinary reads. */
			decidedBy?: AgenticChatControlDecisionAuthorV1;
	  } & (
				| {
						/**
						 * A provider call rejected before execution. The executor records the
						 * failed call behind the same durable/public fence as a normal read, but
						 * never invokes the read adapter or returns it through the round bridge.
						 */
						validationFailure: {
							error: string;
							toolCategory: string | null;
						};
						memoServed?: never;
				  }
				| {
						/**
						 * An exact successful pure read already completed in this turn. The
						 * executor skips the read adapter but still persists and publishes this
						 * call-specific execution before returning it to the provider.
						 */
						memoServed: AgenticChatReadToolExecutionV1;
						validationFailure?: never;
				  }
				| { validationFailure?: never; memoServed?: never }
			))
	| (AgenticChatProviderScheduledToolStepV1 & {
			type: 'mutating_tool';
			callTransitionId: string;
			resultTransitionId: string;
			logicalOperationId: string;
			providerToolCallId: string;
			toolName: string;
			operationName: string;
			arguments: JsonObject;
			downstreamIdempotencySupported: boolean;
	  })
	| {
			type: 'finish';
			finishedReason: string;
			usage: AgenticChatProviderUsageV1 | null;
	  };

export type AgenticChatProviderInputV1 = {
	executionInput: AgenticChatWorkerExecutionInputV1;
	/** Current queue ownership token used only for fenced private observations. */
	processingToken: string;
	/**
	 * Turn wall-clock deadline. Threaded into every acting and reviewer pass so
	 * each network attempt's timeout is bounded by the time actually left.
	 */
	budget?: AgenticChatProviderBudgetV1;
	signal: AbortSignal;
};

export const AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION = 'agentic_chat_worker_prompt_v1' as const;

/**
 * Exact durable text/tool prompt captured during preparation, before the start
 * fence permits network I/O. Ephemeral signed media URLs are resolved only
 * after that fence and never enter this snapshot; their immutable identities
 * and validation outcomes use the private execution-observation ledger.
 */
export type AgenticChatPreparedPromptSnapshotV1 = {
	snapshotVersion: typeof AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION;
	modelMessages: JsonObject[];
	toolDefinitions: JsonObject[];
	systemPromptSha256: string;
	messagesSha256: string;
	toolsSha256: string;
	systemPromptChars: number;
	messageChars: number;
	approxPromptTokens: number;
};

export type AgenticChatPreparedProviderInvocationV1 = {
	/** Read-only workflows must also suppress automatic research/future domain capture. */
	automaticDomainCapture?: 'disabled';
	/** Exact immutable prompt sent by this prepared invocation. */
	promptSnapshot?: AgenticChatPreparedPromptSnapshotV1;
	/** No network/provider work may begin until the executor calls this after its start fence. */
	stream(): AsyncIterable<AgenticChatProviderStepV1>;
	/**
	 * Multi-round continuation. A provider round ends when
	 * its iterable completes without emitting `finish`; the executor then calls
	 * this with every successful tool result of that round — each already durable in the
	 * tool-execution ledger and publicly committed as a `tool_result` event —
	 * and consumes the returned round the same way.
	 */
	continueWithToolResults?(
		input: AgenticChatProviderToolRoundInputV1
	): AsyncIterable<AgenticChatProviderStepV1>;
	/** Clear provider-owned pure-read memoization before any write can execute. */
	invalidateReadMemo?(): void;
	/** Idempotently release any pre-start capacity reservation. */
	release(): void;
};

export type AgenticChatProviderReadSynthesisInputV1 = {
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	execution: AgenticChatReadToolExecutionV1;
};

export type AgenticChatProviderMutationSynthesisInputV1 = {
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	execution: {
		result: JsonObject | null;
		executionTimeMs: number | null;
		tokensConsumed: number | null;
		affectedEntities: JsonObject[];
		toolCategory: string;
		resultCount: null;
		zeroResult: null;
		requiresUserAction: boolean | null;
	};
	mutation: {
		effectId: string;
		logicalOperationId: string;
		operationName: string;
		replayed: boolean;
	};
};

export type AgenticChatProviderFailedToolSynthesisInputV1 = {
	providerToolCallId: string;
	toolName: string;
	arguments: JsonObject;
	failure: {
		kind: 'known_execution_failure' | 'dependency_failed';
		error: string;
		toolCategory: string | null;
		modelPayload: JsonObject;
	};
};

export type AgenticChatProviderToolSynthesisInputV1 =
	| AgenticChatProviderReadSynthesisInputV1
	| AgenticChatProviderMutationSynthesisInputV1
	| AgenticChatProviderFailedToolSynthesisInputV1;

export type AgenticChatProviderToolRoundInputV1 = {
	/** 1-based provider round about to start; the initial `stream()` pass is round 1. */
	round: number;
	/** Ordered durable/public results from the preceding provider round. */
	results: readonly AgenticChatProviderToolSynthesisInputV1[];
};

/**
 * Production providers use `prepare` to validate input and reserve a slot before
 * the execution-start CAS. The legacy `stream` shape remains only for
 * deterministic fixtures and must not be used by a real provider adapter.
 */
export type AgenticChatProviderPortV1 = {
	prepare?(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1>;
	stream?(input: AgenticChatProviderInputV1): AsyncIterable<AgenticChatProviderStepV1>;
};

export type ContractReviewRejectionCode =
	| 'unexpected_control_tool'
	| 'revision_disallowed'
	| 'revision_value_unchanged'
	| 'revision_evidence_invalid'
	| 'corrected_contract_invalid'
	| 'approval_sha_mismatch'
	| 'decision_schema_invalid'
	| 'unexecutable_effect_fields'
	| 'provider_failure'
	| 'decision_truncated'
	| 'unexpected_finish_reason'
	| 'unreadable_decision'
	| 'missing_done'
	| 'decision_count_invalid';

/** Shape-only review telemetry: no reviewer prose, argument values, or user text. */
export type ContractReviewDiagnostic = Readonly<{
	kind: 'rejected_contract_review';
	code: ContractReviewRejectionCode;
	finished: boolean;
	finishedReason: string | null;
	validationIssueCount: number;
	/** Fixed schema keywords only; validation messages may contain private values. */
	validationIssueFields: string[];
	calls: Array<{
		toolName: string | null;
		argumentBytes: number;
		argumentSha256: string;
		truncated: boolean;
	}>;
}>;

export type AgenticChatProviderExecutionDiagnosticV1 =
	| ContractReviewDiagnostic
	| Readonly<{
			kind: 'rejected_tool_name';
			rejectedToolName: string | null;
			rejectedToolNameLength: number;
			advertisedToolCount: number;
			repeatedAdvertisedToolName: string | null;
			repeatedToolNameCount: number | null;
	  }>
	/**
	 * Why a provider's streamed tool arguments could not be accepted, carrying
	 * only shape and position — never argument content. Added after the
	 * 2026-08-20 battery, where `provider_tool_arguments_invalid` alone could not
	 * distinguish a model emitting malformed JSON from a generation truncated at
	 * its token cap, and the retained evidence named neither.
	 */
	| Readonly<{
			kind: 'rejected_tool_arguments';
			toolName: string | null;
			/**
			 * Which acceptance step rejected the arguments. `finish_reason` means
			 * the calls were streamed but the provider reported a finish reason
			 * other than tool calls, so the arguments cannot be trusted complete.
			 */
			stage: 'delta_type' | 'json_parse' | 'json_shape' | 'finish_reason';
			/** Assembled argument bytes at rejection. */
			argumentBytes: number;
			/** SHA-256 of the assembled arguments, for correlating repeats. */
			argumentSha256: string;
			/** Byte offset JSON.parse reported, when it reported one. */
			parseErrorOffset: number | null;
			/** Coarse parse category; never the offending text. */
			parseErrorCategory:
				| 'unexpected_end'
				| 'unterminated'
				| 'unexpected_token'
				| 'other'
				| null;
			/** The provider's claimed finish reason for this pass, when known. */
			finishedReason: string | null;
			/** True when the pass consumed its entire completion budget. */
			completionBudgetExhausted: boolean;
	  }>;

export class AgenticChatProviderExecutionError extends Error {
	constructor(
		readonly code: string,
		readonly failureClass: AgenticChatRecoveryFailureClassV1,
		message: string,
		readonly diagnostic: AgenticChatProviderExecutionDiagnosticV1 | null = null
	) {
		super(message);
		this.name = 'AgenticChatProviderExecutionError';
	}
}
