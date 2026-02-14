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
import { ApiResponse } from '$lib/utils/api-response';
import { SSEResponse } from '$lib/utils/sse-response';
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	ContextShiftPayload,
	ContextUsageSnapshot,
	LastTurnContext,
	OperationEventPayload
} from '@buildos/shared-types';
import type { ServiceContext } from '$lib/services/agentic-chat/shared/types';
import type { AgentState } from '$lib/types/agent-chat-enhancement';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor-refactored';
import { ToolExecutionService } from '$lib/services/agentic-chat/execution/tool-execution-service';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
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

const logger = createLogger('API:AgentStreamV2');
const FASTCHAT_STREAM_ENDPOINT = '/api/agent/v2/stream';
const FASTCHAT_STREAM_METHOD = 'POST';

const FASTCHAT_CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000;
const FASTCHAT_CONTEXT_CACHE_VERSION = 1;
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

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

async function parseRequest(request: Request): Promise<FastAgentStreamRequest> {
	const body = (await request.json()) as FastAgentStreamRequest;
	return body;
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
			logger.warn('Project access RPC failed; allowing fast path', { error, projectId });
			if (errorLogger) {
				void errorLogger.logError(error, {
					userId: context?.userId,
					endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
					httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
					operationType: 'fastchat_project_access',
					metadata: { projectId, reason: 'rpc_failed' }
				});
			}
			return { allowed: true, reason: 'rpc_failed' };
		}

		return { allowed: !!data, reason: data ? 'ok' : 'denied' };
	} catch (error) {
		logger.warn('Project access check failed; allowing fast path', { error, projectId });
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId: context?.userId,
				endpoint: context?.endpoint ?? FASTCHAT_STREAM_ENDPOINT,
				httpMethod: context?.httpMethod ?? FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_project_access',
				metadata: { projectId, reason: 'exception' }
			});
		}
		return { allowed: true, reason: 'exception' };
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

type FastChatContextCache = {
	version: number;
	key: string;
	created_at: string;
	context: {
		contextType: ChatContextType;
		entityId?: string | null;
		projectId?: string | null;
		projectName?: string | null;
		focusEntityType?: string | null;
		focusEntityId?: string | null;
		focusEntityName?: string | null;
		data?: Record<string, unknown> | string | null;
	};
};

const OPERATION_ENTITY_TYPES: OperationEventPayload['entity_type'][] = [
	'document',
	'task',
	'goal',
	'plan',
	'project',
	'milestone',
	'risk',
	'requirement'
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

function buildContextCacheKey(params: {
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: { focusType?: string | null; focusEntityId?: string | null; projectId?: string };
}): string {
	const focusType = params.projectFocus?.focusType ?? null;
	const focusEntityId = params.projectFocus?.focusEntityId ?? null;
	const projectId = params.projectFocus?.projectId ?? params.entityId ?? null;
	return [
		'v2',
		params.contextType,
		projectId ?? 'none',
		focusType ?? 'none',
		focusEntityId ?? 'none'
	].join('|');
}

function isCacheFresh(cache: FastChatContextCache | null | undefined): boolean {
	if (!cache?.created_at) return false;
	const createdAt = Date.parse(cache.created_at);
	if (Number.isNaN(createdAt)) return false;
	return Date.now() - createdAt <= FASTCHAT_CONTEXT_CACHE_TTL_MS;
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

	const { data, error } = await supabase
		.from('chat_sessions')
		.select('agent_metadata')
		.eq('id', sessionId)
		.maybeSingle();

	if (error) {
		logger.warn('Failed to load agent metadata for update', { error, sessionId });
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
					stage: 'select',
					patch: sanitizeLogData(patch)
				}
			});
		}
		return;
	}

	const current = (data?.agent_metadata ?? {}) as Record<string, unknown>;
	const next = {
		...current,
		...patch
	};

	const { error: updateError } = await supabase
		.from('chat_sessions')
		.update({ agent_metadata: next, updated_at: new Date().toISOString() })
		.eq('id', sessionId);

	if (updateError) {
		logger.warn('Failed to update agent metadata', { updateError, sessionId });
		if (errorLogger) {
			void errorLogger.logError(updateError, {
				userId: options?.userId,
				projectId: options?.projectId,
				endpoint: FASTCHAT_STREAM_ENDPOINT,
				httpMethod: FASTCHAT_STREAM_METHOD,
				operationType: 'fastchat_update_agent_metadata',
				tableName: 'chat_sessions',
				recordId: sessionId,
				metadata: {
					stage: 'update',
					patch: sanitizeLogData(patch)
				}
			});
		}
	}
}

