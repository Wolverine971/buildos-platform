// apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_RETENTION_MS,
	AGENTIC_CHAT_LIVE_VISION_MAX_IMAGE_BYTES,
	AGENTIC_CHAT_LIVE_VISION_MAX_IMAGES,
	AGENTIC_CHAT_LIVE_VISION_MAX_RENDER_WIDTH,
	AGENTIC_CHAT_LIVE_VISION_MAX_SIGNED_URL_TTL_SECONDS,
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	buildAgenticChatToolSurfaceV1,
	hashCanonicalAdmissionRequestV1,
	hashTurnInputArtifactContentV1,
	normalizeAgenticChatText,
	normalizeTurnInputArtifactContentV1,
	shouldUseAgenticChatLiveVisionV1,
	validateTurnInputArtifactV1,
	type AgentChatTransportContextV1,
	type AgenticChatContextUsageSnapshotV1,
	type AgenticChatDomainMetadataSnapshotV1,
	type AgenticChatHistoryStateV1,
	type AgenticChatResumeCheckpointSnapshotV1,
	type AgenticChatSessionEventSnapshotV1,
	type AgenticChatToolSurfaceV1,
	type ChatAttachmentRef,
	type ChatContextType,
	type ChatSession,
	type ChatToolDefinition,
	type Database,
	type FrozenHistoryMessageV1,
	type Json,
	type JsonObject,
	type LastTurnContext,
	type ProjectFocus,
	type TurnInputArtifactContentV1
} from '@buildos/shared-types';
import {
	getToolDiscoveryPolicyVersion,
	getToolRegistry
} from '@buildos/agentic-chat-runtime/catalog';
import {
	applyActiveDomainSignalsOverlay,
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT,
	resolveLitePromptTurnSituation
} from '$lib/services/agentic-chat-lite/prompt';
import {
	LIVING_REFERENCE_MODE,
	resolveAgentWorkspaceFromContextData
} from '$lib/services/agentic-chat/project-domain-profiles';
import { listOutcomeCards } from '$lib/services/agentic-chat/tools/outcome-cards/catalog';
import {
	mergeDomainSessionState,
	type DomainSessionState
} from '$lib/services/agentic-chat/tools/domains/domain-session-state';
import { getDomainIdsForSkillReference } from '$lib/services/agentic-chat/tools/domains/domain-used-signals';
import { listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';
import { resolveSkillGatePreload } from '$lib/services/agentic-chat/tools/domains/skill-gate-preload';
import { buildEntityResolutionHint } from './entity-resolution';
import { checkDailyBriefAccess, checkProjectAccess } from './access-checks';
import {
	appendAttachmentContextToMessage,
	buildAttachmentOnlyDisplayText,
	freezeChatAttachmentsForArtifact,
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
import { buildPreparedPromptSurfaceKey } from './prepared-prompt-cache';
import { resolveFastChatScaffoldConfigFromEnv } from './scaffold-variant';
import { projectWorkerFrozenHistorySnapshot } from './session-service';
import { loadFastChatPromptContext } from './context-loader';
import { resolveMaterializedFastChatContext } from './materialized-context-cache.server';
import { loadValidatedChatAttachments } from './stream-attachments';
import { buildPendingTurnContractSystemMessage } from './turn-contract';
import { resolveFastChatTurnPreparation } from './turn-preparation';
import type { FastChatHistoryMessage } from './types';
import type { LegacyFallbackHistorySnapshot } from './turn-admission';
import type { AgenticChatWorkerAdmissionRpcArgs } from './worker-turn-admission.server';
import {
	freezeCheckpointResumeSnapshot,
	loadLatestActiveCheckpoint,
	recoverCheckpointResumeLifecycle
} from './turn-supervisor/checkpoint-service.server';
import { buildWorkerPromptScaffold, resolveWorkerPromptTools } from './worker-prompt-surface';

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
const SUPERVISOR_RESUMING_STALE_AFTER_MS = positiveInt(
	process.env.FASTCHAT_SUPERVISOR_RESUMING_STALE_AFTER_MS,
	15 * 60 * 1000,
	24 * 60 * 60 * 1000
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
const LIVE_VISION_ENABLED = process.env.AGENT_CHAT_LIVE_VISION_ENABLED === 'true';
let cachedDomainReferenceMaps:
	| Pick<AgenticChatDomainMetadataSnapshotV1, 'skillDomainIds' | 'outcomeCardDomainIds'>
	| undefined;
const LIVE_VISION_MAX_IMAGES = positiveInt(
	process.env.AGENT_CHAT_LIVE_VISION_MAX_IMAGES_PER_TURN,
	2,
	AGENTIC_CHAT_LIVE_VISION_MAX_IMAGES
);
const LIVE_VISION_MAX_IMAGE_BYTES = positiveInt(
	process.env.AGENT_CHAT_LIVE_VISION_MAX_IMAGE_BYTES,
	8 * 1024 * 1024,
	AGENTIC_CHAT_LIVE_VISION_MAX_IMAGE_BYTES
);
const LIVE_VISION_RENDER_WIDTH = positiveInt(
	process.env.AGENT_CHAT_LIVE_VISION_RENDER_WIDTH,
	1600,
	AGENTIC_CHAT_LIVE_VISION_MAX_RENDER_WIDTH
);
const LIVE_VISION_SIGNED_URL_TTL_SECONDS = positiveInt(
	process.env.AGENT_CHAT_LIVE_VISION_SIGNED_URL_TTL_SECONDS,
	900,
	AGENTIC_CHAT_LIVE_VISION_MAX_SIGNED_URL_TTL_SECONDS
);
const TEMP_IMAGE_MAX_BYTES = positiveInt(
	process.env.AGENT_CHAT_IMAGE_MAX_BYTES,
	25 * 1024 * 1024,
	100 * 1024 * 1024
);
const TEMP_IMAGE_TTL_SECONDS = positiveInt(
	process.env.AGENT_CHAT_TEMPORARY_IMAGE_TTL_SECONDS,
	24 * 60 * 60,
	7 * 24 * 60 * 60
);
const STORAGE_BUCKET = 'onto-assets';
const TEMP_ATTACHMENT_PATH_PREFIX = 'users';
const SCAFFOLD = resolveFastChatScaffoldConfigFromEnv(process.env);
// The dedicated worker executes the reviewed direct/control surface only. It
// cannot run the web-owned dynamic skill discovery tools, so its prompt must
// never commission those calls. Trusted server-selected skill preloads remain
// available through the per-turn domain overlay below.
const WORKER_PROMPT_SCAFFOLD = buildWorkerPromptScaffold(SCAFFOLD.prompt);

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
	preparedPromptUsed: boolean;
};

export type AgenticChatWorkerPreparationErrorCode =
	| 'invalid_command'
	| 'access_denied'
	| 'session_conflict'
	| 'transport_renegotiate'
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
	liveVisionEnabled?: boolean;
	loadResumeCheckpoint?: (input: {
		serviceClient: FastChatSupabaseClient;
		userId: string;
		sessionId: string;
		nowMs: number;
	}) => Promise<AgenticChatResumeCheckpointSnapshotV1 | null>;
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
	const turnRunId = canonicalGeneratedUuid(createId(), 'turn');
	if (!Number.isFinite(Date.parse(nowIso))) throw protocolError('Preparation time is invalid');

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
		maxTempLifetimeSeconds: TEMP_IMAGE_TTL_SECONDS,
		nowMs,
		createAdminClient: () => input.serviceClient as never
	});
	if ('error' in attachmentValidation) {
		if (attachmentValidation.error.status === 403) {
			throw accessDenied('One or more attachments are unavailable');
		}
		throw invalidCommand('One or more attachments are invalid');
	}
	const attachments = attachmentValidation.attachments;
	const liveVisionEnabled = input.dependencies?.liveVisionEnabled ?? LIVE_VISION_ENABLED;
	if (attachments.length > 0 && !liveVisionEnabled) {
		throw new AgenticChatWorkerPreparationError(
			'transport_renegotiate',
			'Worker live vision is unavailable for attachment turns'
		);
	}
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
	const resumeCheckpoint = sessionIntent.session
		? await (input.dependencies?.loadResumeCheckpoint ?? loadWorkerResumeCheckpoint)({
				serviceClient: input.serviceClient,
				userId: input.userId,
				sessionId: sessionIntent.session.id,
				nowMs
			})
		: null;
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
		projectCreateWorkflow: 'reviewed_shell',
		scaffold: SCAFFOLD
	});
	const workerToolResolution = resolveWorkerPromptTools(turnPreparation.tools);
	const workerPromptTools = workerToolResolution.tools;
	if (workerToolResolution.unavailableToolNames.length > 0) {
		throw new AgenticChatWorkerPreparationError(
			'transport_renegotiate',
			`Worker tool surface is unavailable: ${workerToolResolution.unavailableToolNames.join(', ')}`
		);
	}
	const preparedWorkerSurfaceKey = buildPreparedPromptSurfaceKey(
		turnPreparation.selectedSurfaceProfile,
		'worker_realtime'
	);

	const preparedAdmissionLineage = sessionIntent.session
		? await inspectPreparedPromptAdmissionLineage({
				supabase: input.serviceClient,
				key: input.command.preparedPromptKey,
				userId: input.userId,
				sessionId: sessionIntent.session.id,
				cacheKey: turnPreparation.cacheKey,
				surfaceProfile: preparedWorkerSurfaceKey
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
				surfaceProfile: preparedWorkerSurfaceKey,
				contextType,
				tools: workerPromptTools,
				scaffold: WORKER_PROMPT_SCAFFOLD,
				nowMs
			})
		: ({ hit: false, reason: 'missing_key' } as const);

	const requestLastTurnContext = input.command.lastTurnContext;
	const continuityHint = buildLastTurnContinuityHint(requestLastTurnContext);
	const workerSkillGatePreload = SCAFFOLD.routing.skillPreload
		? resolveSkillGatePreload(turnPreparation.turnDomainSensing, {
				allowFollowupSkillLoad: false
			})
		: null;
	// An unresolved dynamic skill gate would ask the worker to call a tool it
	// cannot execute. Only carry domain sensing into the worker prompt after the
	// trusted preload has already satisfied that gate.
	const workerPromptDomainSensing = workerSkillGatePreload
		? turnPreparation.turnDomainSensing
		: null;
	let modelHistory: HistoryWithLineage[];
	let historySource: 'admission_window' | 'prepared_prompt';
	let preparedArtifact: TurnInputArtifactContentV1['prepared'];
	let preparedPromptId: string | null = null;
	let preparedContextPayloadSha256: string | null = null;
	let preparedSurfaceProfile: string | null = null;
	let historyState: AgenticChatHistoryStateV1;

	if (preparedInspection.hit) {
		historySource = 'prepared_prompt';
		modelHistory = preparedInspection.history.history.map((message) => ({
			...message,
			sourceMessageId: null
		}));
		historyState = preparedInspection.history.state;
		preparedPromptId = preparedInspection.row.id;
		preparedContextPayloadSha256 = canonicalSha256(
			preparedInspection.row.context_payload_sha256
		);
		preparedSurfaceProfile = preparedInspection.surfaceKey;
		preparedArtifact = {
			sourcePreparedPromptId: preparedPromptId,
			contextPayload: toJsonObject(preparedInspection.row.context_payload),
			conversationSummary: preparedInspection.row.conversation_summary ?? null,
			surfaceProfile: preparedSurfaceProfile,
			systemPrompt: preparedInspection.surface.system_prompt,
			promptSections: toJsonObjectArray(preparedInspection.surface.sections),
			toolSurface: buildToolSurface(turnPreparation.selectedSurfaceProfile, workerPromptTools)
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
		historyState = {
			strategy: historyComposition.strategy,
			compressed: historyComposition.compressed,
			rawHistoryCount: historyComposition.rawHistoryCount,
			historyForModelCount: historyComposition.historyForModel.length
		};
		const trustedPromptContext = await resolveTrustedPromptContext({
			userClient: input.userClient,
			serviceClient: input.serviceClient,
			userId: input.userId,
			contextType,
			entityId,
			projectId,
			projectFocus: input.command.projectFocus,
			turnPreparation
		});
		const promptContext = {
			...trustedPromptContext,
			conversationSummary,
			entityResolutionHint: buildEntityResolutionHint(requestLastTurnContext)
		};
		const agentWorkspace = resolveAgentWorkspaceFromContextData(promptContext.data);
		const turnSituation = resolveLitePromptTurnSituation({
			toolNames: workerPromptTools.map((tool) => tool.function?.name ?? '').filter(Boolean),
			latestUserMessage: messageForModel,
			livingWorkspace: agentWorkspace?.mode === LIVING_REFERENCE_MODE,
			// The semantic disposition gate decides whether this particular message
			// is a capture; admission does not classify it from its wording.
			livingWorkspaceCapture: false,
			domainProfile: agentWorkspace?.domain_profile ?? null,
			domainAffinity: agentWorkspace?.domain_affinity ?? null
		});
		let envelope = buildLitePromptEnvelope({
			...promptContext,
			tools: workerPromptTools,
			projectCreateWorkflow: 'reviewed_shell',
			productSurface: WORKER_TURNS_ENDPOINT,
			conversationPosition: `worker admission ${input.command.streamRunId}`,
			currentUserMessage: messageForModel,
			domainSensingResult: null,
			scaffold: WORKER_PROMPT_SCAFFOLD
		});
		envelope = applyActiveDomainSignalsOverlay(envelope, {
			currentUserMessage: messageForModel,
			projectCreateWorkflow: 'reviewed_shell',
			conversationSummary,
			priorDomainIds: turnPreparation.priorDomainIds,
			priorOutcomeCardIds: turnPreparation.priorOutcomeCardIds,
			domainSensingResult: workerPromptDomainSensing,
			skillGatePreload: workerSkillGatePreload,
			turnSituation,
			scaffold: WORKER_PROMPT_SCAFFOLD
		});
		preparedArtifact = {
			sourcePreparedPromptId: null,
			contextPayload: toJsonObject(promptContext),
			conversationSummary,
			surfaceProfile: turnPreparation.selectedSurfaceProfile,
			systemPrompt: envelope.systemPrompt,
			promptSections: toJsonObjectArray(envelope.sections),
			toolSurface: buildToolSurface(turnPreparation.selectedSurfaceProfile, workerPromptTools)
		};
	}

	// Pending commissions are current session state, not prepared-prompt state.
	// Append them after either history path so a cached/prepared turn cannot
	// silently lose an unfinished semantic contract during worker adoption.
	const pendingContractMessage = buildPendingTurnContractSystemMessage(
		turnPreparation.pendingTurnContract
	);
	if (pendingContractMessage) {
		modelHistory.push({
			role: 'system',
			content: pendingContractMessage,
			sourceMessageId: null
		});
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
		historyState = {
			strategy: 'raw_history',
			compressed: false,
			rawHistoryCount: 0,
			historyForModelCount: 0
		};
	}

	const frozenHistory = freezeHistory(modelHistory);
	historyState = {
		...historyState,
		historyForModelCount: frozenHistory.length
	};
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
	const liveVisionRequested = shouldUseAgenticChatLiveVisionV1({
		message: normalizedMessage,
		attachmentCount: attachments.length,
		liveVisionEnabled
	});
	const liveVisionAttachmentCount = liveVisionRequested
		? Math.min(attachments.length, LIVE_VISION_MAX_IMAGES)
		: 0;
	const artifactContent = normalizeTurnInputArtifactContentV1({
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource,
		history: frozenHistory,
		prepared: {
			...preparedArtifact,
			historyState,
			domainMetadata: freezeWorkerDomainMetadata({
				previousState: turnPreparation.previousDomainState,
				domainSensing: turnPreparation.turnDomainSensing,
				turnRunId,
				streamRunId: input.command.streamRunId,
				nowIso
			}),
			...(resumeCheckpoint ? { resumeCheckpoint } : {}),
			currentTurn: {
				message: normalizedMessage,
				attachmentContextMaxChars: ATTACHMENT_CONTEXT_MAX_CHARS,
				liveVision: {
					requested: liveVisionRequested,
					maxImages: LIVE_VISION_MAX_IMAGES,
					maxImageBytes: LIVE_VISION_MAX_IMAGE_BYTES,
					renderWidth: LIVE_VISION_RENDER_WIDTH,
					signedUrlTtlSeconds: LIVE_VISION_SIGNED_URL_TTL_SECONDS
				},
				attachments: freezeChatAttachmentsForArtifact(attachments)
			},
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
		userMessageMetadata.live_vision_requested = liveVisionRequested;
		userMessageMetadata.live_vision_attachment_count = liveVisionAttachmentCount;
		userMessageMetadata.attachments = sanitizeAttachmentRefsForMetadata(
			attachments
		) as unknown as Json;
	}
	if (resumeCheckpoint) {
		userMessageMetadata.supervisor_resume_checkpoint_id = resumeCheckpoint.checkpointId;
		userMessageMetadata.supervisor_resume_original_turn_run_id =
			resumeCheckpoint.originalTurnRunId;
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
			// Kept true while the RPC parameter remains in the deployed contract.
			// Admission no longer treats transient worker pressure as a rejection.
			p_capacity_available: true
		},
		preparedPromptUsed: preparedPromptId !== null
	};
}

function freezeWorkerDomainMetadata(input: {
	previousState: DomainSessionState | null;
	domainSensing: Parameters<typeof mergeDomainSessionState>[1] | null;
	turnRunId: string;
	streamRunId: string;
	nowIso: string;
}): AgenticChatDomainMetadataSnapshotV1 {
	const emptyState: DomainSessionState = {
		version: 1,
		updated_at: input.nowIso,
		active_domains: [],
		active_outcome_cards: [],
		coverage_gaps: [],
		research_backlog: [],
		used_domains: [],
		unknown_domain_interests: [],
		workflow_gap_candidates: [],
		recent_observations: []
	};
	const state = input.domainSensing
		? mergeDomainSessionState(input.previousState, input.domainSensing, {
				now: input.nowIso,
				turnRunId: input.turnRunId,
				streamRunId: input.streamRunId
			})
		: (input.previousState ?? emptyState);
	const { skillDomainIds, outcomeCardDomainIds } = getWorkerDomainReferenceMaps();
	return {
		version: 1,
		sensingApplied: input.domainSensing !== null,
		state: toJsonObject(state),
		skillDomainIds,
		outcomeCardDomainIds
	};
}

function getWorkerDomainReferenceMaps(): Pick<
	AgenticChatDomainMetadataSnapshotV1,
	'skillDomainIds' | 'outcomeCardDomainIds'
> {
	if (cachedDomainReferenceMaps) return cachedDomainReferenceMaps;
	cachedDomainReferenceMaps = {
		skillDomainIds: Object.fromEntries(
			listAllSkills()
				.map(
					(skill) =>
						[skill.id, sortedUnique(getDomainIdsForSkillReference(skill.id))] as const
				)
				.sort(([left], [right]) => left.localeCompare(right))
		),
		outcomeCardDomainIds: Object.fromEntries(
			listOutcomeCards()
				.map((card) => [card.id, sortedUnique(card.domainIds)] as const)
				.sort(([left], [right]) => left.localeCompare(right))
		)
	};
	return cachedDomainReferenceMaps;
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function loadWorkerResumeCheckpoint(input: {
	serviceClient: FastChatSupabaseClient;
	userId: string;
	sessionId: string;
	nowMs: number;
}): Promise<AgenticChatResumeCheckpointSnapshotV1 | null> {
	await recoverCheckpointResumeLifecycle({
		supabase: input.serviceClient,
		userId: input.userId,
		staleBefore: new Date(input.nowMs - SUPERVISOR_RESUMING_STALE_AFTER_MS).toISOString(),
		recoveredAt: new Date(input.nowMs).toISOString()
	});
	const checkpoint = await loadLatestActiveCheckpoint({
		supabase: input.serviceClient,
		userId: input.userId,
		sessionId: input.sessionId,
		now: new Date(input.nowMs).toISOString()
	});
	return checkpoint ? freezeCheckpointResumeSnapshot(checkpoint) : null;
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
		limit: Math.min(Math.max(params.limit * 32, 64), 1600)
	});
	const continuityToolExecutions = await loadHistoryToolExecutions({
		serviceClient: params.serviceClient,
		messageIds: assistantMessageIds,
		limit: params.limit * 6,
		toolNames: ['skill_load', 'request_turn_clarification']
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
		loaded_skill_executions: continuityToolExecutions
	});
}

