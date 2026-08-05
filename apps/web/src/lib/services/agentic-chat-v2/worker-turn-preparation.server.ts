// apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_RETENTION_MS,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	hashCanonicalAdmissionRequestV1,
	hashTurnInputArtifactContentV1,
	normalizeAgenticChatText,
	normalizeTurnInputArtifactContentV1,
	validateTurnInputArtifactV1,
	type AgentChatTransportContextV1,
	type AgenticChatContextUsageSnapshotV1,
	type AgenticChatSessionEventSnapshotV1,
	type ChatAttachmentRef,
	type ChatContextType,
	type ChatSession,
	type Database,
	type FrozenHistoryMessageV1,
	type Json,
	type JsonObject,
	type LastTurnContext,
	type ProjectFocus,
	type TurnInputArtifactContentV1
} from '@buildos/shared-types';
import {
	applyActiveDomainSignalsOverlay,
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT
} from '$lib/services/agentic-chat-lite/prompt';
import { buildEntityResolutionHint } from './entity-resolution';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	isFastChatContextCacheFresh,
	normalizeFastChatContextSnapshot
} from './context-cache';
import { checkDailyBriefAccess, checkProjectAccess } from './access-checks';
import {
	appendAttachmentContextToMessage,
	buildAttachmentOnlyDisplayText,
	normalizeChatAttachmentsForAdmission,
	sanitizeAttachmentRefsForMetadata
} from './attachments';
import { composeFastChatHistory } from './history-composer';
import { buildFastContextUsageSnapshot } from './context-usage';
import { buildLastTurnContinuityHint } from './last-turn-context';
import {
	inspectPreparedPromptAdmissionLineage,
	inspectPreparedPromptForWorkerAdmission
} from './prepared-prompt-consumer.server';
import { normalizePreparedHistoryForModel } from './prepared-prompt-history';
import { resolveFastChatScaffoldConfigFromEnv } from './scaffold-variant';
import { projectWorkerFrozenHistorySnapshot } from './session-service';
import { loadFastChatPromptContext } from './context-loader';
import { loadValidatedChatAttachments } from './stream-attachments';
import { buildPendingTurnIntentSystemMessage } from './turn-intent';
import { resolveFastChatTurnPreparation } from './turn-preparation';
import type { FastChatHistoryMessage } from './types';
import type { LegacyFallbackHistorySnapshot } from './turn-admission';
import {
	observeAgenticChatWorkerCapacityWithRetry,
	type AgenticChatWorkerCapacityDecisionV1
} from './worker-turn-capacity.server';
import type { AgenticChatWorkerAdmissionRpcArgs } from './worker-turn-admission.server';

const WORKER_TURNS_ENDPOINT = '/api/agent/v2/turns';
const HISTORY_LIMIT = positiveInt(process.env.FASTCHAT_HISTORY_LOOKBACK_MESSAGES, 10, 50);
const HISTORY_COMPRESSION_THRESHOLD = positiveInt(
	process.env.FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
	8,
	50
);
const HISTORY_TAIL_MESSAGES = positiveInt(process.env.FASTCHAT_HISTORY_TAIL_MESSAGES, 4, 50);
const HISTORY_MAX_SUMMARY_CHARS = positiveInt(
	process.env.FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
	420,
	20_000
);
const HISTORY_MAX_MESSAGE_CHARS = positiveInt(
	process.env.FASTCHAT_HISTORY_MAX_MESSAGE_CHARS,
	1200,
	100_000
);
const CONTEXT_SHIFT_HINT_TTL_MS = positiveInt(
	process.env.FASTCHAT_CONTEXT_SHIFT_HINT_TTL_MS,
	120_000,
	3_600_000
);
const MAX_ATTACHMENTS = positiveInt(process.env.AGENT_CHAT_MAX_IMAGE_ATTACHMENTS_PER_TURN, 4, 16);
const ATTACHMENT_TEXT_MAX_CHARS = positiveInt(
	process.env.AGENT_CHAT_ATTACHMENT_TEXT_MAX_CHARS,
	2200,
	20_000
);
const ATTACHMENT_CONTEXT_MAX_CHARS = positiveInt(
	process.env.AGENT_CHAT_ATTACHMENT_CONTEXT_MAX_CHARS,
	7000,
	100_000
);
const TEMP_IMAGE_MAX_BYTES = positiveInt(
	process.env.AGENT_CHAT_IMAGE_MAX_BYTES,
	25 * 1024 * 1024,
	100 * 1024 * 1024
);
const STORAGE_BUCKET = 'onto-assets';
const TEMP_ATTACHMENT_PATH_PREFIX = 'users';
const SCAFFOLD = resolveFastChatScaffoldConfigFromEnv(process.env);

