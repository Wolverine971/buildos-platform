// apps/web/src/routes/api/agent/v2/stream/+server.ts
/**
 * Fast Agentic Chat V2 Streaming Endpoint
 *
 * Minimal SSE path optimized for speed:
 * - Lightweight prompt builder
 * - Last-N message history
 * - Streaming LLM only (no tools/planner)
 * - Async persistence
 */

import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import { SSEResponse } from '$lib/utils/sse-response';
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { OpenRouterV2Service } from '$lib/services/openrouter-v2-service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	ContextShiftPayload,
	ContextUsageSnapshot,
	Json,
	LastTurnContext,
	OperationEventPayload,
	AgentTimingSummary
} from '@buildos/shared-types';
import type { ServiceContext } from '$lib/services/agentic-chat/shared/types';
import type { AgentState, ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor-refactored';
import { ToolExecutionService } from '$lib/services/agentic-chat/execution/tool-execution-service';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
import { getToolCategory } from '$lib/services/agentic-chat/tools/core/tools.config';
import { v4 as uuidv4 } from 'uuid';
import {
	AgentStateReconciliationService,
	type AgentStateMessageSnapshot,
	type AgentStateToolSummary
} from '$lib/services/agentic-chat/state/agent-state-reconciliation-service';
import {
	createFastChatSessionService,
	buildMasterPrompt,
	buildFastContextUsageSnapshot,
	loadFastChatPromptContext,
	normalizeFastContextType,
	composeFastChatHistory,
	selectFastChatTools,
	streamFastChat,
	type FastAgentStreamRequest
} from '$lib/services/agentic-chat-v2';
import {
	getLoadedSkillActivity,
	getRequestedSkillActivity,
	type SkillActivityEvent
} from '$lib/services/agentic-chat-v2/skill-activity';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheEntry,
	buildFastChatContextCacheKey as buildContextCacheKey,
	isFastChatContextCacheFresh as isCacheFresh,
	type FastChatContextCache
} from '$lib/services/agentic-chat-v2/context-cache';
import {
	consumeTransientFastChatCancelHint,
	normalizeFastChatStreamRunId,
	readFastChatCancelReasonFromMetadata,
	type FastChatCancelReason
} from '$lib/services/agentic-chat-v2/cancel-reason-channel';

const logger = createLogger('API:AgentStreamV2');
const FASTCHAT_STREAM_ENDPOINT = '/api/agent/v2/stream';
const FASTCHAT_STREAM_METHOD = 'POST';

const FASTCHAT_HISTORY_LOOKBACK_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_LOOKBACK_MESSAGES,
	10
);
const FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
	8
);
const FASTCHAT_HISTORY_TAIL_MESSAGES = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_TAIL_MESSAGES,
	4
);
const FASTCHAT_HISTORY_MAX_SUMMARY_CHARS = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
	420
);
const FASTCHAT_HISTORY_MAX_MESSAGE_CHARS = parsePositiveInt(
	process.env.FASTCHAT_HISTORY_MAX_MESSAGE_CHARS,
	1200
);
const FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS = parsePositiveInt(
	process.env.FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS,
	8
);
const FASTCHAT_GATEWAY_NEAR_LIMIT_MAX_TOOL_ROUNDS = parsePositiveInt(
	process.env.FASTCHAT_GATEWAY_NEAR_LIMIT_MAX_TOOL_ROUNDS,
	6
);
const FASTCHAT_CONTEXT_SHIFT_HINT_TTL_MS = parsePositiveInt(
	process.env.FASTCHAT_CONTEXT_SHIFT_HINT_TTL_MS,
	120000
);
const FASTCHAT_CANCEL_REASON_RETRY_DELAY_MS = parsePositiveInt(
	process.env.FASTCHAT_CANCEL_REASON_RETRY_DELAY_MS,
	70
);
const FASTCHAT_AUTONOMOUS_RECOVERY_ENABLED = parseBooleanFlag(
	process.env.FASTCHAT_ENABLE_AUTONOMOUS_RECOVERY,
	false
);
const FASTCHAT_OPENROUTER_V2_ENABLED = parseBooleanFlag(process.env.OPENROUTER_V2_ENABLED, false);

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function isAbortLikeError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const maybeError = error as { name?: string; message?: string };
	const name = maybeError.name?.toLowerCase() ?? '';
	const message = maybeError.message?.toLowerCase() ?? '';
	return (
		name === 'aborterror' ||
		message.includes('aborted') ||
		message.includes('request aborted') ||
		message.includes('stream closed') ||
		message.includes('cancelled')
	);
}

async function parseRequest(request: Request): Promise<FastAgentStreamRequest> {
	const body = (await request.json()) as FastAgentStreamRequest;
	return body;
}

function waitMs(ms: number): Promise<void> {
	if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCancelReasonFromSessionMetadata(params: {
	supabase: any;
	userId: string;
	sessionId: string;
	streamRunId: string;
}): Promise<FastChatCancelReason | null> {
	const { data, error } = await params.supabase
		.from('chat_sessions')
		.select('agent_metadata')
		.eq('id', params.sessionId)
		.eq('user_id', params.userId)
		.maybeSingle();

	if (error || !data) return null;
	return readFastChatCancelReasonFromMetadata({
		agentMetadata: data.agent_metadata,
		streamRunId: params.streamRunId
	});
}

async function resolveInterruptedReason(params: {
	supabase: any;
	userId: string;
	sessionId: string;
	streamRunId?: string;
	requestAborted: boolean;
}): Promise<FastChatCancelReason | 'disconnect' | 'cancelled'> {
	if (!params.requestAborted) {
		return 'cancelled';
	}
	if (!params.streamRunId) {
		return 'disconnect';
	}

	const transientReason = consumeTransientFastChatCancelHint({
		userId: params.userId,
		streamRunId: params.streamRunId
	});
	if (transientReason) return transientReason;

	const sessionReason = await readCancelReasonFromSessionMetadata({
		supabase: params.supabase,
		userId: params.userId,
		sessionId: params.sessionId,
		streamRunId: params.streamRunId
	});
	if (sessionReason) return sessionReason;

	if (FASTCHAT_CANCEL_REASON_RETRY_DELAY_MS > 0) {
		await waitMs(FASTCHAT_CANCEL_REASON_RETRY_DELAY_MS);
	}

	const transientRetry = consumeTransientFastChatCancelHint({
		userId: params.userId,
		streamRunId: params.streamRunId
	});
	if (transientRetry) return transientRetry;

	const sessionRetry = await readCancelReasonFromSessionMetadata({
		supabase: params.supabase,
		userId: params.userId,
		sessionId: params.sessionId,
		streamRunId: params.streamRunId
	});
	if (sessionRetry) return sessionRetry;

	return 'disconnect';
}

async function checkProjectAccessFallback(
	supabase: any,
	projectId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		userId?: string;
		endpoint?: string;
		httpMethod?: string;
	},
	fallbackReason: 'rpc_failed' | 'exception' = 'rpc_failed'
): Promise<{ allowed: boolean; reason: string }> {
	try {
		const { data, error } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.maybeSingle();

		if (error) {
			logger.warn('Project access fallback lookup failed', {
				error,
				projectId,
				fallbackReason
			});
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId: context?.userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_project_access_fallback',
					metadata: { projectId, fallbackReason, reason: 'fallback_lookup_failed' }
				});
			}
			return { allowed: false, reason: 'fallback_lookup_failed' };
		}

		return { allowed: Boolean(data), reason: data ? 'fallback_lookup' : 'denied' };
	} catch (fallbackError) {
		logger.warn('Project access fallback lookup exception', {
			error: fallbackError,
			projectId,
			fallbackReason
		});
		if (errorLogger) {
			void errorLogger.logError(fallbackError, {
				userId: context?.userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_project_access_fallback',
				metadata: { projectId, fallbackReason, reason: 'fallback_lookup_exception' }
			});
		}
		return { allowed: false, reason: 'fallback_lookup_exception' };
	}
}

async function checkProjectAccess(
	supabase: any,
	projectId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		userId?: string;
		endpoint?: string;
		httpMethod?: string;
	}
): Promise<{ allowed: boolean; reason?: string }> {
	try {
		const { data, error } = await supabase.rpc('current_actor_has_project_access', {
			p_project_id: projectId,
			p_required_access: 'read'
		});

		if (error) {
			logger.warn('Project access RPC failed; falling back to project lookup', {
				error,
				projectId
			});
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId: context?.userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_project_access',
					metadata: { projectId, reason: 'rpc_failed' }
				});
			}
			return checkProjectAccessFallback(
				supabase,
				projectId,
				errorLogger,
				context,
				'rpc_failed'
			);
		}

		return { allowed: !!data, reason: data ? 'ok' : 'denied' };
	} catch (error) {
		logger.warn('Project access check failed; falling back to project lookup', {
			error,
			projectId
		});
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId: context?.userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_project_access',
				metadata: { projectId, reason: 'exception' }
			});
		}
		return checkProjectAccessFallback(supabase, projectId, errorLogger, context, 'exception');
	}
}

async function checkDailyBriefAccess(
	supabase: any,
	briefId: string,
	userId: string,
	errorLogger?: ErrorLoggerService,
	context?: {
		endpoint?: string;
		httpMethod?: string;
	}
): Promise<{ allowed: boolean; reason?: string }> {
	try {
		const { data, error } = await supabase
			.from('ontology_daily_briefs')
			.select('id')
			.eq('id', briefId)
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			logger.warn('Daily brief access check failed', { error, briefId, userId });
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_daily_brief_access',
					metadata: { briefId, reason: 'query_failed' }
				});
			}
			return { allowed: false, reason: 'query_failed' };
		}

		return { allowed: Boolean(data), reason: data ? 'ok' : 'not_found' };
	} catch (error) {
		logger.warn('Daily brief access check exception', { error, briefId, userId });
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_daily_brief_access',
				metadata: { briefId, reason: 'exception' }
			});
		}
		return { allowed: false, reason: 'exception' };
	}
}

type FastChatContextShiftHint = {
	context_type: ChatContextType;
	entity_id?: string | null;
	project_id?: string | null;
	shifted_at: string;
};

const OPERATION_ENTITY_TYPES: OperationEventPayload['entity_type'][] = [
	'document',
	'task',
	'goal',
	'plan',
	'project',
	'milestone',
	'risk'
];

function isOperationEntityType(
	value: string | null | undefined
): value is OperationEventPayload['entity_type'] {
	if (!value) return false;
	return OPERATION_ENTITY_TYPES.includes(value as OperationEventPayload['entity_type']);
}

function getToolsRequiringProjectId(tools: ChatToolDefinition[]): Set<string> {
	const required = new Set<string>();
	for (const tool of tools) {
		const name = tool.function?.name;
		if (!name) continue;
		const params = tool.function?.parameters as
			| { required?: string[]; properties?: Record<string, unknown> }
			| undefined;
		const requiredParams = Array.isArray(params?.required) ? params?.required : [];
		if (requiredParams.includes('project_id')) {
			required.add(name);
		}
	}
	return required;
}