function emitOperation(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	operation: OperationEventPayload,
	onError?: (error: unknown) => void
): void {
	void agentStream.sendMessage({ type: 'operation', operation }).catch((error) => {
		logger.warn('Failed to emit operation event', { error, operation });
		onError?.(error);
	});
}

function emitContextUsage(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	usage: ContextUsageSnapshot,
	onError?: (error: unknown) => void
): void {
	void agentStream.sendMessage({ type: 'context_usage', usage }).catch((error) => {
		logger.warn('Failed to emit context usage', { error });
		onError?.(error);
	});
}

function emitToolCall(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	toolCall: ChatToolCall,
	onError?: (error: unknown) => void
): void {
	void agentStream.sendMessage({ type: 'tool_call', tool_call: toolCall }).catch((error) => {
		logger.warn('Failed to emit tool_call', { error, toolCall });
		onError?.(error);
	});
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
	onError?: (error: unknown) => void
): void {
	const payload = buildToolResultEventPayload(toolCall, result);
	void agentStream.sendMessage({ type: 'tool_result', result: payload }).catch((error) => {
		logger.warn('Failed to emit tool_result', { error, toolCall });
		onError?.(error);
	});
}

const CONTEXT_SHIFT_ENTITY_TYPES: ContextShiftPayload['entity_type'][] = [
	'project',
	'task',
	'plan',
	'goal',
	'document',
	'milestone',
	'risk',
	'requirement'
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
	onError?: (error: unknown) => void
): Promise<void> {
	try {
		await agentStream.sendMessage({ type: 'context_shift', context_shift: contextShift });
	} catch (error) {
		logger.warn('Failed to emit context_shift', { error, contextShift });
		onError?.(error);
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

function appendUniqueId(values: string[] | undefined, value: string): string[] {
	const next = values ? [...values] : [];
	if (!next.includes(value)) next.push(value);
	return next;
}

function assignLastTurnEntity(
	entities: LastTurnContext['entities'],
	entityType: string | undefined,
	entityId: string | undefined
): void {
	if (!entityType || !entityId) return;
	const normalizedType = entityType.toLowerCase();
	switch (normalizedType) {
		case 'project':
			entities.project_id = entities.project_id ?? entityId;
			break;
		case 'task':
			entities.task_ids = appendUniqueId(entities.task_ids, entityId);
			break;
		case 'goal':
			entities.goal_ids = appendUniqueId(entities.goal_ids, entityId);
			break;
		case 'plan':
			entities.plan_id = entities.plan_id ?? entityId;
			break;
		case 'document':
			entities.document_id = entities.document_id ?? entityId;
			break;
		default:
			break;
	}
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
		normalizeTextValue(record.entity_id ?? record.entityId)
	);
	assignLastTurnEntity(entities, 'project', normalizeTextValue(record.project_id));
	assignLastTurnEntity(entities, 'task', normalizeTextValue(record.task_id));
	assignLastTurnEntity(entities, 'goal', normalizeTextValue(record.goal_id));
	assignLastTurnEntity(entities, 'plan', normalizeTextValue(record.plan_id));
	assignLastTurnEntity(entities, 'document', normalizeTextValue(record.document_id));

	const taskIds = Array.isArray(record.task_ids) ? record.task_ids : [];
	for (const taskId of taskIds) {
		assignLastTurnEntity(entities, 'task', normalizeTextValue(taskId));
	}
	const goalIds = Array.isArray(record.goal_ids) ? record.goal_ids : [];
	for (const goalId of goalIds) {
		assignLastTurnEntity(entities, 'goal', normalizeTextValue(goalId));
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
		assignLastTurnEntity(entities, key, extractEntityIdFromRecord(record[key]));
	}

	const pluralKeys: Array<{ key: string; entityType: string }> = [
		{ key: 'projects', entityType: 'project' },
		{ key: 'tasks', entityType: 'task' },
		{ key: 'goals', entityType: 'goal' },
		{ key: 'plans', entityType: 'plan' },
		{ key: 'documents', entityType: 'document' }
	];
	for (const { key, entityType } of pluralKeys) {
		if (!Array.isArray(record[key])) continue;
		for (const item of record[key] as unknown[]) {
			assignLastTurnEntity(entities, entityType, extractEntityIdFromRecord(item));
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
	if (entities.project_id) refs.push(`project:${entities.project_id}`);
	if (entities.plan_id) refs.push(`plan:${entities.plan_id}`);
	if (entities.document_id) refs.push(`document:${entities.document_id}`);
	if (entities.task_ids?.length) refs.push(`tasks:${entities.task_ids.slice(0, 4).join(',')}`);
	if (entities.goal_ids?.length) refs.push(`goals:${entities.goal_ids.slice(0, 4).join(',')}`);
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
			normalizeTextValue(params.contextShift.entity_id)
		);
	}

	const effectiveContextType = params.contextShift?.new_context ?? params.contextType;
	if (isProjectScopedContext(effectiveContextType) && params.entityId && !entities.project_id) {
		entities.project_id = params.entityId;
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
	'requirement',
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

	const initialContextType = normalizeFastContextType(streamRequest.context_type);
	if (isDailyBriefContext(initialContextType)) {
		const briefEntityId = streamRequest.entity_id?.trim();
		if (!briefEntityId) {
			return ApiResponse.badRequest('daily_brief context requires a brief entity_id');
		}
	}

	const agentStream = SSEResponse.createChatStream();

	void agentStream
		.sendMessage({
			type: 'agent_state',
			state: 'thinking',
			details: 'BuildOS is processing your request...'
		})
		.catch((error) => {
			logger.warn('Failed to emit initial agent state', { error });
			logFastChatError({
				error,
				operationType: 'fastchat_stream_emit_agent_state',
				metadata: { streamStage: 'initial_thinking_state' }
			});
		});

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
					await agentStream.sendMessage({
						type: 'error',
						error: 'Brief context requires a brief ID.'
					});
					await agentStream.sendMessage({
						type: 'done',
						usage: { total_tokens: 0 },
						finished_reason: 'error'
					});
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
					await agentStream.sendMessage({
						type: 'error',
						error: 'Access denied for the selected brief.'
					});
					await agentStream.sendMessage({
						type: 'done',
						usage: { total_tokens: 0 },
						finished_reason: 'error'
					});
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
					await agentStream.sendMessage({
						type: 'error',
						error: 'Access denied for the selected project.'
					});
					await agentStream.sendMessage({
						type: 'done',
						usage: { total_tokens: 0 },
						finished_reason: 'error'
					});
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

			await agentStream.sendMessage({ type: 'session', session });

			const requestLastTurnContext =
				streamRequest.lastTurnContext ?? streamRequest.last_turn_context ?? null;
			const history = await sessionService.loadRecentMessages(
				session.id,
				FASTCHAT_HISTORY_LOOKBACK_MESSAGES
			);
			const continuityHint = buildLastTurnContinuityHint(requestLastTurnContext);
			const conversationSummary =
				typeof session.summary === 'string' ? session.summary : null;
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
			const historyForModel = historyComposition.historyForModel;
			const sessionMetadata = (session.agent_metadata ?? {}) as Record<string, any>;
			const cacheKey = buildContextCacheKey({ contextType, entityId, projectFocus });
			const cachedContext = sessionMetadata.fastchat_context_cache as
				| FastChatContextCache
				| undefined;

			const userMessagePromise = sessionService.persistMessage({
				sessionId: session.id,
				userId,
				role: 'user',
				content: message,
				metadata: voiceGroupId ? { voice_note_group_id: voiceGroupId } : undefined
			});

			const llm = new SmartLLMService({
				supabase,
				httpReferer: request.headers.get('referer') ?? undefined,
				appName: 'BuildOS Agentic Chat V2'
			});
			const gatewayEnabled = isToolGatewayEnabled();
			const tools = selectFastChatTools({ contextType, message });
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
			try {
				if (
					cachedContext &&
					cachedContext.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
					cachedContext.key === cacheKey &&
					isCacheFresh(cachedContext)
				) {
					promptContext = { ...cachedContext.context };
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

					void updateAgentMetadata(
						supabase,
						session.id,
						{
							fastchat_context_cache: {
								version: FASTCHAT_CONTEXT_CACHE_VERSION,
								key: cacheKey,
								created_at: new Date().toISOString(),
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
							}
						},
						{
							errorLogger,
							userId,
							projectId: projectIdForLogs
						}
					);
				}

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
				emitContextUsage(agentStream, usageSnapshot, (error) => {
					logFastChatError({
						error,
						operationType: 'fastchat_stream_emit_context_usage',
						projectId: projectIdForLogs,
						metadata: { sessionId: session.id, contextType }
					});
				});
			} catch (error) {
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

			const { assistantText, usage, finishedReason, toolExecutions } = await streamFastChat({
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
								conversationHistory: [],
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
					emitToolCall(agentStream, patchedCall, (error) => {
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
					});
				},
				onToolResult: async ({ toolCall, result }) => {
					const patchedCall = patchToolCall(toolCall);
					emitToolResult(agentStream, patchedCall, result, (error) => {
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
					});
					if (!result.success) {
						logFastChatError({
							error: new Error(result.error ?? 'FastChat tool execution failed'),
							operationType: 'fastchat_tool_result_failure',
							projectId: effectiveProjectIdForTools ?? projectIdForLogs,
							metadata: {
								sessionId: session.id,
								contextType: effectiveContextType,
								entityId: effectiveEntityId,
								toolName: patchedCall.function.name,
								toolCallId: patchedCall.id,
								toolError: result.error
							}
						});
					}

					const contextShift = extractContextShiftPayload(result);
					if (contextShift) {
						effectiveContextType = contextShift.new_context;
						effectiveEntityId = contextShift.entity_id;
						latestContextShift = contextShift;
						if (isProjectScopedContext(contextShift.new_context)) {
							effectiveProjectIdForTools = contextShift.entity_id;
						}
						await emitContextShift(agentStream, contextShift, (error) => {
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
						});
					}
				},
				onDelta: async (delta) => {
					try {
						await agentStream.sendMessage({ type: 'text_delta', content: delta });
					} catch (error) {
						logFastChatError({
							error,
							operationType: 'fastchat_stream_emit_delta',
							projectId: effectiveProjectIdForTools ?? projectIdForLogs,
							metadata: {
								sessionId: session.id,
								contextType: effectiveContextType
							}
						});
						throw error;
					}
				}
			});

			const [userMessage] = await Promise.all([
				userMessagePromise.catch((error) => {
					logger.warn('Failed to persist user message', { error, sessionId: session.id });
					logFastChatError({
						error,
						operationType: 'fastchat_persist_message',
						projectId: projectIdForLogs,
						metadata: { role: 'user', sessionId: session.id }
					});
					return null;
				})
			]);

			if (voiceGroupId && userMessage?.id) {
				await sessionService.attachVoiceNoteGroup({
					groupId: voiceGroupId,
					userId,
					sessionId: session.id,
					messageId: userMessage.id
				});
			}

			const assistantMessage = await sessionService.persistMessage({
				sessionId: session.id,
				userId,
				role: 'assistant',
				content: assistantText.trim(),
				usage
			});

			if (!assistantMessage) {
				logFastChatError({
					error: new Error('Failed to persist assistant message'),
					operationType: 'fastchat_persist_message',
					projectId: projectIdForLogs,
					metadata: { role: 'assistant', sessionId: session.id }
				});
			}

			await sessionService.updateSessionStats({
				session,
				messageCountDelta: 2,
				totalTokensDelta: usage?.total_tokens ?? 0,
				contextType: effectiveContextType,
				entityId: effectiveEntityId
			});

			const lastTurnContext = buildLastTurnContext({
				assistantText: assistantText.trim(),
				userMessage: message,
				contextType: effectiveContextType,
				entityId: effectiveEntityId,
				contextShift: latestContextShift,
				toolExecutions: toolExecutions ?? [],
				timestamp: assistantMessage?.created_at ?? new Date().toISOString()
			});
			try {
				await agentStream.sendMessage({
					type: 'last_turn_context',
					context: lastTurnContext
				});
			} catch (error) {
				logger.warn('Failed to emit last_turn_context', { error, sessionId: session.id });
				logFastChatError({
					error,
					operationType: 'fastchat_stream_emit_last_turn_context',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				});
			}

			await agentStream.sendMessage({
				type: 'done',
				usage,
				finished_reason: finishedReason
			});

			const summarizerMessages: AgentStateMessageSnapshot[] = [
				...history.map((item) => ({
					role: item.role,
					content: item.content
				})),
				{ role: 'user', content: message },
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
				...buildToolResultSummaries(toolExecutions ?? [])
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

				if (updated) {
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
				}
			})().catch((error) => {
				logger.warn('FastChat agent_state reconciliation failed', { error });
				logFastChatError({
					error,
					operationType: 'fastchat_agent_state_reconciliation',
					projectId: effectiveProjectIdForTools ?? projectIdForLogs,
					metadata: { sessionId: session.id, contextType: effectiveContextType }
				});
			});
		} catch (error) {
			logger.error('Agent V2 stream error', { error });
			logFastChatError({
				error,
				operationType: 'fastchat_stream',
				projectId: projectIdForLogs,
				metadata: { contextType, entityId, sessionId: streamRequest.session_id }
			});
			try {
				await agentStream.sendMessage({
					type: 'error',
					error: 'An error occurred while streaming.'
				});
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
				await agentStream.sendMessage({
					type: 'done',
					usage: { total_tokens: 0 },
					finished_reason: 'error'
				});
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