type FastChatSupabaseClient = SupabaseClient<Database>;

export type AgenticChatWorkerCommandInput = {
	clientTurnId: string;
	streamRunId: string;
	sessionId: string | null;
	context: AgentChatTransportContextV1;
	message: string;
	attachments: ChatAttachmentRef[];
	projectFocus: ProjectFocus | null;
	lastTurnContext: LastTurnContext | null;
	voiceNoteGroupId: string | null;
	preparedPromptKey: string | null;
};

export type AgenticChatWorkerLeaseAuthority = {
	decisionId: string;
	mode: 'worker_realtime';
	contractVersion: typeof AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
};

export type AgenticChatWorkerPreparationResult = {
	args: AgenticChatWorkerAdmissionRpcArgs;
	capacity: AgenticChatWorkerCapacityDecisionV1;
	preparedPromptUsed: boolean;
};

export type AgenticChatWorkerPreparationErrorCode =
	| 'invalid_command'
	| 'access_denied'
	| 'session_conflict'
	| 'database_error'
	| 'protocol_error';

export class AgenticChatWorkerPreparationError extends Error {
	constructor(
		readonly code: AgenticChatWorkerPreparationErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatWorkerPreparationError';
	}
}

export type AgenticChatWorkerPreparationDependencies = {
	createId?: () => string;
	nowMs?: () => number;
	observeCapacity?: () => Promise<AgenticChatWorkerCapacityDecisionV1>;
};

/**
 * Build the one trusted value accepted by the atomic worker admission adapter.
 * The browser supplies only command intent and a separately verified lease;
 * ownership, context, history, prompt content, hashes, capacity, and durable
 * identities are all derived here.
 */