function maybeInjectProjectId(
	toolCall: ChatToolCall,
	projectId: string | undefined,
	toolsRequiringProjectId: Set<string>
): ChatToolCall {
	if (!projectId) return toolCall;
	if (!toolsRequiringProjectId.has(toolCall.function.name)) return toolCall;

	let args: Record<string, unknown> = {};
	const rawArgs = toolCall.function.arguments;
	if (rawArgs) {
		try {
			args = JSON.parse(rawArgs);
		} catch {
			return toolCall;
		}
	}

	const existing =
		typeof (args as Record<string, unknown>).project_id === 'string'
			? String((args as Record<string, unknown>).project_id).trim()
			: '';
	if (existing) return toolCall;

	return {
		...toolCall,
		function: {
			...toolCall.function,
			arguments: JSON.stringify({ ...args, project_id: projectId })
		}
	};
}

function readRecentContextShiftHint(
	metadata: Record<string, unknown>,
	nowMs: number = Date.now()
): FastChatContextShiftHint | null {
	const raw = metadata.fastchat_last_context_shift;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const contextType =
		typeof record.context_type === 'string'
			? (normalizeFastContextType(record.context_type as ChatContextType) as ChatContextType)
			: null;
	if (!contextType) return null;
	const shiftedAtRaw = typeof record.shifted_at === 'string' ? record.shifted_at : '';
	const shiftedAtMs = Date.parse(shiftedAtRaw);
	if (!Number.isFinite(shiftedAtMs)) return null;
	if (nowMs - shiftedAtMs > FASTCHAT_CONTEXT_SHIFT_HINT_TTL_MS) return null;

	return {
		context_type: contextType,
		entity_id: typeof record.entity_id === 'string' ? record.entity_id : null,
		project_id: typeof record.project_id === 'string' ? record.project_id : null,
		shifted_at: shiftedAtRaw
	};
}

function normalizePrewarmedContextCache(raw: unknown): FastChatContextCache | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const key = typeof record.key === 'string' ? record.key : null;
	const createdAt = typeof record.created_at === 'string' ? record.created_at : null;
	const version = typeof record.version === 'number' ? record.version : null;
	const contextRaw =
		record.context && typeof record.context === 'object' && !Array.isArray(record.context)
			? (record.context as Record<string, unknown>)
			: null;
	if (!key || !createdAt || version === null || !contextRaw) return null;

	const contextTypeRaw =
		typeof contextRaw.contextType === 'string'
			? contextRaw.contextType
			: typeof contextRaw.context_type === 'string'
				? contextRaw.context_type
				: null;
	if (!contextTypeRaw) return null;

	return {
		version,
		key,
		created_at: createdAt,
		context: {
			contextType: normalizeFastContextType(contextTypeRaw as ChatContextType),
			entityId: typeof contextRaw.entityId === 'string' ? contextRaw.entityId : null,
			projectId: typeof contextRaw.projectId === 'string' ? contextRaw.projectId : null,
			projectName: typeof contextRaw.projectName === 'string' ? contextRaw.projectName : null,
			focusEntityType:
				typeof contextRaw.focusEntityType === 'string' ? contextRaw.focusEntityType : null,
			focusEntityId:
				typeof contextRaw.focusEntityId === 'string' ? contextRaw.focusEntityId : null,
			focusEntityName:
				typeof contextRaw.focusEntityName === 'string' ? contextRaw.focusEntityName : null,
			data:
				contextRaw.data && typeof contextRaw.data === 'object'
					? (contextRaw.data as Record<string, unknown>)
					: typeof contextRaw.data === 'string'
						? contextRaw.data
						: null
		}
	};
}

function shouldBypassContextCacheForShiftHint(params: {
	requestContextType: ChatContextType;
	requestEntityId?: string | null;
	requestProjectFocus?: Pick<ProjectFocus, 'focusType' | 'focusEntityId' | 'projectId'> | null;
	shiftHint: FastChatContextShiftHint | null;
}): boolean {
	const { shiftHint } = params;
	if (!shiftHint) return false;
	const requestKey = buildContextCacheKey({
		contextType: params.requestContextType,
		entityId: params.requestEntityId,
		projectFocus: params.requestProjectFocus
	});
	const shiftKey = buildContextCacheKey({
		contextType: shiftHint.context_type,
		entityId: shiftHint.entity_id ?? shiftHint.project_id ?? null
	});
	return requestKey !== shiftKey;
}

function resolveCacheAgeSeconds(createdAtRaw: string | null | undefined): number {
	if (!createdAtRaw) return 0;
	const createdAtMs = Date.parse(createdAtRaw);
	if (!Number.isFinite(createdAtMs)) return 0;
	return Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
}

function annotateContextMetaCacheAge(
	data: Record<string, unknown> | string | null | undefined,
	cacheAgeSeconds: number
): void {
	if (!data || typeof data !== 'object') return;
	const record = data as Record<string, unknown>;
	const contextMeta =
		record.context_meta && typeof record.context_meta === 'object'
			? (record.context_meta as Record<string, unknown>)
			: null;
	if (!contextMeta) return;
	contextMeta.cache_age_seconds = Math.max(0, Math.floor(cacheAgeSeconds));
}

function buildEmptyAgentState(sessionId: string): AgentState {
	return {
		sessionId,
		current_understanding: {
			entities: [],
			dependencies: []
		},
		assumptions: [],
		expectations: [],
		tentative_hypotheses: [],
		items: []
	};
}

function isValidAgentStateEntityId(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	return trimmed.length > 0 && !trimmed.includes('...') && isValidUUID(trimmed);
}

function sanitizeUuidStringArray(values: unknown): string[] | undefined {
	if (!Array.isArray(values)) return undefined;
	const unique = new Set<string>();
	for (const value of values) {
		if (!isValidAgentStateEntityId(value)) continue;
		unique.add(value.trim());
	}
	return unique.size > 0 ? Array.from(unique) : undefined;
}

function sanitizeAgentStateForPrompt(agentState: AgentState): AgentState {
	const entities = (agentState.current_understanding?.entities ?? [])
		.filter((entity) => isValidAgentStateEntityId(entity?.id))
		.map((entity) => ({
			...entity,
			id: entity.id.trim()
		}));

	const dependencies = (agentState.current_understanding?.dependencies ?? [])
		.filter((dep) => isValidAgentStateEntityId(dep?.from) && isValidAgentStateEntityId(dep?.to))
		.map((dep) => ({
			...dep,
			from: dep.from.trim(),
			to: dep.to.trim()
		}));

	const items = (agentState.items ?? []).map((item) => {
		const relatedEntityIds = sanitizeUuidStringArray(item.relatedEntityIds);
		return relatedEntityIds
			? { ...item, relatedEntityIds }
			: { ...item, relatedEntityIds: undefined };
	});

	const expectations = (agentState.expectations ?? []).map((expectation) => {
		const expectedIds = sanitizeUuidStringArray(expectation.expected_ids);
		return expectedIds
			? { ...expectation, expected_ids: expectedIds }
			: { ...expectation, expected_ids: undefined };
	});

	return {
		...agentState,
		current_understanding: {
			entities,
			dependencies
		},
		items,
		expectations
	};
}

function extractEntityLabel(
	record: Record<string, any> | null | undefined,
	fallback?: string
): string | undefined {
	if (!record) return fallback;
	const candidate =
		record.title ??
		record.name ??
		record.text ??
		record.summary ??
		record.goal ??
		record.milestone;
	if (typeof candidate === 'string' && candidate.trim()) {
		return candidate.trim();
	}
	return fallback;
}

function buildContextToolSummary(params: {
	contextType: ChatContextType;
	data?: Record<string, unknown> | string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityName?: string | null;
}): AgentStateToolSummary[] {
	const { contextType, data, projectName, focusEntityType, focusEntityName } = params;
	if (!data || typeof data !== 'object') return [];

	const record = data as Record<string, any>;
	const entity_counts: Record<string, number> = {};
	const entity_updates: Array<{ id: string; kind: string; name?: string }> = [];
	const addEntities = (items: any[], kind: string, limit = 6) => {
		entity_counts[kind] = items.length;
		for (const item of items.slice(0, limit)) {
			if (!item || typeof item !== 'object') continue;
			const id = typeof item.id === 'string' ? item.id : undefined;
			if (!id) continue;
			entity_updates.push({
				id,
				kind,
				name: extractEntityLabel(item)
			});
		}
	};

	if (isDailyBriefContext(contextType)) {
		const briefId =
			typeof record.brief_id === 'string'
				? record.brief_id
				: typeof record.briefId === 'string'
					? record.briefId
					: undefined;
		const briefDate =
			typeof record.brief_date === 'string'
				? record.brief_date
				: typeof record.briefDate === 'string'
					? record.briefDate
					: undefined;
		const mentionedEntities = Array.isArray(record.mentioned_entities)
			? (record.mentioned_entities as Array<Record<string, unknown>>)
			: Array.isArray(record.mentionedEntities)
				? (record.mentionedEntities as Array<Record<string, unknown>>)
				: [];
		const mentionedEntityCountsRaw =
			record.mentioned_entity_counts && typeof record.mentioned_entity_counts === 'object'
				? (record.mentioned_entity_counts as Record<string, unknown>)
				: record.mentionedEntityCounts && typeof record.mentionedEntityCounts === 'object'
					? (record.mentionedEntityCounts as Record<string, unknown>)
					: {};

		for (const [kind, value] of Object.entries(mentionedEntityCountsRaw)) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
			entity_counts[kind] = value;
		}

		if (entity_counts.project === undefined && Array.isArray(record.project_briefs)) {
			entity_counts.project = record.project_briefs.length;
		}

		for (const entity of mentionedEntities.slice(0, 12)) {
			const entityKind =
				typeof entity.entity_kind === 'string'
					? entity.entity_kind
					: typeof entity.entityKind === 'string'
						? entity.entityKind
						: undefined;
			const entityId =
				typeof entity.entity_id === 'string'
					? entity.entity_id
					: typeof entity.entityId === 'string'
						? entity.entityId
						: undefined;
			if (!entityKind || !entityId) continue;

			if (entity_counts[entityKind] === undefined) {
				entity_counts[entityKind] = 0;
			}
			if (entity_counts[entityKind] === 0) {
				entity_counts[entityKind] = mentionedEntities.filter((candidate) => {
					const candidateKind =
						typeof candidate.entity_kind === 'string'
							? candidate.entity_kind
							: typeof candidate.entityKind === 'string'
								? candidate.entityKind
								: undefined;
					return candidateKind === entityKind;
				}).length;
			}

			entity_updates.push({
				id: entityId,
				kind: entityKind,
				name:
					extractEntityLabel(entity as Record<string, any>) ??
					(typeof entity.role === 'string' ? entity.role : undefined)
			});
		}

		if (briefId) {
			entity_updates.push({
				id: briefId,
				kind: 'daily_brief',
				name: briefDate ? `Brief ${briefDate}` : 'Daily Brief'
			});
		}

		const summary = briefDate
			? `Loaded daily brief snapshot for ${briefDate}.`
			: 'Loaded daily brief snapshot.';

		if (!entity_updates.length && !Object.keys(entity_counts).length) {
			return [
				{
					tool_name: 'context_snapshot',
					success: true,
					summary
				}
			];
		}

		return [
			{
				tool_name: 'context_snapshot',
				success: true,
				entity_counts,
				entity_updates,
				summary
			}
		];
	}

	if (record.project) {
		const projectRecord = record.project as Record<string, any>;
		const projectId = typeof projectRecord.id === 'string' ? projectRecord.id : undefined;
		if (projectId) {
			entity_updates.push({
				id: projectId,
				kind: 'project',
				name: extractEntityLabel(projectRecord, projectName ?? 'Project')
			});
			entity_counts.project = 1;
		}
	}

	if (Array.isArray(record.goals)) addEntities(record.goals, 'goal');
	if (Array.isArray(record.milestones)) addEntities(record.milestones, 'milestone');
	if (Array.isArray(record.plans)) addEntities(record.plans, 'plan');
	if (Array.isArray(record.tasks)) addEntities(record.tasks, 'task');
	if (Array.isArray(record.documents)) addEntities(record.documents, 'document');
	if (Array.isArray(record.events)) addEntities(record.events, 'event');

	if (record.linked_entities && typeof record.linked_entities === 'object') {
		Object.entries(record.linked_entities).forEach(([kind, items]) => {
			if (!Array.isArray(items) || items.length === 0) return;
			addEntities(items, kind, 4);
		});
	}

	if (focusEntityType && focusEntityName) {
		entity_updates.push({
			id: `focus:${focusEntityType}`,
			kind: focusEntityType,
			name: focusEntityName
		});
	}

	const summary =
		contextType === 'global'
			? 'Loaded global context snapshot.'
			: projectName
				? `Loaded context snapshot for ${projectName}.`
				: 'Loaded project context snapshot.';

	if (!entity_updates.length && !Object.keys(entity_counts).length) {
		return [];
	}

	return [
		{
			tool_name: 'context_snapshot',
			success: true,
			entity_counts,
			entity_updates,
			summary
		}
	];
}

