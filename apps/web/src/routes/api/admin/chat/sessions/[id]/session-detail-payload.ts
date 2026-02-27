// apps/web/src/routes/api/admin/chat/sessions/[id]/session-detail-payload.ts
type TimelineSeverity = 'info' | 'success' | 'warning' | 'error';
type TimelineType =
	| 'session'
	| 'message'
	| 'tool_execution'
	| 'llm_call'
	| 'operation'
	| 'context_shift'
	| 'timing';

export interface TimelineEvent {
	id: string;
	timestamp: string;
	type: TimelineType;
	severity: TimelineSeverity;
	title: string;
	summary: string;
	turn_index: number | null;
	payload: Record<string, unknown>;
}

interface SessionUserRow {
	id?: string | null;
	email?: string | null;
	name?: string | null;
}

export interface SessionRow {
	id: string;
	user_id: string;
	title?: string | null;
	auto_title?: string | null;
	summary?: string | null;
	status?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	message_count?: number | string | null;
	total_tokens_used?: number | string | null;
	tool_call_count?: number | string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	agent_metadata?: unknown;
	users?: SessionUserRow | null;
}

export interface MessageRow {
	id: string;
	role?: string | null;
	content?: string | null;
	created_at?: string | null;
	metadata?: unknown;
	tool_call_id?: string | null;
	tool_calls?: unknown;
	tool_name?: string | null;
	tool_result?: unknown;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	message_type?: string | null;
	error_message?: string | null;
	error_code?: string | null;
	operation_ids?: unknown;
}

export interface ToolExecutionRow {
	id: string;
	message_id?: string | null;
	tool_name?: string | null;
	tool_category?: string | null;
	arguments?: unknown;
	result?: unknown;
	execution_time_ms?: number | string | null;
	tokens_consumed?: number | string | null;
	success?: boolean | null;
	error_message?: string | null;
	requires_user_action?: boolean | null;
	created_at?: string | null;
}

export interface LlmCallRow {
	id: string;
	operation_type?: string | null;
	model_requested?: string | null;
	model_used?: string | null;
	provider?: string | null;
	status?: string | null;
	error_message?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	total_cost_usd?: number | string | null;
	response_time_ms?: number | string | null;
	request_started_at?: string | null;
	request_completed_at?: string | null;
	created_at?: string | null;
	metadata?: unknown;
	openrouter_request_id?: string | null;
	openrouter_cache_status?: string | null;
	streaming?: boolean | null;
}

export interface OperationRow {
	id: string;
	operation_type?: string | null;
	table_name?: string | null;
	status?: string | null;
	reasoning?: string | null;
	data?: unknown;
	result?: unknown;
	error_message?: string | null;
	duration_ms?: number | string | null;
	created_at?: string | null;
	executed_at?: string | null;
	sequence_number?: number | string | null;
}

export interface TimingDataRow extends Record<string, unknown> {
	id?: string | null;
	message_received_at?: string | null;
	created_at?: string | null;
	time_to_first_response_ms?: number | string | null;
	time_to_first_event_ms?: number | string | null;
}

const COST_PER_MILLION_TOKENS_USD = 0.21;

const asNumber = (value: unknown): number => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const toIsoOrFallback = (value: string | null | undefined, fallback: string): string =>
	value ?? fallback;