export async function prepareAgenticChatWorkerAdmission(input: {
	userClient: FastChatSupabaseClient;
	serviceClient: FastChatSupabaseClient;
	userId: string;
	command: AgenticChatWorkerCommandInput;
	lease: AgenticChatWorkerLeaseAuthority;
	dependencies?: AgenticChatWorkerPreparationDependencies;
}): Promise<AgenticChatWorkerPreparationResult> {
	const createId = input.dependencies?.createId ?? randomUUID;
	const nowMs = input.dependencies?.nowMs?.() ?? Date.now();
	const nowIso = new Date(nowMs).toISOString();
	if (!Number.isFinite(Date.parse(nowIso))) throw protocolError('Preparation time is invalid');

	// Started here so the observation deadline overlaps the preparation work
	// below instead of stacking after it inside the route's bounded duration;
	// the decision is awaited only when the admission args are assembled.
	const capacityObservation = (
		input.dependencies?.observeCapacity ??
		(() => observeAgenticChatWorkerCapacityWithRetry('turn_admission'))
	)();
	capacityObservation.catch(() => {});

	const contextType = input.command.context.type as ChatContextType;
	const entityId = input.command.context.entityId;
	const projectId = input.command.context.projectId;
	const normalizedMessage = normalizeAgenticChatText(input.command.message);
	if (!normalizedMessage && input.command.attachments.length === 0) {
		throw invalidCommand('Message or attachment is required');
	}
	if (input.command.attachments.length > MAX_ATTACHMENTS) {
		throw invalidCommand(`At most ${MAX_ATTACHMENTS} image attachments are allowed`);
	}
	if (contextType === 'daily_brief' && !entityId) {
		throw invalidCommand('Daily brief context requires an entity');
	}

	await verifyContextAccess({
		userClient: input.userClient,
		userId: input.userId,
		contextType,
		entityId,
		projectId
	});

	const attachmentValidation = await loadValidatedChatAttachments({
		supabase: input.userClient,
		userId: input.userId,
		projectId,
		attachments: input.command.attachments,
		endpoint: WORKER_TURNS_ENDPOINT,
		httpMethod: 'POST',
		maxExtractedTextChars: ATTACHMENT_TEXT_MAX_CHARS,
		tempAttachmentPathPrefix: TEMP_ATTACHMENT_PATH_PREFIX,
		storageBucket: STORAGE_BUCKET,
		maxTempImageBytes: TEMP_IMAGE_MAX_BYTES,
		createAdminClient: () => input.serviceClient as never
	});
	if ('error' in attachmentValidation) {
		if (attachmentValidation.error.status === 403) {
			throw accessDenied('One or more attachments are unavailable');
		}
		throw invalidCommand('One or more attachments are invalid');
	}
	const attachments = attachmentValidation.attachments;
	const normalizedAttachments = normalizeChatAttachmentsForAdmission(attachments);
	const storedUserMessageContent =
		normalizedMessage || buildAttachmentOnlyDisplayText(attachments.length);
	const messageForModel = appendAttachmentContextToMessage(normalizedMessage, attachments, {
		maxChars: ATTACHMENT_CONTEXT_MAX_CHARS,
		rawMediaPassedToModel: false
	});

	const sessionIntent = await resolveWorkerSessionIntent({
		serviceClient: input.serviceClient,
		userId: input.userId,
		requestedSessionId: input.command.sessionId,
		contextType,
		entityId,
		projectFocus: input.command.projectFocus
	});
	const conversationSummary =
		typeof sessionIntent.session?.summary === 'string' ? sessionIntent.session.summary : null;
	const agentMetadata = sessionIntent.session?.agent_metadata ?? sessionIntent.inlineMetadata;
	const turnPreparation = resolveFastChatTurnPreparation({
		contextType,
		entityId,
		projectId,
		projectFocus: input.command.projectFocus,
		latestUserMessage: messageForModel,
		conversationSummary,
		agentMetadata,
		contextShiftHintTtlMs: CONTEXT_SHIFT_HINT_TTL_MS,
		nowMs,
		scaffold: SCAFFOLD
	});

	const preparedAdmissionLineage = sessionIntent.session
		? await inspectPreparedPromptAdmissionLineage({
				supabase: input.serviceClient,
				key: input.command.preparedPromptKey,
				userId: input.userId,
				sessionId: sessionIntent.session.id,
				cacheKey: turnPreparation.cacheKey,
				surfaceProfile: turnPreparation.selectedSurfaceProfile
			})
		: null;
	const requestHash = await hashCanonicalAdmissionRequestV1({
		version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
		clientTurnId: input.command.clientTurnId,
		streamRunId: input.command.streamRunId,
		context: {
			type: contextType,
			entityId,
			projectId
		},
		message: storedUserMessageContent,
		attachments: normalizedAttachments,
		voiceNoteGroupId: input.command.voiceNoteGroupId,
		preparedPromptLineage: {
			id: preparedAdmissionLineage?.id ?? null,
			acceptedSurfaceProfile: preparedAdmissionLineage?.acceptedSurfaceProfile ?? null
		}
	});

	const preparedInspection = sessionIntent.session
		? await inspectPreparedPromptForWorkerAdmission({
				supabase: input.serviceClient,
				key: input.command.preparedPromptKey,
				userId: input.userId,
				sessionId: sessionIntent.session.id,
				cacheKey: turnPreparation.cacheKey,
				surfaceProfile: turnPreparation.selectedSurfaceProfile,
				contextType,
				tools: turnPreparation.tools,
				scaffold: SCAFFOLD.prompt,
				nowMs
			})
		: ({ hit: false, reason: 'missing_key' } as const);

	const requestLastTurnContext = input.command.lastTurnContext;
	const continuityHint = buildLastTurnContinuityHint(requestLastTurnContext);
	let modelHistory: HistoryWithLineage[];
	let historySource: 'admission_window' | 'prepared_prompt';
	let preparedArtifact: TurnInputArtifactContentV1['prepared'];
	let preparedPromptId: string | null = null;
	let preparedContextPayloadSha256: string | null = null;
	let preparedSurfaceProfile: string | null = null;

	if (preparedInspection.hit) {
		historySource = 'prepared_prompt';
		modelHistory = normalizePreparedHistoryForModel(
			preparedInspection.row.history_for_model
		).map((message) => ({ ...message, sourceMessageId: null }));
		preparedPromptId = preparedInspection.row.id;
		preparedContextPayloadSha256 = canonicalSha256(
			preparedInspection.row.context_payload_sha256
		);
		preparedSurfaceProfile = turnPreparation.selectedSurfaceProfile;
		preparedArtifact = {
			sourcePreparedPromptId: preparedPromptId,
			contextPayload: toJsonObject(preparedInspection.row.context_payload),
			conversationSummary: preparedInspection.row.conversation_summary ?? null,
			surfaceProfile: preparedSurfaceProfile,
			systemPrompt: preparedInspection.surface.system_prompt,
			promptSections: toJsonObjectArray(preparedInspection.surface.sections),
			toolSurface: buildToolSurface(
				turnPreparation.selectedSurfaceProfile,
				turnPreparation.tools
			)
		};
	} else {
		historySource = 'admission_window';
		const rawHistory = sessionIntent.session
			? await loadOwnedWorkerHistory({
					serviceClient: input.serviceClient,
					userId: input.userId,
					sessionId: sessionIntent.session.id,
					limit: HISTORY_LIMIT
				})
			: [];
		const historyComposition = composeFastChatHistory({
			history: rawHistory,
			continuityHint,
			sessionSummary: conversationSummary,
			settings: {
				compressionThresholdMessages: HISTORY_COMPRESSION_THRESHOLD,
				tailMessagesWhenCompressed: HISTORY_TAIL_MESSAGES,
				maxSummaryChars: HISTORY_MAX_SUMMARY_CHARS,
				maxMessageChars: HISTORY_MAX_MESSAGE_CHARS
			}
		});
		modelHistory = historyComposition.historyForModel.map((message) => ({
			...message,
			sourceMessageId: readHistorySourceMessageId(message)
		}));
		const pendingIntentMessage = buildPendingTurnIntentSystemMessage(
			turnPreparation.turnIntent
		);
		if (pendingIntentMessage) {
			modelHistory.push({
				role: 'system',
				content: pendingIntentMessage,
				sourceMessageId: null
			});
		}

		const trustedPromptContext = await resolveTrustedPromptContext({
			userClient: input.userClient,
			userId: input.userId,
			contextType,
			entityId,
			projectFocus: input.command.projectFocus,
			turnPreparation
		});
		const promptContext = {
			...trustedPromptContext,
			conversationSummary,
			entityResolutionHint: buildEntityResolutionHint(requestLastTurnContext)
		};
		let envelope = buildLitePromptEnvelope({
			...promptContext,
			tools: turnPreparation.tools,
			productSurface: WORKER_TURNS_ENDPOINT,
			conversationPosition: `worker admission ${input.command.streamRunId}`,
			currentUserMessage: messageForModel,
			domainSensingResult: null,
			scaffold: SCAFFOLD.prompt
		});
		envelope = applyActiveDomainSignalsOverlay(envelope, {
			currentUserMessage: messageForModel,
			conversationSummary,
			priorDomainIds: turnPreparation.priorDomainIds,
			priorOutcomeCardIds: turnPreparation.priorOutcomeCardIds,
			domainSensingResult: turnPreparation.turnDomainSensing,
			skillGatePreload: null,
			turnSituation: null,
			scaffold: SCAFFOLD.prompt
		});
		preparedArtifact = {
			sourcePreparedPromptId: null,
			contextPayload: toJsonObject(promptContext),
			conversationSummary,
			surfaceProfile: turnPreparation.selectedSurfaceProfile,
			systemPrompt: envelope.systemPrompt,
			promptSections: toJsonObjectArray(envelope.sections),
			toolSurface: buildToolSurface(
				turnPreparation.selectedSurfaceProfile,
				turnPreparation.tools
			)
		};
	}

	// A newly created inline session must stay history/lineage free even when a
	// stale prepared key or continuity hint was submitted by the browser.
	if (!sessionIntent.session) {
		historySource = 'admission_window';
		modelHistory = [];
		preparedPromptId = null;
		preparedContextPayloadSha256 = null;
		preparedSurfaceProfile = null;
		preparedArtifact = { ...preparedArtifact, sourcePreparedPromptId: null };
	}

	const frozenHistory = freezeHistory(modelHistory);
	const sessionSnapshot = buildWorkerSessionEventSnapshot({
		session: sessionIntent.session,
		inlineAgentMetadata: turnPreparation.sessionMetadata
	});
	const contextUsageSnapshot = toJsonObject(
		buildFastContextUsageSnapshot({
			systemPrompt: preparedArtifact.systemPrompt,
			history: frozenHistory,
			userMessage: messageForModel
		})
	) as AgenticChatContextUsageSnapshotV1;
	const artifactContent = normalizeTurnInputArtifactContentV1({
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource,
		history: frozenHistory,
		prepared: {
			...preparedArtifact,
			sessionSnapshot,
			contextUsageSnapshot
		}
	});
	const artifactContentHash = await hashTurnInputArtifactContentV1(artifactContent);
	const artifactValidation = await validateTurnInputArtifactV1(
		{
			...artifactContent,
			createdAt: nowIso,
			retainUntil: new Date(nowMs + AGENTIC_CHAT_INPUT_RETENTION_MS).toISOString(),
			contentHash: artifactContentHash
		},
		{ excludedMessageId: null }
	);
	if (!artifactValidation.ok) {
		throw protocolError(`Prepared input artifact is invalid: ${artifactValidation.code}`);
	}

	const turnRunId = canonicalGeneratedUuid(createId(), 'turn');
	const userMessageId = canonicalGeneratedUuid(createId(), 'message');
	const inputArtifactId = canonicalGeneratedUuid(createId(), 'artifact');
	const correlationId = canonicalGeneratedUuid(createId(), 'correlation');
	const userMessageMetadata: Record<string, Json | undefined> = {
		client_turn_id: input.command.clientTurnId,
		stream_run_id: input.command.streamRunId,
		idempotency_key: `chat-turn:${turnRunId}:user`
	};
	if (input.command.voiceNoteGroupId) {
		userMessageMetadata.voice_note_group_id = input.command.voiceNoteGroupId;
	}
	if (attachments.length > 0) {
		userMessageMetadata.attachment_count = attachments.length;
		userMessageMetadata.attachment_only = normalizedMessage.length === 0;
		userMessageMetadata.attachments = sanitizeAttachmentRefsForMetadata(
			attachments
		) as unknown as Json;
	}
	const requestPayload = toJsonObject({
		message: storedUserMessageContent,
		sessionId: sessionIntent.session?.id ?? null,
		clientTurnId: input.command.clientTurnId,
		streamRunId: input.command.streamRunId,
		context: input.command.context,
		projectFocus: input.command.projectFocus,
		lastTurnContext: input.command.lastTurnContext,
		attachments: normalizedAttachments,
		voiceNoteGroupId: input.command.voiceNoteGroupId,
		promptVariant: LITE_PROMPT_VARIANT,
		surfaceProfile: turnPreparation.selectedSurfaceProfile,
		preparedPromptId
	});
	const capacity = await capacityObservation;

	return {
		args: {
			p_user_id: input.userId,
			p_session_id: sessionIntent.session?.id ?? null,
			p_turn_run_id: turnRunId,
			p_user_message_id: userMessageId,
			p_input_artifact_id: inputArtifactId,
			p_stream_run_id: input.command.streamRunId,
			p_client_turn_id: input.command.clientTurnId,
			p_request_hash: requestHash,
			p_request_hash_version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
			p_transport_contract_version: input.lease.contractVersion,
			p_transport_decision_id: input.lease.decisionId,
			p_correlation_id: correlationId,
			p_context_type: contextType,
			p_entity_id: entityId,
			p_project_id: projectId,
			p_source: 'live_ui',
			p_gateway_enabled: true,
			p_request_message: storedUserMessageContent,
			p_request_payload: requestPayload as Json,
			p_request_payload_version: 'agentic_chat_request_v1',
			p_user_message_content: storedUserMessageContent,
			p_user_message_metadata: userMessageMetadata as Json,
			p_history_limit: HISTORY_LIMIT,
			p_history_source: artifactValidation.normalizedContent.historySource,
			p_artifact_history: artifactValidation.normalizedContent.history as unknown as Json,
			p_artifact_prepared: artifactValidation.normalizedContent.prepared as unknown as Json,
			p_artifact_content_hash: artifactValidation.contentHash,
			p_artifact_history_bytes: artifactValidation.historyBytes,
			p_artifact_content_bytes: artifactValidation.contentBytes,
			p_prepared_prompt_id: preparedPromptId,
			p_prepared_context_payload_sha256: preparedContextPayloadSha256,
			p_prepared_surface_profile: preparedSurfaceProfile,
			p_session_agent_metadata: toJsonObject(
				sessionIntent.session ? {} : turnPreparation.sessionMetadata
			) as Json,
			p_capacity_available: capacity.available
		},
		capacity,
		preparedPromptUsed: preparedPromptId !== null
	};
}

