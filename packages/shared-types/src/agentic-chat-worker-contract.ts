// packages/shared-types/src/agentic-chat-worker-contract.ts
export const AGENTIC_CHAT_WORKER_CONTRACT_VERSION = 'agentic_chat_worker_v1' as const;
export const AGENTIC_CHAT_REQUEST_HASH_VERSION = 'agentic_chat_request_hash_v2' as const;
export const AGENTIC_CHAT_INPUT_ARTIFACT_VERSION = 'agentic_chat_input_v2' as const;
export const AGENTIC_CHAT_INPUT_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
export const AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES = 256 * 1024;
export const AGENTIC_CHAT_INPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES = 2 * 1024 * 1024;
export const AGENTIC_CHAT_STREAM_SPILL_THRESHOLD_BYTES = 512 * 1024;
export const AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES = 512 * 1024;
export const AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS = 128;
export const AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES = 16 * 1024 * 1024;
export const AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES = 512 * 1024;
export const AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES = 256 * 1024;
export const AGENTIC_CHAT_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const AGENTIC_CHAT_SIGNAL_VERSION = 'agentic_chat_signal_v1' as const;
export const AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS = 500;
export const AGENTIC_CHAT_CANCEL_OBSERVATION_MAX_PAIRS = 128;

export type JsonObject = { [key: string]: JsonValue | undefined };
export type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];

export type NormalizedChatAttachmentV1 = {
	attachment_kind: 'onto_asset' | 'temporary_file';
	media_type: 'image';
	asset_id: string | null;
	temporary_attachment_id: string | null;
	project_id: string | null;
	role: 'attachment' | 'analysis_target';
	display_order: number;
	file_name: string | null;
	content_type: string | null;
	file_size_bytes: number | null;
	width: number | null;
	height: number | null;
	checksum_sha256: string | null;
	ocr_status: string | null;
	extraction_summary: string | null;
	extracted_text_preview: string | null;
};

/**
 * The hashed semantic command covers only user-authored/user-chosen fields.
 * Client-recomputed state (session id, last-turn context, project focus) is
 * deliberately excluded — hash v2 — so a legitimate retry of the same
 * `(user_id, client_turn_id)` cannot become a false idempotency conflict.
 * Those excluded fields are validated against the stored turn at admission
 * instead: a supplied session id must equal the stored `session_id`.
 */
export type CanonicalAdmissionRequestV1 = {
	version: typeof AGENTIC_CHAT_REQUEST_HASH_VERSION;
	clientTurnId: string;
	streamRunId: string;
	context: {
		type: string;
		entityId: string | null;
		projectId: string | null;
	};
	message: string;
	attachments: NormalizedChatAttachmentV1[];
	voiceNoteGroupId: string | null;
	preparedPromptLineage: {
		id: string | null;
		acceptedSurfaceProfile: string | null;
	};
};

export type FrozenHistoryMessageV1 = {
	sourceMessageId: string | null;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	attachments: NormalizedChatAttachmentV1[];
	toolCalls: JsonObject[];
	toolCallId: string | null;
};

export type TurnInputArtifactContentV1 = {
	artifactVersion: typeof AGENTIC_CHAT_INPUT_ARTIFACT_VERSION;
	/** which mechanism produced the frozen history; prepared-prompt history has no source message ids */
	historySource: 'admission_window' | 'prepared_prompt';
	history: FrozenHistoryMessageV1[];
	prepared: {
		sourcePreparedPromptId: string | null;
		contextPayload: JsonObject;
		conversationSummary: string | null;
		surfaceProfile: string;
		systemPrompt: string;
		promptSections: JsonObject[];
		toolSurface: JsonObject;
	};
};

export type TurnInputArtifactV1 = TurnInputArtifactContentV1 & {
	createdAt: string;
	retainUntil: string;
	contentHash: string;
};

export type TurnInputArtifactValidationErrorCodeV1 =
	| 'invalid_version'
	| 'invalid_history_source'
	| 'invalid_content'
	| 'invalid_hash_format'
	| 'hash_mismatch'
	| 'history_too_large'
	| 'artifact_too_large'
	| 'invalid_retention'
	| 'prepared_history_has_source_ids'
	| 'admitted_message_in_history';

export type TurnInputArtifactValidationResultV1 =
	| {
			ok: true;
			contentHash: string;
			contentBytes: number;
			historyBytes: number;
			normalizedContent: TurnInputArtifactContentV1;
	  }
	| {
			ok: false;
			code: TurnInputArtifactValidationErrorCodeV1;
			detail: string;
	  };