async function updateAgentMetadata(
	supabase: any,
	sessionId: string,
	patch: Record<string, unknown>,
	options?: {
		errorLogger?: ErrorLoggerService;
		userId?: string;
		projectId?: string;
	}
): Promise<void> {
	const errorLogger = options?.errorLogger;
	const { data, error } = await (supabase as any).rpc('merge_chat_session_agent_metadata', {
		p_session_id: sessionId,
		p_patch: patch as Json
	});

	if (error) {
		logger.warn('Failed to merge agent metadata', { error, sessionId });
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId: options?.userId,
				projectId: options?.projectId,
				endpoint: FASTCHAT_STREAM_ENDPOINT,
				httpMethod: FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_update_agent_metadata',
				tableName: 'chat_sessions',
				recordId: sessionId,
				metadata: {
					stage: 'rpc',
					patch: sanitizeLogData(patch)
				}
			});
		}
		return;
	}

	if (data === null) {
		logger.warn('No chat session metadata merged', { sessionId });
	}
}

function emitOperation(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	operation: OperationEventPayload,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage({ type: 'operation', operation })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit operation event', { error, operation });
			options.onError?.(error);
		});
}

function emitContextUsage(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	usage: ContextUsageSnapshot,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage({ type: 'context_usage', usage })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit context usage', { error });
			options.onError?.(error);
		});
}

function emitToolCall(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	toolCall: ChatToolCall,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage({ type: 'tool_call', tool_call: toolCall })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit tool_call', { error, toolCall });
			options.onError?.(error);
		});
}

function previewToolArguments(raw: unknown, maxChars = 280): string {
	if (raw === undefined || raw === null) {
		return 'null';
	}

	let value: string;
	if (typeof raw === 'string') {
		value = raw;
	} else {
		try {
			value = JSON.stringify(raw);
		} catch {
			value = String(raw);
		}
	}
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function buildToolResultEventPayload(toolCall: ChatToolCall, result: ChatToolResult) {
	const toolName = toolCall.function.name;
	return {
		...result,
		tool_name: toolName,
		toolName,
		toolCallId: result.tool_call_id ?? toolCall.id,
		tool_call_id: result.tool_call_id ?? toolCall.id,
		data: result.result
	};
}

function emitToolResult(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	toolCall: ChatToolCall,
	result: ChatToolResult,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	const payload = buildToolResultEventPayload(toolCall, result);
	void agentStream
		.sendMessage({ type: 'tool_result', result: payload })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit tool_result', { error, toolCall });
			options.onError?.(error);
		});
}

function emitSkillActivity(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	event: SkillActivityEvent,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage(event)
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit skill_activity', { error, event });
			options.onError?.(error);
		});
}

const CONTEXT_SHIFT_ENTITY_TYPES: ContextShiftPayload['entity_type'][] = [
	'project',
	'task',
	'plan',
	'goal',
	'document',
	'milestone',
	'risk'
];

const CONTEXT_SHIFT_NESTED_KEYS = ['result', 'data', 'payload'];

function isContextShiftEntityType(
	value: string | null | undefined
): value is ContextShiftPayload['entity_type'] {
	if (!value) return false;
	return CONTEXT_SHIFT_ENTITY_TYPES.includes(value as ContextShiftPayload['entity_type']);
}

function extractContextShiftObject(value: unknown, depth = 0): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || depth > 4) return null;

	const record = value as Record<string, unknown>;
	if (record.context_shift && typeof record.context_shift === 'object') {
		return record.context_shift as Record<string, unknown>;
	}

	for (const key of CONTEXT_SHIFT_NESTED_KEYS) {
		const nested = record[key];
		const extracted = extractContextShiftObject(nested, depth + 1);
		if (extracted) {
			return extracted;
		}
	}

	return null;
}

function extractContextShiftPayload(result: ChatToolResult): ContextShiftPayload | null {
	const contextShift = extractContextShiftObject(result);
	if (!contextShift) return null;

	const rawContext =
		typeof contextShift.new_context === 'string' ? contextShift.new_context.trim() : '';
	const rawEntityId =
		typeof contextShift.entity_id === 'string' ? contextShift.entity_id.trim() : '';
	if (!rawContext || !rawEntityId) return null;

	const normalizedContext = normalizeFastContextType(rawContext as ChatContextType);
	const entityName =
		typeof contextShift.entity_name === 'string' && contextShift.entity_name.trim()
			? contextShift.entity_name.trim()
			: 'Project';
	const entityType =
		typeof contextShift.entity_type === 'string' &&
		isContextShiftEntityType(contextShift.entity_type)
			? contextShift.entity_type
			: 'project';
	const message =
		typeof contextShift.message === 'string' && contextShift.message.trim()
			? contextShift.message.trim()
			: `Context updated to ${entityName}`;

	return {
		new_context: normalizedContext,
		entity_id: rawEntityId,
		entity_name: entityName,
		entity_type: entityType,
		message
	};
}

async function emitContextShift(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	contextShift: ContextShiftPayload,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): Promise<void> {
	try {
		await agentStream.sendMessage({ type: 'context_shift', context_shift: contextShift });
		options.onMessageSent?.();
	} catch (error) {
		logger.warn('Failed to emit context_shift', { error, contextShift });
		options.onError?.(error);
	}
}