type WorkerSessionIntent = {
	session: ChatSession | null;
	inlineMetadata: JsonObject;
};

function buildWorkerSessionEventSnapshot(input: {
	session: ChatSession | null;
	inlineAgentMetadata: unknown;
}): AgenticChatSessionEventSnapshotV1 {
	const source = toJsonObject(
		input.session ?? {
			summary: null,
			agent_metadata: input.inlineAgentMetadata
		}
	);
	const { id: _databaseScopedId, ...snapshot } = source;
	return snapshot as AgenticChatSessionEventSnapshotV1;
}

async function resolveWorkerSessionIntent(params: {
	serviceClient: FastChatSupabaseClient;
	userId: string;
	requestedSessionId: string | null;
	contextType: ChatContextType;
	entityId: string | null;
	projectFocus: ProjectFocus | null;
}): Promise<WorkerSessionIntent> {
	if (params.requestedSessionId) {
		const { data, error } = await params.serviceClient
			.from('chat_sessions')
			.select('*')
			.eq('id', params.requestedSessionId)
			.eq('user_id', params.userId)
			.maybeSingle();
		if (error) throw databaseError('Worker session lookup failed');
		if (!data) throw sessionConflict('Worker session is unavailable');
		if (
			data.context_type !== params.contextType ||
			(data.entity_id ?? null) !== params.entityId
		) {
			throw sessionConflict('Worker session scope does not match');
		}
		return { session: data, inlineMetadata: {} };
	}

	if (params.contextType === 'daily_brief' && params.entityId) {
		const { data, error } = await params.serviceClient
			.from('chat_sessions')
			.select('*')
			.eq('user_id', params.userId)
			.eq('context_type', 'daily_brief')
			.eq('entity_id', params.entityId)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (error) throw databaseError('Canonical worker session lookup failed');
		if (data) return { session: data, inlineMetadata: {} };
	}

	return {
		session: null,
		inlineMetadata: params.projectFocus ? toJsonObject({ focus: params.projectFocus }) : {}
	};
}

