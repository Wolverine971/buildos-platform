// apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/handler.server.ts
/**
 * Legacy Agentic Chat HTTP/SSE execution host
 *
 * Compatibility composition root for the remaining web-hosted execution path:
 * request/admission -> context/prompt -> LLM/tools -> persistence/finalization.
 *
 * The public SvelteKit route delegates here and owns no execution behavior. Keep
 * new worker-compatible behavior out of this host; capability branches may be
 * removed only after worker parity or an explicit product retirement decision.
 */

// SSE streaming session — needs full duration + room for tool execution.
export const LEGACY_AGENT_STREAM_CONFIG = {
	maxDuration: 300,
	memory: 1024
};

import type { RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { GLM_53_FLASH_MODEL } from '@buildos/smart-llm';
import { ApiResponse } from '$lib/utils/api-response';
import { SSEResponse } from '$lib/utils/sse-response';
import { createLogger } from '$lib/utils/logger';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import {
	getClientIpFromHeaders,
	getRequestIdFromHeaders,
	getUserAgentFromHeaders
} from '$lib/server/error-tracking';
import { consumeAgenticChatTurnRateLimit } from '$lib/server/agentic-chat-turn-rate-limit';
import { OpenRouterV2Service } from '$lib/services/openrouter-v2-service';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';
import type {
	AgentTurnPhase,
	ChatContextType,
	ChatToolCall,
	ChatToolResult,
	ContextShiftPayload,
	ContextUsageSnapshot,
	Json,
	AgentTimingSummary
} from '@buildos/shared-types';
import {
	AGENTIC_CHAT_REQUEST_HASH_VERSION,
	hashCanonicalAdmissionRequestV1
} from '@buildos/shared-types';
import type { ServiceContext, ToolExecutionResult } from '$lib/services/agentic-chat/shared/types';
import type { AgentState } from '$lib/types/agent-chat-enhancement';
import {
	buildEmptyAgentState,
	sanitizeAgentStateForPrompt
} from '$lib/services/agentic-chat-v2/agent-state-sanitization';
import {
	buildPersistedToolTrace,
	buildPersistedToolTraceSummary,
	previewToolArguments
} from '$lib/services/agentic-chat-v2/tool-trace';
import {
	getToolsRequiringProjectId,
	maybeInjectProjectId
} from '$lib/services/agentic-chat-v2/tool-project-id';
import {
	buildToolExecutionContextScope,
	buildToolExecutionOntologyContext,
	buildToolExecutionProjectFocus,
	type FastChatResolvedPromptContext
} from '$lib/services/agentic-chat-v2/tool-execution-context';
import {
	checkDailyBriefAccess,
	checkProjectAccess
} from '$lib/services/agentic-chat-v2/access-checks';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { createEmailExecutorTurnState } from '$lib/services/agentic-chat/tools/core/executors/email-executor';
import { ToolExecutionService } from '$lib/services/agentic-chat/legacy-execution/tool-execution-service';
import {
	isSearchTool,
	searchToolFamily,
	searchTelemetryColumns
} from '@buildos/agentic-chat-runtime/loop';
import { v4 as uuidv4 } from 'uuid';
import {
	AgentStateReconciliationService,
	type AgentStateMessageSnapshot
} from '$lib/services/agentic-chat/state/agent-state-reconciliation-service';
import {
	createFastChatSessionService,
	extractLoadedSkillIdsFromHistory,
	projectLegacyFallbackHistorySnapshot,
	appendAttachmentContextToMessage,
	buildAttachmentOnlyDisplayText,
	buildLiveVisionContentParts,
	buildFastContextUsageSnapshot,
	loadFastChatPromptContext,
	normalizeChatAttachmentsForAdmission,
	normalizeChatAttachmentRefs,
	composeFastChatHistory,
	resolveFastChatForcedSynthesisRoutingConfig,
	buildPendingTurnIntentSystemMessage,
	buildFastChatPendingTurnContract,
	buildPendingTurnContractSystemMessage,
	resolveTurnContractOutcome,
	FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY,
	FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY,
	sanitizeAttachmentRefsForMetadata,
	shouldUseLiveVisionForTurn,
	streamFastChat,
	FASTCHAT_LIMITS,
	type FastChatHistoryMessage
} from '$lib/services/agentic-chat-v2';
import { updateAgentMetadata } from '$lib/services/agentic-chat-v2/session-metadata';
import {
	isProjectScopedContext,
	normalizeFastContextType,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId
} from '$lib/services/agentic-chat-v2/scope';
import {
	createLiveVisionSignedImages,
	loadValidatedChatAttachments,
	resolveChatAttachmentProjectId,
	type ValidatedChatAttachments
} from '$lib/services/agentic-chat-v2/stream-attachments';
import type { FastChatHistoryCompositionResult } from '$lib/services/agentic-chat-v2/history-composer';
import {
	buildLLMPassSummary,
	buildToolMessageSnapshotsForReconciliation,
	buildToolResultSummaries,
	emitToolResult,
	parseToolArgumentsForPersistence,
	persistIncrementalToolExecutionRow,
	persistToolExecutionRows
} from '$lib/services/agentic-chat-v2/turn-persistence';
import { appendResearchEntry, buildResearchEntryFromCalls } from '$lib/server/research-log.service';
import { createStatedFutureTask } from '$lib/server/stated-future.service';
import {
	didWriteWithoutDurableRecord,
	extractStatedFutureClause,
	looksLikeConservativeStatedFuture
} from '$lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions';
import {
	applyActiveDomainSignalsOverlay,
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT,
	type LitePromptEnvelope,
	type LitePromptSection,
	type LitePromptVariant,
	hasActiveSituation,
	resolveLitePromptTurnSituation
} from '$lib/services/agentic-chat-lite/prompt';
import {
	getSkillGateCandidateSkillLoadFormats,
	getSkillGateCandidateSkillIds
} from '$lib/services/agentic-chat/tools/domains/domain-sensing';
import {
	resolveSkillGatePreload,
	resolveSkillPreloadById
} from '$lib/services/agentic-chat/tools/domains/skill-gate-preload';
import {
	extractToolNamesFromDefinitions,
	materializeGatewayTools
} from '@buildos/agentic-chat-runtime/catalog';
import {
	deriveLoadedOutcomeCardGapSignalsFromToolExecutions,
	getLoadedSkillIdsFromUsedDomains,
	getNewDomainResearchBacklogEntries,
	mergeDomainSessionState,
	mergeLoadedOutcomeCardGapsIntoSessionState,
	mergeUsedDomainSignalsIntoSessionState
} from '$lib/services/agentic-chat/tools/domains/domain-session-state';
import { deriveUsedDomainSignalsFromToolExecutions } from '$lib/services/agentic-chat/tools/domains/domain-used-signals';
import { buildEntityResolutionHint } from '$lib/services/agentic-chat-v2/entity-resolution';
import { applyLivingWorkspaceToolProfile } from '$lib/services/agentic-chat-v2/living-workspace-tools';
import {
	resolveAgentWorkspaceFromContextData,
	resolveProjectDomainRuntimeSkillId
} from '$lib/services/agentic-chat/project-domain-profiles';
import {
	buildLastTurnContext,
	buildLastTurnContinuityHint
} from '$lib/services/agentic-chat-v2/last-turn-context';
import {
	buildPromptSnapshotRow,
	buildPromptSnapshotSections,
	buildToolCallEventPayload,
	buildToolResultEventPayload as buildTurnEventToolResultPayload,
	extractFastChatToolCallMeta
} from '$lib/services/agentic-chat-v2/prompt-observability';
import { buildPromptCostBreakdown } from '$lib/services/agentic-chat-v2/prompt-cost-breakdown';
import { buildToolSurfaceSizeReport } from '$lib/services/agentic-chat-v2/tool-surface-size-report';
import {
	getLoadedSkillActivity,
	getLoadedSkillToolingTelemetry,
	getRequestedSkillActivity
} from '$lib/services/agentic-chat-v2/skill-activity';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheEntry,
	isFastChatContextCacheFresh as isCacheFresh,
	normalizeFastChatContextSnapshot
} from '$lib/services/agentic-chat-v2/context-cache';
import {
	annotateContextMetaCacheAge,
	normalizeContextLoadSource,
	resolveCacheAgeSeconds
} from '$lib/services/agentic-chat-v2/context-cache-routing';
import {
	sha256Json,
	sha256Text,
	type PreparedPromptCacheMissReason,
	type PreparedPromptSectionSummary
} from '$lib/services/agentic-chat-v2/prepared-prompt-cache';
import {
	consumePreparedPrompt,
	inspectPreparedPromptAdmissionLineage,
	type PreparedPromptConsumeMissDiagnostics
} from '$lib/services/agentic-chat-v2/prepared-prompt-consumer.server';
import {
	normalizePreparedHistoryForModel,
	normalizePreparedHistoryStrategy
} from '$lib/services/agentic-chat-v2/prepared-prompt-history';
import {
	resolveFastChatStreamRunId,
	type FastChatCancelReason
} from '$lib/services/agentic-chat-v2/cancel-reason-channel';
import { LlmStreamPassTerminalError } from '$lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner';
import {
	admitLegacyAgenticChatTurn,
	DEFAULT_PROGRESS_STALE_RECLAIM_MS,
	DEFAULT_RECENT_PROGRESS_GRACE_MS,
	LegacyAgenticChatAdmissionError
} from '$lib/services/agentic-chat-v2/turn-admission';
import { resolveFastChatTurnPreparation } from '$lib/services/agentic-chat-v2/turn-preparation';
import { TurnObservabilityWriter } from '$lib/services/agentic-chat-v2/turn-observability-writer.server';
import { buildRoundToolPattern } from '$lib/services/agentic-chat-v2/stream-orchestrator/round-analysis';
import { buildSkillGateTelemetry } from '$lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions';
import {
	createLegacySseEventSink,
	emitContextShift,
	emitContextUsage,
	emitSkillActivity,
	emitToolCall,
	extractContextShiftPayload,
	type AgentChatEventPayload
} from '$lib/services/agentic-chat-v2/stream-events';
import {
	buildCheckpointResumeSystemMessage,
	createTurnCheckpoint,
	loadLatestActiveCheckpoint,
	markCheckpointResumed,
	markCheckpointResuming,
	recoverCheckpointResumeLifecycle,
	restoreCheckpointToActive,
	type ChatTurnCheckpoint
} from '$lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.server';
import { FastChatStreamConfig } from '$lib/services/agentic-chat-v2/stream-route/config.server';
import {
	FastChatRequestValidationError,
	parseFastChatStreamRequest
} from '$lib/services/agentic-chat-v2/stream-route/request';
import {
	buildContextToolSummary,
	buildProposalFocusSystemMessage,
	CLEAN_RESPONSE_FALLBACK,
	isDailyBriefContext,
	resolvePersistableAssistantContent
} from '$lib/services/agentic-chat-v2/stream-route/prompt-context';
import { FastChatCancellationMonitor } from '$lib/services/agentic-chat-v2/stream-route/cancellation-monitor.server';
import { FastChatErrorReporter } from '$lib/services/agentic-chat-v2/stream-route/error-reporter.server';
import {
	isLegacyDetachedLifecycleEnabled,
	registerLegacyTurnPromise,
	shouldCloseLegacySseSink
} from './lifecycle.server';

const logger = createLogger('API:AgentStreamV2');
const STREAM_CONFIG = FastChatStreamConfig.fromEnvironment();

const FASTCHAT_FIRST_TOOL_CALL_PLANNING_CUE = 'Planning the first step...';
const FASTCHAT_TURN_PHASE_MESSAGES: Record<Exclude<AgentTurnPhase, 'acknowledged'>, string> = {
	planning: 'Planning the best way to handle this request...',
	gathering: 'Gathering the relevant project context...',
	synthesizing: 'Turning the collected context into an answer...',
	recovering: 'The answer stream stalled. Recovering from the context already collected...',
	finalizing: 'Finalizing the response...'
};