export type ChatTurnCommandV1 = {
	commandVersion: 'agentic_chat_turn_v1';
	turnRunId: string;
	sessionId: string;
	userId: string;
	streamRunId: string;
	clientTurnId: string;
	correlationId: string;
	executionMode: 'worker_realtime';
	transportContractVersion: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
	transportDecisionId: string;
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	userMessageId: string;
	userMessage: string;
	attachments: NormalizedChatAttachmentV1[];
	projectFocus: JsonObject | null;
	lastTurnContext: JsonObject | null;
	voiceNoteGroupId: string | null;
	requestHash: string;
	historyCutoffAt: string;
	historyMessageIds: string[];
	preparedPromptId: string | null;
	inputArtifactId: string;
	staleContextPolicy: 'fail_after_max_queue_residence';
	requestPayloadVersion: 'agentic_chat_request_v1';
	requestPayload: JsonObject;
};

export type AgenticChatTurnJobV1 = {
	turnRunId: string;
	correlationId: string;
};

type AgenticChatAdmissionHandleV1 = {
	turnRunId: string;
	sessionId: string;
	userMessageId: string | null;
	inputArtifactId: string | null;
	queueJobId: string | null;
	correlationId: string;
	streamRunId: string;
	clientTurnId: string;
	executionMode: 'worker_realtime' | 'legacy_sse';
	status: ChatTurnStatusV1;
};

/** Domain result parsed from the duplicate-first worker admission RPC. */
export type AgenticChatWorkerAdmissionResultV1 =
	| (AgenticChatAdmissionHandleV1 & {
			outcome: 'newly_admitted';
			executionMayStart: false;
			executionMode: 'worker_realtime';
			status: 'queued';
			userMessageId: string;
			inputArtifactId: string;
			queueJobId: string;
			sessionCreated: boolean;
	  })
	| (AgenticChatAdmissionHandleV1 & {
			outcome: 'matching_duplicate' | 'active_turn_conflict';
			executionMayStart: false;
	  })
	| (AgenticChatAdmissionHandleV1 & {
			outcome: 'idempotency_conflict';
			executionMayStart: false;
			conflictReason: string;
	  })
	| {
			outcome: 'capacity_exceeded';
			executionMayStart: false;
			capacityReason: 'pressure_closed' | 'max_running' | 'max_queued';
			retryAfterSeconds: number;
			runningCount: number;
			queuedCount: number;
	  };

type AgenticChatClaimHandleV1 = {
	turnRunId: string;
	queueJobId: string;
	sessionId: string;
	userId: string;
	correlationId: string;
	executionGeneration: number;
	status: ChatTurnStatusV1;
};

/**
 * Domain result parsed from the queue/domain claim bridge. Provider execution
 * still requires the later immediate-before-provider boundary.
 */
export type AgenticChatTurnClaimResultV1 =
	| (AgenticChatClaimHandleV1 & {
			outcome: 'claimed';
			executionMayStart: true;
			status: 'running';
			inputArtifactId: string;
			userMessageId: string;
	  })
	| (AgenticChatClaimHandleV1 & {
			outcome: 'matching_current_claim';
			executionMayStart: boolean;
			status: 'running';
			inputArtifactId: string;
			userMessageId: string;
	  })
	| (AgenticChatClaimHandleV1 & {
			outcome: 'cancel_requested' | 'already_terminal';
			executionMayStart: false;
	  });

type AgenticChatExecutionHandleV1 = {
	turn_run_id: string;
	queue_job_id: string;
	session_id: string;
	user_id: string;
	correlation_id: string;
	execution_generation: number;
	status: ChatTurnStatusV1;
};

/**
 * Result of the immediate-before-provider database fence. Only `started`
 * authorizes a provider call; a lost-response replay is deliberately denied.
 */
export type AgenticChatExecutionStartRpcResultV1 =
	| (AgenticChatExecutionHandleV1 & {
			outcome: 'started';
			status: 'running';
			execution_started_at: string;
			invoke_provider: true;
	  })
	| (AgenticChatExecutionHandleV1 & {
			outcome: 'already_started';
			status: 'running';
			execution_started_at: string;
			invoke_provider: false;
	  })
	| (AgenticChatExecutionHandleV1 & {
			outcome: 'cancel_requested' | 'stale_context';
			status: 'running';
			invoke_provider: false;
	  })
	| (AgenticChatExecutionHandleV1 & {
			outcome: 'already_terminal';
			status: ChatTurnTerminalStatusV1;
			invoke_provider: false;
	  })
	| (AgenticChatExecutionHandleV1 & {
			outcome: 'stale_generation';
			status: 'queued' | 'running';
			requested_execution_generation: number;
			invoke_provider: false;
	  });

export type AgenticChatRecoveryFailureClassV1 =
	| 'transient_infra'
	| 'provider_throttle'
	| 'timeout_pre_start'
	| 'permanent'
	| 'stale_context'
	| 'publisher_overload'
	| 'timeout_post_start'
	| 'cancelled'
	| 'uncertain_external_commit'
	| 'unknown';