async function verifyContextAccess(params: {
	userClient: FastChatSupabaseClient;
	userId: string;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
}): Promise<void> {
	if (params.contextType === 'daily_brief' && params.entityId) {
		const access = await checkDailyBriefAccess(
			params.userClient,
			params.entityId,
			params.userId,
			undefined,
			{ endpoint: WORKER_TURNS_ENDPOINT, httpMethod: 'POST' }
		);
		if (!access.allowed) throw accessDenied('Daily brief access denied');
	}
	if (params.projectId) {
		const access = await checkProjectAccess(params.userClient, params.projectId, undefined, {
			userId: params.userId,
			endpoint: WORKER_TURNS_ENDPOINT,
			httpMethod: 'POST'
		});
		if (!access.allowed) throw accessDenied('Project access denied');
	}
}

type HistoryWithLineage = FastChatHistoryMessage & { sourceMessageId: string | null };

async function loadOwnedWorkerHistory(params: {
	serviceClient: FastChatSupabaseClient;
	userId: string;
	sessionId: string;
	limit: number;
}): Promise<HistoryWithLineage[]> {
	const { data, error } = await params.serviceClient
		.from('chat_messages')
		.select('id, role, content, metadata, created_at')
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
		.limit(params.limit);
	if (error || !Array.isArray(data)) throw databaseError('Worker history lookup failed');

	const allowedRoles = new Set(['user', 'assistant', 'system']);
	const rows = data
		.filter(
			(row): row is typeof row & { id: string; role: FastChatHistoryMessage['role'] } =>
				typeof row.id === 'string' && allowedRoles.has(row.role)
		)
		.slice()
		.reverse();
	const ids = rows.map((row) => row.id);
	let attachmentRows: LegacyFallbackHistorySnapshot['attachments'] = [];
	if (ids.length > 0) {
		const { data: loadedAttachmentRows, error: attachmentError } = await (
			params.serviceClient as any
		)
			.from('chat_message_attachments')
			.select(
				'message_id, asset_id, project_id, attachment_kind, media_type, role, display_order, metadata, asset:onto_assets(id, project_id, storage_bucket, storage_path, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, ocr_status, extraction_summary, extracted_text)'
			)
			.in('message_id', ids)
			.eq('session_id', params.sessionId)
			.order('display_order', { ascending: true })
			.limit(params.limit * 8);
		if (attachmentError || !Array.isArray(loadedAttachmentRows)) {
			throw databaseError('Worker history attachment lookup failed');
		}
		attachmentRows = loadedAttachmentRows as LegacyFallbackHistorySnapshot['attachments'];
	}

	const interruptedMessageIds = rows
		.filter((row) => row.role === 'assistant' && isInterruptedMessageMetadata(row.metadata))
		.map((row) => row.id);
	const assistantMessageIds = rows.filter((row) => row.role === 'assistant').map((row) => row.id);
	const interruptedToolExecutions = await loadHistoryToolExecutions({
		serviceClient: params.serviceClient,
		messageIds: interruptedMessageIds,
		limit: Math.min(Math.max(params.limit * 32, 64), 1600),
		skillLoadsOnly: false
	});
	const loadedSkillExecutions = await loadHistoryToolExecutions({
		serviceClient: params.serviceClient,
		messageIds: assistantMessageIds,
		limit: params.limit * 6,
		skillLoadsOnly: true
	});

	return projectWorkerFrozenHistorySnapshot({
		messages: rows.map((row) => ({
			id: row.id,
			role: row.role,
			content: row.content,
			metadata: row.metadata,
			created_at: row.created_at
		})),
		attachments: attachmentRows,
		interrupted_tool_executions: interruptedToolExecutions,
		loaded_skill_executions: loadedSkillExecutions
	});
}