export const handleLegacyAgentStreamWarmup: RequestHandler = async ({
	locals: { safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	return new Response(null, {
		status: 204,
		headers: {
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			Pragma: 'no-cache',
			Expires: '0',
			'X-BuildOS-Agent-Stream-Warmup': '1'
		}
	});
};

type FastChatTurnAbortReason = FastChatCancelReason | 'timeout';

function countBy(values: readonly string[]): Record<string, number> {
	return values.reduce<Record<string, number>>((counts, value) => {
		counts[value] = (counts[value] ?? 0) + 1;
		return counts;
	}, {});
}

function readMetadataString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasRenderableLiteSections(sections: readonly unknown[]): sections is LitePromptSection[] {
	if (sections.length === 0) return false;
	return sections.every((section) => {
		if (!section || typeof section !== 'object' || Array.isArray(section)) return false;
		const record = section as Record<string, unknown>;
		return typeof record.id === 'string' && typeof record.content === 'string';
	});
}

function isExpectedToolValidationFailure(errorMessage: string | null | undefined): boolean {
	if (!errorMessage) return false;
	return (
		/Tool validation failed/i.test(errorMessage) ||
		/Missing required parameter/i.test(errorMessage) ||
		/No update fields provided/i.test(errorMessage) ||
		/Invalid .*expected UUID/i.test(errorMessage) ||
		/Tool arguments must be a JSON object/i.test(errorMessage) ||
		/Invalid JSON in tool arguments/i.test(errorMessage)
	);
}

export const handleLegacyAgentStream: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	fetch
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}
	const turnRateLimit = consumeAgenticChatTurnRateLimit(user.id);
	if (!turnRateLimit.allowed) {
		return new Response(JSON.stringify({ error: 'Too many chat turns. Try again shortly.' }), {
			status: 429,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'private, no-store',
				...turnRateLimit.headers,
				'Retry-After': String(turnRateLimit.retryAfterSeconds ?? 1)
			}
		});
	}

	// Turn admission, observability, and supervisor checkpoints are trusted
	// server-owned lifecycle records. `chat_turn_runs` intentionally has no
	// end-user SELECT policy, so an authenticated user client cannot UPDATE a
	// row under Postgres RLS even when its UPDATE policy matches. Keep product
	// data access on the user-scoped client, and use service role only for these
	// internal records after authentication has established the trusted user id.
	const internalSupabase = createAdminSupabaseClient();
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const userId = user.id;
	const requestStartedAtMs = Date.now();
	const requestId = getRequestIdFromHeaders(request.headers);
	const requestUserAgent = getUserAgentFromHeaders(request.headers);
	const requestIpAddress = getClientIpFromHeaders(request.headers);
	const skipProjectLoopBurst = request.headers.get('X-Skip-Project-Loop-Burst') === 'true';

	const errorReporter = new FastChatErrorReporter({
		errorLogger,
		internalSupabase,
		logger,
		userId,
		endpoint: STREAM_CONFIG.endpoint,
		httpMethod: STREAM_CONFIG.httpMethod,
		requestId,
		userAgent: requestUserAgent,
		ipAddress: requestIpAddress
	});
	const persistFastChatError = errorReporter.persist;
	const logFastChatError = errorReporter.log;

	let streamRequest: Awaited<ReturnType<typeof parseFastChatStreamRequest>>;
	try {
		streamRequest = await parseFastChatStreamRequest(request);
	} catch (error) {
		const validationIssues =
			error instanceof FastChatRequestValidationError ? error.issues : null;
		logger.warn('Failed to parse V2 stream request', { error });
		logFastChatError({
			error,
			operationType: 'fastchat_stream_parse',
			metadata: {
				parseStage: validationIssues ? 'request_schema' : 'request_json',
				...(validationIssues ? { validationIssues } : {})
			}
		});
		return ApiResponse.badRequest(
			validationIssues
				? `Invalid request body: ${validationIssues.join('; ')}`
				: 'Invalid request body'
		);
	}

	const message = typeof streamRequest.message === 'string' ? streamRequest.message.trim() : '';
	const normalizedAttachmentInput = normalizeChatAttachmentRefs(streamRequest.attachments);
	if (normalizedAttachmentInput.rejected > 0) {
		return ApiResponse.badRequest('Unsupported or invalid chat attachment');
	}
	const requestAttachmentRefs = normalizedAttachmentInput.attachments;
	if (!message && requestAttachmentRefs.length === 0) {
		return ApiResponse.badRequest('Message or attachment is required');
	}
	if (requestAttachmentRefs.length > STREAM_CONFIG.attachments.maxPerTurn) {
		return ApiResponse.badRequest(
			`You can attach up to ${STREAM_CONFIG.attachments.maxPerTurn} images per message`
		);
	}
	// Lite is the only prompt path (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
	// The request input `prompt_variant` is no longer read; every session is pinned to lite.
	const promptVariant: LitePromptVariant = LITE_PROMPT_VARIANT;
	const clientTurnIdRaw = streamRequest.client_turn_id;
	const clientTurnId =
		typeof clientTurnIdRaw === 'string' && clientTurnIdRaw.trim().length > 0
			? clientTurnIdRaw.trim()
			: undefined;
	const streamRunId = resolveFastChatStreamRunId({
		requestedStreamRunId: streamRequest.stream_run_id,
		clientTurnId,
		createFallbackId: uuidv4
	});
	// `prewarmedContext` is accepted at the request boundary for older clients,
	// but the stream route must not trust unsigned client-carried prompt context.
	// The fast path is the nonce-protected prepared prompt; otherwise we use the
	// server-side session cache or reload context.
	const requestPreparedPromptKey = streamRequest.preparedPromptKey ?? null;

	const initialContextType = normalizeFastContextType(streamRequest.context_type);
	const attachmentProjectId = requestAttachmentRefs.length
		? resolveChatAttachmentProjectId(initialContextType, streamRequest)
		: null;
	const attachmentValidation =
		requestAttachmentRefs.length > 0
			? await loadValidatedChatAttachments({
					supabase,
					userId,
					projectId: attachmentProjectId,
					attachments: requestAttachmentRefs,
					errorLogger,
					endpoint: STREAM_CONFIG.endpoint,
					httpMethod: STREAM_CONFIG.httpMethod,
					maxExtractedTextChars: STREAM_CONFIG.attachments.textMaxChars,
					tempAttachmentPathPrefix: STREAM_CONFIG.storage.temporaryAttachmentPathPrefix,
					storageBucket: STREAM_CONFIG.storage.attachmentBucket,
					maxTempImageBytes: STREAM_CONFIG.attachments.temporaryImageMaxBytes
				})
			: ({ attachments: [], assets: [] } satisfies ValidatedChatAttachments);
	if ('error' in attachmentValidation) {
		return attachmentValidation.error;
	}
	const chatAttachmentRefs = attachmentValidation.attachments;
	const chatAttachmentAssets = attachmentValidation.assets;
	const liveVisionRequested = shouldUseLiveVisionForTurn({
		message,
		attachmentCount: chatAttachmentRefs.length,
		liveVisionEnabled: STREAM_CONFIG.liveVision.enabled
	});
	const liveVisionAttachmentCount = liveVisionRequested
		? Math.min(chatAttachmentRefs.length, STREAM_CONFIG.liveVision.maxAttachmentsPerTurn)
		: 0;
	const storedUserMessageContent =
		message || buildAttachmentOnlyDisplayText(chatAttachmentRefs.length);
	const messageForModel = appendAttachmentContextToMessage(message, chatAttachmentRefs, {
		maxChars: STREAM_CONFIG.attachments.contextMaxChars,
		rawMediaPassedToModel: liveVisionAttachmentCount > 0
	});
	if (isDailyBriefContext(initialContextType)) {
		const briefEntityId = streamRequest.entity_id?.trim();
		if (!briefEntityId) {
			return ApiResponse.badRequest('daily_brief context requires a brief entity_id');
		}
	}

	const turnAbortController = new AbortController();
	let turnAbortReason: FastChatTurnAbortReason | null = null;
	const abortTurn = (reason: FastChatTurnAbortReason): void => {
		if (turnAbortController.signal.aborted) return;
		turnAbortReason = reason;
		turnAbortController.abort(new Error(`FastChat turn aborted: ${reason}`));
	};
	const turnTimeoutId = setTimeout(() => {
		abortTurn('timeout');
	}, STREAM_CONFIG.detachedTurnMaxDurationMs);
	const timingEntityId = resolveEffectiveEntityId({
		contextType: initialContextType,
		entityId: streamRequest.entity_id,
		projectFocus: streamRequest.projectFocus
	});
	let timingContextType: ChatContextType = initialContextType;
	let timingSessionId: string | null = null;
	let timingProjectId = resolveEffectiveProjectId({
		contextType: initialContextType,
		entityId: timingEntityId,
		projectFocus: streamRequest.projectFocus
	});
	let sessionResolvedAtMs: number | null = null;
	let activeTurnLookupMs: number | null = null;
	let turnAdmissionMs: number | null = null;
	let historyLoadStartedAtMs: number | null = null;
	let historyLoadedAtMs: number | null = null;
	let historyComposeStartedAtMs: number | null = null;
	let historyComposedAtMs: number | null = null;
	let toolSelectionMs: number | null = null;
	let preparedPromptConsumeMs: number | null = null;
	let contextBuildStartedAtMs: number | null = null;
	let contextReadyAtMs: number | null = null;
	let promptSnapshotInsertMs: number | null = null;
	let firstEventAtMs: number | null = null;
	let firstResponseAtMs: number | null = null;
	let assistantPersistStartedAtMs: number | null = null;
	let assistantPersistedAtMs: number | null = null;
	let finalizationStartedAtMs: number | null = null;
	let doneEmittedAtMs: number | null = null;
	let historyStrategy: string | null = null;
	let historyCompressed = false;
	let rawHistoryCount: number | null = null;
	let historyForModelCount: number | null = null;
	let contextCacheSource: AgentTimingSummary['cache_source'] = 'not_requested';
	let contextLoadSource: AgentTimingSummary['context_load_source'] = 'none';
	let contextCacheAgeSecondsForTiming: number | null = null;
	let bypassedContextCache = false;
	let preparedPromptRequested = Boolean(requestPreparedPromptKey);
	let preparedPromptHit = false;
	let preparedPromptMissReason: PreparedPromptCacheMissReason | null = requestPreparedPromptKey
		? null
		: 'missing_key';
	let preparedPromptMissDiagnostics: PreparedPromptConsumeMissDiagnostics | null = null;
	let preparedPromptId: string | null = null;
	let preparedPromptAgeSeconds: number | null = null;
	let preparedSurfaceProfile: string | null = null;
	let turnRunId: string | null = null;
	let promptSnapshotId: string | null = null;
	let evalScaffoldFingerprint: string | null = null;
	let persistPromptSnapshotAfterFirstResponse: (() => void) | null = null;
	const scheduleDeferredPromptSnapshotPersistence = (): void => {
		const schedule = persistPromptSnapshotAfterFirstResponse;
		if (!schedule) return;
		persistPromptSnapshotAfterFirstResponse = null;
		schedule();
	};
	let streamDetached = false;
	// Keep a request-local copy of every completed execution. The orchestrator only
	// returns its aggregate execution list on a normal/cancelled result; if an LLM
	// pass throws after reads have completed, the callback is the only durable
	// handoff available to the route's error finalizer.
	const completedToolExecutions: Array<{
		toolCall: ChatToolCall;
		result: ChatToolResult;
	}> = [];
	// D4: incremental tool-execution persistence. Rows are written as mutations
	// complete so a mid-turn lambda kill still leaves a record of applied writes.
	// sequence_index records observed completion order only; end-of-turn persistence
	// correlates the row by the stable (turn_run_id, provider_tool_call_id) identity.
	let incrementalToolSequence = 0;
	const baseAgentStream = SSEResponse.createChatStream({
		heartbeatIntervalMs: STREAM_CONFIG.sseHeartbeatIntervalMs
	});
	const eventSink = createLegacySseEventSink({
		baseStream: baseAgentStream,
		streamRunId,
		clientTurnId,
		getTurnRunId: () => turnRunId
	});

	const markStreamEventSent = (eventType: string): void => {
		const now = Date.now();
		if (firstEventAtMs === null) {
			firstEventAtMs = now;
		}
		if ((eventType === 'text' || eventType === 'text_delta') && firstResponseAtMs === null) {
			firstResponseAtMs = now;
		}
	};
	const observabilityWriter = new TurnObservabilityWriter({
		supabase: internalSupabase,
		userId,
		streamRunId,
		clientTurnId: clientTurnId ?? null,
		requestStartedAtMs,
		messageLength: messageForModel.length,
		requestPrewarmedContext: false,
		logger,
		logError: logFastChatError,
		getTimingState: () => ({
			sessionId: timingSessionId,
			contextType: timingContextType,
			projectId: timingProjectId ?? null,
			entityId: timingEntityId ?? null,
			sessionResolvedAtMs,
			activeTurnLookupMs,
			turnAdmissionMs,
			historyLoadStartedAtMs,
			historyLoadedAtMs,
			historyComposeStartedAtMs,
			historyComposedAtMs,
			toolSelectionMs,
			preparedPromptConsumeMs,
			contextBuildStartedAtMs,
			contextReadyAtMs,
			promptSnapshotInsertMs,
			firstEventAtMs,
			firstResponseAtMs,
			assistantPersistStartedAtMs,
			assistantPersistedAtMs,
			finalizationStartedAtMs,
			doneEmittedAtMs,
			historyStrategy,
			historyCompressed,
			rawHistoryCount,
			historyForModelCount,
			contextCacheSource,
			contextLoadSource,
			contextCacheAgeSeconds: contextCacheAgeSecondsForTiming,
			bypassedContextCache,
			preparedPromptRequested,
			preparedPromptHit,
			preparedPromptMissReason,
			preparedPromptMissDiagnostics: preparedPromptMissDiagnostics as Json | null,
			preparedPromptId,
			preparedPromptAgeSeconds,
			preparedSurfaceProfile
		})
	});
	// Interval progress heartbeat: the per-tool-execution heartbeat goes silent
	// during long no-tool LLM generations, which made `last_progress_at` unusable
	// for distinguishing a dead turn from a slow one. A 30s wall-clock beat means
	// admission's stale-progress reclaim (turn-admission.ts) can free a dead
	// session in ~2 minutes instead of the full detached-turn max duration.
	const progressHeartbeatId = setInterval(() => {
		observabilityWriter.queueTurnRunUpdate(
			{ last_progress_at: new Date().toISOString() },
			'turn_progress_heartbeat'
		);
	}, 30_000);
	const sendTimedMessage = async (
		payload: AgentChatEventPayload,
		errorContext: {
			operationType: string;
			projectId?: string;
			metadata?: Record<string, unknown>;
		}
	): Promise<boolean> => {
		if (streamDetached) {
			return false;
		}

		try {
			await eventSink.emit(payload);
			markStreamEventSent(payload.type);
			return true;
		} catch (error) {
			streamDetached = true;
			logger.info('FastChat stream detached; continuing turn execution', {
				type: payload.type,
				streamRunId
			});
			logFastChatError({
				error,
				operationType: errorContext.operationType,
				projectId: errorContext.projectId,
				metadata: {
					...(errorContext.metadata ?? {}),
					streamDetached: true,
					streamRunId
				}
			});
			return false;
		}
	};
	const sendTimedMessageDetached = (
		payload: AgentChatEventPayload,
		errorContext: {
			operationType: string;
			projectId?: string;
			metadata?: Record<string, unknown>;
		}
	): void => {
		void sendTimedMessage(payload, errorContext).catch((error) => {
			logger.warn('Failed to emit timed stream event', {
				error,
				type: payload.type
			});
		});
	};

	const acknowledgementContext = normalizeFastContextType(streamRequest.context_type);
	const acknowledgementScope = isProjectScopedContext(acknowledgementContext)
		? 'project'
		: isDailyBriefContext(acknowledgementContext)
			? 'brief'
			: 'workspace';
	sendTimedMessageDetached(
		{
			type: 'turn_phase',
			turn_phase: 'acknowledged',
			message: `Request received. Preparing the ${acknowledgementScope} context...`
		},
		{
			operationType: 'fastchat_stream_emit_turn_phase',
			metadata: { streamStage: 'acknowledged', contextType: acknowledgementContext }
		}
	);

	let detachedLifecycleRegistered = false;
	const turnPromise = (async () => {
		const contextType = normalizeFastContextType(streamRequest.context_type);
		const projectFocus = streamRequest.projectFocus ?? undefined;
		const entityId = resolveEffectiveEntityId({
			contextType,
			entityId: streamRequest.entity_id,
			projectFocus
		});
		const projectIdForLogs =
			resolveEffectiveProjectId({ contextType, entityId, projectFocus }) ?? undefined;
		const sessionService = createFastChatSessionService(supabase, {
			errorLogger,
			endpoint: STREAM_CONFIG.endpoint,
			httpMethod: STREAM_CONFIG.httpMethod
		});
		const voiceGroupId = streamRequest.voiceNoteGroupId;
		let cancellationMonitor: FastChatCancellationMonitor | null = null;
		let activeSupervisorCheckpoint: ChatTurnCheckpoint | null = null;
		let resumingSupervisorCheckpoint: ChatTurnCheckpoint | null = null;
		let supervisorQuestionCheckpointId: string | null = null;
		let supervisorQuestionCheckpointFailed = false;
		const restoreResumingSupervisorCheckpoint = async (reason: string): Promise<void> => {
			if (!resumingSupervisorCheckpoint) return;
			const checkpointId = resumingSupervisorCheckpoint.id;
			try {
				const restored = await restoreCheckpointToActive({
					supabase: internalSupabase,
					checkpointId,
					userId
				});
				if (restored) {
					observabilityWriter.recordEvent('finalize', 'supervisor_checkpoint_restored', {
						checkpoint_id: checkpointId,
						reason
					} as Json);
					resumingSupervisorCheckpoint = null;
				}
			} catch (error) {
				logFastChatError({
					error,
					operationType: 'fastchat_supervisor_checkpoint_restore',
					projectId: projectIdForLogs,
					tableName: 'chat_turn_checkpoints',
					recordId: checkpointId,
					metadata: {
						sessionId: timingSessionId,
						contextType,
						entityId,
						reason
					}
				});
			}
		};

		// Emits the standard error -> done pair used by every early-exit / deny path.
		// Marks doneEmittedAtMs for timing. Callers keep their own tail (stream close,
		// cancel-watcher teardown, timing metric) since those differ per exit reason.
		// `turn_rejected: true` tells the client this command created no durable user
		// message, so it can roll back its optimistic bubble. A matching admission
		// duplicate overrides this to false because the original message is durable.
		const emitErrorThenDone = async (params: {
			error: string;
			finishedReason: string;
			projectId?: string;
			errorMetadata: Record<string, unknown>;
			doneMetadata?: Record<string, unknown>;
			turnRejected?: boolean;
		}): Promise<void> => {
			await sendTimedMessage(
				{
					type: 'error',
					error: params.error,
					turn_rejected: params.turnRejected ?? true
				},
				{
					operationType: 'fastchat_stream_emit_error',
					projectId: params.projectId,
					metadata: params.errorMetadata
				}
			);
			doneEmittedAtMs = Date.now();
			await sendTimedMessage(
				{
					type: 'done',
					usage: { total_tokens: 0 },
					finished_reason: params.finishedReason
				},
				{
					operationType: 'fastchat_stream_emit_done',
					projectId: params.projectId,
					metadata: params.doneMetadata ?? params.errorMetadata
				}
			);
		};

		try {
			if (isDailyBriefContext(contextType)) {
				if (!entityId) {
					logFastChatError({
						error: new Error('FastChat daily brief id missing'),
						operationType: 'fastchat_daily_brief_missing_entity',
						metadata: {
							contextType
						}
					});
					await emitErrorThenDone({
						error: 'Brief context requires a brief ID.',
						finishedReason: 'error',
						errorMetadata: { contextType, entityId, reason: 'missing_brief_id' }
					});
					await eventSink.close();
					return;
				}

				const briefAccess = await checkDailyBriefAccess(
					supabase,
					entityId,
					userId,
					errorLogger,
					{
						endpoint: STREAM_CONFIG.endpoint,
						httpMethod: STREAM_CONFIG.httpMethod
					}
				);
				if (!briefAccess.allowed) {
					logFastChatError({
						error: new Error('FastChat daily brief access denied'),
						operationType: 'fastchat_daily_brief_access_denied',
						metadata: {
							contextType,
							entityId,
							reason: briefAccess.reason ?? 'denied'
						}
					});
					await emitErrorThenDone({
						error: 'Access denied for the selected brief.',
						finishedReason: 'error',
						errorMetadata: { contextType, entityId, reason: 'brief_access_denied' }
					});
					await eventSink.close();
					return;
				}
			}

			if (projectIdForLogs) {
				const accessResult = await checkProjectAccess(
					supabase,
					projectIdForLogs,
					errorLogger,
					{
						userId,
						endpoint: STREAM_CONFIG.endpoint,
						httpMethod: STREAM_CONFIG.httpMethod
					}
				);
				if (!accessResult.allowed) {
					logFastChatError({
						error: new Error('FastChat project access denied'),
						operationType: 'fastchat_project_access_denied',
						projectId: projectIdForLogs,
						metadata: {
							contextType,
							entityId,
							reason: accessResult.reason ?? 'denied'
						}
					});
					await emitErrorThenDone({
						error: 'Access denied for the selected project.',
						finishedReason: 'error',
						projectId: projectIdForLogs,
						errorMetadata: { contextType, entityId, reason: 'project_access_denied' }
					});
					await eventSink.close();
					return;
				}
			}

			const { session } = await sessionService.resolveSession({
				sessionId: streamRequest.session_id,
				userId,
				contextType,
				entityId: entityId ?? undefined,
				projectFocus
			});
			sessionResolvedAtMs = Date.now();
			timingSessionId = session.id;
			timingContextType = contextType;
			timingProjectId =
				resolveEffectiveProjectId({ contextType, entityId, projectFocus }) ??
				timingProjectId;

			await sendTimedMessage(
				{ type: 'session', session },
				{
					operationType: 'fastchat_stream_emit_session',
					projectId: projectIdForLogs,
					metadata: { sessionId: session.id, contextType }
				}
			);

			cancellationMonitor = new FastChatCancellationMonitor({
				supabase,
				userId,
				sessionId: session.id,
				streamRunId,
				intervalMs: STREAM_CONFIG.cancellation.watchIntervalMs,
				reasonRetryDelayMs: STREAM_CONFIG.cancellation.reasonRetryDelayMs,
				signal: turnAbortController.signal,
				onCancel: abortTurn,
				logger
			});
			cancellationMonitor.start();

			const requestLastTurnContext = streamRequest.lastTurnContext ?? null;
			const continuityHint = buildLastTurnContinuityHint(requestLastTurnContext);
			const conversationSummary =
				typeof session.summary === 'string' ? session.summary : null;
			const turnPreparation = resolveFastChatTurnPreparation({
				contextType,
				entityId,
				projectId: projectIdForLogs ?? null,
				projectFocus,
				latestUserMessage: message,
				conversationSummary,
				agentMetadata: session.agent_metadata,
				contextShiftHintTtlMs: STREAM_CONFIG.contextShiftHintTtlMs,
				scaffold: STREAM_CONFIG.scaffold
			});
			const {
				sessionMetadata,
				pendingTurnIntent,
				pendingTurnContract,
				turnIntent,
				previousDomainState,
				priorDomainIds,
				priorOutcomeCardIds,
				domainSensingBypassed,
				turnDomainSensing,
				recentContextShiftHint,
				bypassContextCacheForShiftHint,
				cacheKey,
				cachedContext,
				selectedSurfaceProfile
			} = turnPreparation;
			let tools = turnPreparation.tools;
			const gatewayEnabled = true;
			let commissionedWriteToolNames: string[] = [];
			let commissionedWriteMinimumCount = 0;
			let latestDomainState = previousDomainState;
			let domainStateMetadataUpdatePromise: Promise<boolean> | null = null;

			const preparedAdmissionLineage = await inspectPreparedPromptAdmissionLineage({
				supabase: internalSupabase,
				key: requestPreparedPromptKey,
				userId,
				sessionId: session.id,
				cacheKey,
				surfaceProfile: selectedSurfaceProfile
			});
			const requestHash = await hashCanonicalAdmissionRequestV1({
				version: AGENTIC_CHAT_REQUEST_HASH_VERSION,
				clientTurnId: clientTurnId ?? '',
				streamRunId,
				context: {
					type: contextType,
					entityId: entityId ?? null,
					projectId: timingProjectId ?? null
				},
				message: storedUserMessageContent,
				attachments: normalizeChatAttachmentsForAdmission(chatAttachmentRefs),
				voiceNoteGroupId: voiceGroupId ?? null,
				preparedPromptLineage: {
					id: preparedAdmissionLineage?.id ?? null,
					acceptedSurfaceProfile: preparedAdmissionLineage?.acceptedSurfaceProfile ?? null
				}
			});

			const userMessageMetadata: Record<string, Json | undefined> = {};
			if (voiceGroupId) userMessageMetadata.voice_note_group_id = voiceGroupId;
			if (clientTurnId) userMessageMetadata.client_turn_id = clientTurnId;
			userMessageMetadata.stream_run_id = streamRunId;
			if (chatAttachmentRefs.length > 0) {
				userMessageMetadata.attachment_count = chatAttachmentRefs.length;
				userMessageMetadata.attachment_only = message.length === 0;
				userMessageMetadata.live_vision_requested = liveVisionRequested;
				userMessageMetadata.live_vision_attachment_count = liveVisionAttachmentCount;
				userMessageMetadata.attachments = sanitizeAttachmentRefsForMetadata(
					chatAttachmentRefs
				) as unknown as Json;
			}

			const candidateTurnRunId = uuidv4();
			const candidateUserMessageId = uuidv4();
			userMessageMetadata.idempotency_key = `chat-turn:${candidateTurnRunId}:user`;
			const admissionStartedAtMs = Date.now();
			let turnAdmission: Awaited<ReturnType<typeof admitLegacyAgenticChatTurn>>;
			try {
				turnAdmission = await admitLegacyAgenticChatTurn({
					supabase: internalSupabase,
					userId,
					sessionId: session.id,
					turnRunId: candidateTurnRunId,
					userMessageId: candidateUserMessageId,
					streamRunId,
					clientTurnId: clientTurnId ?? null,
					requestHash,
					requestHashVersion: AGENTIC_CHAT_REQUEST_HASH_VERSION,
					contextType,
					entityId: entityId ?? null,
					projectId: timingProjectId ?? null,
					source: 'live_ui',
					gatewayEnabled: true,
					requestMessage: storedUserMessageContent,
					startedAt: new Date(requestStartedAtMs).toISOString(),
					userMessageContent: storedUserMessageContent,
					userMessageMetadata,
					historyLimit: STREAM_CONFIG.history.lookbackMessages,
					detachedTurnMaxDurationMs: STREAM_CONFIG.detachedTurnMaxDurationMs,
					progressStaleReclaimMs: DEFAULT_PROGRESS_STALE_RECLAIM_MS,
					recentProgressGraceMs: DEFAULT_RECENT_PROGRESS_GRACE_MS
				});
			} catch (error) {
				turnAdmissionMs = Math.max(0, Date.now() - admissionStartedAtMs);
				logFastChatError({
					error,
					operationType: 'fastchat_legacy_atomic_admission',
					projectId: projectIdForLogs,
					tableName: 'chat_turn_runs',
					recordId: candidateTurnRunId,
					metadata: {
						sessionId: session.id,
						contextType,
						entityId,
						code:
							error instanceof LegacyAgenticChatAdmissionError
								? error.code
								: 'unknown'
					}
				});
				await emitErrorThenDone({
					error: 'BuildOS could not start this response. Please try again.',
					finishedReason: 'turn_run_admission_failed',
					projectId: projectIdForLogs,
					errorMetadata: {
						sessionId: session.id,
						contextType,
						entityId,
						reason: 'legacy_atomic_admission_failed'
					}
				});
				observabilityWriter.queueTimingMetric('turn_run_admission_failed');
				return;
			}
			turnAdmissionMs = Math.max(0, Date.now() - admissionStartedAtMs);
			activeTurnLookupMs = null;

			if (turnAdmission.outcome === 'capacity_exceeded') {
				await emitErrorThenDone({
					error: 'Two responses are already running for this account. Try again in a moment.',
					finishedReason: 'user_turn_capacity_exceeded',
					projectId: projectIdForLogs,
					errorMetadata: {
						contextType,
						runningCount: turnAdmission.runningCount,
						retryAfterSeconds: turnAdmission.retryAfterSeconds
					}
				});
				cancellationMonitor?.stop();
				cancellationMonitor = null;
				return;
			}
			if (turnAdmission.outcome === 'matching_duplicate') {
				await emitErrorThenDone({
					error: 'This response is already in progress. Reopen the chat to continue with the existing response.',
					finishedReason: 'matching_duplicate',
					projectId: projectIdForLogs,
					turnRejected: false,
					errorMetadata: {
						sessionId: turnAdmission.sessionId,
						contextType,
						activeTurnRunId: turnAdmission.turnRunId,
						activeStreamRunId: turnAdmission.streamRunId,
						reason: 'matching_duplicate'
					}
				});
				cancellationMonitor?.stop();
				cancellationMonitor = null;
				return;
			}
			if (turnAdmission.outcome === 'active_turn_conflict') {
				await emitErrorThenDone({
					error: 'BuildOS is still finishing the previous response. Reopen this chat in a moment to see the completed result.',
					finishedReason: 'active_turn_running',
					projectId: projectIdForLogs,
					errorMetadata: {
						sessionId: turnAdmission.sessionId,
						contextType,
						activeTurnRunId: turnAdmission.turnRunId,
						activeStreamRunId: turnAdmission.streamRunId
					}
				});
				cancellationMonitor?.stop();
				cancellationMonitor = null;
				return;
			}
			if (turnAdmission.outcome === 'idempotency_conflict') {
				await emitErrorThenDone({
					error: 'This request conflicts with an existing response. Reopen the chat and try again.',
					finishedReason: 'idempotency_conflict',
					projectId: projectIdForLogs,
					errorMetadata: {
						sessionId: turnAdmission.sessionId,
						contextType,
						activeTurnRunId: turnAdmission.turnRunId,
						activeStreamRunId: turnAdmission.streamRunId,
						reason: turnAdmission.conflictReason
					}
				});
				cancellationMonitor?.stop();
				cancellationMonitor = null;
				return;
			}

			turnRunId = turnAdmission.turnRunId;
			observabilityWriter.setTurnRunId(turnRunId);
			const fallbackHistoryFromAdmission = projectLegacyFallbackHistorySnapshot(
				turnAdmission.fallbackSnapshot
			);
			observabilityWriter.recordEvent('prompt', 'turn_intent_resolved', {
				...turnIntent,
				pending_intent_present: pendingTurnIntent !== null,
				pending_contract_present: pendingTurnContract !== null,
				domain_sensing_bypassed: domainSensingBypassed
			} as Json);
			observabilityWriter.recordEvent('tool', 'tool_surface_materialized', {
				source: 'default',
				origin: 'turn_preparation',
				surface_profile: selectedSurfaceProfile,
				tool_names: extractToolNamesFromDefinitions(tools)
			} as Json);
			if (bypassContextCacheForShiftHint && cachedContext) {
				logger.info('Bypassing fastchat context cache due to recent context shift hint', {
					sessionId: session.id,
					contextType,
					entityId,
					shiftHint: recentContextShiftHint
				});
			}
			bypassedContextCache = bypassContextCacheForShiftHint;

			const llm = new OpenRouterV2Service({
				supabase,
				httpReferer: request.headers.get('referer') ?? undefined,
				appName: 'BuildOS Agentic Chat V2',
				// Local dev experiment only. GLM retains the standard ZDR policy and
				// falls through to the production DeepSeek-first chain when unavailable.
				devPrimaryModel: STREAM_CONFIG.routing.useDevGlm53FlashTrial
					? GLM_53_FLASH_MODEL
					: undefined
			});
			preparedSurfaceProfile = selectedSurfaceProfile;
			toolSelectionMs = turnPreparation.toolSelectionMs;

			// WP-12c (speed audit): stale-recovery must precede the active-checkpoint
			// load (recovery flips resuming→active), but the pair as a whole is
			// independent of prepared-prompt consumption and history load — run it
			// in the background and await just before the checkpoint is consumed.
			// Both steps catch internally, so the chain never rejects.
			const supervisorCheckpointChain: Promise<ChatTurnCheckpoint | null> = (async () => {
				try {
					const staleBefore = new Date(
						Date.now() - STREAM_CONFIG.supervisorResumingStaleAfterMs
					).toISOString();
					await recoverCheckpointResumeLifecycle({
						supabase: internalSupabase,
						userId,
						staleBefore,
						recoveredAt: new Date().toISOString()
					});
				} catch (error) {
					logFastChatError({
						error,
						operationType: 'fastchat_supervisor_checkpoint_restore_stale',
						projectId: projectIdForLogs,
						tableName: 'chat_turn_checkpoints',
						metadata: {
							sessionId: session.id,
							contextType,
							entityId
						}
					});
				}

				try {
					return await loadLatestActiveCheckpoint({
						supabase: internalSupabase,
						sessionId: session.id,
						userId
					});
				} catch (error) {
					logFastChatError({
						error,
						operationType: 'fastchat_supervisor_checkpoint_load',
						projectId: projectIdForLogs,
						tableName: 'chat_turn_checkpoints',
						metadata: {
							sessionId: session.id,
							contextType,
							entityId
						}
					});
					return null;
				}
			})();

			const preparedPromptConsumeStartedAtMs = Date.now();
			const preparedPromptForTurn = await consumePreparedPrompt({
				supabase: internalSupabase,
				key: requestPreparedPromptKey,
				userId,
				sessionId: session.id,
				cacheKey,
				surfaceProfile: selectedSurfaceProfile,
				contextType,
				tools,
				scaffold: STREAM_CONFIG.scaffold.prompt
			});
			preparedPromptConsumeMs = Math.max(0, Date.now() - preparedPromptConsumeStartedAtMs);
			if (!preparedPromptForTurn.hit) {
				preparedPromptMissReason = preparedPromptForTurn.reason;
				preparedPromptMissDiagnostics = preparedPromptForTurn.diagnostics ?? null;
			} else {
				preparedPromptMissDiagnostics = null;
			}
			observabilityWriter.recordEvent('prompt', 'prepared_prompt_cache_checked', {
				prepared_prompt_requested: preparedPromptRequested,
				prepared_prompt_hit: preparedPromptForTurn.hit,
				prepared_prompt_miss_reason: preparedPromptForTurn.hit
					? null
					: preparedPromptForTurn.reason,
				prepared_prompt_id: preparedPromptForTurn.hit
					? preparedPromptForTurn.row.id
					: (preparedPromptForTurn.diagnostics?.prepared_prompt_id ?? null),
				prepared_prompt_age_seconds: preparedPromptForTurn.hit
					? preparedPromptForTurn.ageSeconds
					: (preparedPromptForTurn.diagnostics?.prepared_prompt_age_seconds ?? null),
				requested_surface_profile: selectedSurfaceProfile,
				diagnostics: preparedPromptForTurn.hit
					? null
					: ((preparedPromptForTurn.diagnostics ?? null) as Json | null)
			} as Json);

			// WP-12c (speed audit): on the cold path (prepared-prompt miss +
			// stale/absent session context cache) the fresh context load needs
			// only request identity — start it before history load/composition
			// runs and await it where the context is consumed below.
			const canUseSessionContextCache = Boolean(
				cachedContext &&
					!bypassContextCacheForShiftHint &&
					cachedContext.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
					cachedContext.key === cacheKey &&
					isCacheFresh(cachedContext)
			);
			const freshContextLoadPromise =
				!preparedPromptForTurn.hit && !canUseSessionContextCache
					? loadFastChatPromptContext({
							supabase,
							userId,
							contextType,
							entityId,
							projectFocus,
							onError: ({ stage, error, metadata }) => {
								logFastChatError({
									error,
									operationType: 'fastchat_context_load',
									projectId: projectIdForLogs,
									metadata: {
										stage,
										contextType,
										entityId,
										projectFocus,
										...(metadata ?? {})
									}
								});
							}
						})
					: null;
			// The loader resolves with degraded context on stage errors; this
			// no-op guard only prevents an unhandled rejection if the turn
			// aborts before the await below.
			freshContextLoadPromise?.catch(() => {});

			let history: FastChatHistoryMessage[] = [];
			let historyForModel: FastChatHistoryMessage[];
			let historyComposition: FastChatHistoryCompositionResult;
			if (preparedPromptForTurn.hit) {
				const nowMs = Date.now();
				historyLoadStartedAtMs = nowMs;
				historyLoadedAtMs = nowMs;
				historyComposeStartedAtMs = nowMs;
				historyForModel = normalizePreparedHistoryForModel(
					preparedPromptForTurn.row.history_for_model
				);
				historyComposition = {
					historyForModel,
					compressed: preparedPromptForTurn.row.history_compressed === true,
					strategy: normalizePreparedHistoryStrategy(
						preparedPromptForTurn.row.history_strategy
					),
					rawHistoryCount:
						typeof preparedPromptForTurn.row.raw_history_count === 'number'
							? preparedPromptForTurn.row.raw_history_count
							: historyForModel.length,
					tailMessagesKept: historyForModel.length,
					continuityHintUsed: false
				};
				historyComposedAtMs = Date.now();
			} else {
				historyLoadStartedAtMs = Date.now();
				history = fallbackHistoryFromAdmission;
				historyLoadedAtMs = Date.now();
				historyComposeStartedAtMs = Date.now();
				historyComposition = composeFastChatHistory({
					history,
					continuityHint,
					sessionSummary: conversationSummary,
					settings: {
						compressionThresholdMessages:
							STREAM_CONFIG.history.compressionThresholdMessages,
						tailMessagesWhenCompressed: STREAM_CONFIG.history.tailMessages,
						maxSummaryChars: STREAM_CONFIG.history.maxSummaryChars,
						maxMessageChars: STREAM_CONFIG.history.maxMessageChars
					}
				});
				historyComposedAtMs = Date.now();
				historyForModel = historyComposition.historyForModel;
			}
			historyStrategy = historyComposition.strategy;
			historyCompressed = historyComposition.compressed;
			rawHistoryCount = historyComposition.rawHistoryCount;
			const proposalFocusSystemMessage = buildProposalFocusSystemMessage(sessionMetadata);
			if (proposalFocusSystemMessage) {
				historyForModel = [
					{ role: 'system', content: proposalFocusSystemMessage },
					...historyForModel
				];
			}
			historyForModelCount = historyForModel.length;
			const pendingIntentSystemMessage = buildPendingTurnIntentSystemMessage(turnIntent);
			if (pendingIntentSystemMessage) {
				historyForModel = [
					...historyForModel,
					{ role: 'system', content: pendingIntentSystemMessage }
				];
				historyForModelCount = historyForModel.length;
			}
			const pendingContractSystemMessage =
				buildPendingTurnContractSystemMessage(pendingTurnContract);
			if (pendingContractSystemMessage) {
				historyForModel = [
					...historyForModel,
					{ role: 'system', content: pendingContractSystemMessage }
				];
				historyForModelCount = historyForModel.length;
			}
			// WP-7 skill preload: sensing already knows the top gate candidate, so
			// load it server-side instead of spending an LLM pass on skill_load.
			// Runs AFTER consumePreparedPrompt so the prepared-surface hash check
			// still compares launch tools (preload must not inflate stale_harness),
			// and after history composition so an already-loaded skill is skipped.
			const historyLoadedSkillIdsForTurn = extractLoadedSkillIdsFromHistory(historyForModel);
			let skillGatePreload = STREAM_CONFIG.scaffold.routing.skillPreload
				? resolveSkillGatePreload(turnDomainSensing, {
						alreadyLoadedSkillIds: historyLoadedSkillIdsForTurn
					})
				: null;
			if (skillGatePreload && skillGatePreload.materializedToolNames.length > 0) {
				const skillPreloadMaterialization = materializeGatewayTools(
					tools,
					skillGatePreload.materializedToolNames
				);
				tools = skillPreloadMaterialization.tools;
				if (skillPreloadMaterialization.addedToolNames.length > 0) {
					observabilityWriter.recordEvent('tool', 'tool_surface_materialized', {
						source: 'skill_bundle',
						origin: 'skill_preload',
						skill_id: skillGatePreload.skillId,
						tool_names: skillPreloadMaterialization.addedToolNames
					} as Json);
				}
			}
			const promptDumpTurnNumber =
				historyForModel.reduce((count, item) => count + (item.role === 'user' ? 1 : 0), 0) +
				1;
			observabilityWriter.queueTurnRunUpdate(
				{
					history_strategy: historyStrategy,
					history_compressed: historyCompressed,
					raw_history_count: rawHistoryCount,
					history_for_model_count: historyForModelCount
				},
				'update_turn_run_history_composition',
				{
					historyStrategy,
					historyCompressed,
					rawHistoryCount,
					historyForModelCount
				}
			);

			activeSupervisorCheckpoint = await supervisorCheckpointChain;
			if (activeSupervisorCheckpoint) {
				try {
					resumingSupervisorCheckpoint = await markCheckpointResuming({
						supabase: internalSupabase,
						checkpointId: activeSupervisorCheckpoint.id,
						userId,
						resumeTurnRunId: turnRunId
					});
					if (resumingSupervisorCheckpoint) {
						historyForModel = [
							...historyForModel,
							{
								role: 'system',
								content: buildCheckpointResumeSystemMessage(
									resumingSupervisorCheckpoint
								)
							}
						];
						historyForModelCount = historyForModel.length;
						userMessageMetadata.supervisor_resume_checkpoint_id =
							resumingSupervisorCheckpoint.id;
						userMessageMetadata.supervisor_resume_original_turn_run_id =
							resumingSupervisorCheckpoint.turn_run_id;
						observabilityWriter.queueTurnRunUpdate(
							{
								history_for_model_count: historyForModelCount
							},
							'update_turn_run_supervisor_checkpoint_resume',
							{
								checkpointId: resumingSupervisorCheckpoint.id,
								originalTurnRunId: resumingSupervisorCheckpoint.turn_run_id
							}
						);
						observabilityWriter.recordEvent(
							'prompt',
							'supervisor_checkpoint_resuming',
							{
								checkpoint_id: resumingSupervisorCheckpoint.id,
								original_turn_run_id: resumingSupervisorCheckpoint.turn_run_id,
								resume_turn_run_id: turnRunId,
								checkpoint_type: resumingSupervisorCheckpoint.checkpoint_type,
								reason: resumingSupervisorCheckpoint.reason,
								history_for_model_count: historyForModelCount
							} as Json
						);
					} else {
						logger.info('Supervisor checkpoint was already consumed before resume', {
							checkpointId: activeSupervisorCheckpoint.id,
							sessionId: session.id,
							turnRunId
						});
					}
				} catch (error) {
					resumingSupervisorCheckpoint = null;
					logFastChatError({
						error,
						operationType: 'fastchat_supervisor_checkpoint_resume',
						projectId: projectIdForLogs,
						tableName: 'chat_turn_checkpoints',
						recordId: activeSupervisorCheckpoint.id,
						metadata: {
							sessionId: session.id,
							contextType,
							entityId,
							turnRunId
						}
					});
				}
			}
			if (resumingSupervisorCheckpoint) {
				const { error: userMessageMetadataError } = await internalSupabase
					.from('chat_messages')
					.update({ metadata: userMessageMetadata as Json })
					.eq('id', turnAdmission.userMessageId)
					.eq('session_id', session.id)
					.eq('user_id', userId);
				if (userMessageMetadataError) {
					logFastChatError({
						error: userMessageMetadataError,
						operationType: 'fastchat_user_message_metadata_update',
						projectId: projectIdForLogs,
						tableName: 'chat_messages',
						recordId: turnAdmission.userMessageId,
						metadata: {
							sessionId: session.id,
							checkpointId: resumingSupervisorCheckpoint.id
						}
					});
				}
			}
			if (chatAttachmentRefs.length > 0) {
				await sessionService.persistMessageAttachments({
					sessionId: session.id,
					userId,
					messageId: turnAdmission.userMessageId,
					projectId: attachmentProjectId,
					attachments: chatAttachmentRefs
				});
			}
			let toolsRequiringProjectId = getToolsRequiringProjectId(tools);
			let effectiveContextType: ChatContextType = contextType;
			let effectiveEntityId: string | null = entityId ?? null;
			let latestContextShift: ContextShiftPayload | null = null;
			let effectiveProjectIdForTools =
				resolveEffectiveProjectId({ contextType, entityId, projectFocus }) ?? undefined;
			const emailTurnState = createEmailExecutorTurnState();
			const toolExecutorInstance =
				tools.length > 0
					? new ChatToolExecutor(supabase, userId, session.id, fetch, llm, {
							logExecutions: false,
							// Thread the turn signal so a cancel aborts in-flight tool HTTP
							// requests (writes) instead of letting them land after the turn ends.
							abortSignal: turnAbortController.signal,
							skipProjectLoopBurst,
							emailTurnState
						})
					: undefined;
			const sharedToolExecutor =
				toolExecutorInstance &&
				(async (toolName: string, args: Record<string, any>, context: ServiceContext) => {
					const call: ChatToolCall = {
						id: uuidv4(),
						type: 'function',
						function: {
							name: toolName,
							arguments: JSON.stringify(args ?? {})
						}
					} as ChatToolCall;

					const executionAbortSignal = context.abortSignal ?? turnAbortController.signal;
					const executorForCall =
						executionAbortSignal === turnAbortController.signal
							? toolExecutorInstance
							: new ChatToolExecutor(supabase, userId, session.id, fetch, llm, {
									logExecutions: false,
									abortSignal: executionAbortSignal,
									skipProjectLoopBurst,
									emailTurnState
								});
					const result = await executorForCall.execute(call);
					if (!result.success) {
						throw new Error(result.error || `Tool ${toolName} execution failed`);
					}

					const metadata: Record<string, any> = {};
					if (typeof result.duration_ms === 'number') {
						metadata.durationMs = result.duration_ms;
					}
					const usage =
						(result as any)?.usage ??
						(result.result as any)?.usage ??
						(result.result as any)?.usage_metrics;
					const directTokensConsumed =
						typeof (result as any)?.tokens_consumed === 'number' &&
						Number.isFinite((result as any).tokens_consumed)
							? (result as any).tokens_consumed
							: undefined;
					const tokensUsed =
						directTokensConsumed ??
						(usage && typeof usage.total_tokens === 'number'
							? usage.total_tokens
							: typeof usage?.totalTokens === 'number'
								? usage.totalTokens
								: undefined);
					if (typeof tokensUsed === 'number') {
						metadata.tokensUsed = tokensUsed;
					}

					return {
						data: result.result ?? null,
						streamEvents: Array.isArray(result.stream_events)
							? (result.stream_events as any[])
							: undefined,
						metadata: Object.keys(metadata).length > 0 ? metadata : undefined
					};
				});
			const toolExecutionService = sharedToolExecutor
				? new ToolExecutionService(sharedToolExecutor, undefined, errorLogger)
				: undefined;
			const patchToolCall = (toolCall: ChatToolCall) => {
				const resp = maybeInjectProjectId(
					toolCall,
					effectiveProjectIdForTools,
					toolsRequiringProjectId
				);
				return resp;
			};

			let systemPrompt: string | undefined;
			let litePromptEnvelope: LitePromptEnvelope | null = null;
			let preparedPromptSectionSummaries: PreparedPromptSectionSummary[] | null = null;
			let preparedPromptContextInventory: unknown = null;
			let preparedPromptToolsSummary: unknown = null;
			let contextUsageSnapshot: ContextUsageSnapshot | null = null;
			let currentTurnContent: string | OpenRouterContentPart[] = messageForModel;
			let liveVisionPrepared = {
				requested: liveVisionRequested,
				enabled: STREAM_CONFIG.liveVision.enabled,
				imageCount: 0,
				failedImageCount: 0,
				skippedByLimit: 0,
				assetIds: [] as string[],
				failedAssetIds: [] as string[]
			};
			let contextCacheAgeSeconds = 0;
			let promptContext: FastChatResolvedPromptContext | undefined;
			contextBuildStartedAtMs = Date.now();
			try {
				if (preparedPromptForTurn.hit) {
					promptContext = normalizeFastChatContextSnapshot(
						preparedPromptForTurn.row.context_payload
					) ?? { contextType };
					const preparedPromptContextCache = buildFastChatContextCacheEntry({
						cacheKey,
						context: promptContext,
						createdAt:
							typeof preparedPromptForTurn.row.created_at === 'string'
								? preparedPromptForTurn.row.created_at
								: undefined
					});
					void updateAgentMetadata(
						supabase,
						session.id,
						{
							fastchat_context_cache: preparedPromptContextCache
						},
						{
							errorLogger,
							userId,
							projectId: projectIdForLogs
						}
					);
					systemPrompt = preparedPromptForTurn.surface.system_prompt;
					preparedPromptSectionSummaries = Array.isArray(
						preparedPromptForTurn.surface.sections
					)
						? preparedPromptForTurn.surface.sections
						: [];
					preparedPromptContextInventory =
						preparedPromptForTurn.surface.context_inventory ?? null;
					preparedPromptToolsSummary =
						preparedPromptForTurn.surface.tools_summary ?? null;
					if (hasRenderableLiteSections(preparedPromptForTurn.surface.sections)) {
						litePromptEnvelope = {
							promptVariant: LITE_PROMPT_VARIANT,
							systemPrompt,
							sections: preparedPromptForTurn.surface.sections,
							contextInventory: preparedPromptForTurn.surface.context_inventory,
							toolsSummary: preparedPromptForTurn.surface.tools_summary
						};
					}
					contextCacheAgeSeconds = preparedPromptForTurn.ageSeconds;
					contextCacheSource = 'prepared_prompt';
					contextLoadSource = normalizeContextLoadSource(promptContext.contextLoadSource);
					preparedPromptHit = true;
					preparedPromptMissReason = null;
					preparedPromptId = preparedPromptForTurn.row.id;
					preparedPromptAgeSeconds = preparedPromptForTurn.ageSeconds;
				} else if (cachedContext && canUseSessionContextCache) {
					promptContext = { ...cachedContext.context };
					contextCacheAgeSeconds = resolveCacheAgeSeconds(cachedContext.created_at);
					contextCacheSource = 'session_cache';
					contextLoadSource = normalizeContextLoadSource(
						cachedContext.context.contextLoadSource
					);
				} else {
					// Started before history load (WP-12c) — this await measures
					// only the residual wait, not the full context build.
					if (!freshContextLoadPromise) {
						throw new Error(
							'FastChat fresh context load was not started for a cold turn'
						);
					}
					promptContext = await freshContextLoadPromise;
					contextCacheSource = 'fresh_load';
					contextLoadSource = promptContext.contextLoadSource ?? 'none';

					const fastChatContextCache = buildFastChatContextCacheEntry({
						cacheKey,
						context: {
							contextType: promptContext.contextType,
							entityId: promptContext.entityId ?? null,
							projectId: promptContext.projectId ?? null,
							projectName: promptContext.projectName ?? null,
							focusEntityType: promptContext.focusEntityType ?? null,
							focusEntityId: promptContext.focusEntityId ?? null,
							focusEntityName: promptContext.focusEntityName ?? null,
							contextLoadSource,
							timezone: promptContext.timezone ?? null,
							data: promptContext.data ?? null
						}
					});

					void updateAgentMetadata(
						supabase,
						session.id,
						{
							fastchat_context_cache: fastChatContextCache
						},
						{
							errorLogger,
							userId,
							projectId: projectIdForLogs
						}
					);
				}

				annotateContextMetaCacheAge(promptContext?.data, contextCacheAgeSeconds);
				contextCacheAgeSecondsForTiming = contextCacheAgeSeconds;

				if (!promptContext) {
					throw new Error('Prepared FastChat prompt context was not resolved');
				}

				promptContext.conversationSummary = conversationSummary;
				promptContext.entityResolutionHint =
					buildEntityResolutionHint(requestLastTurnContext);

				const agentWorkspace = resolveAgentWorkspaceFromContextData(promptContext.data);
				const livingWorkspaceToolSelection = applyLivingWorkspaceToolProfile({
					tools,
					workspace: agentWorkspace
				});
				if (livingWorkspaceToolSelection.tools !== tools) {
					tools = livingWorkspaceToolSelection.tools;
					toolsRequiringProjectId = getToolsRequiringProjectId(tools);
				}
				commissionedWriteToolNames = livingWorkspaceToolSelection.implicitCapture
					? ['update_onto_document', 'create_onto_document'].filter((name) =>
							extractToolNamesFromDefinitions(tools).includes(name)
						)
					: [];
				commissionedWriteMinimumCount =
					livingWorkspaceToolSelection.commissionedWriteMinimumCount;

				if (livingWorkspaceToolSelection.implicitCapture) {
					observabilityWriter.recordEvent(
						'prompt',
						'living_workspace_capture_activated',
						{
							workspace_mode: agentWorkspace?.mode ?? null,
							domain_profile: agentWorkspace?.domain_profile ?? null,
							domain_affinity: agentWorkspace?.domain_affinity ?? null,
							tool_names: extractToolNamesFromDefinitions(tools)
						} as Json
					);
				}

				// The current message is sensed before project context is loaded, so
				// terse continuation turns ("give me three options") cannot name their
				// domain lexically. Persisted, server-owned project affinity can fill
				// that gap without making the skill global or spending an LLM round.
				const projectDomainRuntimeSkillId = resolveProjectDomainRuntimeSkillId({
					workspace: agentWorkspace,
					latestUserMessage: message,
					implicitCapture: livingWorkspaceToolSelection.implicitCapture
				});
				if (STREAM_CONFIG.scaffold.routing.skillPreload && projectDomainRuntimeSkillId) {
					const projectDomainSkillPreload = resolveSkillPreloadById(
						projectDomainRuntimeSkillId,
						{
							alreadyLoadedSkillIds: historyLoadedSkillIdsForTurn
						}
					);
					if (projectDomainSkillPreload) {
						// Persisted affinity only activates through a high-confidence,
						// project-specific matcher. Prefer it over a conflicting lexical
						// preload from a secondary domain (for example, a fiction
						// "character arc" prompt that also resembles content strategy).
						skillGatePreload = projectDomainSkillPreload;
						if (skillGatePreload.materializedToolNames.length) {
							const projectSkillMaterialization = materializeGatewayTools(
								tools,
								skillGatePreload.materializedToolNames
							);
							tools = projectSkillMaterialization.tools;
							toolsRequiringProjectId = getToolsRequiringProjectId(tools);
							if (projectSkillMaterialization.addedToolNames.length > 0) {
								observabilityWriter.recordEvent(
									'tool',
									'tool_surface_materialized',
									{
										source: 'skill_bundle',
										origin: 'project_domain_skill_preload',
										skill_id: skillGatePreload.skillId,
										tool_names: projectSkillMaterialization.addedToolNames
									} as Json
								);
							}
						}
						observabilityWriter.recordEvent(
							'prompt',
							'project_domain_skill_preloaded',
							{
								domain_profile: agentWorkspace?.domain_profile ?? null,
								domain_affinity: agentWorkspace?.domain_affinity ?? null,
								skill_id: skillGatePreload.skillId,
								materialized_tool_names: skillGatePreload.materializedToolNames
							} as Json
						);
					}
				}

				// tasker/39 stage 3: situational rule blocks key off the turn's
				// actual write/web capability (plus intent), so compute the
				// situation from the final tool surface — preload/turn-intent
				// materializations have already landed in `tools` by this point.
				const turnSituation = resolveLitePromptTurnSituation({
					toolNames: extractToolNamesFromDefinitions(tools),
					turnIntentRequiresWrite: turnIntent.requiresWrite,
					latestUserMessage: message,
					livingWorkspace: agentWorkspace?.mode === 'living_reference',
					livingWorkspaceCapture: livingWorkspaceToolSelection.implicitCapture,
					domainProfile: agentWorkspace?.domain_profile ?? null,
					domainAffinity: agentWorkspace?.domain_affinity ?? null
				});

				if (!systemPrompt) {
					litePromptEnvelope = buildLitePromptEnvelope({
						...promptContext,
						tools,
						productSurface: STREAM_CONFIG.endpoint,
						conversationPosition: `live stream turn ${streamRunId}`,
						currentUserMessage: message,
						domainSensingResult: null,
						scaffold: STREAM_CONFIG.scaffold.prompt
					});
					systemPrompt = litePromptEnvelope.systemPrompt;
				}

				// Rebuild the prepared-prompt envelope when this turn carries any
				// per-turn overlay content. The old `turnDomainSensing`-only guard
				// dropped the write block on exactly the turns that need it most:
				// pure native writes bypass domain sensing (turn-preparation), so
				// a prepared-prompt hit skipped the overlay entirely.
				if (
					!litePromptEnvelope &&
					systemPrompt &&
					(turnDomainSensing ||
						skillGatePreload ||
						hasActiveSituation(turnSituation) ||
						contextType === 'project_create')
				) {
					litePromptEnvelope = buildLitePromptEnvelope({
						...promptContext,
						tools,
						productSurface: STREAM_CONFIG.endpoint,
						conversationPosition: `live stream turn ${streamRunId}`,
						currentUserMessage: message,
						domainSensingResult: null,
						scaffold: STREAM_CONFIG.scaffold.prompt
					});
				}

				if (litePromptEnvelope) {
					litePromptEnvelope = applyActiveDomainSignalsOverlay(litePromptEnvelope, {
						currentUserMessage: message,
						conversationSummary,
						priorDomainIds,
						priorOutcomeCardIds,
						domainSensingResult: turnDomainSensing,
						skillGatePreload,
						turnSituation,
						scaffold: STREAM_CONFIG.scaffold.prompt
					});
					systemPrompt = litePromptEnvelope.systemPrompt;
				}

				if (turnDomainSensing) {
					const nextDomainState = mergeDomainSessionState(
						previousDomainState,
						turnDomainSensing,
						{
							turnRunId,
							streamRunId,
							now: new Date()
						}
					);
					latestDomainState = nextDomainState;
					domainStateMetadataUpdatePromise = updateAgentMetadata(
						supabase,
						session.id,
						{
							fastchat_domain_state: nextDomainState
						},
						{
							errorLogger,
							userId,
							projectId: projectIdForLogs
						}
					);
					void domainStateMetadataUpdatePromise;
					const newResearchBacklogEntries = getNewDomainResearchBacklogEntries(
						nextDomainState,
						previousDomainState
					);
					observabilityWriter.recordEvent('prompt', 'domain_sensing_applied', {
						source: turnDomainSensing.source,
						domain_ids: turnDomainSensing.active_domains.map((domain) => domain.id),
						candidate_outcome_card_ids: turnDomainSensing.candidate_outcome_card_ids,
						recommended_skill_ids: turnDomainSensing.recommended_skill_ids,
						skill_gate_required: turnDomainSensing.skill_load_required === true,
						skill_preloaded_id: skillGatePreload?.skillId ?? null,
						skill_preload_materialized_tools:
							skillGatePreload?.materializedToolNames ?? [],
						expected_skill_ids: getSkillGateCandidateSkillIds(turnDomainSensing),
						expected_skill_formats:
							getSkillGateCandidateSkillLoadFormats(turnDomainSensing),
						coverage_gap_skill_ids: turnDomainSensing.coverage_gap_skill_ids,
						coverage_gap_resource_ids: turnDomainSensing.coverage_gap_resource_ids,
						research_backlog_ids: nextDomainState.research_backlog.map(
							(entry) => entry.id
						)
					} as Json);
					if (newResearchBacklogEntries.length > 0) {
						observabilityWriter.recordEvent(
							'prompt',
							'domain_research_backlog_queued',
							{
								entries: newResearchBacklogEntries.map((entry) => ({
									id: entry.id,
									kind: entry.kind,
									priority: entry.priority,
									domain_ids: entry.domain_ids,
									missing_skill_id: entry.missing_skill_id ?? null,
									missing_resource_id: entry.missing_resource_id ?? null
								}))
							} as Json
						);
					}
				}

				if (liveVisionRequested && chatAttachmentAssets.length > 0) {
					const liveVision = await createLiveVisionSignedImages({
						supabase,
						userId,
						projectId: attachmentProjectId,
						sessionId: session.id,
						assets: chatAttachmentAssets,
						maxImages: STREAM_CONFIG.liveVision.maxAttachmentsPerTurn,
						maxImageBytes: STREAM_CONFIG.liveVision.maxImageBytes,
						renderWidth: STREAM_CONFIG.liveVision.renderWidth,
						ttlSeconds: STREAM_CONFIG.liveVision.signedUrlTtlSeconds,
						logger
					});
					currentTurnContent = buildLiveVisionContentParts({
						text: messageForModel,
						images: liveVision.images.map((image) => ({
							...image,
							detail: 'auto'
						}))
					});
					liveVisionPrepared = {
						requested: true,
						enabled: STREAM_CONFIG.liveVision.enabled,
						imageCount: liveVision.images.length,
						failedImageCount: liveVision.failedAssetIds.length,
						skippedByLimit: liveVision.skippedByLimit,
						assetIds: liveVision.images.map((image) => image.assetId),
						failedAssetIds: liveVision.failedAssetIds
					};
					observabilityWriter.recordEvent('prompt', 'live_vision_prepared', {
						requested: liveVisionPrepared.requested,
						enabled: liveVisionPrepared.enabled,
						image_count: liveVisionPrepared.imageCount,
						failed_image_count: liveVisionPrepared.failedImageCount,
						skipped_by_limit: liveVisionPrepared.skippedByLimit,
						max_images_per_turn: STREAM_CONFIG.liveVision.maxAttachmentsPerTurn,
						max_image_file_size_bytes: STREAM_CONFIG.liveVision.maxImageBytes,
						render_width: STREAM_CONFIG.liveVision.renderWidth,
						signed_url_ttl_seconds: STREAM_CONFIG.liveVision.signedUrlTtlSeconds,
						asset_ids: liveVisionPrepared.assetIds,
						failed_asset_ids: liveVisionPrepared.failedAssetIds
					} as Json);
				}

				const scaffoldPromptSections =
					litePromptEnvelope?.sections ?? preparedPromptSectionSummaries;
				evalScaffoldFingerprint = sha256Json({
					version: 1,
					config: STREAM_CONFIG.scaffold,
					prompt: {
						system_prompt_sha256: sha256Text(systemPrompt),
						sections: (scaffoldPromptSections ?? []).map((section) => ({
							id: section.id,
							source: section.source,
							content_sha256:
								'content' in section
									? sha256Text(section.content)
									: section.content_sha256
						}))
					},
					tools: {
						names: extractToolNamesFromDefinitions(tools),
						definitions_sha256: sha256Json(tools)
					}
				});
				const usageSnapshot = buildFastContextUsageSnapshot({
					systemPrompt,
					history: historyForModel,
					userMessage: messageForModel
				});
				contextUsageSnapshot = usageSnapshot;
				emitContextUsage(eventSink, usageSnapshot, {
					onError: (error) => {
						logFastChatError({
							error,
							operationType: 'fastchat_stream_emit_context_usage',
							projectId: projectIdForLogs,
							metadata: { sessionId: session.id, contextType }
						});
					},
					onMessageSent: () => {
						markStreamEventSent('context_usage');
					}
				});
				contextReadyAtMs = Date.now();
				observabilityWriter.queueTurnRunUpdate(
					{
						cache_source: contextCacheSource,
						cache_age_seconds: contextCacheAgeSecondsForTiming,
						prepared_prompt_id: preparedPromptId,
						prepared_prompt_hit: preparedPromptHit,
						prepared_prompt_miss_reason: preparedPromptMissReason,
						prepared_surface_profile: preparedSurfaceProfile
					},
					'update_turn_run_context_cache',
					{
						cacheSource: contextCacheSource,
						contextLoadSource,
						cacheAgeSeconds: contextCacheAgeSecondsForTiming,
						preparedPromptHit,
						preparedPromptMissReason,
						preparedSurfaceProfile
					}
				);
				if (turnRunId && systemPrompt) {
					const snapshotTurnRunId = turnRunId;
					const snapshotSessionId = session.id;
					const snapshotSystemPrompt = systemPrompt;
					const snapshotPromptContext = {
						...promptContext,
						contextType: promptContext.contextType ?? contextType
					};
					const snapshotEntityId = promptContext.entityId ?? entityId ?? null;
					const snapshotProjectId =
						promptContext.projectId ??
						resolveEffectiveProjectId({ contextType, entityId, projectFocus });
					const snapshotHistory = [...historyForModel];
					const snapshotTools = tools;
					const snapshotLiteSections =
						litePromptEnvelope?.sections ?? preparedPromptSectionSummaries;
					const snapshotLiteContextInventory =
						litePromptEnvelope?.contextInventory ?? preparedPromptContextInventory;
					const snapshotLiteToolsSummary =
						litePromptEnvelope?.toolsSummary ?? preparedPromptToolsSummary;
					const snapshotRequestPayload = {
						message: storedUserMessageContent,
						session_id: snapshotSessionId,
						client_turn_id: clientTurnId ?? null,
						stream_run_id: streamRunId,
						context_type: contextType,
						entity_id: entityId ?? null,
						project_focus: projectFocus ?? null,
						attachments:
							chatAttachmentRefs.length > 0
								? sanitizeAttachmentRefsForMetadata(chatAttachmentRefs)
								: [],
						live_vision: {
							requested: liveVisionPrepared.requested,
							enabled: liveVisionPrepared.enabled,
							raw_media_included: liveVisionPrepared.imageCount > 0,
							image_count: liveVisionPrepared.imageCount,
							failed_image_count: liveVisionPrepared.failedImageCount,
							skipped_by_limit: liveVisionPrepared.skippedByLimit,
							asset_ids: liveVisionPrepared.assetIds,
							failed_asset_ids: liveVisionPrepared.failedAssetIds,
							max_images_per_turn: STREAM_CONFIG.liveVision.maxAttachmentsPerTurn,
							max_image_file_size_bytes: STREAM_CONFIG.liveVision.maxImageBytes,
							render_width: STREAM_CONFIG.liveVision.renderWidth,
							signed_url_ttl_seconds: STREAM_CONFIG.liveVision.signedUrlTtlSeconds
						},
						prompt_variant: promptVariant,
						voice_note_group_id: voiceGroupId ?? null,
						prepared_prompt_id: preparedPromptId,
						prepared_prompt_hit: preparedPromptHit,
						prepared_prompt_miss_reason: preparedPromptMissReason,
						prepared_prompt_miss_diagnostics:
							(preparedPromptMissDiagnostics as Json | null) ?? null,
						prepared_surface_profile: preparedSurfaceProfile,
						eval_scaffold_variant: STREAM_CONFIG.scaffold.variant,
						eval_scaffold_fingerprint: evalScaffoldFingerprint,
						eval_scaffold_config: STREAM_CONFIG.scaffold
					};
					persistPromptSnapshotAfterFirstResponse = () => {
						const snapshotId = uuidv4();
						const snapshotTask = new Promise<void>((resolve) => {
							setTimeout(() => {
								void (async () => {
									try {
										const promptCostBreakdown = buildPromptCostBreakdown({
											systemPrompt: snapshotSystemPrompt,
											history: snapshotHistory,
											userMessage: messageForModel,
											tools: snapshotTools
										});
										const promptToolSurfaceReport = buildToolSurfaceSizeReport({
											profile: 'current_request',
											contextType,
											tools: snapshotTools
										});
										const promptSections = buildPromptSnapshotSections({
											...snapshotPromptContext,
											promptVariant,
											promptCostBreakdown,
											toolSurfaceReport: promptToolSurfaceReport,
											liteSections: snapshotLiteSections,
											liteContextInventory: snapshotLiteContextInventory,
											liteToolsSummary: snapshotLiteToolsSummary
										});
										const promptSnapshotRow = buildPromptSnapshotRow({
											turnRunId: snapshotTurnRunId,
											sessionId: snapshotSessionId,
											userId,
											streamRunId,
											contextType,
											entityId: snapshotEntityId,
											projectId: snapshotProjectId,
											promptVariant,
											systemPrompt: snapshotSystemPrompt,
											history: snapshotHistory,
											message: messageForModel,
											tools: snapshotTools,
											requestPayload: snapshotRequestPayload,
											promptSections,
											promptCostBreakdown,
											contextPayload: snapshotPromptContext,
											toolSurfaceReport: promptToolSurfaceReport,
											liteSections: snapshotLiteSections,
											liteContextInventory: snapshotLiteContextInventory,
											liteToolsSummary: snapshotLiteToolsSummary
										});
										const promptSnapshotInsertStartedAtMs = Date.now();
										await observabilityWriter.persistPromptSnapshot({
											id: snapshotId,
											...promptSnapshotRow,
											turn_run_id: snapshotTurnRunId,
											session_id: snapshotSessionId,
											user_id: userId
										});
										promptSnapshotInsertMs = Math.max(
											0,
											Date.now() - promptSnapshotInsertStartedAtMs
										);
										promptSnapshotId = snapshotId;
										observabilityWriter.queueTurnRunUpdate(
											{ prompt_snapshot_id: snapshotId },
											'link_turn_run_prompt_snapshot',
											{ promptSnapshotId: snapshotId }
										);
										observabilityWriter.recordEvent(
											'prompt',
											'prompt_snapshot_created',
											{
												prompt_snapshot_id: snapshotId,
												prompt_variant: promptVariant,
												system_prompt_chars:
													promptSnapshotRow.system_prompt_chars,
												message_chars: promptSnapshotRow.message_chars,
												approx_prompt_tokens:
													promptSnapshotRow.approx_prompt_tokens,
												prompt_snapshot_insert_ms: promptSnapshotInsertMs,
												prompt_cost_breakdown: promptCostBreakdown,
												eval_scaffold_variant:
													STREAM_CONFIG.scaffold.variant,
												eval_scaffold_fingerprint: evalScaffoldFingerprint,
												eval_scaffold_config: STREAM_CONFIG.scaffold
											} as Json
										);
									} catch (error) {
										logFastChatError({
											error,
											operationType: 'fastchat_prompt_snapshot_insert',
											projectId: projectIdForLogs,
											metadata: {
												sessionId: snapshotSessionId,
												contextType,
												turnRunId: snapshotTurnRunId
											}
										});
									}
								})().finally(resolve);
							}, 0);
						});
						observabilityWriter.trackDetachedTask(
							snapshotTask,
							'persist_prompt_snapshot',
							{
								projectId: projectIdForLogs,
								contextType,
								sessionId: snapshotSessionId,
								entityId: snapshotEntityId,
								turnRunId: snapshotTurnRunId
							}
						);
					};
				}
			} catch (error) {
				contextCacheSource = 'context_build_failed';
				contextReadyAtMs = Date.now();
				logger.warn('Failed to build fast chat prompt context', { error });
				logFastChatError({
					error,
					operationType: 'fastchat_context_build',
					projectId: projectIdForLogs,
					metadata: {
						contextType,
						entityId,
						projectFocus
					}
				});
			}

			const gatewayRoundCap =
				contextUsageSnapshot?.status === 'near_limit' ||
				contextUsageSnapshot?.status === 'over_budget'
					? Math.min(
							STREAM_CONFIG.gateway.maxToolRounds,
							STREAM_CONFIG.gateway.nearLimitMaxToolRounds
						)
					: STREAM_CONFIG.gateway.maxToolRounds;
			const conversationHistoryForTools = [
				...historyForModel,
				{ role: 'user', content: messageForModel }
			] as ServiceContext['conversationHistory'];
			const buildServiceContextForToolExecution = (): ServiceContext => {
				const toolProjectFocus = buildToolExecutionProjectFocus({
					projectFocus,
					promptContext,
					latestContextShift,
					projectId: effectiveProjectIdForTools
				});
				const contextScope = buildToolExecutionContextScope({
					projectId: effectiveProjectIdForTools,
					projectName:
						toolProjectFocus?.projectName ?? promptContext?.projectName ?? undefined,
					projectFocus: toolProjectFocus,
					promptContext
				});
				return {
					sessionId: session.id,
					userId,
					contextType: effectiveContextType,
					entityId: effectiveEntityId ?? undefined,
					originalTurnContext: {
						contextType,
						entityId: entityId ?? null,
						entityName: promptContext?.projectName ?? null
					},
					conversationHistory: conversationHistoryForTools,
					ontologyContext: buildToolExecutionOntologyContext({
						promptContext,
						contextScope
					}),
					lastTurnContext: requestLastTurnContext ?? undefined,
					projectFocus: toolProjectFocus,
					contextScope
				};
			};
			const toChatToolResult = (result: ToolExecutionResult): ChatToolResult => {
				const durationMs =
					typeof result.metadata?.durationMs === 'number' &&
					Number.isFinite(result.metadata.durationMs)
						? Math.round(result.metadata.durationMs)
						: undefined;
				const tokensConsumed =
					typeof result.tokensUsed === 'number' && Number.isFinite(result.tokensUsed)
						? result.tokensUsed
						: undefined;
				return {
					tool_call_id: result.toolCallId,
					result: result.data ?? null,
					success: result.success,
					error: typeof result.error === 'string' ? result.error : result.error?.message,
					...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
					...(tokensConsumed !== undefined ? { tokens_consumed: tokensConsumed } : {}),
					...(Array.isArray(result.streamEvents)
						? { stream_events: result.streamEvents }
						: {})
				};
			};
			const skillGateExpectedSkillIds = turnDomainSensing
				? getSkillGateCandidateSkillIds(turnDomainSensing)
				: [];
			const skillGateExpectedSkillFormats = turnDomainSensing
				? getSkillGateCandidateSkillLoadFormats(turnDomainSensing)
				: {};
			// A server-preloaded skill counts as loaded: the gate must not force
			// (or repair toward) a redundant skill_load for it.
			// The used_domains ledger (session metadata) survives history
			// compression, so skills the session already loaded stay loaded for
			// gate/repair purposes (WP-8). It deliberately does NOT feed the
			// preload skip above: when compression evicted the skill content,
			// the preload must re-inject it rather than the gate passing on a
			// skill the model can no longer see.
			const usedDomainLedgerSkillIds = turnDomainSensing
				? getLoadedSkillIdsFromUsedDomains(previousDomainState)
				: [];
			const skillGateHistoryLoadedSkillIds = [
				...new Set([
					...historyLoadedSkillIdsForTurn,
					...usedDomainLedgerSkillIds,
					...(skillGatePreload ? [skillGatePreload.skillId] : [])
				])
			];
			// The gate can only demand skill_load when the turn's tool surface
			// actually exposes it. project_create (create_onto_project only)
			// otherwise gets a finalization repair instructing a tool call the
			// model cannot make (prompt audit WP-3, 2026-07-10).
			const turnToolSurfaceHasSkillLoad =
				extractToolNamesFromDefinitions(tools).includes('skill_load');
			const skillGate =
				STREAM_CONFIG.scaffold.routing.skillGateRepair &&
				turnDomainSensing &&
				turnToolSurfaceHasSkillLoad
					? {
							required: turnDomainSensing.skill_load_required === true,
							recommendedSkillIds: skillGateExpectedSkillIds,
							acceptableSkillIds: skillGateExpectedSkillIds,
							historyLoadedSkillIds: skillGateHistoryLoadedSkillIds
						}
					: null;
			let firstToolCallPlanningCueEmitted = false;
			const forcedSynthesisRouting = resolveFastChatForcedSynthesisRoutingConfig({
				mode: STREAM_CONFIG.routing.forcedSynthesis.mode,
				sampleRate: STREAM_CONFIG.routing.forcedSynthesis.sampleRate,
				bucketKey: clientTurnId ?? streamRunId ?? turnRunId ?? session.id,
				models: STREAM_CONFIG.routing.forcedSynthesis.models,
				ignoredProviderSlugs: STREAM_CONFIG.routing.forcedSynthesis.ignoredProviderSlugs,
				maxTokens: FASTCHAT_LIMITS.FORCED_SYNTHESIS_MAX_TOKENS
			});

			const {
				assistantText,
				finalAssistantText,
				usage,
				finishedReason,
				toolExecutions,
				llmPasses,
				toolRounds,
				toolCallsMade,
				supervisorDecisions,
				finalizationGuard,
				cancelled,
				peakPromptTokens,
				finalContextUsage,
				skillGateViolationRepaired,
				completionOutcome,
				turnContract,
				turnContractResolution,
				securityReview,
				orchestrationInterventions
			} = await streamFastChat({
				llm,
				userId,
				sessionId: session.id,
				contextType,
				entityId,
				projectId: resolveEffectiveProjectId({ contextType, entityId, projectFocus }),
				turnRunId,
				streamRunId,
				clientTurnId,
				initialTurnContract: pendingTurnContract?.contract ?? null,
				history: historyForModel,
				message: messageForModel,
				trustedUserMessage: message,
				currentTurnContainsUntrustedContent: chatAttachmentRefs.length > 0,
				currentTurnContent,
				signal: turnAbortController.signal,
				systemPrompt,
				maxToolRounds: Math.max(1, gatewayRoundCap),
				allowAutonomousRecovery: STREAM_CONFIG.scaffold.recovery.autonomousRecovery,
				allowForcedSynthesis: STREAM_CONFIG.scaffold.recovery.softForcedSynthesis,
				forcedSynthesisRouting,
				pinnedModels: STREAM_CONFIG.routing.pinnedModels,
				turnIntent,
				commissionedWriteToolNames,
				commissionedWriteMinimumCount,
				skillGate,
				tools,
				onToolMaterialization: ({ source, toolNames, reason }) => {
					observabilityWriter.recordEvent('tool', 'tool_surface_materialized', {
						source,
						origin: 'orchestrator',
						tool_names: toolNames,
						reason
					} as Json);
				},
				// Live orchestration-budget snapshot from provider-reported tokens.
				// Not re-emitted to the UI badge because the UI uses a different
				// (smaller) budget calibrated for chat length; mixing them would
				// mislead the user. See docs/specs/agent-token-tracking-
				// investigation-2026-05-12.md for the two-budget design.
				onContextUsageUpdate: undefined,
				onPhase: async (turnPhase) => {
					const phaseMessage = FASTCHAT_TURN_PHASE_MESSAGES[turnPhase];
					const phaseSent = await sendTimedMessage(
						{
							type: 'turn_phase',
							turn_phase: turnPhase,
							message: phaseMessage
						},
						{
							operationType: 'fastchat_stream_emit_turn_phase',
							projectId: effectiveProjectIdForTools ?? projectIdForLogs,
							metadata: {
								sessionId: session.id,
								contextType: effectiveContextType,
								turnPhase
							}
						}
					);
					if (phaseSent) {
						observabilityWriter.recordEvent('stream', 'turn_phase_changed', {
							turn_phase: turnPhase
						} as Json);
					}
				},
				supervisorContextData: promptContext?.data ?? null,
				debugContext: {
					promptVariant: LITE_PROMPT_VARIANT,
					turnNumber: promptDumpTurnNumber,
					gatewayEnabled,
					historyStrategy: historyComposition.strategy,
					historyCompressed: historyComposition.compressed,
					rawHistoryCount: historyComposition.rawHistoryCount,
					historyForModelCount: historyForModel.length,
					tailMessagesKept: historyComposition.tailMessagesKept,
					continuityHintUsed: historyComposition.continuityHintUsed,
					liteSections: litePromptEnvelope?.sections ?? preparedPromptSectionSummaries,
					liteContextInventory:
						litePromptEnvelope?.contextInventory ?? preparedPromptContextInventory,
					liteToolsSummary: litePromptEnvelope?.toolsSummary ?? preparedPromptToolsSummary
				},
				toolExecutor: toolExecutionService
					? async (toolCall, availableToolsForExecution = tools) => {
							const result = await toolExecutionService.executeTool(
								toolCall,
								buildServiceContextForToolExecution(),
								availableToolsForExecution,
								{ abortSignal: turnAbortController.signal }
							);
							return toChatToolResult(result);
						}
					: toolExecutorInstance
						? (toolCall) => toolExecutorInstance.execute(patchToolCall(toolCall))
						: undefined,
				batchToolExecutor: toolExecutionService
					? async (toolCalls, availableToolsForExecution = tools) => {
							const patchedCalls = toolCalls.map((toolCall) =>
								patchToolCall(toolCall)
							);
							const results = await toolExecutionService.batchExecuteTools(
								patchedCalls,
								buildServiceContextForToolExecution(),
								availableToolsForExecution,
								3,
								{ abortSignal: turnAbortController.signal }
							);
							return results.map(toChatToolResult);
						}
					: undefined,
				onToolCall: async (toolCall) => {
					const patchedCall = patchToolCall(toolCall);
					const toolCallMeta = extractFastChatToolCallMeta(patchedCall);
					observabilityWriter.recordEvent(
						'tool',
						'tool_call_emitted',
						buildToolCallEventPayload(patchedCall),
						{
							helpPath: toolCallMeta.helpPath,
							canonicalOp: toolCallMeta.canonicalOp
						}
					);
					if (!streamDetached && !firstToolCallPlanningCueEmitted) {
						firstToolCallPlanningCueEmitted = true;
						const planningCueSent = await sendTimedMessage(
							{
								type: 'agent_state',
								state: 'thinking',
								contextType: effectiveContextType,
								details: FASTCHAT_FIRST_TOOL_CALL_PLANNING_CUE,
								activity_visibility: 'activity_log'
							},
							{
								operationType: 'fastchat_stream_emit_first_tool_call_planning_cue',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									toolName: patchedCall.function.name,
									toolCallId: patchedCall.id
								}
							}
						);
						if (planningCueSent) {
							observabilityWriter.recordEvent(
								'stream',
								'first_tool_call_planning_cue_emitted',
								{
									tool_name: patchedCall.function.name,
									tool_call_id: patchedCall.id
								} as Json
							);
						}
					}
					if (!streamDetached) {
						emitToolCall(eventSink, patchedCall, {
							onError: (error) => {
								streamDetached = true;
								logFastChatError({
									error,
									operationType: 'fastchat_stream_emit_tool_call',
									projectId: effectiveProjectIdForTools ?? projectIdForLogs,
									metadata: {
										sessionId: session.id,
										contextType: effectiveContextType,
										toolName: patchedCall.function.name,
										toolCallId: patchedCall.id,
										streamDetached: true
									}
								});
							},
							onMessageSent: () => {
								markStreamEventSent('tool_call');
							}
						});
					}
					const requestedSkillActivity = getRequestedSkillActivity(patchedCall);
					if (requestedSkillActivity) {
						observabilityWriter.recordEvent(
							'tool',
							'skill_requested',
							{
								path: requestedSkillActivity.path,
								via: requestedSkillActivity.via
							} as Json,
							{ skillPath: requestedSkillActivity.path }
						);
					}
					if (dev && requestedSkillActivity && !streamDetached) {
						emitSkillActivity(eventSink, requestedSkillActivity, {
							onError: (error) => {
								streamDetached = true;
								logFastChatError({
									error,
									operationType: 'fastchat_stream_emit_skill_activity',
									projectId: effectiveProjectIdForTools ?? projectIdForLogs,
									metadata: {
										sessionId: session.id,
										contextType: effectiveContextType,
										toolName: patchedCall.function.name,
										toolCallId: patchedCall.id,
										action: requestedSkillActivity.action,
										path: requestedSkillActivity.path,
										streamDetached: true
									}
								});
							},
							onMessageSent: () => {
								markStreamEventSent('skill_activity');
							}
						});
					}
				},
				onToolResult: async ({ toolCall, result }) => {
					completedToolExecutions.push({ toolCall, result });
					try {
						const patchedCall = patchToolCall(toolCall);
						const toolCallMeta = extractFastChatToolCallMeta(patchedCall);
						// D4: persist this execution incrementally (before the next tool runs)
						// so a mid-turn lambda kill still leaves a record of applied writes.
						// Uses the raw `toolCall` (same object the end-of-turn persist reads
						// from normalizedExecutions) so the incremental row matches the final
						// row byte-for-byte apart from message_id.
						if (turnRunId) {
							// Keep a human-readable completion ordinal for diagnostics. It is
							// deliberately not used as the persistence identity.
							const sequenceIndex = ++incrementalToolSequence;
							// D4: only WRITES need incremental crash-recovery persistence — reads
							// are re-derivable, so we skip the per-read DB round-trip on the hot
							// path. Write-detection mirrors the orchestrator's round
							// classification (registry `kind` + op-name heuristics); ambiguous
							// tools fall through as writes there, so we err toward persisting.
							const isMutationExecution = buildRoundToolPattern([
								patchedCall
							]).hasWriteOps;
							if (isMutationExecution) {
								try {
									await persistIncrementalToolExecutionRow({
										supabase: internalSupabase,
										sessionId: session.id,
										turnRunId,
										streamRunId,
										clientTurnId,
										toolCall,
										result,
										sequenceIndex
									});
								} catch (error) {
									// Non-fatal: the end-of-turn bulk persist is the safety net for
									// a turn that completes. Log and keep streaming.
									logFastChatError({
										error,
										operationType:
											'fastchat_persist_tool_execution_incremental',
										projectId: effectiveProjectIdForTools ?? projectIdForLogs,
										metadata: {
											sessionId: session.id,
											contextType: effectiveContextType,
											toolName: toolCall.function.name,
											toolCallId: toolCall.id,
											sequenceIndex
										}
									});
								}
							}
							// D4: heartbeat turn progress so a future sweeper can distinguish a
							// dead turn from a slow one. Fires on every execution (read or write —
							// progress is progress) and is cheap/detached, so it stays outside the
							// write gate above. Best-effort (detached).
							observabilityWriter.queueTurnRunUpdate(
								{ last_progress_at: new Date().toISOString() },
								'turn_progress_heartbeat'
							);
						}
						// Dev-only: surface exactly what the agent's search is doing so we can
						// watch tool choice (smart vs legacy family), the query, scope, and
						// result/zero-result counts live while smoke-testing. Gated on `dev`
						// so it never adds noise/cost in production.
						if (dev && isSearchTool(patchedCall.function.name)) {
							const searchArgs = parseToolArgumentsForPersistence(
								patchedCall.function.arguments
							);
							const argRecord =
								searchArgs &&
								typeof searchArgs === 'object' &&
								!Array.isArray(searchArgs)
									? (searchArgs as Record<string, unknown>)
									: {};
							const searchTelemetry = searchTelemetryColumns({
								toolName: patchedCall.function.name,
								success: result.success === true,
								result: result.result
							});
							logger.info('[search] agent search executed', {
								tool: patchedCall.function.name,
								family: searchToolFamily(patchedCall.function.name),
								queryChars:
									typeof (argRecord.query ?? argRecord.search) === 'string'
										? String(argRecord.query ?? argRecord.search).length
										: 0,
								projectScoped: Boolean(argRecord.project_id),
								types: Array.isArray(argRecord.types) ? argRecord.types : undefined,
								resultCount: searchTelemetry.result_count,
								zeroResult: searchTelemetry.zero_result,
								success: result.success === true,
								durationMs:
									typeof result.duration_ms === 'number'
										? result.duration_ms
										: null,
								sessionId: session.id
							});
						}
						if (!streamDetached) {
							emitToolResult(eventSink, patchedCall, result, {
								onError: (error) => {
									streamDetached = true;
									logFastChatError({
										error,
										operationType: 'fastchat_stream_emit_tool_result',
										projectId: effectiveProjectIdForTools ?? projectIdForLogs,
										metadata: {
											sessionId: session.id,
											contextType: effectiveContextType,
											toolName: patchedCall.function.name,
											toolCallId: patchedCall.id,
											streamDetached: true
										}
									});
								},
								onMessageSent: () => {
									markStreamEventSent('tool_result');
								}
							});
						}
						const validationFailed =
							!result.success && isExpectedToolValidationFailure(result.error);
						observabilityWriter.recordEvent(
							'tool',
							validationFailed
								? 'tool_call_validation_failed'
								: 'tool_result_received',
							buildTurnEventToolResultPayload(patchedCall, result),
							{
								helpPath: toolCallMeta.helpPath,
								canonicalOp: toolCallMeta.canonicalOp,
								validationFailed
							}
						);
						const loadedSkillActivity = getLoadedSkillActivity(patchedCall, result);
						if (loadedSkillActivity) {
							const loadedSkillTooling = getLoadedSkillToolingTelemetry(result);
							observabilityWriter.recordEvent(
								'tool',
								'skill_loaded',
								{
									path: loadedSkillActivity.path,
									via: loadedSkillActivity.via,
									...loadedSkillTooling
								} as Json,
								{ skillPath: loadedSkillActivity.path }
							);
						}
						if (dev && loadedSkillActivity && !streamDetached) {
							emitSkillActivity(eventSink, loadedSkillActivity, {
								onError: (error) => {
									streamDetached = true;
									logFastChatError({
										error,
										operationType: 'fastchat_stream_emit_skill_activity',
										projectId: effectiveProjectIdForTools ?? projectIdForLogs,
										metadata: {
											sessionId: session.id,
											contextType: effectiveContextType,
											toolName: patchedCall.function.name,
											toolCallId: patchedCall.id,
											action: loadedSkillActivity.action,
											path: loadedSkillActivity.path,
											streamDetached: true
										}
									});
								},
								onMessageSent: () => {
									markStreamEventSent('skill_activity');
								}
							});
						}
						if (!result.success) {
							const toolErrorLength =
								typeof result.error === 'string' ? result.error.length : 0;
							const toolFailureMetadata = {
								sessionId: session.id,
								contextType: effectiveContextType,
								entityId: effectiveEntityId,
								toolName: patchedCall.function.name,
								toolCallId: patchedCall.id,
								toolError: `Tool failed (${toolErrorLength} error characters).`
							};
							if (isExpectedToolValidationFailure(result.error)) {
								logger.warn('FastChat tool validation failure', {
									...toolFailureMetadata,
									toolArgsPreview: previewToolArguments(
										patchedCall.function.arguments
									)
								});
								const errorLogId = persistFastChatError({
									error: new Error(
										`FastChat tool validation failed (${toolErrorLength} error characters).`
									),
									operationType: 'tool_execution',
									projectId: effectiveProjectIdForTools ?? projectIdForLogs,
									metadata: {
										...toolFailureMetadata,
										failureStage: 'fastchat_tool_validation',
										toolArgsPreview: previewToolArguments(
											patchedCall.function.arguments
										)
									}
								});
								if (patchedCall.function.name === 'create_onto_project') {
									errorReporter.trackRecoverableProjectCreateError(
										patchedCall.id,
										errorLogId
									);
								}
							} else {
								logFastChatError({
									error: new Error(
										`FastChat tool execution failed (${toolErrorLength} error characters).`
									),
									operationType: 'fastchat_tool_result_failure',
									projectId: effectiveProjectIdForTools ?? projectIdForLogs,
									metadata: toolFailureMetadata
								});
							}
						}
						if (result.success && patchedCall.function.name === 'create_onto_project') {
							await errorReporter.resolveRecoveredProjectCreateErrors(patchedCall.id);
						}

						const contextShift = extractContextShiftPayload(result);
						if (contextShift) {
							observabilityWriter.recordEvent('tool', 'context_shift_emitted', {
								new_context: contextShift.new_context,
								entity_id: contextShift.entity_id ?? null
							} as Json);
							effectiveContextType = contextShift.new_context;
							effectiveEntityId = contextShift.entity_id;
							latestContextShift = contextShift;
							effectiveProjectIdForTools =
								contextShift.entity_type === 'project'
									? (readMetadataString(contextShift.entity_id) ?? undefined)
									: (readMetadataString(projectFocus?.projectId) ??
										readMetadataString(promptContext?.projectId) ??
										effectiveProjectIdForTools);
							void updateAgentMetadata(
								supabase,
								session.id,
								{
									fastchat_last_context_shift: {
										context_type: contextShift.new_context,
										entity_id: contextShift.entity_id ?? null,
										project_id: effectiveProjectIdForTools ?? null,
										shifted_at: new Date().toISOString()
									}
								},
								{
									errorLogger,
									userId,
									projectId: effectiveProjectIdForTools ?? projectIdForLogs
								}
							);
							await emitContextShift(eventSink, contextShift, {
								onError: (error) => {
									logFastChatError({
										error,
										operationType: 'fastchat_stream_emit_context_shift',
										projectId: effectiveProjectIdForTools,
										metadata: {
											sessionId: session.id,
											contextType: contextShift.new_context,
											entityId: contextShift.entity_id
										}
									});
								},
								onMessageSent: () => {
									markStreamEventSent('context_shift');
								}
							});
						}
					} catch (error) {
						logger.warn('FastChat onToolResult callback failed', {
							error,
							sessionId: session.id
						});
						logFastChatError({
							error,
							operationType: 'fastchat_stream_on_tool_result',
							projectId: effectiveProjectIdForTools ?? projectIdForLogs,
							metadata: {
								sessionId: session.id,
								contextType: effectiveContextType,
								entityId: effectiveEntityId,
								toolName: toolCall.function.name,
								toolCallId: toolCall.id
							}
						});
					}
				},
				onSupervisorDecision: async ({ decision, digest, source, trigger }) => {
					const payload = {
						action: decision.action,
						reason: 'reason' in decision ? decision.reason : null,
						question: decision.action === 'ask_user' ? decision.question : null,
						source: source ?? 'monitor',
						trigger: trigger ?? null,
						digest: {
							elapsed_ms: digest.elapsedMs,
							ms_since_visible_text: digest.msSinceVisibleText,
							llm_pass_count: digest.llmPassCount,
							tool_round_count: digest.toolRoundCount,
							tool_call_count: digest.toolCallCount,
							validation_failure_count: digest.validationFailureCount,
							progress: digest.progress,
							risks: digest.risks,
							recent_tools: digest.recentTools
						}
					} as Json;
					observabilityWriter.recordEvent(
						decision.action === 'emit_status' ? 'stream' : 'llm',
						decision.action === 'emit_status'
							? 'supervisor_status_emitted'
							: decision.action === 'force_synthesis'
								? 'supervisor_force_synthesis'
								: decision.action === 'flag_eval'
									? 'supervisor_eval_flagged'
									: decision.action === 'ask_user'
										? 'supervisor_ask_user'
										: 'supervisor_decision',
						payload
					);
					if (decision.action === 'emit_status') {
						await sendTimedMessage(
							{
								type: 'agent_state',
								state: 'thinking',
								contextType: effectiveContextType,
								details: decision.message
							},
							{
								operationType: 'fastchat_stream_emit_supervisor_status',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									reason: decision.reason
								}
							}
						);
					}
					if (decision.action === 'ask_user') {
						try {
							if (!supervisorQuestionCheckpointId && turnRunId) {
								const supervisorQuestionCheckpoint = await createTurnCheckpoint({
									supabase: internalSupabase,
									turnRunId,
									sessionId: session.id,
									userId,
									checkpointType: 'supervisor_question',
									reason: decision.reason,
									digest: decision.checkpoint.digest,
									resumeContext: decision.checkpoint.resumeContext,
									supervisorDecision: decision,
									question: decision.question
								});
								supervisorQuestionCheckpointId = supervisorQuestionCheckpoint.id;
								observabilityWriter.recordEvent(
									'llm',
									'supervisor_question_checkpoint_created',
									{
										checkpoint_id: supervisorQuestionCheckpointId,
										reason: decision.reason,
										question_chars: decision.question.length
									} as Json
								);
							}
						} catch (error) {
							supervisorQuestionCheckpointFailed = true;
							logFastChatError({
								error,
								operationType: 'fastchat_supervisor_question_checkpoint',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								tableName: 'chat_turn_checkpoints',
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									entityId: effectiveEntityId,
									turnRunId,
									reason: decision.reason
								}
							});
							observabilityWriter.recordEvent(
								'llm',
								'supervisor_question_checkpoint_failed',
								{
									reason: decision.reason,
									error: error instanceof Error ? error.message : String(error)
								} as Json
							);
						}
						await sendTimedMessage(
							{
								type: 'agent_state',
								state: 'waiting_on_user',
								contextType: effectiveContextType,
								details: 'Waiting on your direction to continue.'
							},
							{
								operationType: 'fastchat_stream_emit_supervisor_question_state',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									reason: decision.reason,
									checkpointId: supervisorQuestionCheckpointId,
									checkpointFailed: supervisorQuestionCheckpointFailed
								}
							}
						);
					}
				},
				onDelta: async (delta) => {
					try {
						const deltaSent = await sendTimedMessage(
							{ type: 'text_delta', content: delta },
							{
								operationType: 'fastchat_stream_emit_delta',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType
								}
							}
						);
						if (deltaSent) {
							scheduleDeferredPromptSnapshotPersistence();
						}
					} catch (error) {
						if (!turnAbortController.signal.aborted) {
							logger.warn('Failed to emit text delta', {
								error,
								sessionId: session.id
							});
						}
						throw error;
					}
				}
			});
			scheduleDeferredPromptSnapshotPersistence();
			if (!cancelled) {
				const finalizingSent = await sendTimedMessage(
					{
						type: 'turn_phase',
						turn_phase: 'finalizing',
						message: FASTCHAT_TURN_PHASE_MESSAGES.finalizing
					},
					{
						operationType: 'fastchat_stream_emit_turn_phase',
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						metadata: {
							sessionId: session.id,
							contextType: effectiveContextType,
							turnPhase: 'finalizing'
						}
					}
				);
				if (finalizingSent) {
					observabilityWriter.recordEvent('stream', 'turn_phase_changed', {
						turn_phase: 'finalizing'
					} as Json);
				}
			}
			const normalizedExecutions = toolExecutions ?? [];

			// Deterministic research capture (spec: WORKING_NOTES_RESEARCH_LOG_SPEC_2026-07-26).
			// The model is separately steered to write a real synthesized document; this is the
			// floor beneath that, so a turn that researched and saved nothing still leaves a record.
			// Awaited on purpose — a fire-and-forget write races end-of-turn assertions.
			const researchLogProjectId = effectiveProjectIdForTools ?? projectIdForLogs;
			if (researchLogProjectId) {
				try {
					const researchEntry = buildResearchEntryFromCalls(
						normalizedExecutions.map((execution) => ({
							name: execution.toolCall?.function?.name ?? '',
							args: parseToolArgumentsForPersistence(
								execution.toolCall?.function?.arguments
							) as Record<string, unknown> | null,
							result: execution.result?.result
						})),
						{
							streamRunId,
							userMessage: message,
							capturedAt: new Date().toISOString()
						}
					);
					if (researchEntry) {
						await appendResearchEntry(supabase, {
							projectId: researchLogProjectId,
							userId,
							entry: researchEntry
						});
					}
				} catch (researchLogError) {
					// Capture must never fail a turn that otherwise succeeded.
					logger.warn('Research log capture failed', {
						error:
							researchLogError instanceof Error
								? researchLogError.message
								: String(researchLogError),
						streamRunId
					});
				}
			}

			// Deterministic forward-carry capture (D1, 2026-07-26). The stated-future repair gate
			// gives the model first refusal; this is the floor beneath it — measured lifetime 1/27
			// without it. Triggered from ground truth (user text + actual executions), NOT the
			// gate's fired flag: coupling to the flag let 2/5 battery runs drop the future when
			// finalization took a path the gate never saw. The conservative pattern subset keeps
			// regex false positives from becoming user-visible tasks. Awaited for the same reason
			// as research capture: a fire-and-forget write races end-of-turn assertions.
			const statedFutureProjectId = effectiveProjectIdForTools ?? projectIdForLogs;
			if (
				statedFutureProjectId &&
				!cancelled &&
				looksLikeConservativeStatedFuture(message) &&
				didWriteWithoutDurableRecord(normalizedExecutions)
			) {
				try {
					// Extract from the raw user message, not messageForModel — attachment
					// boilerplate must never become a task title. No clause here means the
					// gate matched only appended context; skip rather than title it wrong.
					const clause = extractStatedFutureClause(message);
					if (clause) {
						await createStatedFutureTask(supabase, {
							projectId: statedFutureProjectId,
							userId,
							streamRunId,
							clause,
							userMessage: message
						});
					}
				} catch (statedFutureError) {
					// Capture must never fail a turn that otherwise succeeded.
					logger.warn('Stated-future capture failed', {
						error:
							statedFutureError instanceof Error
								? statedFutureError.message
								: String(statedFutureError),
						streamRunId
					});
				}
			}

			const semanticTurnOutcome =
				turnContractResolution ??
				resolveTurnContractOutcome({
					contract: turnContract,
					toolExecutions: normalizedExecutions,
					finishedReason
				});
			// Compatibility aliases for persistence/checkpoint columns whose schema
			// names predate semantic contracts.
			const turnOutcomeStatus = semanticTurnOutcome.status;
			// A security-review stop must never become an auto-resuming mutation
			// contract. The next user message has to explicitly confirm the proposed
			// write, after which the model can declare a fresh bounded contract.
			const nextPendingTurnContract = securityReview?.required
				? null
				: buildFastChatPendingTurnContract({
						resolution: semanticTurnOutcome,
						contextType,
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						turnRunId,
						finishedReason
					});
			let pendingContractMetadataPersisted = false;
			if (
				turnContract ||
				pendingTurnContract ||
				pendingTurnIntent ||
				securityReview?.required
			) {
				pendingContractMetadataPersisted = await updateAgentMetadata(
					supabase,
					session.id,
					{
						[FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY]: nextPendingTurnContract,
						// Clear the lexical pending-intent record during migration. Only a
						// model-declared or directly observed semantic contract carries over.
						[FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY]: null
					},
					{
						errorLogger,
						userId,
						projectId: effectiveProjectIdForTools ?? projectIdForLogs
					}
				);
			}
			observabilityWriter.recordEvent('finalize', 'turn_outcome_resolved', {
				outcome_status: semanticTurnOutcome.status,
				completion_status: completionOutcome?.status ?? 'completed',
				answer_source: completionOutcome?.answerSource ?? 'model',
				contract_present: semanticTurnOutcome.contract !== null,
				contract_source: semanticTurnOutcome.contract?.source ?? null,
				contract_fulfilled: semanticTurnOutcome.fulfilled,
				contract_outcomes: semanticTurnOutcome.outcomes,
				security_review_required: securityReview?.required === true,
				security_review_reasons: securityReview?.reasons ?? [],
				security_review_tools: securityReview?.toolNames ?? [],
				lexical_intent_shadow: turnIntent,
				pending_contract_persisted:
					nextPendingTurnContract !== null && pendingContractMetadataPersisted
			} as Json);
			const normalizedToolCallCount = Math.max(
				typeof toolCallsMade === 'number' && Number.isFinite(toolCallsMade)
					? toolCallsMade
					: 0,
				normalizedExecutions.length
			);
			const toolDomainSignalObservedAt = new Date();
			const usedDomainSignals = deriveUsedDomainSignalsFromToolExecutions(
				normalizedExecutions,
				{
					now: toolDomainSignalObservedAt,
					turnRunId
				}
			);
			const loadedOutcomeCardGapSignals =
				deriveLoadedOutcomeCardGapSignalsFromToolExecutions(normalizedExecutions);
			if (usedDomainSignals.length > 0 || loadedOutcomeCardGapSignals.length > 0) {
				const domainStateBeforeToolMerge = latestDomainState;
				if (domainStateMetadataUpdatePromise) {
					await domainStateMetadataUpdatePromise;
				}
				let nextDomainState =
					usedDomainSignals.length > 0
						? mergeUsedDomainSignalsIntoSessionState(
								latestDomainState,
								usedDomainSignals,
								{ now: toolDomainSignalObservedAt }
							)
						: mergeLoadedOutcomeCardGapsIntoSessionState(
								latestDomainState,
								loadedOutcomeCardGapSignals,
								{ now: toolDomainSignalObservedAt }
							);
				if (usedDomainSignals.length > 0 && loadedOutcomeCardGapSignals.length > 0) {
					nextDomainState = mergeLoadedOutcomeCardGapsIntoSessionState(
						nextDomainState,
						loadedOutcomeCardGapSignals,
						{ now: toolDomainSignalObservedAt }
					);
				}
				latestDomainState = nextDomainState;
				await updateAgentMetadata(
					supabase,
					session.id,
					{
						fastchat_domain_state: nextDomainState
					},
					{
						errorLogger,
						userId,
						projectId: effectiveProjectIdForTools ?? projectIdForLogs
					}
				);
				const newToolBacklogEntries = getNewDomainResearchBacklogEntries(
					nextDomainState,
					domainStateBeforeToolMerge
				);
				observabilityWriter.recordEvent('finalize', 'domain_tool_signals_merged', {
					used_domain_signal_count: usedDomainSignals.length,
					loaded_outcome_card_gap_count: loadedOutcomeCardGapSignals.length,
					used_domain_ids: [
						...new Set(usedDomainSignals.map((signal) => signal.domain_id))
					],
					loaded_outcome_card_gap_ids: loadedOutcomeCardGapSignals
						.map(
							(signal) =>
								signal.missing_skill_id ?? signal.missing_resource_id ?? null
						)
						.filter((id): id is string => Boolean(id)),
					research_backlog_ids: nextDomainState.research_backlog.map((entry) => entry.id)
				} as Json);
				if (newToolBacklogEntries.length > 0) {
					observabilityWriter.recordEvent('finalize', 'domain_research_backlog_queued', {
						source: 'tool_results',
						entries: newToolBacklogEntries.map((entry) => ({
							id: entry.id,
							kind: entry.kind,
							priority: entry.priority,
							domain_ids: entry.domain_ids,
							missing_skill_id: entry.missing_skill_id ?? null,
							missing_resource_id: entry.missing_resource_id ?? null
						}))
					} as Json);
				}
			}
			if (turnDomainSensing) {
				observabilityWriter.recordEvent('finalize', 'skill_gate_evaluated', {
					...buildSkillGateTelemetry({
						skillLoadRequired: turnDomainSensing.skill_load_required === true,
						expectedSkillIds: skillGateExpectedSkillIds,
						expectedSkillFormats: skillGateExpectedSkillFormats,
						historyLoadedSkillIds: skillGateHistoryLoadedSkillIds,
						toolExecutions: normalizedExecutions,
						violationRepairInjected: skillGateViolationRepaired === true
					}),
					skill_preloaded_id: skillGatePreload?.skillId ?? null,
					used_domain_ledger_skill_ids: usedDomainLedgerSkillIds
				} as Json);
			}
			if (finalizationGuard?.applied) {
				observabilityWriter.recordEvent(
					'finalize',
					'supervisor_finalization_guard_applied',
					{
						reason: finalizationGuard.reason ?? null,
						guard_finished_reason: finalizationGuard.finishedReason ?? null,
						text_chars: finalizationGuard.text.length,
						tool_execution_count: normalizedExecutions.length
					} as Json
				);
			}
			if (completionOutcome?.status === 'completed_degraded') {
				observabilityWriter.recordEvent('finalize', 'synthesis_transport_recovered', {
					completion_status: completionOutcome.status,
					answer_source: completionOutcome.answerSource,
					recovery_outcome: completionOutcome.recovery?.outcome ?? null,
					recovery_measurements:
						(completionOutcome.recovery?.measurements as Json | undefined) ?? null,
					evidence_tool_execution_count:
						completionOutcome.recovery?.evidenceToolExecutionCount ?? 0
				} as Json);
			}
			if (supervisorDecisions?.length) {
				const sourceCounts = countBy(
					supervisorDecisions.map((record) => record.source ?? 'monitor')
				);
				const triggerCounts = countBy(
					supervisorDecisions.flatMap((record) =>
						record.trigger ? [record.trigger] : []
					)
				);
				observabilityWriter.recordEvent('finalize', 'supervisor_decision_summary', {
					count: supervisorDecisions.length,
					actions: supervisorDecisions.map((record) => record.decision.action),
					sources: sourceCounts,
					triggers: triggerCounts
				} as Json);
			}
			observabilityWriter.recordEvent('finalize', 'orchestration_interventions', {
				...orchestrationInterventions,
				eval_scaffold_variant: STREAM_CONFIG.scaffold.variant,
				eval_scaffold_fingerprint: evalScaffoldFingerprint,
				eval_scaffold_config: STREAM_CONFIG.scaffold,
				eval_pinned_models: STREAM_CONFIG.routing.pinnedModels,
				forced_synthesis_routing_variant: forcedSynthesisRouting?.variant ?? 'off',
				forced_synthesis_routing_models: forcedSynthesisRouting?.models ?? null,
				forced_synthesis_ignored_provider_slugs:
					forcedSynthesisRouting?.ignoredProviderSlugs ?? null,
				forced_synthesis_max_tokens: forcedSynthesisRouting?.maxTokens ?? null
			} as Json);
			for (const pass of llmPasses ?? []) {
				observabilityWriter.recordEvent('llm', 'llm_pass_completed', {
					pass: pass.pass,
					pass_role: pass.passRole ?? null,
					requested_profile: pass.requestedProfile ?? null,
					requested_models: pass.requestedModels ?? null,
					forced_synthesis_routing_variant: pass.forcedSynthesisRoutingVariant ?? null,
					ignored_provider_slugs: pass.ignoredProviderSlugs ?? null,
					max_tokens: pass.maxTokens ?? FASTCHAT_LIMITS.SYNTHESIS_MAX_TOKENS,
					retry_model_rotation: pass.retryModelRotation === true,
					attempt_routes: (pass.attemptRoutes as Json | undefined) ?? null,
					model: pass.model ?? null,
					provider: pass.provider ?? null,
					provider_raw: pass.providerRaw ?? null,
					provider_slug: pass.providerSlug ?? null,
					request_id: pass.requestId ?? null,
					system_fingerprint: pass.systemFingerprint ?? null,
					finished_reason: pass.finishedReason ?? null,
					forced_no_tool_synthesis: pass.forcedNoToolSynthesis === true,
					suppressed_no_tool_synthesis_tool_calls:
						pass.suppressedNoToolSynthesisToolCalls ?? 0,
					suppressed_no_tool_synthesis_tool_call_details:
						(pass.suppressedNoToolSynthesisToolCallDetails as Json | undefined) ?? null,
					cache_status: pass.cacheStatus ?? null,
					stream_retry_count: pass.streamRetryCount ?? 0,
					attempts: pass.attempts ?? 1,
					reasoning_tokens: pass.reasoningTokens ?? null,
					prompt_tokens: pass.promptTokens ?? null,
					completion_tokens: pass.completionTokens ?? null,
					total_tokens: pass.totalTokens ?? null,
					started_at_ms: pass.startedAtMs ?? null,
					duration_ms: pass.durationMs ?? null,
					time_to_first_token_ms: pass.timeToFirstTokenMs ?? null,
					terminal_outcome: pass.terminalOutcome ?? null,
					terminal_event_received: pass.terminalEventReceived ?? null,
					assistant_text_chars_received: pass.assistantTextCharsReceived ?? null,
					reasoning_chars_received: pass.reasoningCharsReceived ?? null,
					tool_calls_received: pass.toolCallsReceived ?? null,
					attempts_exhausted: pass.attemptsExhausted ?? null,
					recovered_as_degraded_completion: pass.recoveredAsDegradedCompletion === true
				} as Json);
			}
			const finalizeUserMessagePromise = (async () => {
				if (voiceGroupId) {
					await sessionService.attachVoiceNoteGroup({
						groupId: voiceGroupId,
						userId,
						sessionId: session.id,
						messageId: turnAdmission.userMessageId
					});
				}
				return { id: turnAdmission.userMessageId };
			})();
			const sessionContextSyncPromise = sessionService.updateSessionContext({
				session,
				contextType: effectiveContextType,
				entityId: effectiveEntityId
			});
			observabilityWriter.trackDetachedTask(
				finalizeUserMessagePromise,
				'finalize_user_message',
				{
					projectId: projectIdForLogs,
					contextType: effectiveContextType,
					sessionId: session.id,
					entityId: effectiveEntityId
				}
			);
			observabilityWriter.trackDetachedTask(
				sessionContextSyncPromise,
				'sync_session_context',
				{
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					contextType: effectiveContextType,
					sessionId: session.id,
					entityId: effectiveEntityId
				}
			);

			const isCancelledTurn =
				cancelled === true ||
				finishedReason === 'cancelled' ||
				turnAbortController.signal.aborted;
			const assistantContent = resolvePersistableAssistantContent({
				finalAssistantText,
				assistantText,
				fallback: null
			});
			if (isCancelledTurn) {
				const interruptedReason =
					turnAbortReason ??
					(await cancellationMonitor?.resolveInterruptedReason(
						turnAbortController.signal.aborted
					)) ??
					'cancelled';
				let interruptedMessage = null;
				if (assistantContent && assistantContent.length > 0) {
					assistantPersistStartedAtMs = Date.now();
					const interruptedMetadata: Record<string, Json | undefined> = {
						interrupted: true,
						interrupted_reason: interruptedReason,
						finished_reason: 'cancelled',
						partial_tokens: Math.ceil(assistantContent.length / 4)
					};
					if (streamRunId) {
						interruptedMetadata.stream_run_id = streamRunId;
					}
					if (clientTurnId) {
						interruptedMetadata.client_turn_id = clientTurnId;
					}
					const interruptedLLMPassSummary = buildLLMPassSummary(llmPasses);
					if (interruptedLLMPassSummary) {
						interruptedMetadata.llm_passes = interruptedLLMPassSummary.passes;
						interruptedMetadata.llm_pass_count = interruptedLLMPassSummary.pass_count;
						if (interruptedLLMPassSummary.peak_prompt_tokens !== null) {
							interruptedMetadata.peak_prompt_tokens =
								interruptedLLMPassSummary.peak_prompt_tokens;
						}
					}
					interruptedMessage = await sessionService.persistMessage({
						sessionId: session.id,
						userId,
						role: 'assistant',
						content: assistantContent,
						metadata: interruptedMetadata,
						usage,
						idempotencyKey: clientTurnId
							? `turn:${clientTurnId}:assistant_interrupted`
							: undefined
					});
					assistantPersistedAtMs = Date.now();
				}

				const interruptedToolExecutionPersistPromise = persistToolExecutionRows({
					supabase: internalSupabase,
					sessionId: session.id,
					messageId: interruptedMessage?.id ?? null,
					turnRunId,
					streamRunId,
					clientTurnId,
					executions: normalizedExecutions,
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					contextType: effectiveContextType,
					interrupted: true,
					logError: logFastChatError
				});
				observabilityWriter.trackDetachedTask(
					interruptedToolExecutionPersistPromise,
					'persist_interrupted_tool_executions',
					{
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						contextType: effectiveContextType,
						sessionId: session.id,
						entityId: effectiveEntityId
					}
				);

				finalizationStartedAtMs = Date.now();
				if (!streamDetached) {
					const cancelledLastTurnContext = buildLastTurnContext({
						assistantText: assistantContent ?? '',
						userMessage: storedUserMessageContent,
						contextType: effectiveContextType,
						entityId: effectiveEntityId,
						contextShift: latestContextShift,
						toolExecutions: toolExecutions ?? [],
						timestamp: interruptedMessage?.created_at ?? new Date().toISOString()
					});
					try {
						await sendTimedMessage(
							{
								type: 'last_turn_context',
								context: cancelledLastTurnContext
							},
							{
								operationType: 'fastchat_stream_emit_last_turn_context',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									finishedReason: 'cancelled'
								}
							}
						);
					} catch (error) {
						logger.warn('Failed to emit cancelled last_turn_context', {
							error,
							sessionId: session.id
						});
					}
					doneEmittedAtMs = Date.now();
					const cancelledTimingSummary =
						observabilityWriter.buildTimingSummary('cancelled');
					if (timingSessionId) {
						await sendTimedMessage(
							{
								type: 'timing',
								timing: cancelledTimingSummary
							},
							{
								operationType: 'fastchat_stream_emit_timing',
								projectId: effectiveProjectIdForTools ?? projectIdForLogs,
								metadata: {
									sessionId: session.id,
									contextType: effectiveContextType,
									finishedReason: 'cancelled'
								}
							}
						);
					}
					await sendTimedMessage(
						{
							type: 'done',
							usage,
							finished_reason: 'cancelled'
						},
						{
							operationType: 'fastchat_stream_emit_done',
							projectId: effectiveProjectIdForTools ?? projectIdForLogs,
							metadata: {
								sessionId: session.id,
								contextType: effectiveContextType,
								finishedReason: 'cancelled'
							}
						}
					);
					doneEmittedAtMs = Date.now();
					observabilityWriter.recordEvent('finalize', 'done_emitted', {
						finished_reason: 'cancelled',
						total_tokens: usage?.total_tokens ?? null
					} as Json);
					observabilityWriter.queueTimingMetric('cancelled');
				} else {
					doneEmittedAtMs = Date.now();
					observabilityWriter.queueTimingMetric(interruptedReason);
				}
				await observabilityWriter.persistFinalState(
					{
						assistant_message_id: interruptedMessage?.id ?? null,
						status: 'cancelled',
						finished_reason: interruptedReason,
						tool_round_count: toolRounds ?? 0,
						tool_call_count: normalizedToolCallCount,
						validation_failure_count: observabilityWriter.getValidationFailureCount(),
						llm_pass_count: llmPasses?.length ?? 0,
						...observabilityWriter.getFirstLanePatch(),
						prompt_snapshot_id: promptSnapshotId,
						timing_metric_id: observabilityWriter.getTimingMetricId(),
						cache_source: contextCacheSource,
						cache_age_seconds: contextCacheAgeSecondsForTiming,
						finished_at: new Date().toISOString()
					},
					'cancelled'
				);
				await restoreResumingSupervisorCheckpoint(interruptedReason ?? 'cancelled');
				return;
			}

			const persistedToolTrace = buildPersistedToolTrace(normalizedExecutions);
			const persistedToolTraceSummary = buildPersistedToolTraceSummary(persistedToolTrace);
			const llmPassSummary = buildLLMPassSummary(llmPasses);
			const persistedAssistantContent =
				resolvePersistableAssistantContent({ finalAssistantText, assistantText }) ??
				CLEAN_RESPONSE_FALLBACK;
			const assistantPersistMetadata: Record<string, Json | undefined> = {};
			assistantPersistMetadata.outcome_status = turnOutcomeStatus;
			assistantPersistMetadata.completion_outcome = (completionOutcome ?? {
				status: 'completed',
				answerSource: 'model'
			}) as unknown as Json;
			assistantPersistMetadata.completion_status = completionOutcome?.status ?? 'completed';
			assistantPersistMetadata.answer_source = completionOutcome?.answerSource ?? 'model';
			if (
				completionOutcome?.status === 'completed_degraded' &&
				completionOutcome.answerSource === 'partial_model'
			) {
				assistantPersistMetadata.interrupted = true;
				assistantPersistMetadata.interrupted_reason = 'synthesis_recovered';
			}
			assistantPersistMetadata.turn_intent = turnIntent as unknown as Json;
			if (persistedToolTrace.length > 0) {
				assistantPersistMetadata.fastchat_tool_trace_v1 = persistedToolTrace as Json;
				if (persistedToolTraceSummary) {
					assistantPersistMetadata.fastchat_tool_trace_summary =
						persistedToolTraceSummary;
				}
			}
			if (clientTurnId) assistantPersistMetadata.client_turn_id = clientTurnId;
			if (streamRunId) assistantPersistMetadata.stream_run_id = streamRunId;
			if (llmPassSummary) {
				assistantPersistMetadata.llm_passes = llmPassSummary.passes;
				assistantPersistMetadata.llm_pass_count = llmPassSummary.pass_count;
				if (llmPassSummary.peak_prompt_tokens !== null) {
					assistantPersistMetadata.peak_prompt_tokens = llmPassSummary.peak_prompt_tokens;
				}
			}
			// Prefer the orchestrator's peakPromptTokens when present (computed from
			// live provider-reported tokens; survives even if llmPasses metadata
			// is missing).
			if (typeof peakPromptTokens === 'number' && peakPromptTokens > 0) {
				assistantPersistMetadata.peak_prompt_tokens = peakPromptTokens;
			}
			if (finalContextUsage) {
				assistantPersistMetadata.final_context_usage = {
					estimated_tokens: finalContextUsage.estimatedTokens,
					token_budget: finalContextUsage.tokenBudget,
					usage_percent: finalContextUsage.usagePercent,
					status: finalContextUsage.status
				} as Json;
			}
			if (finalizationGuard?.applied) {
				assistantPersistMetadata.supervisor_finalization_guard = {
					reason: finalizationGuard.reason ?? null,
					guard_finished_reason: finalizationGuard.finishedReason ?? null,
					text_chars: finalizationGuard.text.length
				} as Json;
			}
			const shouldResolveResumingCheckpoint =
				semanticTurnOutcome.contract === null || semanticTurnOutcome.fulfilled;
			if (resumingSupervisorCheckpoint && shouldResolveResumingCheckpoint) {
				assistantPersistMetadata.supervisor_resume_checkpoint = {
					checkpoint_id: resumingSupervisorCheckpoint.id,
					original_turn_run_id: resumingSupervisorCheckpoint.turn_run_id,
					reason: resumingSupervisorCheckpoint.reason
				} as Json;
			}
			if (supervisorQuestionCheckpointId || supervisorQuestionCheckpointFailed) {
				assistantPersistMetadata.supervisor_question_checkpoint = {
					checkpoint_id: supervisorQuestionCheckpointId,
					failed: supervisorQuestionCheckpointFailed
				} as Json;
			}
			assistantPersistStartedAtMs = Date.now();
			const assistantMessage = await sessionService.persistMessage({
				sessionId: session.id,
				userId,
				role: 'assistant',
				content: persistedAssistantContent,
				metadata:
					Object.keys(assistantPersistMetadata).length > 0
						? assistantPersistMetadata
						: undefined,
				usage,
				idempotencyKey: clientTurnId ? `turn:${clientTurnId}:assistant` : undefined
			});
			assistantPersistedAtMs = Date.now();

			// Honesty guard (2026-07-23 audit N14): if the final assistant message
			// failed to persist, the turn must NOT report completed — the client
			// saw streamed text that will vanish on snapshot reload. Downgrade the
			// done event and the turn run's terminal state so reconcile paths see
			// a failed turn instead of a "successful" one with a missing reply.
			const assistantPersistFailed = !assistantMessage;
			if (assistantPersistFailed) {
				logFastChatError({
					error: new Error('Failed to persist assistant message'),
					operationType: 'fastchat_persist_message',
					projectId: projectIdForLogs,
					metadata: { role: 'assistant', sessionId: session.id }
				});
			}

			const toolExecutionPersistPromise = persistToolExecutionRows({
				supabase: internalSupabase,
				sessionId: session.id,
				messageId: assistantMessage?.id ?? null,
				turnRunId,
				streamRunId,
				clientTurnId,
				executions: normalizedExecutions,
				projectId: effectiveProjectIdForTools ?? projectIdForLogs,
				contextType: effectiveContextType,
				logError: logFastChatError
			});
			observabilityWriter.trackDetachedTask(
				toolExecutionPersistPromise,
				'persist_tool_executions',
				{
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					contextType: effectiveContextType,
					sessionId: session.id,
					entityId: effectiveEntityId
				}
			);

			const lastTurnContext = buildLastTurnContext({
				assistantText: persistedAssistantContent,
				userMessage: storedUserMessageContent,
				contextType: effectiveContextType,
				entityId: effectiveEntityId,
				contextShift: latestContextShift,
				toolExecutions: normalizedExecutions,
				timestamp: assistantMessage?.created_at ?? new Date().toISOString()
			});
			finalizationStartedAtMs = Date.now();
			try {
				await sendTimedMessage(
					{
						type: 'last_turn_context',
						context: lastTurnContext
					},
					{
						operationType: 'fastchat_stream_emit_last_turn_context',
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						metadata: { sessionId: session.id, contextType: effectiveContextType }
					}
				);
			} catch (error) {
				logger.warn('Failed to emit last_turn_context', { error, sessionId: session.id });
				logFastChatError({
					error,
					operationType: 'fastchat_stream_emit_last_turn_context',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				});
			}

			const executionToolSummaries = buildToolResultSummaries(normalizedExecutions);
			const summarizerMessages: AgentStateMessageSnapshot[] = [
				...history.map((item) => ({
					role: item.role,
					content: item.content,
					...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {})
				})),
				{ role: 'user', content: messageForModel },
				...buildToolMessageSnapshotsForReconciliation(
					normalizedExecutions,
					executionToolSummaries
				),
				{ role: 'assistant', content: persistedAssistantContent }
			];
			const toolSummaries = [
				...buildContextToolSummary({
					contextType,
					data: promptContext?.data,
					projectName: promptContext?.projectName ?? null,
					focusEntityType: promptContext?.focusEntityType ?? null,
					focusEntityName: promptContext?.focusEntityName ?? null
				}),
				...executionToolSummaries
			];
			void (async () => {
				const reconciliation = new AgentStateReconciliationService(supabase, errorLogger);
				const currentState = sanitizeAgentStateForPrompt(
					(sessionMetadata.agent_state as AgentState | undefined) ??
						buildEmptyAgentState(session.id)
				);
				const updated = await reconciliation.reconcile({
					sessionId: session.id,
					userId,
					contextType: effectiveContextType,
					messages: summarizerMessages,
					toolResults: toolSummaries,
					agentState: currentState,
					httpReferer: request.headers.get('referer') ?? undefined,
					turnRunId,
					streamRunId,
					clientTurnId
				});

				if (!updated) return;

				const sanitizedUpdated = sanitizeAgentStateForPrompt(updated);
				await updateAgentMetadata(
					supabase,
					session.id,
					{
						agent_state: sanitizedUpdated
					},
					{
						errorLogger,
						userId,
						projectId: effectiveProjectIdForTools ?? projectIdForLogs
					}
				);
			})().catch((error) => {
				logger.warn('FastChat agent_state reconciliation failed', { error });
				logFastChatError({
					error,
					operationType: 'fastchat_agent_state_reconciliation',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				});
			});

			doneEmittedAtMs = Date.now();
			const timingSummary = observabilityWriter.buildTimingSummary(finishedReason);
			if (timingSessionId) {
				await sendTimedMessage(
					{
						type: 'timing',
						timing: timingSummary
					},
					{
						operationType: 'fastchat_stream_emit_timing',
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						metadata: { sessionId: session.id, contextType: effectiveContextType }
					}
				);
			}
			const effectiveCompletionStatus = assistantPersistFailed
				? 'failed'
				: (completionOutcome?.status ?? 'completed');
			await sendTimedMessage(
				{
					type: 'done',
					usage,
					finished_reason: assistantPersistFailed
						? 'assistant_persist_failed'
						: finishedReason,
					completion_status: effectiveCompletionStatus,
					answer_source: completionOutcome?.answerSource ?? 'model'
				},
				{
					operationType: 'fastchat_stream_emit_done',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				}
			);
			doneEmittedAtMs = Date.now();
			observabilityWriter.recordEvent('finalize', 'done_emitted', {
				finished_reason: finishedReason ?? null,
				completion_status: effectiveCompletionStatus,
				answer_source: completionOutcome?.answerSource ?? 'model',
				total_tokens: usage?.total_tokens ?? null
			} as Json);
			observabilityWriter.queueTimingMetric(finishedReason);
			await observabilityWriter.persistFinalState(
				{
					assistant_message_id: assistantMessage?.id ?? null,
					status: assistantPersistFailed ? 'failed' : 'completed',
					finished_reason: assistantPersistFailed
						? 'assistant_persist_failed'
						: (finishedReason ?? null),
					tool_round_count: toolRounds ?? 0,
					tool_call_count: normalizedToolCallCount,
					validation_failure_count: observabilityWriter.getValidationFailureCount(),
					llm_pass_count: llmPasses?.length ?? 0,
					...observabilityWriter.getFirstLanePatch(),
					prompt_snapshot_id: promptSnapshotId,
					timing_metric_id: observabilityWriter.getTimingMetricId(),
					cache_source: contextCacheSource,
					cache_age_seconds: contextCacheAgeSecondsForTiming,
					finished_at: new Date().toISOString()
				},
				assistantPersistFailed ? 'failed' : 'completed'
			);
			if (resumingSupervisorCheckpoint && shouldResolveResumingCheckpoint) {
				const checkpointId = resumingSupervisorCheckpoint.id;
				try {
					const resumed = await markCheckpointResumed({
						supabase: internalSupabase,
						checkpointId,
						userId
					});
					if (resumed) {
						observabilityWriter.recordEvent(
							'finalize',
							'supervisor_checkpoint_resumed',
							{
								checkpoint_id: checkpointId,
								original_turn_run_id: resumed.turn_run_id,
								resume_turn_run_id: turnRunId
							} as Json
						);
						resumingSupervisorCheckpoint = null;
					} else {
						logger.warn('Supervisor checkpoint was not resumable at completion', {
							checkpointId,
							sessionId: session.id,
							turnRunId
						});
					}
				} catch (error) {
					logFastChatError({
						error,
						operationType: 'fastchat_supervisor_checkpoint_resumed',
						projectId: effectiveProjectIdForTools ?? projectIdForLogs,
						tableName: 'chat_turn_checkpoints',
						recordId: checkpointId,
						metadata: {
							sessionId: session.id,
							contextType: effectiveContextType,
							entityId: effectiveEntityId,
							turnRunId
						}
					});
				}
			} else if (resumingSupervisorCheckpoint) {
				observabilityWriter.recordEvent(
					'finalize',
					'supervisor_checkpoint_remains_active',
					{
						checkpoint_id: resumingSupervisorCheckpoint.id,
						resume_turn_run_id: turnRunId,
						outcome_status: turnOutcomeStatus,
						contract_fulfilled: semanticTurnOutcome.fulfilled
					} as Json
				);
			}
		} catch (error) {
			// O8: a turn is a *user cancellation* only when the abort signal actually
			// fired. The signal is set synchronously by the AbortController before any
			// AbortError reaches us, so it is the source of truth. Message-substring
			// matching (e.g. "aborted", "stream closed") also fires on real provider
			// timeouts / socket drops and would misclassify genuine errors as cancels,
			// silently swallowing them — so we trust the signal, not the message.
			if (turnAbortController.signal.aborted) {
				const interruptedReason = turnAbortReason ?? 'cancelled';
				doneEmittedAtMs = doneEmittedAtMs ?? Date.now();
				scheduleDeferredPromptSnapshotPersistence();
				observabilityWriter.queueTimingMetric(interruptedReason);
				await observabilityWriter.persistFinalState(
					{
						status: 'cancelled',
						finished_reason: interruptedReason,
						validation_failure_count: observabilityWriter.getValidationFailureCount(),
						...observabilityWriter.getFirstLanePatch(),
						prompt_snapshot_id: promptSnapshotId,
						timing_metric_id: observabilityWriter.getTimingMetricId(),
						cache_source: contextCacheSource,
						cache_age_seconds: contextCacheAgeSecondsForTiming,
						finished_at: new Date().toISOString()
					},
					'aborted'
				);
				await restoreResumingSupervisorCheckpoint(interruptedReason);
				logger.info('Agent V2 stream cancelled', {
					sessionId: streamRequest.session_id ?? null,
					contextType,
					entityId
				});
				return;
			}
			logger.error('Agent V2 stream error', { error });
			logFastChatError({
				error,
				operationType: 'fastchat_stream',
				projectId: projectIdForLogs,
				metadata: { contextType, entityId, sessionId: streamRequest.session_id }
			});
			// 2026-07-31 gate finding: the terminal stream measurements existed
			// only in console output and the failed turn run recorded 0 calls /
			// 0 rounds despite seven completed executions. Persist both durably.
			const terminalStreamFailure =
				error instanceof LlmStreamPassTerminalError ? error : null;
			if (terminalStreamFailure) {
				const measurements = terminalStreamFailure.measurements;
				observabilityWriter.recordEvent('llm', 'stream_terminal_failure', {
					outcome: terminalStreamFailure.outcome,
					pass: measurements.pass,
					pass_role: measurements.passRole ?? null,
					attempts: measurements.attempts,
					max_attempts: measurements.maxAttempts,
					retry_count: measurements.retryCount,
					timeout_ms: measurements.timeoutMs,
					duration_ms: measurements.durationMs,
					terminal_event_received: measurements.terminalEventReceived,
					assistant_text_chars_received: measurements.assistantTextCharsReceived,
					reasoning_chars_received: measurements.reasoningCharsReceived,
					tool_calls_received: measurements.toolCallsReceived,
					retryable: measurements.retryable,
					attempts_exhausted: measurements.attemptsExhausted,
					last_error_message: measurements.lastErrorMessage ?? null,
					attempt_routes: (measurements.attemptRoutes ?? []).map((route) => ({
						attempt: route.attempt,
						models: route.models ?? null,
						max_tokens: route.maxTokens ?? null
					})),
					discarded_partial_chars: terminalStreamFailure.discardedPartialChars ?? null,
					recovery_blocked_reason: terminalStreamFailure.recoveryBlockedReason ?? null,
					turn_tool_rounds: terminalStreamFailure.turnProgress?.toolRounds ?? null,
					turn_tool_calls_made: terminalStreamFailure.turnProgress?.toolCallsMade ?? null
				} as Json);
			}
			if (completedToolExecutions.length > 0 && timingSessionId) {
				await persistToolExecutionRows({
					supabase: internalSupabase,
					sessionId: timingSessionId,
					messageId: null,
					turnRunId,
					streamRunId,
					clientTurnId,
					executions: completedToolExecutions,
					projectId: projectIdForLogs,
					contextType,
					logError: logFastChatError
				});
			}
			try {
				await sendTimedMessage(
					{
						type: 'error',
						error: 'An error occurred while streaming.'
					},
					{
						operationType: 'fastchat_stream_emit_error',
						projectId: projectIdForLogs,
						metadata: {
							contextType,
							entityId,
							sessionId: streamRequest.session_id
						}
					}
				);
			} catch (sendError) {
				logFastChatError({
					error: sendError,
					operationType: 'fastchat_stream_emit_error',
					projectId: projectIdForLogs,
					metadata: {
						contextType,
						entityId,
						sessionId: streamRequest.session_id
					}
				});
			}
			doneEmittedAtMs = Date.now();
			if (timingSessionId) {
				try {
					await sendTimedMessage(
						{
							type: 'timing',
							timing: observabilityWriter.buildTimingSummary('error')
						},
						{
							operationType: 'fastchat_stream_emit_timing',
							projectId: projectIdForLogs,
							metadata: {
								sessionId: timingSessionId,
								contextType,
								finishedReason: 'error'
							}
						}
					);
				} catch (sendError) {
					logFastChatError({
						error: sendError,
						operationType: 'fastchat_stream_emit_timing',
						projectId: projectIdForLogs,
						metadata: {
							sessionId: timingSessionId,
							contextType,
							finishedReason: 'error'
						}
					});
				}
			}
			try {
				await sendTimedMessage(
					{
						type: 'done',
						usage: { total_tokens: 0 },
						finished_reason: 'error'
					},
					{
						operationType: 'fastchat_stream_emit_done',
						projectId: projectIdForLogs,
						metadata: {
							contextType,
							entityId,
							sessionId: streamRequest.session_id
						}
					}
				);
				doneEmittedAtMs = Date.now();
				observabilityWriter.recordEvent('finalize', 'done_emitted', {
					finished_reason: 'error',
					total_tokens: 0
				} as Json);
				scheduleDeferredPromptSnapshotPersistence();
			} catch (sendError) {
				logFastChatError({
					error: sendError,
					operationType: 'fastchat_stream_emit_done',
					projectId: projectIdForLogs,
					metadata: {
						contextType,
						entityId,
						sessionId: streamRequest.session_id
					}
				});
			}
			observabilityWriter.queueTimingMetric('error');
			// Reconcile counters from the executions that actually completed; the
			// exact round count rides on the terminal error when available, and a
			// turn with executions had at least one round by definition.
			await observabilityWriter.persistFinalState(
				{
					status: 'failed',
					finished_reason: 'error',
					tool_call_count: Math.max(
						terminalStreamFailure?.turnProgress?.toolCallsMade ?? 0,
						completedToolExecutions.length
					),
					tool_round_count:
						terminalStreamFailure?.turnProgress?.toolRounds ??
						(completedToolExecutions.length > 0 ? 1 : 0),
					validation_failure_count: observabilityWriter.getValidationFailureCount(),
					...observabilityWriter.getFirstLanePatch(),
					prompt_snapshot_id: promptSnapshotId,
					timing_metric_id: observabilityWriter.getTimingMetricId(),
					cache_source: contextCacheSource,
					cache_age_seconds: contextCacheAgeSecondsForTiming,
					finished_at: new Date().toISOString()
				},
				'failed'
			);
			await restoreResumingSupervisorCheckpoint('error');
		} finally {
			clearTimeout(turnTimeoutId);
			clearInterval(progressHeartbeatId);
			cancellationMonitor?.stop();
			// D4c: flush the detached persistence set (chat_tool_executions,
			// timing_metrics, chat_turn_runs patches, agent_state, attachment links)
			// AND the buffered turn events before the stream closes. Awaiting only
			// flushTurnEvents() here left the detached set to race the lambda freeze,
			// dropping tool-execution rows / timing on close. Bounded so a hung
			// detached task cannot block close forever.
			try {
				const flushResult = await observabilityWriter.flushWithBudget(
					STREAM_CONFIG.observability.flushBudgetMs
				);
				if (!flushResult.completed) {
					logger.warn(
						'FastChat observability flush exceeded budget before stream close',
						{
							sessionId: streamRequest.session_id ?? null,
							budgetMs: STREAM_CONFIG.observability.flushBudgetMs
						}
					);
				}
			} catch (error) {
				logFastChatError({
					error,
					operationType: 'fastchat_observability_flush',
					projectId: projectIdForLogs,
					metadata: {
						contextType,
						entityId,
						sessionId: streamRequest.session_id
					}
				});
			}
			if (
				!shouldCloseLegacySseSink({
					streamDetached,
					detachedLifecycleRegistered
				})
			) {
				return;
			}
			try {
				await eventSink.close();
			} catch (error) {
				logFastChatError({
					error,
					operationType: 'fastchat_stream_close',
					projectId: projectIdForLogs,
					metadata: {
						contextType,
						entityId,
						sessionId: streamRequest.session_id
					}
				});
			}
		}
	})();

	const detachedLifecycleEnabled = isLegacyDetachedLifecycleEnabled(
		env.AGENT_CHAT_LEGACY_WAIT_UNTIL_ENABLED
	);
	try {
		detachedLifecycleRegistered = registerLegacyTurnPromise(turnPromise, {
			enabled: detachedLifecycleEnabled
		});
		if (detachedLifecycleEnabled && !detachedLifecycleRegistered) {
			logger.warn(
				'Legacy Agent Stream waitUntil context unavailable; preserving open stream',
				{
					streamRunId
				}
			);
		}
	} catch (error) {
		logger.warn('Legacy Agent Stream waitUntil registration failed; preserving open stream', {
			error,
			streamRunId
		});
	}

	return eventSink.response;
};
