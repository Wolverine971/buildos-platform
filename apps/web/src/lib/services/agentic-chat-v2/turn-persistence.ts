// apps/web/src/lib/services/agentic-chat-v2/turn-persistence.ts
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolResult,
	Database,
	Json
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { getToolCategory } from '$lib/services/agentic-chat/tools/core/tools.config';
import { searchTelemetryColumns } from '$lib/services/agentic-chat/tools/core/search-telemetry';
import { extractAffectedEntitiesFromToolExecution } from '$lib/services/agentic-chat/tools/core/affected-entities';
import type {
	AgentStateMessageSnapshot,
	AgentStateToolSummary
} from '$lib/services/agentic-chat/state/agent-state-reconciliation-service';
import { extractFastChatToolCallMeta } from '$lib/services/agentic-chat-v2/prompt-observability';
import type { LLMStreamPassMetadata } from './stream-orchestrator/shared';
import { extractToolOpFromToolCall } from './tool-trace';
import type { AgentChatSSEStream } from './stream-events';

const logger = createLogger('API:AgentStreamV2');

type FastChatSupabaseClient = SupabaseClient<Database>;

const TOOL_RESULT_STREAM_EVENTS_PREVIEW_LIMIT = 8;
const TOOL_RESULT_STREAM_EVENTS_PREVIEW_MAX_STRING_LENGTH = 240;
const TOOL_RESULT_STREAM_EVENTS_PREVIEW_MAX_DEPTH = 3;

type ToolExecutionInsertRow = {
	session_id: string;
	message_id: string | null;
	turn_run_id: string | null;
	stream_run_id: string | null;
	client_turn_id: string | null;
	tool_name: string;
	tool_category: string | null;
	gateway_op: string | null;
	help_path: string | null;
	sequence_index: number | null;
	arguments: Json;
	result: Json | null;
	result_count: number | null;
	zero_result: boolean | null;
	execution_time_ms: number | null;
	tokens_consumed: number | null;
	success: boolean;
	error_message: string | null;
	requires_user_action: boolean | null;
	affected_entities: Json;
};

type PersistToolExecutionLogError = (params: {
	error: unknown;
	operationType: string;
	projectId?: string;
	metadata?: Record<string, unknown>;
}) => void;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readMetadataString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveToolResultRequiresUserAction(result: ChatToolResult): boolean | null {
	const direct = result as ChatToolResult & Record<string, unknown>;
	if (typeof direct.requires_user_action === 'boolean') return direct.requires_user_action;
	if (typeof direct.requiresUserAction === 'boolean') return direct.requiresUserAction;
	return inferPayloadRequiresUserAction(result.result);
}

function inferPayloadRequiresUserAction(value: unknown, depth = 0): boolean | null {
	if (!isPlainRecord(value) || depth > 2) return null;

	const direct = value.requires_user_action ?? value.requiresUserAction;
	if (typeof direct === 'boolean') return direct;

	const needsInput = value.needs_input ?? value.needsInput;
	if (typeof needsInput === 'boolean') return needsInput;

	const status = readMetadataString(value.status) ?? readMetadataString(value.state);
	if (
		status &&
		[
			'needs_input',
			'needs input',
			'requires_user_action',
			'user_action_required',
			'waiting_on_user'
		].includes(status.toLowerCase())
	) {
		return true;
	}

	return (
		inferPayloadRequiresUserAction(value.result, depth + 1) ??
		inferPayloadRequiresUserAction(value.data, depth + 1) ??
		null
	);
}

function finiteTelemetryNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildToolResultStreamEventsTelemetry(params: {
	streamEvents?: unknown[];
	streamEventsPreview?: unknown[];
	streamEventCount?: unknown;
}): {
	stream_event_count?: number;
	stream_events_preview?: unknown[];
} {
	const previewSource = params.streamEvents ?? params.streamEventsPreview;
	const streamEventCount =
		finiteTelemetryNumber(params.streamEventCount) ??
		params.streamEvents?.length ??
		params.streamEventsPreview?.length;
	return {
		...(streamEventCount !== undefined ? { stream_event_count: streamEventCount } : {}),
		...(Array.isArray(previewSource)
			? {
					stream_events_preview: sanitizeLogData(previewSource, {
						maxEntries: TOOL_RESULT_STREAM_EVENTS_PREVIEW_LIMIT,
						maxStringLength: TOOL_RESULT_STREAM_EVENTS_PREVIEW_MAX_STRING_LENGTH,
						maxDepth: TOOL_RESULT_STREAM_EVENTS_PREVIEW_MAX_DEPTH
					}) as unknown[]
				}
			: {})
	};
}