async function loadHistoryToolExecutions(params: {
	serviceClient: FastChatSupabaseClient;
	messageIds: string[];
	limit: number;
	skillLoadsOnly: boolean;
}): Promise<LegacyFallbackHistorySnapshot['interrupted_tool_executions']> {
	if (params.messageIds.length === 0) return [];
	let query = params.serviceClient
		.from('chat_tool_executions')
		.select(
			'message_id, provider_tool_call_id, tool_name, gateway_op, sequence_index, success, error_message, arguments, result'
		)
		.in('message_id', params.messageIds);
	if (params.skillLoadsOnly) {
		query = query.eq('tool_name', 'skill_load').eq('success', true);
	}
	const { data, error } = await query
		.order('sequence_index', { ascending: true })
		.limit(params.limit);
	if (error || !Array.isArray(data)) {
		throw databaseError('Worker history tool execution lookup failed');
	}
	return data as LegacyFallbackHistorySnapshot['interrupted_tool_executions'];
}

function isInterruptedMessageMetadata(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		value.interrupted === true ||
		value.finished_reason === 'cancelled' ||
		typeof value.interrupted_reason === 'string'
	);
}

async function resolveTrustedPromptContext(params: {
	userClient: FastChatSupabaseClient;
	userId: string;
	contextType: ChatContextType;
	entityId: string | null;
	projectFocus: ProjectFocus | null;
	turnPreparation: ReturnType<typeof resolveFastChatTurnPreparation>;
}) {
	const cached = params.turnPreparation.cachedContext;
	const canUseCache = Boolean(
		cached &&
			!params.turnPreparation.bypassContextCacheForShiftHint &&
			cached.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
			cached.key === params.turnPreparation.cacheKey &&
			isFastChatContextCacheFresh(cached)
	);
	if (cached && canUseCache) {
		const normalized = normalizeFastChatContextSnapshot(cached.context);
		if (normalized) return normalized;
	}
	return loadFastChatPromptContext({
		supabase: params.userClient,
		userId: params.userId,
		contextType: params.contextType,
		entityId: params.entityId ?? undefined,
		projectFocus: params.projectFocus ?? undefined
	});
}