export type AgenticChatRecoveryDecisionV1 =
	| { decision: 'reconcile_terminal_queue' }
	| { decision: 'stale_generation' }
	| { decision: 'already_requeued' }
	| { decision: 'finalize_cancelled'; failureCode: 'cancelled' }
	| { decision: 'effect_reconciliation_required' }
	| { decision: 'retry'; failureCode: AgenticChatRecoveryFailureClassV1 }
	| {
			decision: 'finalize_failed';
			failureCode: AgenticChatRecoveryFailureClassV1;
			retryExhausted: boolean;
	  }
	| { decision: 'invalid_status' };

export type AgenticChatRecoveryRpcResultV1 = AgenticChatExecutionHandleV1 & {
	outcome:
		| 'retry_scheduled'
		| 'already_requeued'
		| 'finalize_failed'
		| 'finalize_cancelled'
		| 'effect_reconciliation_required'
		| 'stale_generation'
		| 'queue_reconciled'
		| 'already_reconciled';
	execution_may_retry: boolean;
	failure_code: AgenticChatRecoveryFailureClassV1 | null;
};

export type AgentStreamEventPhaseV1 = 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';

export type AgentStreamEventV1<TPayload extends { type: string } = { type: string }> = {
	contract_version: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
	event_id: string;
	stream_run_id: string;
	client_turn_id: string;
	session_id: string;
	turn_run_id: string;
	execution_generation: number;
	sequence_index: number;
	phase: AgentStreamEventPhaseV1;
	event_type: TPayload['type'];
	durable: boolean;
} & TPayload;

export type TurnSnapshotV1 = {
	contract_version: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
	turn_run_id: string;
	/** both transports implement reconcile(); legacy snapshots carry 'legacy_sse' */
	execution_mode: 'worker_realtime' | 'legacy_sse';
	execution_generation: number;
	status: ChatTurnStatusV1;
	text: string;
	projection: JsonObject;
	snapshot_sequence: number;
	durable_through_sequence: number;
	projection_durable_sequence: number;
	durable_events: AgentStreamEventV1[];
	response_watermark: number;
	reconcile_required: boolean;
	assistant_message: JsonObject | null;
	terminal_event_id: string | null;
	updated_at: string;
};

export type ChatTurnSignalV1 = {
	signalVersion: typeof AGENTIC_CHAT_SIGNAL_VERSION;
	id: string;
	turnRunId: string;
	kind: 'cancel';
	reason: 'user_cancelled' | 'superseded' | 'timeout' | 'operator_cancelled';
	source: 'browser' | 'worker' | 'operator' | 'sweeper';
	createdAt: string;
	consumedAt: string | null;
	consumedByGeneration: number | null;
};

export type AgenticChatCancellationObservationInputV1 = {
	turn_run_id: string;
	execution_generation: number;
};

export type AgenticChatCancellationObservationV1 = {
	turn_run_id: string;
	execution_generation: number;
	signal_id: string;
	cancel_reason: ChatTurnSignalV1['reason'];
	cancel_source: ChatTurnSignalV1['source'];
	cancel_requested_at: string;
	consumed_at: string;
};

export type AgenticChatCancellationObservationRpcResultV1 = AgenticChatCancellationObservationV1[];

export type CancelTurnResultV1 =
	| { outcome: 'cancel_requested' }
	| { outcome: 'cancelled'; status: 'cancelled'; terminalEventId: string }
	| {
			outcome: 'already_terminal';
			status: ChatTurnTerminalStatusV1;
			terminalEventId: string;
	  }
	| { outcome: 'legacy_abort_requested' };

export type AgentChatTransportLeaseV1 = {
	mode: 'legacy_sse' | 'worker_realtime';
	contractVersion: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION | 'legacy_internal_v1';
	decisionId: string;
	token: string;
	expiresAt: string;
};

export type TurnHandleV1 =
	| {
			contractVersion: 'legacy_internal_v1';
			executionMode: 'legacy_sse';
			streamRunId: string;
			clientTurnId: string;
			sessionId: string | null;
			turnRunId: string | null;
	  }
	| {
			contractVersion: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
			executionMode: 'worker_realtime';
			streamRunId: string;
			clientTurnId: string;
			sessionId: string;
			turnRunId: string;
	  };

export type ChatTurnEffectStateV1 =
	| 'reserved'
	| 'started'
	| 'succeeded'
	| 'failed'
	| 'cancelled'
	| 'uncertain';

export type ChatTurnEffectReservationV1 = {
	effectId: string;
	turnRunId: string;
	executionGeneration: number;
	sessionId: string;
	userId: string;
	toolName: string;
	operationName: string;
	canonicalArgumentHash: string;
	providerToolCallId: string | null;
};