function normalizeTextValue(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function summarizeLastTurnText(text: string, maxLength = 180): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isProjectScopedContext(contextType: ChatContextType): boolean {
	return (
		contextType === 'project' ||
		contextType === 'project_audit' ||
		contextType === 'project_forecast'
	);
}

function isDailyBriefContext(value: unknown): boolean {
	return typeof value === 'string' && value === 'daily_brief';
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

type LastTurnEntityType = 'project' | 'task' | 'goal' | 'plan' | 'document' | 'milestone' | 'risk';

const LAST_TURN_ENTITY_LIST_KEY: Record<LastTurnEntityType, keyof LastTurnContext['entities']> = {
	project: 'projects',
	task: 'tasks',
	goal: 'goals',
	plan: 'plans',
	document: 'documents',
	milestone: 'milestones',
	risk: 'risks'
};

function truncateEntityText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return undefined;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function extractEntityPreview(
	value: unknown,
	fallbackId?: string
): {
	id?: string;
	name?: string;
	description?: string;
} {
	if (!value || typeof value !== 'object') {
		return { id: fallbackId };
	}
	const record = value as Record<string, unknown>;
	const id = normalizeTextValue(record.id ?? record.entity_id ?? record.entityId ?? fallbackId);
	const name =
		truncateEntityText(record.name, 80) ??
		truncateEntityText(record.title, 80) ??
		truncateEntityText(record.summary, 80) ??
		truncateEntityText(record.text, 80);
	const description =
		truncateEntityText(record.description, 140) ??
		truncateEntityText(record.content, 140) ??
		truncateEntityText(record.summary, 140);
	return { id, name, description };
}

function upsertLastTurnEntity(
	entities: LastTurnContext['entities'],
	entityType: LastTurnEntityType,
	preview: { id?: string; name?: string; description?: string }
): void {
	const id = normalizeTextValue(preview.id);
	if (!id) return;

	const listKey = LAST_TURN_ENTITY_LIST_KEY[entityType];
	const list =
		((entities as Record<string, unknown>)[listKey] as
			| Array<{
					id: string;
					name?: string;
					description?: string;
			  }>
			| undefined) ?? [];
	const existing = list.find((item) => item.id === id);
	if (existing) {
		if (!existing.name && preview.name) existing.name = preview.name;
		if (!existing.description && preview.description)
			existing.description = preview.description;
	} else {
		list.push({
			id,
			name: preview.name,
			description: preview.description
		});
	}
	(entities as Record<string, unknown>)[listKey] = list;

	// Back-compat for existing readers while rollout completes.
	switch (entityType) {
		case 'project':
			entities.project_id = entities.project_id ?? id;
			break;
		case 'task':
			entities.task_ids = Array.from(new Set([...(entities.task_ids ?? []), id]));
			break;
		case 'goal':
			entities.goal_ids = Array.from(new Set([...(entities.goal_ids ?? []), id]));
			break;
		case 'plan':
			entities.plan_id = entities.plan_id ?? id;
			break;
		case 'document':
			entities.document_id = entities.document_id ?? id;
			break;
		default:
			break;
	}
}

function assignLastTurnEntity(
	entities: LastTurnContext['entities'],
	entityType: string | undefined,
	entityId: string | undefined,
	record?: unknown
): void {
	if (!entityType) return;
	const normalizedType = entityType.toLowerCase() as LastTurnEntityType;
	if (!LAST_TURN_ENTITY_LIST_KEY[normalizedType]) return;
	const preview = extractEntityPreview(record, entityId);
	upsertLastTurnEntity(entities, normalizedType, preview);
}

function assignLastTurnEntityByPrefix(
	entities: LastTurnContext['entities'],
	entityId: string
): void {
	const normalized = entityId.toLowerCase();
	if (normalized.startsWith('proj_')) {
		assignLastTurnEntity(entities, 'project', entityId);
	} else if (normalized.startsWith('task_')) {
		assignLastTurnEntity(entities, 'task', entityId);
	} else if (normalized.startsWith('goal_')) {
		assignLastTurnEntity(entities, 'goal', entityId);
	} else if (normalized.startsWith('plan_')) {
		assignLastTurnEntity(entities, 'plan', entityId);
	} else if (normalized.startsWith('doc_')) {
		assignLastTurnEntity(entities, 'document', entityId);
	} else if (normalized.startsWith('mil_')) {
		assignLastTurnEntity(entities, 'milestone', entityId);
	} else if (normalized.startsWith('risk_')) {
		assignLastTurnEntity(entities, 'risk', entityId);
	}
}

function extractEntityIdFromRecord(value: unknown): string | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	return normalizeTextValue(record.id ?? record.entity_id ?? record.entityId);
}

function collectLastTurnEntitiesFromValue(
	value: unknown,
	entities: LastTurnContext['entities'],
	depth = 0
): void {
	if (!value || depth > 6) return;

	if (Array.isArray(value)) {
		for (const item of value.slice(0, 25)) {
			collectLastTurnEntitiesFromValue(item, entities, depth + 1);
		}
		return;
	}

	if (typeof value !== 'object') return;

	const record = value as Record<string, unknown>;
	assignLastTurnEntity(
		entities,
		normalizeTextValue(record.entity_type ?? record.entityType),
		normalizeTextValue(record.entity_id ?? record.entityId),
		record
	);
	assignLastTurnEntity(
		entities,
		'project',
		normalizeTextValue(record.project_id),
		record.project
	);
	assignLastTurnEntity(entities, 'task', normalizeTextValue(record.task_id), record.task);
	assignLastTurnEntity(entities, 'goal', normalizeTextValue(record.goal_id), record.goal);
	assignLastTurnEntity(entities, 'plan', normalizeTextValue(record.plan_id), record.plan);
	assignLastTurnEntity(
		entities,
		'document',
		normalizeTextValue(record.document_id),
		record.document
	);
	assignLastTurnEntity(
		entities,
		'milestone',
		normalizeTextValue(record.milestone_id),
		record.milestone
	);
	assignLastTurnEntity(entities, 'risk', normalizeTextValue(record.risk_id), record.risk);

	const taskIds = Array.isArray(record.task_ids) ? record.task_ids : [];
	for (const taskId of taskIds) {
		assignLastTurnEntity(entities, 'task', normalizeTextValue(taskId));
	}
	const goalIds = Array.isArray(record.goal_ids) ? record.goal_ids : [];
	for (const goalId of goalIds) {
		assignLastTurnEntity(entities, 'goal', normalizeTextValue(goalId));
	}
	const planIds = Array.isArray(record.plan_ids) ? record.plan_ids : [];
	for (const planId of planIds) {
		assignLastTurnEntity(entities, 'plan', normalizeTextValue(planId));
	}
	const documentIds = Array.isArray(record.document_ids) ? record.document_ids : [];
	for (const documentId of documentIds) {
		assignLastTurnEntity(entities, 'document', normalizeTextValue(documentId));
	}

	const entitiesAccessed = Array.isArray(record._entities_accessed)
		? record._entities_accessed
		: Array.isArray(record.entities_accessed)
			? record.entities_accessed
			: [];
	for (const entityId of entitiesAccessed) {
		const normalized = normalizeTextValue(entityId);
		if (!normalized) continue;
		assignLastTurnEntityByPrefix(entities, normalized);
	}

	const singularKeys: Array<'project' | 'task' | 'goal' | 'plan' | 'document'> = [
		'project',
		'task',
		'goal',
		'plan',
		'document'
	];
	for (const key of singularKeys) {
		assignLastTurnEntity(entities, key, extractEntityIdFromRecord(record[key]), record[key]);
	}

	const pluralKeys: Array<{ key: string; entityType: LastTurnEntityType }> = [
		{ key: 'projects', entityType: 'project' },
		{ key: 'tasks', entityType: 'task' },
		{ key: 'goals', entityType: 'goal' },
		{ key: 'plans', entityType: 'plan' },
		{ key: 'documents', entityType: 'document' },
		{ key: 'milestones', entityType: 'milestone' },
		{ key: 'risks', entityType: 'risk' }
	];
	for (const { key, entityType } of pluralKeys) {
		if (!Array.isArray(record[key])) continue;
		for (const item of record[key] as unknown[]) {
			assignLastTurnEntity(entities, entityType, extractEntityIdFromRecord(item), item);
		}
	}

	for (const nested of Object.values(record)) {
		if (nested && typeof nested === 'object') {
			collectLastTurnEntitiesFromValue(nested, entities, depth + 1);
		}
	}
}

function formatLastTurnEntityReferences(entities: LastTurnContext['entities']): string[] {
	const refs: string[] = [];
	const formatItems = (items: Array<{ id: string; name?: string }>): string =>
		items
			.slice(0, 4)
			.map((item) => (item.name ? `${item.name} (${item.id})` : item.id))
			.join(',');
	if (entities.projects?.length) refs.push(`projects:${formatItems(entities.projects)}`);
	if (entities.tasks?.length) refs.push(`tasks:${formatItems(entities.tasks)}`);
	if (entities.plans?.length) refs.push(`plans:${formatItems(entities.plans)}`);
	if (entities.goals?.length) refs.push(`goals:${formatItems(entities.goals)}`);
	if (entities.documents?.length) refs.push(`documents:${formatItems(entities.documents)}`);

	// Backward-compat with stored legacy contexts.
	if (refs.length === 0) {
		if (entities.project_id) refs.push(`project:${entities.project_id}`);
		if (entities.plan_id) refs.push(`plan:${entities.plan_id}`);
		if (entities.document_id) refs.push(`document:${entities.document_id}`);
		if (entities.task_ids?.length)
			refs.push(`tasks:${entities.task_ids.slice(0, 4).join(',')}`);
		if (entities.goal_ids?.length)
			refs.push(`goals:${entities.goal_ids.slice(0, 4).join(',')}`);
	}
	return refs;
}

function buildLastTurnContinuityHint(lastTurnContext?: LastTurnContext | null): string | null {
	if (!lastTurnContext) return null;

	const lines: string[] = [];
	const summary = summarizeLastTurnText(lastTurnContext.summary ?? '', 140);
	if (summary) {
		lines.push(`Last turn summary: ${summary}`);
	}

	const refs = formatLastTurnEntityReferences(lastTurnContext.entities ?? {});
	if (refs.length > 0) {
		lines.push(`Entities referenced: ${refs.join('; ')}`);
	}

	const dataAccessed = Array.isArray(lastTurnContext.data_accessed)
		? lastTurnContext.data_accessed
				.map((item) => normalizeTextValue(item))
				.filter((item): item is string => Boolean(item))
		: [];
	if (dataAccessed.length > 0) {
		lines.push(`Tools used: ${dataAccessed.slice(0, 6).join(', ')}`);
	}

	const priorContext =
		typeof lastTurnContext.context_type === 'string'
			? normalizeFastContextType(lastTurnContext.context_type as ChatContextType)
			: 'global';
	lines.push(`Prior context: ${priorContext}`);

	if (lines.length === 0) return null;

	return [
		'Conversation continuity hint (lightweight):',
		...lines,
		'Use this only as context; prioritize the latest user message.'
	].join('\n');
}

function buildLastTurnContext(params: {
	assistantText: string;
	userMessage: string;
	contextType: ChatContextType;
	entityId?: string | null;
	contextShift?: ContextShiftPayload | null;
	toolExecutions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
	timestamp: string;
}): LastTurnContext {
	const entities: LastTurnContext['entities'] = {};
	const toolsUsed = new Set<string>();

	for (const execution of params.toolExecutions) {
		const toolName = normalizeTextValue(execution.toolCall.function?.name);
		if (toolName) {
			toolsUsed.add(toolName);
		}
		collectLastTurnEntitiesFromValue(execution.result, entities);
	}

	if (params.contextShift) {
		assignLastTurnEntity(
			entities,
			params.contextShift.entity_type,
			normalizeTextValue(params.contextShift.entity_id),
			{
				id: params.contextShift.entity_id,
				name: params.contextShift.entity_name,
				description: params.contextShift.message
			}
		);
	}

	const effectiveContextType = params.contextShift?.new_context ?? params.contextType;
	if (
		isProjectScopedContext(effectiveContextType) &&
		params.entityId &&
		!entities.projects?.length
	) {
		assignLastTurnEntity(entities, 'project', params.entityId);
	}

	const summary =
		summarizeLastTurnText(params.assistantText, 180) ||
		(params.contextShift?.message
			? summarizeLastTurnText(params.contextShift.message, 180)
			: '') ||
		summarizeLastTurnText(params.userMessage, 120) ||
		'Completed the latest turn.';

	const dataAccessed = Array.from(toolsUsed);
	if (params.contextShift && !dataAccessed.includes('context_shift')) {
		dataAccessed.push('context_shift');
	}

	return {
		summary,
		entities,
		context_type: effectiveContextType,
		data_accessed: dataAccessed,
		timestamp: params.timestamp
	};
}

const TOOL_ENTITY_KEYS = [
	'project',
	'task',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'event'
];

function buildToolEntityCounts(payload: Record<string, any>): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const key of TOOL_ENTITY_KEYS) {
		const pluralKey = `${key}s`;
		if (Array.isArray(payload?.[pluralKey])) {
			counts[key] = payload[pluralKey].length;
		}
	}
	return counts;
}

function buildToolEntityUpdates(
	payload: Record<string, any>
): Array<{ id: string; kind: string; name?: string }> {
	const updates: Array<{ id: string; kind: string; name?: string }> = [];
	for (const key of TOOL_ENTITY_KEYS) {
		const record = payload?.[key];
		if (!record || typeof record !== 'object') continue;
		const id = typeof record.id === 'string' ? record.id : null;
		if (!id) continue;
		updates.push({
			id,
			kind: key,
			name: extractEntityLabel(record)
		});
	}
	return updates;
}

function buildToolResultSummaries(
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>
): AgentStateToolSummary[] {
	if (!executions.length) return [];

	return executions.map(({ toolCall, result }) => {
		const payload = result.result;
		const counts =
			payload && typeof payload === 'object'
				? buildToolEntityCounts(payload as Record<string, any>)
				: {};
		const updates =
			payload && typeof payload === 'object'
				? buildToolEntityUpdates(payload as Record<string, any>)
				: [];
		const entitiesAccessed = Array.isArray((payload as any)?._entities_accessed)
			? ((payload as any)._entities_accessed as string[])
			: Array.isArray((payload as any)?.entities_accessed)
				? ((payload as any).entities_accessed as string[])
				: undefined;
		const summaryParts: string[] = [`${toolCall.function.name}`];
		if (Object.keys(counts).length > 0) {
			const countsLine = Object.entries(counts)
				.map(([key, count]) => `${key}:${count}`)
				.join(', ');
			summaryParts.push(`(${countsLine})`);
		}
		const summary = result.success
			? `Executed ${summaryParts.join(' ')}.`
			: `Failed ${toolCall.function.name}: ${result.error ?? 'unknown error'}`;
		const toolSummary: AgentStateToolSummary = {
			tool_name: toolCall.function.name,
			success: result.success,
			error: result.error,
			summary
		};
		if (entitiesAccessed?.length) {
			toolSummary.entities_accessed = entitiesAccessed;
		}
		if (Object.keys(counts).length > 0) {
			toolSummary.entity_counts = counts;
		}
		if (updates.length > 0) {
			toolSummary.entity_updates = updates;
		}
		return toolSummary;
	});
}

type PersistedToolTraceEntry = {
	tool_call_id: string;
	tool_name: string;
	op?: string;
	success: boolean;
	error?: string;
	arguments_preview?: string;
	result_preview?: string;
	duration_ms?: number;
};

const MAX_PERSISTED_TOOL_TRACE_ITEMS = 12;
const MAX_PERSISTED_TOOL_ERROR_CHARS = 180;
const MAX_PERSISTED_TOOL_ARGUMENT_PREVIEW_CHARS = 420;
const MAX_PERSISTED_TOOL_RESULT_PREVIEW_CHARS = 600;