function freezeHistory(history: HistoryWithLineage[]): FrozenHistoryMessageV1[] {
	return history.map((message) => ({
		sourceMessageId: message.sourceMessageId,
		role: message.role,
		content: message.content,
		attachments: normalizeChatAttachmentsForAdmission(message.attachments ?? []),
		toolCalls: (message.tool_calls ?? []).map((toolCall) => toJsonObject(toolCall)),
		toolCallId: message.tool_call_id ?? null
	}));
}

function readHistorySourceMessageId(message: FastChatHistoryMessage): string | null {
	const value = (message as FastChatHistoryMessage & { sourceMessageId?: unknown })
		.sourceMessageId;
	return typeof value === 'string' ? value : null;
}

function buildToolSurface(surfaceProfile: string, tools: unknown[]): JsonObject {
	return toJsonObject({
		surfaceProfile,
		toolNames: tools
			.map((tool) =>
				isRecord(tool) && isRecord(tool.function) && typeof tool.function.name === 'string'
					? tool.function.name
					: null
			)
			.filter((name): name is string => Boolean(name)),
		definitions: tools
	});
}

function toJsonObject(value: unknown): JsonObject {
	const serialized = JSON.stringify(value ?? {});
	const parsed = JSON.parse(serialized) as unknown;
	if (!isRecord(parsed)) throw protocolError('Trusted JSON object is invalid');
	return parsed as JsonObject;
}