export type ChatTurnEffectReceiptV1 = {
	effectId: string;
	state: ChatTurnEffectStateV1;
	downstreamIdempotencySupported: boolean;
	downstreamReceipt: JsonObject | null;
	startedAt: string | null;
	finishedAt: string | null;
};

type ChatTurnEffectRpcResultBaseV1 = ChatTurnEffectReceiptV1 & {
	turnRunId: string;
	executionGeneration: number;
	sessionId: string;
	userId: string;
};

/**
 * Result shared by the fenced effect RPCs. Only the single `started` outcome
 * authorizes the runtime to invoke a mutating adapter; every duplicate or
 * reconciliation path is receipt-only.
 */
export type ChatTurnEffectRpcResultV1 = ChatTurnEffectRpcResultBaseV1 &
	(
		| { outcome: 'started'; state: 'started'; invokeAdapter: true }
		| { outcome: 'reserved'; state: 'reserved'; invokeAdapter: false }
		| { outcome: 'reconciled'; invokeAdapter: false }
		| { outcome: 'existing'; invokeAdapter: false }
	);

export type ChatTurnStatusV1 = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ChatTurnTerminalStatusV1 = Extract<
	ChatTurnStatusV1,
	'completed' | 'failed' | 'cancelled'
>;

export type TerminalFinalizationDecisionV1 =
	| { decision: 'commit'; status: ChatTurnTerminalStatusV1 }
	| { decision: 'already_terminal'; status: ChatTurnTerminalStatusV1 }
	| { decision: 'stale_generation' }
	| { decision: 'cancel_requested' }
	| { decision: 'invalid_status' };

export type AgenticChatTerminalReceiptV1 = {
	turn_run_id: string;
	session_id: string;
	user_id: string;
	queue_job_id: string;
	execution_generation: number;
	status: ChatTurnTerminalStatusV1;
	finished_reason: string;
	failure_code: string | null;
	assistant_message_id: string | null;
	terminal_event_id: string;
	terminal_sequence_index: number;
	terminalized_at: string;
};

/** Service-to-database result for the single worker terminal CAS boundary. */
export type AgenticChatTerminalFinalizeRpcResultV1 =
	| (AgenticChatTerminalReceiptV1 & { outcome: 'finalized' | 'already_terminal' })
	| {
			outcome: 'stale_generation';
			turn_run_id: string;
			session_id: string;
			user_id: string;
			queue_job_id: string;
			requested_execution_generation: number;
			execution_generation: number;
			status: 'queued' | 'running';
	  }
	| {
			outcome: 'cancel_requested';
			turn_run_id: string;
			session_id: string;
			user_id: string;
			queue_job_id: string;
			execution_generation: number;
			status: 'running';
			cancel_requested_at: string;
			cancel_reason: ChatTurnSignalV1['reason'];
	  };

/** Service-to-database result for queued or running worker cancellation. */
export type AgenticChatCancelRpcResultV1 =
	| (AgenticChatTerminalReceiptV1 & { outcome: 'cancelled' | 'already_terminal' })
	| {
			outcome: 'cancel_requested';
			turn_run_id: string;
			session_id: string;
			user_id: string;
			queue_job_id: string;
			execution_generation: number;
			status: 'running';
			cancel_requested_at: string;
			cancel_reason: ChatTurnSignalV1['reason'];
			cancel_source: ChatTurnSignalV1['source'];
			signal_id: string;
	  };

type AgenticChatStreamPersistedReceiptBaseV1 = {
	turn_run_id: string;
	queue_job_id: string;
	session_id: string;
	user_id: string;
	stream_run_id: string;
	client_turn_id: string | null;
	execution_generation: number;
	sequence_index: number;
	event_id: string;
	phase: AgentStreamEventPhaseV1;
	event_type: string;
	durable: true;
};

export type AgenticChatStreamWriteBlockedRpcResultV1 =
	| {
			outcome: 'stale_generation';
			publish_allowed: false;
			turn_run_id: string;
			queue_job_id: string;
			execution_generation: number;
			requested_execution_generation: number;
			status: ChatTurnStatusV1;
	  }
	| {
			outcome: 'cancel_requested';
			publish_allowed: false;
			turn_run_id: string;
			queue_job_id: string;
			execution_generation: number;
			status: 'running';
			cancel_requested_at: string;
			cancel_reason: ChatTurnSignalV1['reason'];
	  }
	| {
			outcome: 'already_terminal';
			publish_allowed: false;
			turn_run_id: string;
			queue_job_id: string;
			execution_generation: number;
			status: ChatTurnTerminalStatusV1;
			terminal_event_id: string | null;
	  };