function truncateToolTraceText(value: string, maxChars: number): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function extractGatewayOpFromToolCall(toolCall: ChatToolCall): string | undefined {
	if (toolCall.function?.name !== 'tool_exec' && toolCall.function?.name !== 'tool_batch') {
		return undefined;
	}
	const rawArgs = toolCall.function.arguments;
	if (typeof rawArgs !== 'string' || rawArgs.trim().length === 0) return undefined;
	try {
		const parsed = JSON.parse(rawArgs);
		if (toolCall.function.name === 'tool_exec') {
			return typeof parsed?.op === 'string' ? parsed.op : undefined;
		}
		if (toolCall.function.name === 'tool_batch' && Array.isArray(parsed?.ops)) {
			const firstExec = parsed.ops.find(
				(entry: unknown) =>
					entry &&
					typeof entry === 'object' &&
					(entry as Record<string, unknown>).type === 'exec' &&
					typeof (entry as Record<string, unknown>).op === 'string'
			) as Record<string, unknown> | undefined;
			return typeof firstExec?.op === 'string' ? firstExec.op : undefined;
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function buildPersistedToolTrace(
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>
): PersistedToolTraceEntry[] {
	if (!Array.isArray(executions) || executions.length === 0) return [];
	return executions.slice(0, MAX_PERSISTED_TOOL_TRACE_ITEMS).map(({ toolCall, result }) => {
		const op = extractGatewayOpFromToolCall(toolCall);
		const rawError = typeof result.error === 'string' ? result.error : '';
		const argumentsPreview = previewToolArguments(
			toolCall.function.arguments,
			MAX_PERSISTED_TOOL_ARGUMENT_PREVIEW_CHARS
		);
		const resultPreview =
			result.result === undefined
				? undefined
				: previewToolArguments(result.result, MAX_PERSISTED_TOOL_RESULT_PREVIEW_CHARS);
		const durationMs =
			typeof result.duration_ms === 'number' && Number.isFinite(result.duration_ms)
				? result.duration_ms
				: undefined;
		return {
			tool_call_id: toolCall.id,
			tool_name: toolCall.function.name,
			op,
			success: result.success === true,
			...(argumentsPreview ? { arguments_preview: argumentsPreview } : {}),
			...(resultPreview ? { result_preview: resultPreview } : {}),
			...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
			...(rawError
				? {
						error: truncateToolTraceText(rawError, MAX_PERSISTED_TOOL_ERROR_CHARS)
					}
				: {})
		};
	});
}

function buildPersistedToolTraceSummary(trace: PersistedToolTraceEntry[]): string | null {
	if (!trace.length) return null;
	const line = trace
		.slice(0, 6)
		.map((entry) => {
			const label = entry.op ?? entry.tool_name;
			if (entry.success) return `${label}:ok`;
			return `${label}:err${entry.error ? `(${entry.error})` : ''}`;
		})
		.join('; ');
	return `Tool trace: ${truncateToolTraceText(line, 420)}`;
}

type ToolExecutionInsertRow = {
	session_id: string;
	message_id: string | null;
	tool_name: string;
	tool_category: string | null;
	arguments: Json;
	result: Json | null;
	execution_time_ms: number | null;
	tokens_consumed: number | null;
	success: boolean;
	error_message: string | null;
};

function parseToolArgumentsForPersistence(rawArgs: unknown): Json {
	if (!rawArgs || rawArgs === '') return {} as Json;
	if (typeof rawArgs === 'string') {
		try {
			return JSON.parse(rawArgs) as Json;
		} catch {
			return { raw: rawArgs } as Json;
		}
	}
	if (typeof rawArgs === 'object') {
		return rawArgs as Json;
	}
	return { value: String(rawArgs) } as Json;
}

function normalizeToolResultForPersistence(rawResult: unknown): Json | null {
	if (rawResult === undefined) return null;
	if (
		rawResult === null ||
		typeof rawResult === 'string' ||
		typeof rawResult === 'number' ||
		typeof rawResult === 'boolean'
	) {
		return rawResult as Json;
	}
	if (Array.isArray(rawResult) || typeof rawResult === 'object') {
		return rawResult as Json;
	}
	return { value: String(rawResult) } as Json;
}

function buildToolExecutionInsertRows(params: {
	sessionId: string;
	messageId: string | null;
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
}): ToolExecutionInsertRow[] {
	if (!Array.isArray(params.executions) || params.executions.length === 0) return [];
	return params.executions.map(({ toolCall, result }) => ({
		session_id: params.sessionId,
		message_id: params.messageId,
		tool_name: toolCall.function.name,
		tool_category: getToolCategory(toolCall.function.name) ?? null,
		arguments: parseToolArgumentsForPersistence(toolCall.function.arguments),
		result: result.success ? normalizeToolResultForPersistence(result.result) : null,
		execution_time_ms:
			typeof result.duration_ms === 'number' && Number.isFinite(result.duration_ms)
				? result.duration_ms
				: null,
		tokens_consumed: null,
		success: result.success === true,
		error_message: typeof result.error === 'string' ? result.error : null
	}));
}

async function persistToolExecutionRows(params: {
	supabase: any;
	sessionId: string;
	messageId: string | null;
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
	projectId?: string;
	contextType: ChatContextType;
	interrupted?: boolean;
	logError?: (params: {
		error: unknown;
		operationType: string;
		projectId?: string;
		metadata?: Record<string, unknown>;
	}) => void;
}): Promise<void> {
	const rows = buildToolExecutionInsertRows({
		sessionId: params.sessionId,
		messageId: params.messageId,
		executions: params.executions
	});
	if (rows.length === 0) return;

	const { error } = await params.supabase.from('chat_tool_executions').insert(rows);
	if (!error) return;

	logger.warn(
		params.interrupted
			? 'Failed to persist FastChat interrupted tool executions'
			: 'Failed to persist FastChat tool executions',
		{
			error,
			sessionId: params.sessionId
		}
	);
	params.logError?.({
		error,
		operationType: 'fastchat_persist_tool_executions',
		projectId: params.projectId,
		metadata: {
			sessionId: params.sessionId,
			messageId: params.messageId,
			toolExecutionCount: rows.length,
			contextType: params.contextType,
			...(params.interrupted ? { interrupted: true } : {})
		}
	});
}

function detachFastChatTask(
	promise: Promise<unknown>,
	params: {
		label: string;
		projectId?: string;
		contextType: ChatContextType;
		sessionId: string;
		entityId?: string | null;
		logError?: (params: {
			error: unknown;
			operationType: string;
			projectId?: string;
			metadata?: Record<string, unknown>;
		}) => void;
	}
): void {
	void promise.catch((error) => {
		logger.warn(`Detached FastChat task failed: ${params.label}`, {
			error,
			sessionId: params.sessionId
		});
		params.logError?.({
			error,
			operationType: 'fastchat_detached_task',
			projectId: params.projectId,
			metadata: {
				task: params.label,
				sessionId: params.sessionId,
				contextType: params.contextType,
				entityId: params.entityId ?? null
			}
		});
	});
}

function buildToolMessageSnapshotsForReconciliation(
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>,
	toolSummaries: AgentStateToolSummary[]
): AgentStateMessageSnapshot[] {
	if (!executions.length) return [];
	return executions.map(({ toolCall, result }, index) => {
		const summary = toolSummaries[index];
		const contentPayload = {
			tool_name: toolCall.function.name,
			op: extractGatewayOpFromToolCall(toolCall),
			success: result.success,
			error: result.error,
			summary: summary?.summary
		};
		return {
			role: 'tool',
			tool_call_id: toolCall.id,
			tool_name: toolCall.function.name,
			content: JSON.stringify(contentPayload)
		};
	});
}

function _emitContextOperations(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	params: {
		contextType: string;
		data: any;
		projectName?: string | null;
		focusEntityType?: string | null;
		focusEntityName?: string | null;
	}
): void {
	const { contextType, data, projectName, focusEntityType, focusEntityName } = params;

	if (contextType === 'global' && data?.projects) {
		const count = Array.isArray(data.projects) ? data.projects.length : 0;
		emitOperation(agentStream, {
			action: 'list',
			entity_type: 'project',
			entity_name: `All projects (${count})`,
			status: 'success'
		});
		return;
	}

	if (isDailyBriefContext(contextType)) {
		const briefDate =
			typeof data?.brief_date === 'string'
				? data.brief_date
				: typeof data?.briefDate === 'string'
					? data.briefDate
					: null;
		emitOperation(agentStream, {
			action: 'read',
			entity_type: 'project',
			entity_name: briefDate ? `Daily brief ${briefDate}` : 'Daily brief',
			status: 'success'
		});

		const countsRecord =
			data?.mentioned_entity_counts && typeof data.mentioned_entity_counts === 'object'
				? (data.mentioned_entity_counts as Record<string, unknown>)
				: data?.mentionedEntityCounts && typeof data.mentionedEntityCounts === 'object'
					? (data.mentionedEntityCounts as Record<string, unknown>)
					: null;
		if (!countsRecord) return;
		for (const [kind, rawCount] of Object.entries(countsRecord)) {
			if (!isOperationEntityType(kind)) continue;
			if (typeof rawCount !== 'number' || rawCount <= 0) continue;
			emitOperation(agentStream, {
				action: 'list',
				entity_type: kind,
				entity_name: `${kind}s (${rawCount})`,
				status: 'success'
			});
		}
		return;
	}

	if (data?.project) {
		const resolvedProjectName =
			projectName || (typeof data.project.name === 'string' ? data.project.name : 'Project');
		emitOperation(agentStream, {
			action: 'read',
			entity_type: 'project',
			entity_name: resolvedProjectName,
			status: 'success'
		});
	}

	if (focusEntityType && isOperationEntityType(focusEntityType)) {
		const label = focusEntityName?.trim() || focusEntityType;
		emitOperation(agentStream, {
			action: 'read',
			entity_type: focusEntityType,
			entity_name: label,
			status: 'success'
		});
	}

	const listSummaries: Array<{ entity: OperationEventPayload['entity_type']; count: number }> =
		[];
	if (Array.isArray(data?.goals)) {
		listSummaries.push({ entity: 'goal', count: data.goals.length });
	}
	if (Array.isArray(data?.milestones)) {
		listSummaries.push({ entity: 'milestone', count: data.milestones.length });
	}
	if (Array.isArray(data?.plans)) {
		listSummaries.push({ entity: 'plan', count: data.plans.length });
	}
	if (Array.isArray(data?.tasks)) {
		listSummaries.push({ entity: 'task', count: data.tasks.length });
	}
	if (Array.isArray(data?.documents)) {
		listSummaries.push({ entity: 'document', count: data.documents.length });
	}
	if (data?.linked_entities && typeof data.linked_entities === 'object') {
		Object.entries(data.linked_entities).forEach(([key, value]) => {
			if (!isOperationEntityType(key)) return;
			if (!Array.isArray(value) || value.length === 0) return;
			listSummaries.push({ entity: key, count: value.length });
		});
	}

	listSummaries.slice(0, 6).forEach(({ entity, count }) => {
		if (count <= 0) return;
		emitOperation(agentStream, {
			action: 'list',
			entity_type: entity,
			entity_name: `${entity}s (${count})`,
			status: 'success'
		});
	});
}

export const POST: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	fetch
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const userId = user.id;
	const requestStartedAtMs = Date.now();

	const logFastChatError = (params: {
		error: unknown;
		operationType: string;
		projectId?: string;
		tableName?: string;
		recordId?: string;
		metadata?: Record<string, unknown>;
	}): void => {
		const sanitizedMetadata = params.metadata ? sanitizeLogData(params.metadata) : undefined;
		const metadata =
			sanitizedMetadata &&
			typeof sanitizedMetadata === 'object' &&
			!Array.isArray(sanitizedMetadata)
				? (sanitizedMetadata as Record<string, unknown>)
				: sanitizedMetadata !== undefined
					? { value: sanitizedMetadata }
					: undefined;

		void errorLogger.logError(params.error, {
			userId,
			projectId: params.projectId,
			endpoint: FASTCHAT_STREAM_ENDPOINT,
			httpMethod: FASTCHAT_STREAM_METHOD,
			operationType: params.operationType,
			tableName: params.tableName,
			recordId: params.recordId,
			metadata
		});
	};

	let streamRequest: FastAgentStreamRequest;
	try {
		streamRequest = await parseRequest(request);
	} catch (error) {
		logger.warn('Failed to parse V2 stream request', { error });
		logFastChatError({
			error,
			operationType: 'fastchat_stream_parse',
			metadata: {
				parseStage: 'request_json'
			}
		});
		return ApiResponse.badRequest('Invalid request body');
	}

	const message = streamRequest.message?.trim();
	if (!message) {
		return ApiResponse.badRequest('Message is required');
	}
	const clientTurnIdRaw = streamRequest.client_turn_id;
	const clientTurnId =
		typeof clientTurnIdRaw === 'string' && clientTurnIdRaw.trim().length > 0
			? clientTurnIdRaw.trim()
			: undefined;
	const streamRunId = normalizeFastChatStreamRunId(streamRequest.stream_run_id);
	const requestPrewarmedContext = normalizePrewarmedContextCache(
		streamRequest.prewarmedContext ?? streamRequest.prewarmed_context ?? null
	);

	const initialContextType = normalizeFastContextType(streamRequest.context_type);
	if (isDailyBriefContext(initialContextType)) {
		const briefEntityId = streamRequest.entity_id?.trim();
		if (!briefEntityId) {
			return ApiResponse.badRequest('daily_brief context requires a brief entity_id');
		}
	}

	const agentStream = SSEResponse.createChatStream();
	const timingEntityId =
		streamRequest.entity_id?.trim() || streamRequest.projectFocus?.projectId || null;
	let timingContextType: ChatContextType = initialContextType;
	let timingSessionId: string | null = null;
	let timingProjectId =
		streamRequest.projectFocus?.projectId ??
		(isProjectScopedContext(initialContextType) ? timingEntityId : null);
	let sessionResolvedAtMs: number | null = null;
	let historyLoadStartedAtMs: number | null = null;
	let historyLoadedAtMs: number | null = null;
	let historyComposeStartedAtMs: number | null = null;
	let historyComposedAtMs: number | null = null;
	let toolSelectionMs: number | null = null;
	let contextBuildStartedAtMs: number | null = null;
	let contextReadyAtMs: number | null = null;
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
	let contextCacheAgeSecondsForTiming: number | null = null;
	let bypassedContextCache = false;
	let timingMetricQueued = false;

	const toIsoString = (value: number | null): string | null =>
		typeof value === 'number' ? new Date(value).toISOString() : null;
	const durationMs = (start: number | null, end: number | null): number | undefined => {
		if (typeof start !== 'number' || typeof end !== 'number') return undefined;
		return Math.max(0, end - start);
	};
	const markStreamEventSent = (eventType: string): void => {
		const now = Date.now();
		if (firstEventAtMs === null) {
			firstEventAtMs = now;
		}
		if ((eventType === 'text' || eventType === 'text_delta') && firstResponseAtMs === null) {
			firstResponseAtMs = now;
		}
	};
	const detachTimingTask = (
		promise: Promise<unknown> | PromiseLike<unknown>,
		label: string,
		metadata?: Record<string, unknown>
	): void => {
		void Promise.resolve(promise).catch((error) => {
			logger.warn(`Detached FastChat timing task failed: ${label}`, {
				error,
				sessionId: timingSessionId
			});
			logFastChatError({
				error,
				operationType: 'fastchat_timing_metric',
				projectId: timingProjectId ?? undefined,
				tableName: 'timing_metrics',
				recordId: timingSessionId ?? undefined,
				metadata: {
					label,
					sessionId: timingSessionId,
					contextType: timingContextType,
					entityId: timingEntityId,
					...(metadata ?? {})
				}
			});
		});
	};
	const buildTimingSummary = (finishedReason?: string | null): AgentTimingSummary => ({
		request_started_at: new Date(requestStartedAtMs).toISOString(),
		session_resolved_at: toIsoString(sessionResolvedAtMs),
		history_loaded_at: toIsoString(historyLoadedAtMs),
		history_composed_at: toIsoString(historyComposedAtMs),
		context_ready_at: toIsoString(contextReadyAtMs),
		first_event_at: toIsoString(firstEventAtMs),
		first_response_at: toIsoString(firstResponseAtMs),
		assistant_persisted_at: toIsoString(assistantPersistedAtMs),
		done_emitted_at: toIsoString(doneEmittedAtMs),
		cache_source: contextCacheSource,
		cache_age_seconds: contextCacheAgeSecondsForTiming,
		bypassed_context_cache: bypassedContextCache,
		history_strategy: historyStrategy,
		history_compressed: historyCompressed,
		raw_history_count: rawHistoryCount,
		history_for_model_count: historyForModelCount,
		finished_reason: finishedReason ?? null,
		phases: {
			session_resolve_ms: durationMs(requestStartedAtMs, sessionResolvedAtMs),
			history_load_ms: durationMs(historyLoadStartedAtMs, historyLoadedAtMs),
			history_compose_ms: durationMs(historyComposeStartedAtMs, historyComposedAtMs),
			tool_selection_ms: toolSelectionMs ?? undefined,
			context_build_ms: durationMs(contextBuildStartedAtMs, contextReadyAtMs),
			request_to_context_ready_ms: durationMs(requestStartedAtMs, contextReadyAtMs),
			time_to_first_event_ms: durationMs(requestStartedAtMs, firstEventAtMs),
			time_to_first_response_ms: durationMs(requestStartedAtMs, firstResponseAtMs),
			response_generation_ms: durationMs(
				firstResponseAtMs,
				assistantPersistStartedAtMs ?? assistantPersistedAtMs ?? doneEmittedAtMs
			),
			assistant_persist_ms: durationMs(assistantPersistStartedAtMs, assistantPersistedAtMs),
			finalization_ms: durationMs(finalizationStartedAtMs, doneEmittedAtMs),
			total_request_ms: durationMs(requestStartedAtMs, doneEmittedAtMs ?? Date.now())
		}
	});
	const queueTimingMetric = (finishedReason?: string | null): AgentTimingSummary | null => {
		if (!timingSessionId) return null;
		const summary = buildTimingSummary(finishedReason);
		if (timingMetricQueued) {
			return summary;
		}
		timingMetricQueued = true;
		const metadata: Json = {
			stream_version: 'v2',
			client_turn_id: clientTurnId ?? null,
			stream_run_id: streamRunId ?? null,
			project_id: timingProjectId,
			entity_id: timingEntityId,
			request_prewarmed_context: Boolean(requestPrewarmedContext),
			timing_summary: summary
		};
		const nowIso = new Date().toISOString();
		detachTimingTask(
			supabase.from('timing_metrics').insert({
				id: uuidv4(),
				user_id: userId,
				session_id: timingSessionId,
				context_type: timingContextType,
				message_length: message.length,
				message_received_at: new Date(requestStartedAtMs).toISOString(),
				first_event_at: summary.first_event_at ?? null,
				first_response_at: summary.first_response_at ?? null,
				time_to_first_event_ms: summary.phases.time_to_first_event_ms ?? null,
				time_to_first_response_ms: summary.phases.time_to_first_response_ms ?? null,
				context_build_ms: summary.phases.context_build_ms ?? null,
				tool_selection_ms: summary.phases.tool_selection_ms ?? null,
				metadata,
				created_at: nowIso,
				updated_at: nowIso
			}),
			'insert_turn_timing_metric',
			{ finishedReason }
		);
		return summary;
	};
	const sendTimedMessage = async (
		payload: Record<string, unknown> & { type: string },
		errorContext: {
			operationType: string;
			projectId?: string;
			metadata?: Record<string, unknown>;
		}
	): Promise<void> => {
		try {
			await agentStream.sendMessage(payload);
			markStreamEventSent(payload.type);
		} catch (error) {
			logFastChatError({
				error,
				operationType: errorContext.operationType,
				projectId: errorContext.projectId,
				metadata: errorContext.metadata
			});
			throw error;
		}
	};
	const sendTimedMessageDetached = (
		payload: Record<string, unknown> & { type: string },
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

	sendTimedMessageDetached(
		{
			type: 'agent_state',
			state: 'thinking',
			details: 'BuildOS is processing your request...'
		},
		{
			operationType: 'fastchat_stream_emit_agent_state',
			metadata: { streamStage: 'initial_thinking_state' }
		}
	);

	void (async () => {
		const contextType = normalizeFastContextType(streamRequest.context_type);
		const projectFocus = streamRequest.projectFocus ?? undefined;
		const entityId = streamRequest.entity_id?.trim() || projectFocus?.projectId || undefined;
		const projectIdForLogs =
			projectFocus?.projectId ??
			((contextType === 'project' ||
				contextType === 'project_audit' ||
				contextType === 'project_forecast') &&
			typeof entityId === 'string'
				? entityId
				: undefined);
		const sessionService = createFastChatSessionService(supabase, {
			errorLogger,
			endpoint: FASTCHAT_STREAM_ENDPOINT,
			httpMethod: FASTCHAT_STREAM_METHOD
		});
		const voiceGroupId =
			typeof streamRequest.voiceNoteGroupId === 'string'
				? streamRequest.voiceNoteGroupId
				: typeof streamRequest.voice_note_group_id === 'string'
					? streamRequest.voice_note_group_id
					: undefined;

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
					await sendTimedMessage(
						{
							type: 'error',
							error: 'Brief context requires a brief ID.'
						},
						{
							operationType: 'fastchat_stream_emit_error',
							metadata: { contextType, entityId, reason: 'missing_brief_id' }
						}
					);
					doneEmittedAtMs = Date.now();
					await sendTimedMessage(
						{
							type: 'done',
							usage: { total_tokens: 0 },
							finished_reason: 'error'
						},
						{
							operationType: 'fastchat_stream_emit_done',
							metadata: { contextType, entityId, reason: 'missing_brief_id' }
						}
					);
					await agentStream.close();
					return;
				}

				const briefAccess = await checkDailyBriefAccess(
					supabase,
					entityId,
					userId,
					errorLogger,
					{
						endpoint: FASTCHAT_STREAM_ENDPOINT,
						httpMethod: FASTCHAT_STREAM_METHOD
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
					await sendTimedMessage(
						{
							type: 'error',
							error: 'Access denied for the selected brief.'
						},
						{
							operationType: 'fastchat_stream_emit_error',
							metadata: { contextType, entityId, reason: 'brief_access_denied' }
						}
					);
					doneEmittedAtMs = Date.now();
					await sendTimedMessage(
						{
							type: 'done',
							usage: { total_tokens: 0 },
							finished_reason: 'error'
						},
						{
							operationType: 'fastchat_stream_emit_done',
							metadata: { contextType, entityId, reason: 'brief_access_denied' }
						}
					);
					await agentStream.close();
					return;
				}
			}

			if (
				(contextType === 'project' ||
					contextType === 'project_audit' ||
					contextType === 'project_forecast') &&
				entityId
			) {
				const accessResult = await checkProjectAccess(supabase, entityId, errorLogger, {
					userId,
					endpoint: FASTCHAT_STREAM_ENDPOINT,
					httpMethod: FASTCHAT_STREAM_METHOD
				});
				if (!accessResult.allowed) {
					logFastChatError({
						error: new Error('FastChat project access denied'),
						operationType: 'fastchat_project_access_denied',
						projectId: entityId,
						metadata: {
							contextType,
							entityId,
							reason: accessResult.reason ?? 'denied'
						}
					});
					await sendTimedMessage(
						{
							type: 'error',
							error: 'Access denied for the selected project.'
						},
						{
							operationType: 'fastchat_stream_emit_error',
							projectId: entityId,
							metadata: { contextType, entityId, reason: 'project_access_denied' }
						}
					);
					doneEmittedAtMs = Date.now();
					await sendTimedMessage(
						{
							type: 'done',
							usage: { total_tokens: 0 },
							finished_reason: 'error'
						},
						{
							operationType: 'fastchat_stream_emit_done',
							projectId: entityId,
							metadata: { contextType, entityId, reason: 'project_access_denied' }
						}
					);
					await agentStream.close();
					return;
				}
			}

			const { session } = await sessionService.resolveSession({
				sessionId: streamRequest.session_id,
				userId,
				contextType,
				entityId,
				projectFocus
			});
			sessionResolvedAtMs = Date.now();
			timingSessionId = session.id;
			timingContextType = contextType;
			timingProjectId =
				projectFocus?.projectId ??
				(isProjectScopedContext(contextType) ? (entityId ?? null) : timingProjectId);

			await sendTimedMessage(
				{ type: 'session', session },
				{
					operationType: 'fastchat_stream_emit_session',
					projectId: projectIdForLogs,
					metadata: { sessionId: session.id, contextType }
				}
			);

			const requestLastTurnContext =
				streamRequest.lastTurnContext ?? streamRequest.last_turn_context ?? null;
			historyLoadStartedAtMs = Date.now();
			const history = await sessionService.loadRecentMessages(
				session.id,
				FASTCHAT_HISTORY_LOOKBACK_MESSAGES
			);
			historyLoadedAtMs = Date.now();
			const continuityHint = buildLastTurnContinuityHint(requestLastTurnContext);
			const conversationSummary =
				typeof session.summary === 'string' ? session.summary : null;
			historyComposeStartedAtMs = Date.now();
			const historyComposition = composeFastChatHistory({
				history,
				continuityHint,
				sessionSummary: conversationSummary,
				settings: {
					compressionThresholdMessages: FASTCHAT_HISTORY_COMPRESSION_THRESHOLD_MESSAGES,
					tailMessagesWhenCompressed: FASTCHAT_HISTORY_TAIL_MESSAGES,
					maxSummaryChars: FASTCHAT_HISTORY_MAX_SUMMARY_CHARS,
					maxMessageChars: FASTCHAT_HISTORY_MAX_MESSAGE_CHARS
				}
			});
			historyComposedAtMs = Date.now();
			historyStrategy = historyComposition.strategy;
			historyCompressed = historyComposition.compressed;
			rawHistoryCount = historyComposition.rawHistoryCount;
			const historyForModel = historyComposition.historyForModel;
			historyForModelCount = historyForModel.length;
			const sessionMetadata = (session.agent_metadata ?? {}) as Record<string, any>;
			const recentContextShiftHint = readRecentContextShiftHint(sessionMetadata);
			const bypassContextCacheForShiftHint = shouldBypassContextCacheForShiftHint({
				requestContextType: contextType,
				requestEntityId: entityId,
				requestProjectFocus: projectFocus,
				shiftHint: recentContextShiftHint
			});
			const cacheKey = buildContextCacheKey({ contextType, entityId, projectFocus });
			const cachedContext = sessionMetadata.fastchat_context_cache as
				| FastChatContextCache
				| undefined;
			if (bypassContextCacheForShiftHint && cachedContext) {
				logger.info('Bypassing fastchat context cache due to recent context shift hint', {
					sessionId: session.id,
					contextType,
					entityId,
					shiftHint: recentContextShiftHint
				});
			}
			bypassedContextCache = bypassContextCacheForShiftHint;

			const userMessageMetadata: Record<string, Json | undefined> = {};
			if (voiceGroupId) {
				userMessageMetadata.voice_note_group_id = voiceGroupId;
			}
			if (clientTurnId) {
				userMessageMetadata.client_turn_id = clientTurnId;
			}
			if (streamRunId) {
				userMessageMetadata.stream_run_id = streamRunId;
			}
			const userMessagePromise = sessionService.persistMessage({
				sessionId: session.id,
				userId,
				role: 'user',
				content: message,
				metadata:
					Object.keys(userMessageMetadata).length > 0 ? userMessageMetadata : undefined,
				idempotencyKey: clientTurnId ? `turn:${clientTurnId}:user` : undefined
			});

			const llm = FASTCHAT_OPENROUTER_V2_ENABLED
				? new OpenRouterV2Service({
						supabase,
						httpReferer: request.headers.get('referer') ?? undefined,
						appName: 'BuildOS Agentic Chat V2'
					})
				: new SmartLLMService({
						supabase,
						httpReferer: request.headers.get('referer') ?? undefined,
						appName: 'BuildOS Agentic Chat V2'
					});
			const gatewayEnabled = isToolGatewayEnabled();
			const toolSelectionStartedAtMs = Date.now();
			const tools = selectFastChatTools({ contextType, message });
			toolSelectionMs = Math.max(0, Date.now() - toolSelectionStartedAtMs);
			const toolsRequiringProjectId = getToolsRequiringProjectId(tools);
			let effectiveContextType: ChatContextType = contextType;
			let effectiveEntityId: string | null = entityId ?? null;
			let latestContextShift: ContextShiftPayload | null = null;
			let effectiveProjectIdForTools =
				projectFocus?.projectId ??
				((contextType === 'project' ||
					contextType === 'project_audit' ||
					contextType === 'project_forecast') &&
				typeof entityId === 'string'
					? entityId
					: undefined);
			const toolExecutorInstance =
				tools.length > 0
					? new ChatToolExecutor(supabase, userId, session.id, fetch, llm)
					: undefined;
			const sharedToolExecutor =
				toolExecutorInstance &&
				(async (toolName: string, args: Record<string, any>, _context: ServiceContext) => {
					const call: ChatToolCall = {
						id: uuidv4(),
						type: 'function',
						function: {
							name: toolName,
							arguments: JSON.stringify(args ?? {})
						}
					} as ChatToolCall;

					const result = await toolExecutorInstance.execute(call);
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
					const tokensUsed =
						usage && typeof usage.total_tokens === 'number'
							? usage.total_tokens
							: typeof usage?.totalTokens === 'number'
								? usage.totalTokens
								: undefined;
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
			const toolExecutionService =
				gatewayEnabled && sharedToolExecutor
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
			let contextUsageSnapshot: ContextUsageSnapshot | null = null;
			let contextCacheAgeSeconds = 0;
			let promptContext:
				| {
						contextType: ChatContextType;
						entityId?: string | null;
						projectId?: string | null;
						projectName?: string | null;
						focusEntityType?: string | null;
						focusEntityId?: string | null;
						focusEntityName?: string | null;
						agentState?: string | null;
						conversationSummary?: string | null;
						data?: Record<string, unknown> | string | null;
				  }
				| undefined;
			contextBuildStartedAtMs = Date.now();
			try {
				const hasFreshRequestPrewarmCache =
					requestPrewarmedContext &&
					requestPrewarmedContext.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
					requestPrewarmedContext.key === cacheKey &&
					isCacheFresh(requestPrewarmedContext);
				if (
					cachedContext &&
					!bypassContextCacheForShiftHint &&
					cachedContext.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
					cachedContext.key === cacheKey &&
					isCacheFresh(cachedContext)
				) {
					promptContext = { ...cachedContext.context };
					contextCacheAgeSeconds = resolveCacheAgeSeconds(cachedContext.created_at);
					contextCacheSource = 'session_cache';
				} else if (hasFreshRequestPrewarmCache) {
					promptContext = { ...requestPrewarmedContext.context };
					contextCacheAgeSeconds = resolveCacheAgeSeconds(
						requestPrewarmedContext.created_at
					);
					contextCacheSource = 'request_prewarm';
					void updateAgentMetadata(
						supabase,
						session.id,
						{
							fastchat_context_cache: requestPrewarmedContext
						},
						{
							errorLogger,
							userId,
							projectId: projectIdForLogs
						}
					);
				} else {
					promptContext = await loadFastChatPromptContext({
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
					});
					contextCacheSource = 'fresh_load';

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

				const rawAgentState =
					(sessionMetadata.agent_state as AgentState | undefined) ??
					buildEmptyAgentState(session.id);
				const agentState = sanitizeAgentStateForPrompt(rawAgentState);

				promptContext.agentState = JSON.stringify(agentState);
				promptContext.conversationSummary = conversationSummary;

				systemPrompt = buildMasterPrompt(promptContext);

				const usageSnapshot = buildFastContextUsageSnapshot({
					systemPrompt,
					history: historyForModel,
					userMessage: message
				});
				contextUsageSnapshot = usageSnapshot;
				emitContextUsage(agentStream, usageSnapshot, {
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
							FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS,
							FASTCHAT_GATEWAY_NEAR_LIMIT_MAX_TOOL_ROUNDS
						)
					: FASTCHAT_GATEWAY_MAX_TOOL_ROUNDS;
			const conversationHistoryForTools = [
				...historyForModel,
				{ role: 'user', content: message }
			] as ServiceContext['conversationHistory'];

			const { assistantText, usage, finishedReason, toolExecutions, cancelled } =
				await streamFastChat({
					llm,
					userId,
					sessionId: session.id,
					contextType,
					entityId,
					projectId:
						projectFocus?.projectId ??
						(contextType === 'project' ? (entityId ?? null) : null),
					history: historyForModel,
					message,
					signal: request.signal,
					systemPrompt,
					maxToolRounds: gatewayEnabled ? Math.max(1, gatewayRoundCap) : undefined,
					allowAutonomousRecovery: FASTCHAT_AUTONOMOUS_RECOVERY_ENABLED,
					tools,
					debugContext: {
						gatewayEnabled,
						historyStrategy: historyComposition.strategy,
						historyCompressed: historyComposition.compressed,
						rawHistoryCount: historyComposition.rawHistoryCount,
						historyForModelCount: historyForModel.length,
						tailMessagesKept: historyComposition.tailMessagesKept,
						continuityHintUsed: historyComposition.continuityHintUsed
					},
					toolExecutor: toolExecutionService
						? async (toolCall) => {
								const contextScope = effectiveProjectIdForTools
									? {
											projectId: effectiveProjectIdForTools,
											projectName: promptContext?.projectName ?? undefined
										}
									: undefined;
								const serviceContext: ServiceContext = {
									sessionId: session.id,
									userId,
									contextType: effectiveContextType,
									entityId: effectiveEntityId ?? undefined,
									conversationHistory: conversationHistoryForTools,
									contextScope
								};
								const result = await toolExecutionService.executeTool(
									toolCall,
									serviceContext,
									tools,
									{ abortSignal: request.signal }
								);
								return {
									tool_call_id: result.toolCallId,
									result: result.data ?? null,
									success: result.success,
									error:
										typeof result.error === 'string'
											? result.error
											: result.error?.message
								};
							}
						: toolExecutorInstance
							? (toolCall) => toolExecutorInstance.execute(patchToolCall(toolCall))
							: undefined,
					onToolCall: async (toolCall) => {
						const patchedCall = patchToolCall(toolCall);
						emitToolCall(agentStream, patchedCall, {
							onError: (error) => {
								logFastChatError({
									error,
									operationType: 'fastchat_stream_emit_tool_call',
									projectId: effectiveProjectIdForTools ?? projectIdForLogs,
									metadata: {
										sessionId: session.id,
										contextType: effectiveContextType,
										toolName: patchedCall.function.name,
										toolCallId: patchedCall.id
									}
								});
							},
							onMessageSent: () => {
								markStreamEventSent('tool_call');
							}
						});
						if (dev) {
							const skillActivity = getRequestedSkillActivity(patchedCall);
							if (skillActivity) {
								emitSkillActivity(agentStream, skillActivity, {
									onError: (error) => {
										logFastChatError({
											error,
											operationType: 'fastchat_stream_emit_skill_activity',
											projectId: effectiveProjectIdForTools ?? projectIdForLogs,
											metadata: {
												sessionId: session.id,
												contextType: effectiveContextType,
												toolName: patchedCall.function.name,
												toolCallId: patchedCall.id,
												action: skillActivity.action,
												path: skillActivity.path
											}
										});
									},
									onMessageSent: () => {
										markStreamEventSent('skill_activity');
									}
								});
							}
						}
					},
					onToolResult: async ({ toolCall, result }) => {
						try {
							const patchedCall = patchToolCall(toolCall);
							emitToolResult(agentStream, patchedCall, result, {
								onError: (error) => {
									logFastChatError({
										error,
										operationType: 'fastchat_stream_emit_tool_result',
										projectId: effectiveProjectIdForTools ?? projectIdForLogs,
										metadata: {
											sessionId: session.id,
											contextType: effectiveContextType,
											toolName: patchedCall.function.name,
											toolCallId: patchedCall.id
										}
									});
								},
								onMessageSent: () => {
									markStreamEventSent('tool_result');
								}
							});
							if (dev) {
								const skillActivity = getLoadedSkillActivity(patchedCall, result);
								if (skillActivity) {
									emitSkillActivity(agentStream, skillActivity, {
										onError: (error) => {
											logFastChatError({
												error,
												operationType: 'fastchat_stream_emit_skill_activity',
												projectId:
													effectiveProjectIdForTools ?? projectIdForLogs,
												metadata: {
													sessionId: session.id,
													contextType: effectiveContextType,
													toolName: patchedCall.function.name,
													toolCallId: patchedCall.id,
													action: skillActivity.action,
													path: skillActivity.path
												}
											});
										},
										onMessageSent: () => {
											markStreamEventSent('skill_activity');
										}
									});
								}
							}
							if (!result.success) {
								const toolFailureMetadata = {
									sessionId: session.id,
									contextType: effectiveContextType,
									entityId: effectiveEntityId,
									toolName: patchedCall.function.name,
									toolCallId: patchedCall.id,
									toolError: result.error
								};
								if (isExpectedToolValidationFailure(result.error)) {
									logger.warn('FastChat tool validation failure', {
										...toolFailureMetadata,
										toolArgsRaw: patchedCall.function.arguments,
										toolArgsPreview: previewToolArguments(
											patchedCall.function.arguments
										)
									});
									logFastChatError({
										error: new Error(
											result.error ?? 'FastChat tool validation failed'
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
								} else {
									logFastChatError({
										error: new Error(
											result.error ?? 'FastChat tool execution failed'
										),
										operationType: 'fastchat_tool_result_failure',
										projectId: effectiveProjectIdForTools ?? projectIdForLogs,
										metadata: toolFailureMetadata
									});
								}
							}

							const contextShift = extractContextShiftPayload(result);
							if (contextShift) {
								effectiveContextType = contextShift.new_context;
								effectiveEntityId = contextShift.entity_id;
								latestContextShift = contextShift;
								if (isProjectScopedContext(contextShift.new_context)) {
									effectiveProjectIdForTools = contextShift.entity_id;
								}
								void updateAgentMetadata(
									supabase,
									session.id,
									{
										fastchat_last_context_shift: {
											context_type: contextShift.new_context,
											entity_id: contextShift.entity_id ?? null,
											project_id: isProjectScopedContext(
												contextShift.new_context
											)
												? (contextShift.entity_id ?? null)
												: null,
											shifted_at: new Date().toISOString()
										}
									},
									{
										errorLogger,
										userId,
										projectId: effectiveProjectIdForTools ?? projectIdForLogs
									}
								);
								await emitContextShift(agentStream, contextShift, {
									onError: (error) => {
										logFastChatError({
											error,
											operationType: 'fastchat_stream_emit_context_shift',
											projectId: contextShift.entity_id,
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
					onDelta: async (delta) => {
						try {
							await sendTimedMessage(
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
						} catch (error) {
							if (!request.signal.aborted) {
								logger.warn('Failed to emit text delta', {
									error,
									sessionId: session.id
								});
							}
							throw error;
						}
					}
				});
			const normalizedExecutions = toolExecutions ?? [];
			const persistedUserMessagePromise = userMessagePromise.catch((error) => {
				logger.warn('Failed to persist user message', { error, sessionId: session.id });
				logFastChatError({
					error,
					operationType: 'fastchat_persist_message',
					projectId: projectIdForLogs,
					metadata: { role: 'user', sessionId: session.id }
				});
				return null;
			});
			const finalizeUserMessagePromise = (async () => {
				const userMessage = await persistedUserMessagePromise;
				if (voiceGroupId && userMessage?.id) {
					await sessionService.attachVoiceNoteGroup({
						groupId: voiceGroupId,
						userId,
						sessionId: session.id,
						messageId: userMessage.id
					});
				}
				return userMessage;
			})();
			const sessionContextSyncPromise = sessionService.updateSessionContext({
				session,
				contextType: effectiveContextType,
				entityId: effectiveEntityId
			});
			detachFastChatTask(finalizeUserMessagePromise, {
				label: 'finalize_user_message',
				projectId: projectIdForLogs,
				contextType: effectiveContextType,
				sessionId: session.id,
				entityId: effectiveEntityId,
				logError: logFastChatError
			});
			detachFastChatTask(sessionContextSyncPromise, {
				label: 'sync_session_context',
				projectId: effectiveProjectIdForTools ?? projectIdForLogs,
				contextType: effectiveContextType,
				sessionId: session.id,
				entityId: effectiveEntityId,
				logError: logFastChatError
			});

			const isCancelledTurn =
				cancelled === true || finishedReason === 'cancelled' || request.signal.aborted;
			const assistantContent = assistantText.trim();
			if (isCancelledTurn) {
				const interruptedReason = await resolveInterruptedReason({
					supabase,
					userId,
					sessionId: session.id,
					streamRunId: streamRunId ?? undefined,
					requestAborted: request.signal.aborted
				});
				let interruptedMessage = null;
				if (assistantContent.length > 0) {
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
					supabase,
					sessionId: session.id,
					messageId: interruptedMessage?.id ?? null,
					executions: normalizedExecutions,
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					contextType: effectiveContextType,
					interrupted: true,
					logError: logFastChatError
				});
				detachFastChatTask(interruptedToolExecutionPersistPromise, {
					label: 'persist_interrupted_tool_executions',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					contextType: effectiveContextType,
					sessionId: session.id,
					entityId: effectiveEntityId,
					logError: logFastChatError
				});

				finalizationStartedAtMs = Date.now();
				if (!request.signal.aborted) {
					const cancelledLastTurnContext = buildLastTurnContext({
						assistantText: assistantContent,
						userMessage: message,
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
					const cancelledTimingSummary = buildTimingSummary('cancelled');
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
					queueTimingMetric('cancelled');
				} else {
					doneEmittedAtMs = Date.now();
					queueTimingMetric(interruptedReason);
				}
				return;
			}

			const persistedToolTrace = buildPersistedToolTrace(normalizedExecutions);
			const persistedToolTraceSummary = buildPersistedToolTraceSummary(persistedToolTrace);
			assistantPersistStartedAtMs = Date.now();
			const assistantMessage = await sessionService.persistMessage({
				sessionId: session.id,
				userId,
				role: 'assistant',
				content: assistantText.trim(),
				metadata:
					persistedToolTrace.length > 0
						? {
								fastchat_tool_trace_v1: persistedToolTrace,
								fastchat_tool_trace_summary: persistedToolTraceSummary,
								...(clientTurnId ? { client_turn_id: clientTurnId } : {}),
								...(streamRunId ? { stream_run_id: streamRunId } : {})
							}
						: clientTurnId || streamRunId
							? {
									...(clientTurnId ? { client_turn_id: clientTurnId } : {}),
									...(streamRunId ? { stream_run_id: streamRunId } : {})
								}
							: undefined,
				usage,
				idempotencyKey: clientTurnId ? `turn:${clientTurnId}:assistant` : undefined
			});
			assistantPersistedAtMs = Date.now();

			if (!assistantMessage) {
				logFastChatError({
					error: new Error('Failed to persist assistant message'),
					operationType: 'fastchat_persist_message',
					projectId: projectIdForLogs,
					metadata: { role: 'assistant', sessionId: session.id }
				});
			}

			const toolExecutionPersistPromise = persistToolExecutionRows({
				supabase,
				sessionId: session.id,
				messageId: assistantMessage?.id ?? null,
				executions: normalizedExecutions,
				projectId: effectiveProjectIdForTools ?? projectIdForLogs,
				contextType: effectiveContextType,
				logError: logFastChatError
			});
			detachFastChatTask(toolExecutionPersistPromise, {
				label: 'persist_tool_executions',
				projectId: effectiveProjectIdForTools ?? projectIdForLogs,
				contextType: effectiveContextType,
				sessionId: session.id,
				entityId: effectiveEntityId,
				logError: logFastChatError
			});

			const lastTurnContext = buildLastTurnContext({
				assistantText: assistantText.trim(),
				userMessage: message,
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
				{ role: 'user', content: message },
				...buildToolMessageSnapshotsForReconciliation(
					normalizedExecutions,
					executionToolSummaries
				),
				{ role: 'assistant', content: assistantText.trim() }
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
					httpReferer: request.headers.get('referer') ?? undefined
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
			const timingSummary = buildTimingSummary(finishedReason);
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
			await sendTimedMessage(
				{
					type: 'done',
					usage,
					finished_reason: finishedReason
				},
				{
					operationType: 'fastchat_stream_emit_done',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				}
			);
			doneEmittedAtMs = Date.now();
			queueTimingMetric(finishedReason);
		} catch (error) {
			if (request.signal.aborted || isAbortLikeError(error)) {
				doneEmittedAtMs = doneEmittedAtMs ?? Date.now();
				queueTimingMetric('cancelled');
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
			try {
				doneEmittedAtMs = Date.now();
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
				queueTimingMetric('error');
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
		} finally {
			try {
				await agentStream.close();
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

	return agentStream.response;
};
