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
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	ContextUsageSnapshot,
	OperationEventPayload
} from '@buildos/shared-types';
import type { AgentState } from '$lib/types/agent-chat-enhancement';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor-refactored';
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
	selectFastChatTools,
	streamFastChat,
	type FastAgentStreamRequest
} from '$lib/services/agentic-chat-v2';

const logger = createLogger('API:AgentStreamV2');

const FASTCHAT_CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000;
const FASTCHAT_CONTEXT_CACHE_VERSION = 1;

async function parseRequest(request: Request): Promise<FastAgentStreamRequest> {
	const body = (await request.json()) as FastAgentStreamRequest;
	return body;
}

async function checkProjectAccess(
	supabase: any,
	projectId: string,
	errorLogger?: ErrorLoggerService
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
				operationType: 'fastchat_project_access',
				metadata: { projectId, reason: 'exception' }
			});
		}
		return { allowed: true, reason: 'exception' };
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
	errorLogger?: ErrorLoggerService
): Promise<void> {
	const { data, error } = await supabase
		.from('chat_sessions')
		.select('agent_metadata')
		.eq('id', sessionId)
		.maybeSingle();

	if (error) {
		logger.warn('Failed to load agent metadata for update', { error, sessionId });
		if (errorLogger) {
			void errorLogger.logDatabaseError(error, 'SELECT', 'chat_sessions', sessionId, {
				operation: 'fastchat_update_agent_metadata'
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
			void errorLogger.logDatabaseError(updateError, 'UPDATE', 'chat_sessions', sessionId, {
				operation: 'fastchat_update_agent_metadata'
			});
		}
	}
}

function emitOperation(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	operation: OperationEventPayload
): void {
	void agentStream
		.sendMessage({ type: 'operation', operation })
		.catch((error) => logger.warn('Failed to emit operation event', { error, operation }));
}

function emitContextUsage(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	usage: ContextUsageSnapshot
): void {
	void agentStream
		.sendMessage({ type: 'context_usage', usage })
		.catch((error) => logger.warn('Failed to emit context usage', { error }));
}

function emitToolCall(
	agentStream: ReturnType<typeof SSEResponse.createChatStream>,
	toolCall: ChatToolCall
): void {
	void agentStream
		.sendMessage({ type: 'tool_call', tool_call: toolCall })
		.catch((error) => logger.warn('Failed to emit tool_call', { error, toolCall }));
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
	result: ChatToolResult
): void {
	const payload = buildToolResultEventPayload(toolCall, result);
	void agentStream
		.sendMessage({ type: 'tool_result', result: payload })
		.catch((error) => logger.warn('Failed to emit tool_result', { error, toolCall }));
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

function emitContextOperations(
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

	let streamRequest: FastAgentStreamRequest;
	try {
		streamRequest = await parseRequest(request);
	} catch (error) {
		logger.warn('Failed to parse V2 stream request', { error });
		return ApiResponse.badRequest('Invalid request body');
	}

	const message = streamRequest.message?.trim();
	if (!message) {
		return ApiResponse.badRequest('Message is required');
	}

	const agentStream = SSEResponse.createChatStream();
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	void agentStream
		.sendMessage({
			type: 'agent_state',
			state: 'thinking',
			details: 'BuildOS is processing your request...'
		})
		.catch((error) => logger.warn('Failed to emit initial agent state', { error }));

	void (async () => {
		const sessionService = createFastChatSessionService(supabase);
		const contextType = normalizeFastContextType(streamRequest.context_type);
		const projectFocus = streamRequest.projectFocus ?? undefined;
		const entityId = streamRequest.entity_id ?? projectFocus?.projectId ?? undefined;
		const voiceGroupId =
			typeof streamRequest.voiceNoteGroupId === 'string'
				? streamRequest.voiceNoteGroupId
				: typeof streamRequest.voice_note_group_id === 'string'
					? streamRequest.voice_note_group_id
					: undefined;

		try {
			if (
				(contextType === 'project' ||
					contextType === 'project_audit' ||
					contextType === 'project_forecast') &&
				entityId
			) {
				const accessResult = await checkProjectAccess(supabase, entityId, errorLogger);
				if (!accessResult.allowed) {
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
				userId: user.id,
				contextType,
				entityId,
				projectFocus
			});

			await agentStream.sendMessage({ type: 'session', session });

			const history = await sessionService.loadRecentMessages(session.id, 10);
			const sessionMetadata = (session.agent_metadata ?? {}) as Record<string, any>;
			const cacheKey = buildContextCacheKey({ contextType, entityId, projectFocus });
			const cachedContext = sessionMetadata.fastchat_context_cache as
				| FastChatContextCache
				| undefined;

			const userMessagePromise = sessionService.persistMessage({
				sessionId: session.id,
				userId: user.id,
				role: 'user',
				content: message,
				metadata: voiceGroupId ? { voice_note_group_id: voiceGroupId } : undefined
			});

			const llm = new SmartLLMService({
				supabase,
				httpReferer: request.headers.get('referer') ?? undefined,
				appName: 'BuildOS Agentic Chat V2'
			});
			const tools = selectFastChatTools({ contextType, message });
			const toolsRequiringProjectId = getToolsRequiringProjectId(tools);
			const projectIdForTools =
				projectFocus?.projectId ??
				((contextType === 'project' ||
					contextType === 'project_audit' ||
					contextType === 'project_forecast') &&
				typeof entityId === 'string'
					? entityId
					: undefined);
			const toolExecutor =
				tools.length > 0
					? new ChatToolExecutor(supabase, user.id, session.id, fetch, llm)
					: undefined;
			const patchToolCall = (toolCall: ChatToolCall) => {
				if (toolCall.function.name === 'update_onto_document'){
					console.log(toolCall.function)
				}

				let resp = maybeInjectProjectId(toolCall, projectIdForTools, toolsRequiringProjectId);
				return resp
			}

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
						userId: user.id,
						contextType,
						entityId,
						projectFocus
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
						errorLogger
					);
				}

				const agentState =
					(sessionMetadata.agent_state as AgentState | undefined) ??
					buildEmptyAgentState(session.id);
				const conversationSummary =
					typeof session.summary === 'string' ? session.summary : null;

				promptContext.agentState = JSON.stringify(agentState);
				promptContext.conversationSummary = conversationSummary;

				systemPrompt = buildMasterPrompt(promptContext);
				emitContextOperations(agentStream, {
					contextType,
					data: promptContext.data,
					projectName: promptContext.projectName,
					focusEntityType: promptContext.focusEntityType,
					focusEntityName: promptContext.focusEntityName
				});

				const usageSnapshot = buildFastContextUsageSnapshot({
					systemPrompt,
					history,
					userMessage: message
				});
				emitContextUsage(agentStream, usageSnapshot);
			} catch (error) {
				logger.warn('Failed to build fast chat prompt context', { error });
				void errorLogger.logError(error, {
					userId: user.id,
					projectId: projectFocus?.projectId ?? undefined,
					operationType: 'fastchat_context_build',
					metadata: {
						contextType,
						entityId,
						projectFocus
					}
				});
			}

			const { assistantText, usage, finishedReason, toolExecutions } = await streamFastChat({
				llm,
				userId: user.id,
				sessionId: session.id,
				contextType,
				entityId,
				projectId: projectFocus?.projectId ?? (contextType === 'project' ? entityId : null),
				history,
				message,
				signal: request.signal,
				systemPrompt,
				tools,
				toolExecutor: toolExecutor
					? (toolCall) => toolExecutor.execute(patchToolCall(toolCall))
					: undefined,
				onToolCall: async (toolCall) => {
					emitToolCall(agentStream, patchToolCall(toolCall));
				},
				onToolResult: async ({ toolCall, result }) => {
					emitToolResult(agentStream, patchToolCall(toolCall), result);
				},
				onDelta: async (delta) => {
					await agentStream.sendMessage({ type: 'text_delta', content: delta });
				}
			});

			const [userMessage] = await Promise.all([
				userMessagePromise.catch((error) => {
					logger.warn('Failed to persist user message', { error, sessionId: session.id });
					void errorLogger.logError(error, {
						userId: user.id,
						projectId: projectFocus?.projectId ?? undefined,
						operationType: 'fastchat_persist_message',
						metadata: { role: 'user', sessionId: session.id }
					});
					return null;
				})
			]);

			if (voiceGroupId && userMessage?.id) {
				await sessionService.attachVoiceNoteGroup({
					groupId: voiceGroupId,
					userId: user.id,
					sessionId: session.id,
					messageId: userMessage.id
				});
			}

			const assistantMessage = await sessionService.persistMessage({
				sessionId: session.id,
				userId: user.id,
				role: 'assistant',
				content: assistantText.trim(),
				usage
			});

			if (!assistantMessage) {
				void errorLogger.logError(new Error('Failed to persist assistant message'), {
					userId: user.id,
					projectId: projectFocus?.projectId ?? undefined,
					operationType: 'fastchat_persist_message',
					metadata: { role: 'assistant', sessionId: session.id }
				});
			}

			await sessionService.updateSessionStats({
				session,
				messageCountDelta: 2,
				totalTokensDelta: usage?.total_tokens ?? 0,
				contextType,
				entityId: entityId ?? null
			});

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
				const currentState =
					(sessionMetadata.agent_state as AgentState | undefined) ??
					buildEmptyAgentState(session.id);
				const updated = await reconciliation.reconcile({
					sessionId: session.id,
					userId: user.id,
					contextType,
					messages: summarizerMessages,
					toolResults: toolSummaries,
					agentState: currentState,
					httpReferer: request.headers.get('referer') ?? undefined
				});

				if (updated) {
					await updateAgentMetadata(
						supabase,
						session.id,
						{
							agent_state: updated
						},
						errorLogger
					);
				}
			})().catch((error) => {
				logger.warn('FastChat agent_state reconciliation failed', { error });
				void errorLogger.logError(error, {
					userId: user.id,
					projectId: projectFocus?.projectId ?? undefined,
					operationType: 'fastchat_agent_state_reconciliation',
					metadata: { sessionId: session.id, contextType }
				});
			});
		} catch (error) {
			logger.error('Agent V2 stream error', { error });
			void errorLogger.logError(error, {
				userId: user.id,
				projectId: projectFocus?.projectId ?? undefined,
				operationType: 'fastchat_stream',
				metadata: { contextType, entityId, sessionId: streamRequest.session_id }
			});
			await agentStream.sendMessage({
				type: 'error',
				error: 'An error occurred while streaming.'
			});
			await agentStream.sendMessage({
				type: 'done',
				usage: { total_tokens: 0 },
				finished_reason: 'error'
			});
		} finally {
			await agentStream.close();
		}
	})();

	return agentStream.response;
};