export type AgenticChatTextBatchInputV1 = {
	turn_run_id: string;
	queue_job_id: string;
	processing_token: string;
	execution_generation: number;
	batch_id: string;
	text_delta: string;
	assistant_text: string;
};

export type AgenticChatTextBatchRpcResultV1 =
	| (AgenticChatStreamPersistedReceiptBaseV1 & {
			outcome: 'persisted';
			publish_allowed: true;
			phase: 'llm';
			event_type: 'text_delta';
			batch_id: string;
			text_delta: string;
			assistant_text_bytes: number;
			reconcile_required: true;
			persisted_at: string;
	  })
	| (AgenticChatStreamPersistedReceiptBaseV1 & {
			outcome: 'already_persisted';
			publish_allowed: false;
			phase: 'llm';
			event_type: 'text_delta';
			batch_id: string;
			assistant_text_bytes: number;
	  })
	| AgenticChatStreamWriteBlockedRpcResultV1;

export type AgenticChatSemanticEventRpcResultV1 =
	| (AgenticChatStreamPersistedReceiptBaseV1 & {
			outcome: 'persisted';
			publish_allowed: true;
			transition_id: string;
			event_payload: JsonObject;
			reconcile_required: true;
			persisted_at: string;
	  })
	| (AgenticChatStreamPersistedReceiptBaseV1 & {
			outcome: 'already_persisted';
			publish_allowed: false;
			transition_id: string;
			event_payload: JsonObject;
	  })
	| AgenticChatStreamWriteBlockedRpcResultV1;

export type AgenticChatTextBatchFlushItemResultV1 =
	| (AgenticChatTextBatchRpcResultV1 & { input_index: number })
	| {
			outcome: 'rejected';
			publish_allowed: false;
			input_index: number;
			error_code: string;
			error_message: string;
	  };

export type AgenticChatTextBatchFlushRpcResultV1 = {
	outcome: 'flushed';
	input_count: number;
	persisted_count: number;
	rejected_count: number;
	results: AgenticChatTextBatchFlushItemResultV1[];
};

export type AgenticChatStreamDeliveryAckRpcResultV1 =
	| {
			outcome: 'acknowledged' | 'already_acknowledged';
			turn_run_id: string;
			queue_job_id: string;
			execution_generation: number;
			acknowledged_sequence: number;
			current_sequence: number;
			reconcile_required: false;
	  }
	| {
			outcome: 'newer_snapshot';
			turn_run_id: string;
			queue_job_id: string;
			execution_generation: number;
			acknowledged_sequence: number;
			current_sequence: number;
			reconcile_required: true;
	  }
	| {
			outcome: 'stale_generation';
			turn_run_id: string;
			queue_job_id: string;
			requested_execution_generation: number;
			execution_generation: number;
			acknowledged_sequence: number;
			current_sequence: number;
			reconcile_required: boolean;
	  };

/**
 * Broadcast authority is deliberately narrower than durable success. A lost-
 * response replay returns the committed receipt but may only reconcile it.
 */
export function canPublishAgenticChatStreamWriteV1(result: {
	outcome: string;
	publish_allowed: boolean;
}): boolean {
	return result.outcome === 'persisted' && result.publish_allowed === true;
}

export function didAcknowledgeAgenticChatStreamDeliveryV1(
	result: AgenticChatStreamDeliveryAckRpcResultV1
): boolean {
	return (
		(result.outcome === 'acknowledged' || result.outcome === 'already_acknowledged') &&
		result.reconcile_required === false
	);
}

/**
 * Serialize JSON deterministically for the v1 chat hashes.
 *
 * Object keys are recursively sorted, undefined object fields are omitted, array
 * order is preserved, and non-JSON or cyclic values are rejected.
 */
export function canonicalizeAgenticChatJson(value: JsonValue): string {
	return canonicalizeJsonValue(value, new WeakSet<object>(), '$');
}

export function normalizeAgenticChatText(value: string): string {
	return value.replace(/\r\n?/g, '\n').normalize('NFC').trim();
}

export function canonicalizeAdmissionRequestV1(
	request: CanonicalAdmissionRequestV1
): CanonicalAdmissionRequestV1 {
	return {
		version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
		clientTurnId: request.clientTurnId,
		streamRunId: request.streamRunId,
		context: {
			type: request.context.type,
			entityId: request.context.entityId,
			projectId: request.context.projectId
		},
		message: normalizeAgenticChatText(request.message),
		attachments: request.attachments
			.map((attachment, inputOrder) => ({ attachment, inputOrder }))
			.sort(
				(left, right) =>
					left.attachment.display_order - right.attachment.display_order ||
					left.inputOrder - right.inputOrder
			)
			.map(({ attachment }) => canonicalizeAttachmentV1(attachment)),
		voiceNoteGroupId: request.voiceNoteGroupId,
		preparedPromptLineage: {
			id: request.preparedPromptLineage.id,
			acceptedSurfaceProfile: request.preparedPromptLineage.acceptedSurfaceProfile
		}
	};
}

