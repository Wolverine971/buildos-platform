// packages/shared-types/src/agentic-chat-worker-contract.ts
export const AGENTIC_CHAT_WORKER_CONTRACT_VERSION = 'agentic_chat_worker_v1' as const;
export const AGENTIC_CHAT_REQUEST_HASH_VERSION = 'agentic_chat_request_hash_v2' as const;
export const AGENTIC_CHAT_INPUT_ARTIFACT_VERSION = 'agentic_chat_input_v2' as const;

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
	signalVersion: 'agentic_chat_signal_v1';
	id: string;
	turnRunId: string;
	kind: 'cancel';
	reason: 'user_cancelled' | 'superseded' | 'timeout' | 'operator_cancelled';
	source: 'browser' | 'worker' | 'operator' | 'sweeper';
	createdAt: string;
	consumedAt: string | null;
	consumedByGeneration: number | null;
};

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