export function parseToolArgumentsForPersistence(rawArgs: unknown): Json {
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

export function buildToolResultEventPayload(toolCall: ChatToolCall, result: ChatToolResult) {
	const meta = extractFastChatToolCallMeta(toolCall);
	const argumentsPayload = parseToolArgumentsForPersistence(toolCall.function.arguments);
	const resultPayload = result.success ? normalizeToolResultForPersistence(result.result) : null;
	const searchTelemetry = searchTelemetryColumns({
		toolName: toolCall.function.name,
		success: result.success === true,
		result: result.result
	});
	const toolCategory = getToolCategory(toolCall.function.name) ?? null;
	const affectedEntities = extractAffectedEntitiesFromToolExecution({
		id: result.tool_call_id ?? toolCall.id,
		tool_name: toolCall.function.name,
		gateway_op: meta.canonicalOp,
		arguments: argumentsPayload,
		result: resultPayload,
		success: result.success === true
	});
	const requiresUserAction = resolveToolResultRequiresUserAction(result);
	const resultRecord = result as ChatToolResult & Record<string, unknown>;
	const {
		stream_events: rawStreamEvents,
		streamEvents: rawCamelStreamEvents,
		stream_events_preview: rawStreamEventsPreview,
		streamEventsPreview: rawCamelStreamEventsPreview,
		stream_event_count: rawStreamEventCount,
		streamEventCount: rawCamelStreamEventCount,
		...resultWithoutRawStreamEvents
	} = resultRecord;
	const streamEvents = Array.isArray(rawStreamEvents)
		? rawStreamEvents
		: Array.isArray(rawCamelStreamEvents)
			? rawCamelStreamEvents
			: undefined;
	const streamEventsPreview = Array.isArray(rawStreamEventsPreview)
		? rawStreamEventsPreview
		: Array.isArray(rawCamelStreamEventsPreview)
			? rawCamelStreamEventsPreview
			: undefined;

	return {
		...resultWithoutRawStreamEvents,
		...(searchTelemetry.result_count !== null
			? {
					result_count: searchTelemetry.result_count,
					zero_result: searchTelemetry.zero_result
				}
			: {}),
		...(requiresUserAction !== null ? { requires_user_action: requiresUserAction } : {}),
		...(toolCategory ? { tool_category: toolCategory } : {}),
		...(meta.canonicalOp ? { gateway_op: meta.canonicalOp } : {}),
		...(meta.helpPath ? { help_path: meta.helpPath } : {}),
		affected_entities: affectedEntities,
		...buildToolResultStreamEventsTelemetry({
			streamEvents,
			streamEventsPreview,
			streamEventCount: rawStreamEventCount ?? rawCamelStreamEventCount
		}),
		tool_name: toolCall.function.name,
		tool_call_id: result.tool_call_id ?? toolCall.id
	};
}

export function emitToolResult(
	agentStream: AgentChatSSEStream,
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

export function buildToolResultSummaries(
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

export function buildLLMPassSummary(llmPasses: LLMStreamPassMetadata[] | undefined): {
	passes: Json;
	peak_prompt_tokens: number | null;
	pass_count: number;
	total_llm_duration_ms: number | null;
	max_pass_duration_ms: number | null;
} | null {
	if (!llmPasses?.length) return null;

	const passes = llmPasses.map((pass) => {
		const entry: Record<string, Json> = { pass: pass.pass };
		if (pass.passRole !== undefined) entry.pass_role = pass.passRole;
		if (pass.requestedProfile !== undefined) entry.requested_profile = pass.requestedProfile;
		if (pass.requestedModels !== undefined) entry.requested_models = pass.requestedModels;
		if (pass.modelTieringVariant !== undefined)
			entry.model_tiering_variant = pass.modelTieringVariant;
		if (pass.forcedSynthesisRoutingVariant !== undefined)
			entry.forced_synthesis_routing_variant = pass.forcedSynthesisRoutingVariant;
		if (pass.ignoredProviderSlugs !== undefined)
			entry.ignored_provider_slugs = pass.ignoredProviderSlugs;
		if (pass.maxTokens !== undefined) entry.max_tokens = pass.maxTokens;
		if (pass.retryModelRotation !== undefined)
			entry.retry_model_rotation = pass.retryModelRotation;
		if (pass.attemptRoutes !== undefined) entry.attempt_routes = pass.attemptRoutes as Json;
		if (pass.model !== undefined) entry.model = pass.model;
		if (pass.provider !== undefined) entry.provider = pass.provider;
		if (pass.providerRaw !== undefined) entry.provider_raw = pass.providerRaw;
		if (pass.providerSlug !== undefined) entry.provider_slug = pass.providerSlug;
		if (pass.requestId !== undefined) entry.request_id = pass.requestId;
		if (pass.systemFingerprint !== undefined) entry.system_fingerprint = pass.systemFingerprint;
		if (pass.cacheStatus !== undefined) entry.cache_status = pass.cacheStatus;
		if (pass.finishedReason !== undefined) entry.finished_reason = pass.finishedReason;
		if (typeof pass.promptTokens === 'number') entry.prompt_tokens = pass.promptTokens;
		if (typeof pass.completionTokens === 'number')
			entry.completion_tokens = pass.completionTokens;
		if (typeof pass.totalTokens === 'number') entry.total_tokens = pass.totalTokens;
		if (typeof pass.reasoningTokens === 'number') entry.reasoning_tokens = pass.reasoningTokens;
		if (pass.forcedNoToolSynthesis === true) entry.forced_no_tool_synthesis = true;
		if (typeof pass.suppressedNoToolSynthesisToolCalls === 'number') {
			entry.suppressed_no_tool_synthesis_tool_calls = pass.suppressedNoToolSynthesisToolCalls;
		}
		if (pass.suppressedNoToolSynthesisToolCallDetails?.length) {
			entry.suppressed_no_tool_synthesis_tool_call_details =
				pass.suppressedNoToolSynthesisToolCallDetails as Json;
		}
		if (typeof pass.durationMs === 'number') entry.duration_ms = pass.durationMs;
		if (typeof pass.timeToFirstTokenMs === 'number' || pass.timeToFirstTokenMs === null)
			entry.time_to_first_token_ms = pass.timeToFirstTokenMs;
		if (pass.terminalOutcome !== undefined) entry.terminal_outcome = pass.terminalOutcome;
		if (typeof pass.terminalEventReceived === 'boolean')
			entry.terminal_event_received = pass.terminalEventReceived;
		if (typeof pass.assistantTextCharsReceived === 'number')
			entry.assistant_text_chars_received = pass.assistantTextCharsReceived;
		if (typeof pass.reasoningCharsReceived === 'number')
			entry.reasoning_chars_received = pass.reasoningCharsReceived;
		if (typeof pass.toolCallsReceived === 'number')
			entry.tool_calls_received = pass.toolCallsReceived;
		if (typeof pass.attemptsExhausted === 'boolean')
			entry.attempts_exhausted = pass.attemptsExhausted;
		if (pass.recoveredAsDegradedCompletion === true)
			entry.recovered_as_degraded_completion = true;
		return entry;
	});

	let peak: number | null = null;
	let totalDurationMs = 0;
	let hasDuration = false;
	let maxDurationMs: number | null = null;
	for (const pass of llmPasses) {
		if (typeof pass.promptTokens === 'number' && Number.isFinite(pass.promptTokens)) {
			peak = peak === null ? pass.promptTokens : Math.max(peak, pass.promptTokens);
		}
		if (typeof pass.durationMs === 'number' && Number.isFinite(pass.durationMs)) {
			hasDuration = true;
			totalDurationMs += pass.durationMs;
			maxDurationMs =
				maxDurationMs === null ? pass.durationMs : Math.max(maxDurationMs, pass.durationMs);
		}
	}

	return {
		passes: passes as Json,
		peak_prompt_tokens: peak,
		pass_count: llmPasses.length,
		total_llm_duration_ms: hasDuration ? totalDurationMs : null,
		max_pass_duration_ms: maxDurationMs
	};
}

function buildToolExecutionInsertRows(params: {
	sessionId: string;
	messageId: string | null;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
}): ToolExecutionInsertRow[] {
	if (!Array.isArray(params.executions) || params.executions.length === 0) return [];
	return params.executions.map(({ toolCall, result }, index) => {
		const meta = extractFastChatToolCallMeta(toolCall);
		const argumentsPayload = parseToolArgumentsForPersistence(toolCall.function.arguments);
		const resultPayload = result.success
			? normalizeToolResultForPersistence(result.result)
			: null;
		const searchTelemetry = searchTelemetryColumns({
			toolName: toolCall.function.name,
			success: result.success === true,
			result: result.result
		});
		return {
			session_id: params.sessionId,
			message_id: params.messageId,
			turn_run_id: params.turnRunId ?? null,
			stream_run_id: params.streamRunId ?? null,
			client_turn_id: params.clientTurnId ?? null,
			tool_name: toolCall.function.name,
			tool_category: getToolCategory(toolCall.function.name) ?? null,
			gateway_op: meta.canonicalOp,
			help_path: meta.helpPath,
			sequence_index: index + 1,
			arguments: argumentsPayload,
			result: resultPayload,
			result_count: searchTelemetry.result_count,
			zero_result: searchTelemetry.zero_result,
			execution_time_ms:
				typeof result.duration_ms === 'number' && Number.isFinite(result.duration_ms)
					? result.duration_ms
					: null,
			tokens_consumed:
				typeof (result as ChatToolResult & { tokens_consumed?: number }).tokens_consumed ===
					'number' &&
				Number.isFinite(
					(result as ChatToolResult & { tokens_consumed?: number }).tokens_consumed
				)
					? (result as ChatToolResult & { tokens_consumed?: number }).tokens_consumed!
					: null,
			success: result.success === true,
			error_message: typeof result.error === 'string' ? result.error : null,
			requires_user_action: resolveToolResultRequiresUserAction(result),
			affected_entities: extractAffectedEntitiesFromToolExecution({
				id: (toolCall as { id?: string }).id ?? `${toolCall.function.name}-${index + 1}`,
				tool_name: toolCall.function.name,
				gateway_op: meta.canonicalOp,
				arguments: argumentsPayload,
				result: resultPayload,
				success: result.success === true
			}) as unknown as Json
		};
	});
}

export async function persistIncrementalToolExecutionRow(params: {
	supabase: FastChatSupabaseClient;
	sessionId: string;
	turnRunId: string;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	toolCall: ChatToolCall;
	result: ChatToolResult;
	sequenceIndex: number;
}): Promise<boolean> {
	const rows = buildToolExecutionInsertRows({
		sessionId: params.sessionId,
		messageId: null,
		turnRunId: params.turnRunId,
		streamRunId: params.streamRunId,
		clientTurnId: params.clientTurnId,
		executions: [{ toolCall: params.toolCall, result: params.result }]
	});
	const row = rows[0];
	if (!row) return false;
	row.sequence_index = params.sequenceIndex;
	const { error } = await params.supabase.from('chat_tool_executions').insert(rows);
	if (error) throw error;
	return true;
}

export async function persistToolExecutionRows(params: {
	supabase: FastChatSupabaseClient;
	sessionId: string;
	messageId: string | null;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
	projectId?: string;
	contextType: ChatContextType;
	interrupted?: boolean;
	persistedSequenceIndices?: ReadonlySet<number>;
	logError?: PersistToolExecutionLogError;
}): Promise<void> {
	const rows = buildToolExecutionInsertRows({
		sessionId: params.sessionId,
		messageId: params.messageId,
		turnRunId: params.turnRunId,
		streamRunId: params.streamRunId,
		clientTurnId: params.clientTurnId,
		executions: params.executions
	});
	if (rows.length === 0) return;

	const persisted = params.persistedSequenceIndices;
	const hasPersisted = Boolean(persisted && persisted.size > 0);

	if (hasPersisted && params.messageId && params.turnRunId) {
		const attachSequences = rows
			.map((row) => row.sequence_index)
			.filter(
				(seq): seq is number =>
					typeof seq === 'number' && (persisted as ReadonlySet<number>).has(seq)
			);
		if (attachSequences.length > 0) {
			const { error: attachError } = await params.supabase
				.from('chat_tool_executions')
				.update({ message_id: params.messageId })
				.eq('turn_run_id', params.turnRunId)
				.eq('session_id', params.sessionId)
				.in('sequence_index', attachSequences);
			if (attachError) {
				logger.warn('Failed to attach assistant message to incremental tool executions', {
					error: attachError,
					sessionId: params.sessionId
				});
				params.logError?.({
					error: attachError,
					operationType: 'fastchat_attach_tool_execution_message',
					projectId: params.projectId,
					metadata: {
						sessionId: params.sessionId,
						messageId: params.messageId,
						turnRunId: params.turnRunId,
						attachCount: attachSequences.length,
						contextType: params.contextType
					}
				});
			}
		}
	}

	const rowsToInsert = hasPersisted
		? rows.filter(
				(row) =>
					row.sequence_index == null ||
					!(persisted as ReadonlySet<number>).has(row.sequence_index)
			)
		: rows;
	if (rowsToInsert.length === 0) return;

	const { error } = await params.supabase.from('chat_tool_executions').insert(rowsToInsert);
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
			toolExecutionCount: rowsToInsert.length,
			contextType: params.contextType,
			...(params.interrupted ? { interrupted: true } : {})
		}
	});
}

export function buildToolMessageSnapshotsForReconciliation(
	executions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>,
	toolSummaries: AgentStateToolSummary[]
): AgentStateMessageSnapshot[] {
	if (!executions.length) return [];
	return executions.map(({ toolCall, result }, index) => {
		const summary = toolSummaries[index];
		const contentPayload = {
			tool_name: toolCall.function.name,
			op: extractToolOpFromToolCall(toolCall),
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