export async function hashCanonicalAdmissionRequestV1(
	request: CanonicalAdmissionRequestV1
): Promise<string> {
	return sha256Hex(
		canonicalizeAgenticChatJson(canonicalizeAdmissionRequestV1(request) as unknown as JsonValue)
	);
}

export function canonicalizeTurnInputArtifactContentV1(
	artifact: TurnInputArtifactContentV1 | TurnInputArtifactV1
): string {
	return canonicalizeAgenticChatJson(normalizeTurnInputArtifactContentV1(artifact));
}

export function normalizeTurnInputArtifactContentV1(
	artifact: TurnInputArtifactContentV1 | TurnInputArtifactV1
): TurnInputArtifactContentV1 {
	return {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: artifact.historySource,
		history: freezeTurnInputHistoryV1(artifact.history),
		prepared: {
			sourcePreparedPromptId: artifact.prepared.sourcePreparedPromptId,
			contextPayload: cloneCanonicalJson(artifact.prepared.contextPayload),
			conversationSummary: artifact.prepared.conversationSummary,
			surfaceProfile: artifact.prepared.surfaceProfile,
			systemPrompt: artifact.prepared.systemPrompt,
			promptSections: artifact.prepared.promptSections.map((section) =>
				cloneCanonicalJson(section)
			),
			toolSurface: cloneCanonicalJson(artifact.prepared.toolSurface)
		}
	};
}

/**
 * Copy the exact model-facing history and optionally exclude the newly admitted
 * user message. Later source-row mutation cannot alter the returned snapshot.
 */
export function freezeTurnInputHistoryV1(
	history: FrozenHistoryMessageV1[],
	excludedMessageId: string | null = null
): FrozenHistoryMessageV1[] {
	return history
		.filter(
			(message) => excludedMessageId === null || message.sourceMessageId !== excludedMessageId
		)
		.map((message) => ({
			sourceMessageId: message.sourceMessageId,
			role: message.role,
			content: message.content,
			attachments: message.attachments.map(canonicalizeAttachmentV1),
			toolCalls: message.toolCalls.map((toolCall) => cloneCanonicalJson(toolCall)),
			toolCallId: message.toolCallId
		}));
}

export async function hashTurnInputArtifactContentV1(
	artifact: TurnInputArtifactContentV1 | TurnInputArtifactV1
): Promise<string> {
	return sha256Hex(canonicalizeTurnInputArtifactContentV1(artifact));
}

/**
 * Verify a retained input artifact before any provider work begins.
 *
 * This is intentionally independent of a database client so web and worker
 * adapters can share the same fail-closed version/hash/size contract. Database
 * relationship ownership and active-turn references remain separate fenced
 * checks in the Phase 2 service primitives.
 */