const summarizeText = (value: string | null | undefined, maxChars = 160): string => {
	const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

const sessionTitle = (session: SessionRow, firstUserMessage?: string | null): string => {
	const explicit = session.title?.trim() || session.auto_title?.trim();
	if (explicit) return explicit;
	if (session.summary?.trim()) return summarizeText(session.summary, 120);
	if (firstUserMessage?.trim()) return summarizeText(firstUserMessage, 120);
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `Agent Session (${contextType})`;
};

const resolveTurnIndex = (timestamp: string, userMessageTimestamps: string[]): number | null => {
	if (!userMessageTimestamps.length) return null;
	let turn = 0;
	for (const userTs of userMessageTimestamps) {
		if (userTs <= timestamp) turn += 1;
	}
	return turn > 0 ? turn : null;
};

const formatCost = (value: number): string => `$${value.toFixed(4)}`;

const parseToolTraceFromMessageMetadata = (metadata: unknown): Array<Record<string, unknown>> => {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
	const trace = (metadata as Record<string, unknown>).fastchat_tool_trace_v1;
	return Array.isArray(trace)
		? trace.filter(
				(entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
			)
		: [];
};

export interface SessionDetailPayload {
	session: {
		id: string;
		title: string;
		user: { id: string; email: string; name: string };
		context_type: string;
		context_id: string | null;
		status: string;
		message_count: number;
		total_tokens: number;
		tool_call_count: number;
		llm_call_count: number;
		cost_estimate: number;
		has_errors: boolean;
		created_at: string;
		updated_at: string;
		last_message_at: string | null;
		agent_metadata: Record<string, unknown>;
	};
	metrics: {
		total_tokens: number;
		total_cost_usd: number;
		tool_calls: number;
		tool_failures: number;
		llm_calls: number;
		llm_failures: number;
		messages: number;
	};
	messages: MessageRow[];
	tool_executions: ToolExecutionRow[];
	llm_calls: LlmCallRow[];
	operations: OperationRow[];
	timeline: TimelineEvent[];
	timing_metrics: TimingDataRow | null;
}

interface BuildPayloadInput {
	sessionRow: SessionRow;
	messages: MessageRow[];
	toolExecutions: ToolExecutionRow[];
	llmCalls: LlmCallRow[];
	operations: OperationRow[];
	timingData: TimingDataRow | null;
}

export const buildSessionDetailPayload = ({
	sessionRow,
	messages,
	toolExecutions,
	llmCalls,
	operations,
	timingData
}: BuildPayloadInput): SessionDetailPayload => {
	const sessionCreatedAt = toIsoOrFallback(sessionRow.created_at, new Date().toISOString());
	const userMessageTimestamps = messages
		.filter((row) => row.role === 'user' && typeof row.created_at === 'string')
		.map((row) => row.created_at as string);

	const firstUserMessage = messages.find((row) => row.role === 'user')?.content ?? null;
	const computedTitle = sessionTitle(sessionRow, firstUserMessage);

	const messageTokenTotal = messages.reduce((sum, row) => sum + asNumber(row.total_tokens), 0);
	const usageTokenTotal = llmCalls.reduce((sum, row) => sum + asNumber(row.total_tokens), 0);
	const usageCostTotal = llmCalls.reduce((sum, row) => sum + asNumber(row.total_cost_usd), 0);
	const toolCallCountFromTrace = messages.reduce((sum, row) => {
		return sum + parseToolTraceFromMessageMetadata(row.metadata).length;
	}, 0);

	const totalTokens = Number(
		sessionRow.total_tokens_used ?? usageTokenTotal ?? messageTokenTotal ?? 0
	);
	const totalCost =
		usageCostTotal > 0
			? usageCostTotal
			: (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS_USD;
	const toolCallCount = Number(
		toolExecutions.length || sessionRow.tool_call_count || toolCallCountFromTrace
	);

	const timeline: TimelineEvent[] = [];
	timeline.push({
		id: `session:${sessionRow.id}`,
		timestamp: sessionCreatedAt,
		type: 'session',
		severity: 'info',
		title: 'Session Created',
		summary: `Context: ${sessionRow.context_type ?? 'global'} • Status: ${sessionRow.status ?? 'active'}`,
		turn_index: null,
		payload: {
			session_id: sessionRow.id,
			context_type: sessionRow.context_type,
			entity_id: sessionRow.entity_id,
			status: sessionRow.status
		}
	});

	for (const message of messages) {
		const timestamp = toIsoOrFallback(message.created_at, sessionCreatedAt);
		const severity: TimelineSeverity = message.error_message ? 'error' : 'info';
		const roleLabel =
			message.role === 'user'
				? 'User'
				: message.role === 'assistant'
					? 'Assistant'
					: message.role === 'tool'
						? 'Tool'
						: message.role === 'system'
							? 'System'
							: 'Message';

		timeline.push({
			id: `message:${message.id}`,
			timestamp,
			type: 'message',
			severity,
			title: `${roleLabel} Message`,
			summary:
				summarizeText(message.content, 200) ||
				(message.error_message ? `Error: ${message.error_message}` : '(empty message)'),
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: message.id,
				role: message.role,
				content: message.content,
				message_type: message.message_type,
				total_tokens: message.total_tokens,
				prompt_tokens: message.prompt_tokens,
				completion_tokens: message.completion_tokens,
				tool_call_id: message.tool_call_id,
				tool_name: message.tool_name,
				tool_calls: message.tool_calls,
				tool_result: message.tool_result,
				error_message: message.error_message,
				error_code: message.error_code,
				operation_ids: message.operation_ids,
				metadata: message.metadata
			}
		});

		const traceEntries = parseToolTraceFromMessageMetadata(message.metadata);
		traceEntries.forEach((entry, index) => {
			const success = entry.success === true;
			const traceTool =
				(typeof entry.op === 'string' && entry.op) ||
				(typeof entry.tool_name === 'string' && entry.tool_name) ||
				'tool';
			timeline.push({
				id: `trace:${message.id}:${index}`,
				timestamp,
				type: 'tool_execution',
				severity: success ? 'success' : 'error',
				title: `Tool Trace (${traceTool})`,
				summary: success
					? `${traceTool} completed`
					: `${traceTool} failed${typeof entry.error === 'string' ? `: ${entry.error}` : ''}`,
				turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
				payload: {
					source: 'assistant_message_metadata',
					message_id: message.id,
					trace_entry: entry
				}
			});
		});
	}

	for (const tool of toolExecutions) {
		const timestamp = toIsoOrFallback(tool.created_at, sessionCreatedAt);
		const success = tool.success === true;
		timeline.push({
			id: `tool:${tool.id}`,
			timestamp,
			type: 'tool_execution',
			severity: success ? 'success' : 'error',
			title: `Tool Execution: ${tool.tool_name}`,
			summary: success
				? `${tool.tool_name} succeeded${tool.execution_time_ms ? ` in ${tool.execution_time_ms}ms` : ''}`
				: `${tool.tool_name} failed${tool.error_message ? `: ${tool.error_message}` : ''}`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: tool.id,
				message_id: tool.message_id,
				tool_name: tool.tool_name,
				tool_category: tool.tool_category,
				success: tool.success,
				execution_time_ms: tool.execution_time_ms,
				tokens_consumed: tool.tokens_consumed,
				error_message: tool.error_message,
				requires_user_action: tool.requires_user_action,
				arguments: tool.arguments,
				result: tool.result
			}
		});
	}

	for (const usage of llmCalls) {
		const timestamp = toIsoOrFallback(
			usage.request_started_at ?? usage.created_at,
			sessionCreatedAt
		);
		const severity: TimelineSeverity = usage.status !== 'success' ? 'error' : 'info';
		const tokenCount = asNumber(usage.total_tokens);
		const cost = asNumber(usage.total_cost_usd);
		const responseMs = asNumber(usage.response_time_ms);
		timeline.push({
			id: `llm:${usage.id}`,
			timestamp,
			type: 'llm_call',
			severity,
			title: `LLM Call: ${usage.model_used || usage.model_requested || 'unknown model'}`,
			summary: `${tokenCount} tokens • ${formatCost(cost)}${responseMs > 0 ? ` • ${Math.round(responseMs)}ms` : ''}`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: usage.id,
				operation_type: usage.operation_type,
				model_requested: usage.model_requested,
				model_used: usage.model_used,
				provider: usage.provider,
				status: usage.status,
				error_message: usage.error_message,
				prompt_tokens: usage.prompt_tokens,
				completion_tokens: usage.completion_tokens,
				total_tokens: usage.total_tokens,
				total_cost_usd: usage.total_cost_usd,
				response_time_ms: usage.response_time_ms,
				request_started_at: usage.request_started_at,
				request_completed_at: usage.request_completed_at,
				openrouter_request_id: usage.openrouter_request_id,
				openrouter_cache_status: usage.openrouter_cache_status,
				streaming: usage.streaming,
				metadata: usage.metadata
			}
		});
	}

	for (const operation of operations) {
		const timestamp = toIsoOrFallback(
			operation.executed_at ?? operation.created_at,
			sessionCreatedAt
		);
		const severity: TimelineSeverity =
			operation.status === 'failed' || operation.error_message ? 'error' : 'info';
		timeline.push({
			id: `operation:${operation.id}`,
			timestamp,
			type: 'operation',
			severity,
			title: `Operation: ${operation.operation_type}`,
			summary: `${operation.table_name}${operation.status ? ` • ${operation.status}` : ''}${operation.error_message ? ` • ${operation.error_message}` : ''}`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: operation.id,
				operation_type: operation.operation_type,
				table_name: operation.table_name,
				status: operation.status,
				reasoning: operation.reasoning,
				duration_ms: operation.duration_ms,
				sequence_number: operation.sequence_number,
				error_message: operation.error_message,
				data: operation.data,
				result: operation.result
			}
		});
	}

	const metadata =
		sessionRow.agent_metadata && typeof sessionRow.agent_metadata === 'object'
			? (sessionRow.agent_metadata as Record<string, unknown>)
			: {};
	const maybeContextShift = metadata.fastchat_last_context_shift;
	const contextShift =
		maybeContextShift && typeof maybeContextShift === 'object'
			? (maybeContextShift as Record<string, unknown>)
			: null;

	if (contextShift) {
		const timestamp =
			typeof contextShift.shifted_at === 'string'
				? contextShift.shifted_at
				: sessionCreatedAt;
		timeline.push({
			id: `context_shift:${sessionRow.id}`,
			timestamp,
			type: 'context_shift',
			severity: 'warning',
			title: 'Context Shift',
			summary: `Switched to ${String(contextShift.context_type ?? 'unknown')} (${String(
				contextShift.entity_id ?? 'no entity'
			)})`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: contextShift
		});
	}

	if (timingData) {
		const timestamp = toIsoOrFallback(
			timingData.message_received_at ?? timingData.created_at,
			sessionCreatedAt
		);
		timeline.push({
			id: `timing:${timingData.id}`,
			timestamp,
			type: 'timing',
			severity: 'info',
			title: 'Timing Snapshot',
			summary: `TTFR: ${timingData.time_to_first_response_ms ?? '-'}ms • TTFE: ${timingData.time_to_first_event_ms ?? '-'}ms`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: timingData as Record<string, unknown>
		});
	}

	timeline.sort((a, b) => {
		if (a.timestamp === b.timestamp) return a.id.localeCompare(b.id);
		return a.timestamp < b.timestamp ? -1 : 1;
	});

	const hasErrors =
		messages.some((row) => !!row.error_message) ||
		toolExecutions.some((row) => row.success === false) ||
		llmCalls.some((row) => row.status !== 'success' || !!row.error_message) ||
		operations.some((row) => row.status === 'failed' || !!row.error_message);

	return {
		session: {
			id: sessionRow.id,
			title: computedTitle,
			user: {
				id: sessionRow.users?.id ?? sessionRow.user_id,
				email: sessionRow.users?.email ?? '',
				name: sessionRow.users?.name ?? ''
			},
			context_type: sessionRow.context_type ?? 'global',
			context_id: sessionRow.entity_id ?? null,
			status: sessionRow.status ?? 'active',
			message_count: Number(sessionRow.message_count ?? messages.length),
			total_tokens: totalTokens,
			tool_call_count: toolCallCount,
			llm_call_count: llmCalls.length,
			cost_estimate: totalCost,
			has_errors: hasErrors,
			created_at: sessionCreatedAt,
			updated_at: toIsoOrFallback(
				sessionRow.updated_at ?? sessionRow.last_message_at,
				sessionCreatedAt
			),
			last_message_at: sessionRow.last_message_at ?? null,
			agent_metadata: metadata
		},
		metrics: {
			total_tokens: totalTokens,
			total_cost_usd: totalCost,
			tool_calls: toolCallCount,
			tool_failures: toolExecutions.filter((row) => row.success === false).length,
			llm_calls: llmCalls.length,
			llm_failures: llmCalls.filter((row) => row.status !== 'success').length,
			messages: messages.length
		},
		messages,
		tool_executions: toolExecutions,
		llm_calls: llmCalls,
		operations,
		timeline,
		timing_metrics: timingData ?? null
	};
};