function toJsonObjectArray(value: unknown): JsonObject[] {
	const serialized = JSON.stringify(value ?? []);
	const parsed = JSON.parse(serialized) as unknown;
	if (!Array.isArray(parsed) || parsed.some((entry) => !isRecord(entry))) {
		throw protocolError('Trusted JSON object array is invalid');
	}
	return parsed as JsonObject[];
}

function canonicalSha256(value: unknown): string {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
		throw protocolError('Prepared prompt integrity digest is invalid');
	}
	return value;
}

function canonicalGeneratedUuid(value: string, label: string): string {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
		throw protocolError(`Generated ${label} id is invalid`);
	}
	return value.toLowerCase();
}

function positiveInt(value: string | undefined, fallback: number, maximum: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidCommand(message: string): AgenticChatWorkerPreparationError {
	return new AgenticChatWorkerPreparationError('invalid_command', message);
}

function accessDenied(message: string): AgenticChatWorkerPreparationError {
	return new AgenticChatWorkerPreparationError('access_denied', message);
}

function sessionConflict(message: string): AgenticChatWorkerPreparationError {
	return new AgenticChatWorkerPreparationError('session_conflict', message);
}

function databaseError(message: string): AgenticChatWorkerPreparationError {
	return new AgenticChatWorkerPreparationError('database_error', message);
}

function protocolError(message: string): AgenticChatWorkerPreparationError {
	return new AgenticChatWorkerPreparationError('protocol_error', message);
}