export async function validateTurnInputArtifactV1(
	artifact: TurnInputArtifactV1,
	options: { excludedMessageId?: string | null } = {}
): Promise<TurnInputArtifactValidationResultV1> {
	if (artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
		return {
			ok: false,
			code: 'invalid_version',
			detail: `Expected ${AGENTIC_CHAT_INPUT_ARTIFACT_VERSION}`
		};
	}
	if (
		artifact.historySource !== 'admission_window' &&
		artifact.historySource !== 'prepared_prompt'
	) {
		return {
			ok: false,
			code: 'invalid_history_source',
			detail: 'History source is not supported by the worker contract'
		};
	}
	if (
		!Array.isArray(artifact.history) ||
		artifact.prepared === null ||
		typeof artifact.prepared !== 'object'
	) {
		return {
			ok: false,
			code: 'invalid_content',
			detail: 'Artifact history and prepared content have invalid shapes'
		};
	}
	if (!/^[0-9a-f]{64}$/.test(artifact.contentHash)) {
		return {
			ok: false,
			code: 'invalid_hash_format',
			detail: 'Content hash must be a lowercase SHA-256 hexadecimal digest'
		};
	}

	const createdAtMs = Date.parse(artifact.createdAt);
	const retainUntilMs = Date.parse(artifact.retainUntil);
	if (
		!Number.isFinite(createdAtMs) ||
		!Number.isFinite(retainUntilMs) ||
		retainUntilMs - createdAtMs < AGENTIC_CHAT_INPUT_RETENTION_MS
	) {
		return {
			ok: false,
			code: 'invalid_retention',
			detail: 'Input artifact retention must cover at least seven days'
		};
	}

	if (
		artifact.historySource === 'prepared_prompt' &&
		artifact.history.some((message) => message.sourceMessageId !== null)
	) {
		return {
			ok: false,
			code: 'prepared_history_has_source_ids',
			detail: 'Prepared-prompt history cannot claim source chat-message lineage'
		};
	}

	const excludedMessageId = options.excludedMessageId ?? null;
	if (
		excludedMessageId !== null &&
		artifact.history.some((message) => message.sourceMessageId === excludedMessageId)
	) {
		return {
			ok: false,
			code: 'admitted_message_in_history',
			detail: 'The newly admitted user message must not appear in frozen history'
		};
	}

	let normalizedContent: TurnInputArtifactContentV1;
	let canonicalContent: string;
	let historyBytes: number;
	try {
		normalizedContent = normalizeTurnInputArtifactContentV1(artifact);
		canonicalContent = canonicalizeAgenticChatJson(normalizedContent as unknown as JsonValue);
		historyBytes = utf8ByteLength(
			canonicalizeAgenticChatJson(normalizedContent.history as unknown as JsonValue)
		);
	} catch (error) {
		return {
			ok: false,
			code: 'invalid_content',
			detail:
				error instanceof Error ? error.message : 'Artifact content is not canonical JSON'
		};
	}

	if (historyBytes > AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES) {
		return {
			ok: false,
			code: 'history_too_large',
			detail: `Frozen history exceeds ${AGENTIC_CHAT_INPUT_HISTORY_MAX_BYTES} UTF-8 bytes`
		};
	}

	const contentBytes = utf8ByteLength(canonicalContent);
	if (contentBytes > AGENTIC_CHAT_INPUT_ARTIFACT_MAX_BYTES) {
		return {
			ok: false,
			code: 'artifact_too_large',
			detail: `Input artifact exceeds ${AGENTIC_CHAT_INPUT_ARTIFACT_MAX_BYTES} UTF-8 bytes`
		};
	}

	const contentHash = await sha256Hex(canonicalContent);
	if (contentHash !== artifact.contentHash) {
		return {
			ok: false,
			code: 'hash_mismatch',
			detail: 'Stored content hash does not match the canonical input artifact'
		};
	}

	return {
		ok: true,
		contentHash,
		contentBytes,
		historyBytes,
		normalizedContent
	};
}

export function createAgentStreamEventIdV1(
	turnRunId: string,
	executionGeneration: number,
	sequenceIndex: number
): string {
	if (!turnRunId || turnRunId.includes(':')) {
		throw new Error('turnRunId must be nonempty and cannot contain a colon');
	}
	if (!Number.isSafeInteger(executionGeneration) || executionGeneration < 0) {
		throw new Error('executionGeneration must be a nonnegative safe integer');
	}
	if (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 1) {
		throw new Error('sequenceIndex must be a positive safe integer');
	}
	return `${turnRunId}:${executionGeneration}:${sequenceIndex}`;
}

export function parseAgentStreamEventIdV1(
	eventId: string
): { turnRunId: string; executionGeneration: number; sequenceIndex: number } | null {
	const match = /^(.*):([0-9]+):([0-9]+)$/.exec(eventId);
	if (!match || !match[1] || match[1].includes(':')) return null;

	const executionGeneration = Number(match[2]);
	const sequenceIndex = Number(match[3]);
	if (
		!Number.isSafeInteger(executionGeneration) ||
		executionGeneration < 0 ||
		!Number.isSafeInteger(sequenceIndex) ||
		sequenceIndex < 1
	) {
		return null;
	}

	return { turnRunId: match[1], executionGeneration, sequenceIndex };
}

/**
 * Pure representation of the database terminal-CAS predicate. The Phase 2 RPC
 * remains the only authority that may commit the decision.
 */
export function decideTerminalFinalizationV1(input: {
	currentStatus: ChatTurnStatusV1;
	currentGeneration: number;
	requestedGeneration: number;
	requestedStatus: ChatTurnTerminalStatusV1;
	cancelRequestedAt: string | null;
}): TerminalFinalizationDecisionV1 {
	if (isTerminalChatTurnStatusV1(input.currentStatus)) {
		return { decision: 'already_terminal', status: input.currentStatus };
	}
	if (input.currentGeneration !== input.requestedGeneration) {
		return { decision: 'stale_generation' };
	}
	if (input.currentStatus === 'queued') {
		return input.requestedStatus === 'cancelled'
			? { decision: 'commit', status: 'cancelled' }
			: { decision: 'invalid_status' };
	}
	if (input.cancelRequestedAt !== null && input.requestedStatus !== 'cancelled') {
		return { decision: 'cancel_requested' };
	}
	return { decision: 'commit', status: input.requestedStatus };
}