async function loadHistoryToolExecutions(params: {
	serviceClient: FastChatSupabaseClient;
	messageIds: string[];
	limit: number;
	toolNames?: string[];
}): Promise<LegacyFallbackHistorySnapshot['interrupted_tool_executions']> {
	if (params.messageIds.length === 0) return [];
	let query = params.serviceClient
		.from('chat_tool_executions')
		.select(
			'message_id, provider_tool_call_id, tool_name, gateway_op, sequence_index, success, error_message, arguments, result'
		)
		.in('message_id', params.messageIds);
	if (params.toolNames) {
		query = query.in('tool_name', params.toolNames).eq('success', true);
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
	serviceClient: FastChatSupabaseClient;
	userId: string;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
	projectFocus: ProjectFocus | null;
	turnPreparation: ReturnType<typeof resolveFastChatTurnPreparation>;
}) {
	const cached = params.turnPreparation.cachedContext;
	const resolution = await resolveMaterializedFastChatContext({
		sourceSupabase: params.userClient,
		storeSupabase: params.serviceClient,
		userId: params.userId,
		contextType: params.contextType,
		entityId: params.entityId,
		projectId: params.projectId,
		projectFocus: params.projectFocus,
		cacheKey: params.turnPreparation.cacheKey,
		sessionCache: params.turnPreparation.bypassContextCacheForShiftHint ? null : cached,
		loadFresh: () =>
			loadFastChatPromptContext({
				supabase: params.userClient,
				userId: params.userId,
				contextType: params.contextType,
				entityId: params.entityId ?? undefined,
				projectFocus: params.projectFocus ?? undefined
			})
	});
	return resolution.cache.context;
}

function freezeHistory(history: HistoryWithLineage[]): FrozenHistoryMessageV1[] {
	return history.map((message) => ({
		sourceMessageId: message.sourceMessageId,
		role: message.role,
		content: message.content,
		attachments: freezeChatAttachmentsForArtifact(message.attachments ?? []),
		toolCalls: (message.tool_calls ?? []).map((toolCall) => toJsonObject(toolCall)),
		toolCallId: message.tool_call_id ?? null
	}));
}

function readHistorySourceMessageId(message: FastChatHistoryMessage): string | null {
	const value = (message as FastChatHistoryMessage & { sourceMessageId?: unknown })
		.sourceMessageId;
	return typeof value === 'string' ? value : null;
}

function buildToolSurface(
	surfaceProfile: string,
	tools: ChatToolDefinition[]
): AgenticChatToolSurfaceV1 {
	return buildAgenticChatToolSurfaceV1({
		surfaceProfile,
		definitions: tools,
		registryVersion: getToolRegistry().version,
		discoveryPolicyVersion: getToolDiscoveryPolicyVersion()
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