/**
 * Pure mirror of the database whole-turn recovery policy. Unknown or
 * post-boundary failures never inherit the generic queue's retry default.
 */
export function decideAgenticChatRecoveryV1(input: {
	currentStatus: ChatTurnStatusV1;
	currentGeneration: number;
	requestedGeneration: number;
	failureClass: AgenticChatRecoveryFailureClassV1;
	cancelRequested: boolean;
	executionStarted: boolean;
	mutationReserved: boolean;
	irreversibleBoundaryCrossed: boolean;
	effectCount: number;
	blockingEffectCount: number;
	queueAttempts: number;
	queueMaxAttempts: number;
	queueResidenceExpired: boolean;
}): AgenticChatRecoveryDecisionV1 {
	if (isTerminalChatTurnStatusV1(input.currentStatus)) {
		return { decision: 'reconcile_terminal_queue' };
	}
	if (input.currentGeneration !== input.requestedGeneration) {
		return { decision: 'stale_generation' };
	}
	if (input.currentStatus === 'queued') {
		return { decision: 'already_requeued' };
	}
	if (input.currentStatus !== 'running') {
		return { decision: 'invalid_status' };
	}
	if (input.cancelRequested) {
		return { decision: 'finalize_cancelled', failureCode: 'cancelled' };
	}
	if (input.blockingEffectCount > 0) {
		return { decision: 'effect_reconciliation_required' };
	}

	const retryableClass =
		input.failureClass === 'transient_infra' ||
		input.failureClass === 'provider_throttle' ||
		input.failureClass === 'timeout_pre_start';
	const beforeAllExecutionBoundaries =
		!input.executionStarted &&
		!input.mutationReserved &&
		!input.irreversibleBoundaryCrossed &&
		input.effectCount === 0;
	const attemptsRemain = input.queueAttempts + 1 < input.queueMaxAttempts;
	const timeoutRetryAvailable =
		input.failureClass !== 'timeout_pre_start' || input.queueAttempts === 0;

	if (
		retryableClass &&
		beforeAllExecutionBoundaries &&
		!input.queueResidenceExpired &&
		attemptsRemain &&
		timeoutRetryAvailable
	) {
		return { decision: 'retry', failureCode: input.failureClass };
	}

	return {
		decision: 'finalize_failed',
		failureCode: input.queueResidenceExpired ? 'stale_context' : input.failureClass,
		retryExhausted:
			retryableClass &&
			beforeAllExecutionBoundaries &&
			(!attemptsRemain || !timeoutRetryAvailable)
	};
}

export function isTerminalChatTurnStatusV1(
	status: ChatTurnStatusV1
): status is ChatTurnTerminalStatusV1 {
	return status === 'completed' || status === 'failed' || status === 'cancelled';
}

async function sha256Hex(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error('Web Crypto SHA-256 support is required');
	const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function cloneCanonicalJson<T>(value: T): T {
	return JSON.parse(canonicalizeAgenticChatJson(value as unknown as JsonValue)) as T;
}

function canonicalizeAttachmentV1(
	attachment: NormalizedChatAttachmentV1
): NormalizedChatAttachmentV1 {
	return {
		attachment_kind: attachment.attachment_kind,
		media_type: attachment.media_type,
		asset_id: attachment.asset_id,
		temporary_attachment_id: attachment.temporary_attachment_id,
		project_id: attachment.project_id,
		role: attachment.role,
		display_order: attachment.display_order,
		file_name: attachment.file_name,
		content_type: attachment.content_type,
		file_size_bytes: attachment.file_size_bytes,
		width: attachment.width,
		height: attachment.height,
		checksum_sha256: attachment.checksum_sha256,
		ocr_status: attachment.ocr_status,
		extraction_summary: attachment.extraction_summary,
		extracted_text_preview: attachment.extracted_text_preview
	};
}

function canonicalizeJsonValue(
	value: JsonValue | undefined,
	ancestors: WeakSet<object>,
	path: string
): string {
	if (value === null) return 'null';
	if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
		return JSON.stringify(value);
	}
	if (value === undefined) throw new TypeError(`Undefined value at ${path}`);
	if (typeof value !== 'object') throw new TypeError(`Unsupported JSON value at ${path}`);
	if (ancestors.has(value)) throw new TypeError(`Cyclic JSON value at ${path}`);

	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			return `[${value
				.map((entry, index) => canonicalizeJsonValue(entry, ancestors, `${path}[${index}]`))
				.join(',')}]`;
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError(`Non-plain JSON object at ${path}`);
		}

		return `{${Object.keys(value)
			.filter((key) => value[key] !== undefined)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalizeJsonValue(value[key], ancestors, `${path}.${key}`)}`
			)
			.join(',')}}`;
	} finally {
		ancestors.delete(value);
	}
}
