// apps/web/src/lib/server/admin-llm-usage-analytics.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { resolveModelPricingProfile } from '@buildos/smart-llm';

type Supabase = SupabaseClient<Database>;

type UsageLogRow = Pick<
	Database['public']['Tables']['llm_usage_logs']['Row'],
	| 'id'
	| 'user_id'
	| 'operation_type'
	| 'model_requested'
	| 'model_used'
	| 'provider'
	| 'prompt_tokens'
	| 'completion_tokens'
	| 'total_tokens'
	| 'input_cost_usd'
	| 'output_cost_usd'
	| 'total_cost_usd'
	| 'response_time_ms'
	| 'status'
	| 'streaming'
	| 'profile'
	| 'openrouter_cache_status'
	| 'metadata'
	| 'chat_session_id'
	| 'agent_session_id'
	| 'created_at'
>;

type TurnRunRow = Pick<
	Database['public']['Tables']['chat_turn_runs']['Row'],
	| 'id'
	| 'user_id'
	| 'session_id'
	| 'context_type'
	| 'status'
	| 'finished_reason'
	| 'gateway_enabled'
	| 'source'
	| 'first_lane'
	| 'first_canonical_op'
	| 'first_help_path'
	| 'first_skill_path'
	| 'history_compressed'
	| 'cache_source'
	| 'cache_age_seconds'
	| 'request_prewarmed_context'
	| 'tool_round_count'
	| 'tool_call_count'
	| 'validation_failure_count'
	| 'llm_pass_count'
	| 'started_at'
	| 'finished_at'
	| 'created_at'
>;

type TurnEventRow = Pick<
	Database['public']['Tables']['chat_turn_events']['Row'],
	'turn_run_id' | 'session_id' | 'user_id' | 'event_type' | 'phase' | 'payload' | 'created_at'
>;

type ToolExecutionRow = Pick<
	Database['public']['Tables']['chat_tool_executions']['Row'],
	| 'id'
	| 'turn_run_id'
	| 'session_id'
	| 'tool_name'
	| 'gateway_op'
	| 'help_path'
	| 'success'
	| 'execution_time_ms'
	| 'tokens_consumed'
	| 'created_at'
>;

type UserRow = Pick<Database['public']['Tables']['users']['Row'], 'id' | 'email' | 'name'>;

type NumericSummary = {
	count: number;
	total: number;
	values: number[];
};

export type AdminLlmUsageStats = Awaited<ReturnType<typeof getAdminLlmUsageStats>>;

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50_000;

function numberValue(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function dateKey(value: string | null | undefined): string {
	if (!value) return 'unknown';
	return value.split('T')[0] ?? 'unknown';
}

function percent(part: number, total: number): number {
	return total > 0 ? (part / total) * 100 : 0;
}

function average(total: number, count: number): number {
	return count > 0 ? total / count : 0;
}

function percentile(values: number[], target: number): number {
	const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (filtered.length === 0) return 0;
	const index = Math.min(filtered.length - 1, Math.ceil((target / 100) * filtered.length) - 1);
	return filtered[index] ?? 0;
}

function addNumeric(summary: NumericSummary, value: unknown): void {
	const numeric = numberValue(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return;
	summary.count += 1;
	summary.total += numeric;
	summary.values.push(numeric);
}

function initNumericSummary(): NumericSummary {
	return { count: 0, total: 0, values: [] };
}

function isCacheHit(value: unknown): boolean {
	const normalized = String(value ?? '').toLowerCase();
	return normalized.includes('hit') || normalized.includes('cached ');
}

function jsonObject(value: Json | null): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function getModelCost(model: string, promptTokens: number, completionTokens: number): number {
	const modelConfig = resolveModelPricingProfile(model)?.profile;
	if (!modelConfig) return 0;
	return (
		(promptTokens / 1_000_000) * modelConfig.cost +
		(completionTokens / 1_000_000) * modelConfig.outputCost
	);
}

function getProvider(model: string, fallback?: string | null): string {
	const modelConfig = resolveModelPricingProfile(model)?.profile;
	return fallback || modelConfig?.provider || model.split('/')[0] || 'unknown';
}

async function fetchAllRows<T>(
	queryFactory: (
		from: number,
		to: number
	) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<{ rows: T[]; truncated: boolean }> {
	const rows: T[] = [];
	for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await queryFactory(from, to);
		if (error) throw error;

		const batch = (data ?? []) as T[];
		rows.push(...batch);
		if (batch.length < PAGE_SIZE) {
			return { rows, truncated: false };
		}
	}

	return { rows, truncated: true };
}

function buildDateSeries(startDate: Date, endDate: Date) {
	const days: string[] = [];
	const cursor = new Date(startDate);
	cursor.setHours(0, 0, 0, 0);
	const final = new Date(endDate);
	final.setHours(0, 0, 0, 0);

	while (cursor <= final) {
		days.push(cursor.toISOString().split('T')[0] ?? '');
		cursor.setDate(cursor.getDate() + 1);
	}

	return days.filter(Boolean);
}

function computeTrend(current: number, previous: number) {
	return {
		direction: current >= previous ? 'up' : 'down',
		value: previous > 0 ? Math.abs(((current - previous) / previous) * 100) : 0
	};
}

function parseLlmPassPayload(row: TurnEventRow) {
	const payload = jsonObject(row.payload);
	const model = stringValue(payload.model) ?? 'unknown';
	const provider = stringValue(payload.provider) ?? getProvider(model);
	const promptTokens = numberValue(payload.prompt_tokens);
	const completionTokens = numberValue(payload.completion_tokens);
	const totalTokens = numberValue(payload.total_tokens) || promptTokens + completionTokens;
	const reasoningTokens = numberValue(payload.reasoning_tokens);
	const cacheStatus = stringValue(payload.cache_status);
	const pass = numberValue(payload.pass) || 1;

	return {
		turnRunId: row.turn_run_id,
		sessionId: row.session_id,
		userId: row.user_id,
		model,
		provider,
		promptTokens,
		completionTokens,
		totalTokens,
		reasoningTokens,
		cacheStatus,
		finishedReason: stringValue(payload.finished_reason),
		requestId: stringValue(payload.request_id),
		pass,
		createdAt: row.created_at
	};
}

export async function getAdminLlmUsageStats(supabase: Supabase, lookbackDays: number) {
	const endDate = new Date();
	const startDate = new Date(endDate);
	startDate.setDate(startDate.getDate() - lookbackDays);

	const previousEndDate = new Date(startDate);
	const previousStartDate = new Date(startDate);
	previousStartDate.setDate(previousStartDate.getDate() - lookbackDays);

	const startIso = startDate.toISOString();
	const endIso = endDate.toISOString();
	const previousStartIso = previousStartDate.toISOString();
	const previousEndIso = previousEndDate.toISOString();

	const [
		usageResult,
		previousUsageResult,
		turnRunResult,
		previousTurnRunResult,
		llmEventResult,
		toolResult
	] = await Promise.all([
		fetchAllRows<UsageLogRow>((from, to) =>
			supabase
				.from('llm_usage_logs')
				.select(
					'id, user_id, operation_type, model_requested, model_used, provider, prompt_tokens, completion_tokens, total_tokens, input_cost_usd, output_cost_usd, total_cost_usd, response_time_ms, status, streaming, profile, openrouter_cache_status, metadata, chat_session_id, agent_session_id, created_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<Pick<UsageLogRow, 'total_cost_usd' | 'total_tokens'>>((from, to) =>
			supabase
				.from('llm_usage_logs')
				.select('total_cost_usd, total_tokens')
				.gte('created_at', previousStartIso)
				.lt('created_at', previousEndIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<TurnRunRow>((from, to) =>
			supabase
				.from('chat_turn_runs')
				.select(
					'id, user_id, session_id, context_type, status, finished_reason, gateway_enabled, source, first_lane, first_canonical_op, first_help_path, first_skill_path, history_compressed, cache_source, cache_age_seconds, request_prewarmed_context, tool_round_count, tool_call_count, validation_failure_count, llm_pass_count, started_at, finished_at, created_at'
				)
				.gte('started_at', startIso)
				.lte('started_at', endIso)
				.order('started_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<Pick<TurnRunRow, 'id' | 'status'>>((from, to) =>
			supabase
				.from('chat_turn_runs')
				.select('id, status')
				.gte('started_at', previousStartIso)
				.lt('started_at', previousEndIso)
				.order('started_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<TurnEventRow>((from, to) =>
			supabase
				.from('chat_turn_events')
				.select('turn_run_id, session_id, user_id, event_type, phase, payload, created_at')
				.eq('event_type', 'llm_pass_completed')
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ToolExecutionRow>((from, to) =>
			supabase
				.from('chat_tool_executions')
				.select(
					'id, turn_run_id, session_id, tool_name, gateway_op, help_path, success, execution_time_ms, tokens_consumed, created_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		)
	]);

	const usageRows = usageResult.rows;
	const previousUsageRows = previousUsageResult.rows;
	const turnRuns = turnRunResult.rows;
	const previousTurnRuns = previousTurnRunResult.rows;
	const llmPasses = llmEventResult.rows.map(parseLlmPassPayload);
	const toolExecutions = toolResult.rows;
	const truncation = {
		llmUsageLogs: usageResult.truncated,
		previousLlmUsageLogs: previousUsageResult.truncated,
		chatTurnRuns: turnRunResult.truncated,
		previousChatTurnRuns: previousTurnRunResult.truncated,
		chatTurnEvents: llmEventResult.truncated,
		chatToolExecutions: toolResult.truncated
	};

	const usageByDate = new Map<string, any>();
	const models = new Map<string, any>();
	const operations = new Map<string, any>();
	const users = new Map<string, any>();
	const responseTimes = initNumericSummary();
	let totalCost = 0;
	let inputCost = 0;
	let outputCost = 0;
	let totalTokens = 0;
	let promptTokens = 0;
	let completionTokens = 0;
	let successCount = 0;
	let failureCount = 0;
	let timeoutCount = 0;
	let streamingRequests = 0;
	let cacheHits = 0;

	for (const row of usageRows) {
		const cost = numberValue(row.total_cost_usd);
		const input = numberValue(row.input_cost_usd);
		const output = numberValue(row.output_cost_usd);
		const rowPromptTokens = numberValue(row.prompt_tokens);
		const rowCompletionTokens = numberValue(row.completion_tokens);
		const rowTotalTokens =
			numberValue(row.total_tokens) || rowPromptTokens + rowCompletionTokens;
		const responseMs = numberValue(row.response_time_ms);
		const model = row.model_used || row.model_requested || 'unknown';
		const provider = getProvider(model, row.provider);
		const operation = row.operation_type || 'unknown';
		const day = dateKey(row.created_at);

		totalCost += cost;
		inputCost += input;
		outputCost += output;
		totalTokens += rowTotalTokens;
		promptTokens += rowPromptTokens;
		completionTokens += rowCompletionTokens;
		if (row.status === 'success') successCount += 1;
		if (row.status === 'failure') failureCount += 1;
		if (row.status === 'timeout') timeoutCount += 1;
		if (row.streaming) streamingRequests += 1;
		if (isCacheHit(row.openrouter_cache_status)) cacheHits += 1;
		addNumeric(responseTimes, responseMs);

		const dateEntry =
			usageByDate.get(day) ??
			({
				summary_date: day,
				total_requests: 0,
				total_cost_usd: 0,
				total_tokens: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				successful_requests: 0,
				failed_requests: 0,
				agentic_turns: 0,
				agentic_llm_passes: 0,
				agentic_tokens: 0,
				tool_calls: 0
			} as any);
		dateEntry.total_requests += 1;
		dateEntry.total_cost_usd += cost;
		dateEntry.total_tokens += rowTotalTokens;
		dateEntry.prompt_tokens += rowPromptTokens;
		dateEntry.completion_tokens += rowCompletionTokens;
		if (row.status === 'success') dateEntry.successful_requests += 1;
		if (row.status !== 'success') dateEntry.failed_requests += 1;
		usageByDate.set(day, dateEntry);

		const modelEntry =
			models.get(model) ??
			({
				model,
				provider,
				requests: 0,
				successful_requests: 0,
				failed_requests: 0,
				streaming_requests: 0,
				cache_hits: 0,
				total_cost: 0,
				input_cost: 0,
				output_cost: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
				responseTimes: initNumericSummary(),
				agentic_passes: 0,
				agentic_turns: new Set<string>(),
				agentic_tokens: 0,
				reasoning_tokens: 0
			} as any);
		modelEntry.requests += 1;
		modelEntry.total_cost += cost;
		modelEntry.input_cost += input;
		modelEntry.output_cost += output;
		modelEntry.prompt_tokens += rowPromptTokens;
		modelEntry.completion_tokens += rowCompletionTokens;
		modelEntry.total_tokens += rowTotalTokens;
		if (row.status === 'success') modelEntry.successful_requests += 1;
		if (row.status !== 'success') modelEntry.failed_requests += 1;
		if (row.streaming) modelEntry.streaming_requests += 1;
		if (isCacheHit(row.openrouter_cache_status)) modelEntry.cache_hits += 1;
		addNumeric(modelEntry.responseTimes, responseMs);
		models.set(model, modelEntry);

		const opEntry =
			operations.get(operation) ??
			({
				operation,
				requests: 0,
				successful_requests: 0,
				failed_requests: 0,
				total_cost: 0,
				total_tokens: 0,
				responseTimes: initNumericSummary()
			} as any);
		opEntry.requests += 1;
		opEntry.total_cost += cost;
		opEntry.total_tokens += rowTotalTokens;
		if (row.status === 'success') opEntry.successful_requests += 1;
		if (row.status !== 'success') opEntry.failed_requests += 1;
		addNumeric(opEntry.responseTimes, responseMs);
		operations.set(operation, opEntry);

		const userEntry =
			users.get(row.user_id) ??
			({
				user_id: row.user_id,
				requests: 0,
				turns: 0,
				total_cost: 0,
				total_tokens: 0,
				tool_calls: 0,
				last_usage: row.created_at
			} as any);
		userEntry.requests += 1;
		userEntry.total_cost += cost;
		userEntry.total_tokens += rowTotalTokens;
		if (new Date(row.created_at).getTime() > new Date(userEntry.last_usage).getTime()) {
			userEntry.last_usage = row.created_at;
		}
		users.set(row.user_id, userEntry);
	}

	const agenticModels = new Map<string, any>();
	let agenticPromptTokens = 0;
	let agenticCompletionTokens = 0;
	let agenticTotalTokens = 0;
	let agenticReasoningTokens = 0;
	let agenticEstimatedCost = 0;
	let agenticCacheHits = 0;
	for (const pass of llmPasses) {
		const estimatedCost = getModelCost(pass.model, pass.promptTokens, pass.completionTokens);
		agenticPromptTokens += pass.promptTokens;
		agenticCompletionTokens += pass.completionTokens;
		agenticTotalTokens += pass.totalTokens;
		agenticReasoningTokens += pass.reasoningTokens;
		agenticEstimatedCost += estimatedCost;
		if (isCacheHit(pass.cacheStatus)) agenticCacheHits += 1;

		const day = dateKey(pass.createdAt);
		const dateEntry =
			usageByDate.get(day) ??
			({
				summary_date: day,
				total_requests: 0,
				total_cost_usd: 0,
				total_tokens: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				successful_requests: 0,
				failed_requests: 0,
				agentic_turns: 0,
				agentic_llm_passes: 0,
				agentic_tokens: 0,
				tool_calls: 0
			} as any);
		dateEntry.agentic_llm_passes += 1;
		dateEntry.agentic_tokens += pass.totalTokens;
		usageByDate.set(day, dateEntry);

		const modelEntry =
			models.get(pass.model) ??
			({
				model: pass.model,
				provider: pass.provider,
				requests: 0,
				successful_requests: 0,
				failed_requests: 0,
				streaming_requests: 0,
				cache_hits: 0,
				total_cost: 0,
				input_cost: 0,
				output_cost: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
				responseTimes: initNumericSummary(),
				agentic_passes: 0,
				agentic_turns: new Set<string>(),
				agentic_tokens: 0,
				reasoning_tokens: 0
			} as any);
		modelEntry.agentic_passes += 1;
		modelEntry.agentic_turns.add(pass.turnRunId);
		modelEntry.agentic_tokens += pass.totalTokens;
		modelEntry.reasoning_tokens += pass.reasoningTokens;
		models.set(pass.model, modelEntry);

		const agenticModel =
			agenticModels.get(pass.model) ??
			({
				model: pass.model,
				provider: pass.provider,
				passes: 0,
				turns: new Set<string>(),
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
				reasoning_tokens: 0,
				estimated_cost: 0,
				cache_hits: 0,
				finished_reasons: new Map<string, number>()
			} as any);
		agenticModel.passes += 1;
		agenticModel.turns.add(pass.turnRunId);
		agenticModel.prompt_tokens += pass.promptTokens;
		agenticModel.completion_tokens += pass.completionTokens;
		agenticModel.total_tokens += pass.totalTokens;
		agenticModel.reasoning_tokens += pass.reasoningTokens;
		agenticModel.estimated_cost += estimatedCost;
		if (isCacheHit(pass.cacheStatus)) agenticModel.cache_hits += 1;
		const reason = pass.finishedReason || 'unknown';
		agenticModel.finished_reasons.set(
			reason,
			(agenticModel.finished_reasons.get(reason) || 0) + 1
		);
		agenticModels.set(pass.model, agenticModel);
	}

	const turnDurations = initNumericSummary();
	const contextMap = new Map<string, number>();
	const laneMap = new Map<string, number>();
	const statusMap = new Map<string, number>();
	const cacheSourceMap = new Map<string, number>();
	const agenticOps = new Map<string, any>();
	let completedTurns = 0;
	let failedTurns = 0;
	let cancelledTurns = 0;
	let gatewayTurns = 0;
	let compressedTurns = 0;
	let prewarmedTurns = 0;
	let turnToolCalls = 0;
	let validationFailures = 0;
	let llmPassCountFromTurns = 0;

	for (const turn of turnRuns) {
		const status = turn.status || 'unknown';
		statusMap.set(status, (statusMap.get(status) || 0) + 1);
		contextMap.set(turn.context_type, (contextMap.get(turn.context_type) || 0) + 1);
		const lane = turn.first_lane || 'unknown';
		laneMap.set(lane, (laneMap.get(lane) || 0) + 1);
		const cacheSource = turn.cache_source || 'unknown';
		cacheSourceMap.set(cacheSource, (cacheSourceMap.get(cacheSource) || 0) + 1);
		if (status === 'completed') completedTurns += 1;
		if (status === 'failed') failedTurns += 1;
		if (status === 'cancelled') cancelledTurns += 1;
		if (turn.gateway_enabled) gatewayTurns += 1;
		if (turn.history_compressed) compressedTurns += 1;
		if (turn.request_prewarmed_context) prewarmedTurns += 1;
		turnToolCalls += numberValue(turn.tool_call_count);
		validationFailures += numberValue(turn.validation_failure_count);
		llmPassCountFromTurns += numberValue(turn.llm_pass_count);

		if (turn.started_at && turn.finished_at) {
			addNumeric(
				turnDurations,
				new Date(turn.finished_at).getTime() - new Date(turn.started_at).getTime()
			);
		}

		const day = dateKey(turn.started_at);
		const dateEntry =
			usageByDate.get(day) ??
			({
				summary_date: day,
				total_requests: 0,
				total_cost_usd: 0,
				total_tokens: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				successful_requests: 0,
				failed_requests: 0,
				agentic_turns: 0,
				agentic_llm_passes: 0,
				agentic_tokens: 0,
				tool_calls: 0
			} as any);
		dateEntry.agentic_turns += 1;
		dateEntry.tool_calls += numberValue(turn.tool_call_count);
		usageByDate.set(day, dateEntry);

		const op =
			turn.first_canonical_op || turn.first_help_path || turn.first_skill_path || 'none';
		const opEntry =
			agenticOps.get(op) ??
			({
				operation: op,
				turns: 0,
				completed_turns: 0,
				failed_turns: 0,
				tool_calls: 0,
				validation_failures: 0,
				total_duration_ms: 0,
				duration_values: []
			} as any);
		opEntry.turns += 1;
		if (status === 'completed') opEntry.completed_turns += 1;
		if (status === 'failed') opEntry.failed_turns += 1;
		opEntry.tool_calls += numberValue(turn.tool_call_count);
		opEntry.validation_failures += numberValue(turn.validation_failure_count);
		if (turn.started_at && turn.finished_at) {
			const duration =
				new Date(turn.finished_at).getTime() - new Date(turn.started_at).getTime();
			if (duration >= 0) {
				opEntry.total_duration_ms += duration;
				opEntry.duration_values.push(duration);
			}
		}
		agenticOps.set(op, opEntry);

		const userEntry =
			users.get(turn.user_id) ??
			({
				user_id: turn.user_id,
				requests: 0,
				turns: 0,
				total_cost: 0,
				total_tokens: 0,
				tool_calls: 0,
				last_usage: turn.started_at
			} as any);
		userEntry.turns += 1;
		userEntry.tool_calls += numberValue(turn.tool_call_count);
		if (new Date(turn.started_at).getTime() > new Date(userEntry.last_usage).getTime()) {
			userEntry.last_usage = turn.started_at;
		}
		users.set(turn.user_id, userEntry);
	}

	const toolStats = new Map<string, any>();
	const toolDurations = initNumericSummary();
	let successfulTools = 0;
	for (const tool of toolExecutions) {
		if (tool.success) successfulTools += 1;
		addNumeric(toolDurations, tool.execution_time_ms);
		const label = tool.gateway_op || tool.help_path || tool.tool_name || 'unknown';
		const entry =
			toolStats.get(label) ??
			({
				tool: label,
				calls: 0,
				successful_calls: 0,
				failed_calls: 0,
				tokens_consumed: 0,
				duration: initNumericSummary()
			} as any);
		entry.calls += 1;
		if (tool.success) entry.successful_calls += 1;
		if (!tool.success) entry.failed_calls += 1;
		entry.tokens_consumed += numberValue(tool.tokens_consumed);
		addNumeric(entry.duration, tool.execution_time_ms);
		toolStats.set(label, entry);
	}

	const previousTotalCost = previousUsageRows.reduce(
		(sum, row) => sum + numberValue(row.total_cost_usd),
		0
	);
	const previousTotalTokens = previousUsageRows.reduce(
		(sum, row) => sum + numberValue(row.total_tokens),
		0
	);

	const dailyData = buildDateSeries(startDate, endDate).map((day) => {
		const row = usageByDate.get(day) ?? {
			summary_date: day,
			total_requests: 0,
			total_cost_usd: 0,
			total_tokens: 0,
			prompt_tokens: 0,
			completion_tokens: 0,
			successful_requests: 0,
			failed_requests: 0,
			agentic_turns: 0,
			agentic_llm_passes: 0,
			agentic_tokens: 0,
			tool_calls: 0
		};
		return {
			...row,
			success_rate: percent(row.successful_requests, row.total_requests)
		};
	});

	const modelBreakdown = Array.from(models.values())
		.map((entry) => ({
			model: entry.model,
			provider: entry.provider,
			requests: entry.requests,
			successful_requests: entry.successful_requests,
			failed_requests: entry.failed_requests,
			streaming_requests: entry.streaming_requests,
			cache_hits: entry.cache_hits,
			cache_hit_rate: percent(entry.cache_hits, entry.requests),
			total_cost: entry.total_cost,
			input_cost: entry.input_cost,
			output_cost: entry.output_cost,
			prompt_tokens: entry.prompt_tokens,
			completion_tokens: entry.completion_tokens,
			total_tokens: entry.total_tokens,
			agentic_passes: entry.agentic_passes,
			agentic_turns: entry.agentic_turns.size,
			agentic_tokens: entry.agentic_tokens,
			reasoning_tokens: entry.reasoning_tokens,
			avg_response_time: Math.round(
				average(entry.responseTimes.total, entry.responseTimes.count)
			),
			p95_response_time: Math.round(percentile(entry.responseTimes.values, 95)),
			success_rate: percent(entry.successful_requests, entry.requests),
			cost_per_1m_tokens:
				entry.total_tokens > 0 ? (entry.total_cost / entry.total_tokens) * 1_000_000 : 0,
			cost_share: percent(entry.total_cost, totalCost),
			token_share: percent(entry.total_tokens, totalTokens)
		}))
		.sort((a, b) => b.total_cost - a.total_cost || b.agentic_passes - a.agentic_passes);

	const agenticModelBreakdown = Array.from(agenticModels.values())
		.map((entry) => ({
			model: entry.model,
			provider: entry.provider,
			passes: entry.passes,
			turns: entry.turns.size,
			prompt_tokens: entry.prompt_tokens,
			completion_tokens: entry.completion_tokens,
			total_tokens: entry.total_tokens,
			reasoning_tokens: entry.reasoning_tokens,
			estimated_cost: entry.estimated_cost,
			cache_hits: entry.cache_hits,
			cache_hit_rate: percent(entry.cache_hits, entry.passes),
			share: percent(entry.passes, llmPasses.length),
			finished_reasons: Array.from((entry.finished_reasons as Map<string, number>).entries())
				.map(([reason, count]) => ({ reason, count }))
				.sort((a, b) => b.count - a.count)
		}))
		.sort((a, b) => b.passes - a.passes || b.total_tokens - a.total_tokens);

	const operationBreakdown = Array.from(operations.values())
		.map((entry) => ({
			operation: entry.operation,
			requests: entry.requests,
			successful_requests: entry.successful_requests,
			failed_requests: entry.failed_requests,
			total_cost: entry.total_cost,
			total_tokens: entry.total_tokens,
			avg_response_time: Math.round(
				average(entry.responseTimes.total, entry.responseTimes.count)
			),
			p95_response_time: Math.round(percentile(entry.responseTimes.values, 95)),
			success_rate: percent(entry.successful_requests, entry.requests)
		}))
		.sort((a, b) => b.total_cost - a.total_cost);

	const agenticOperationBreakdown = Array.from(agenticOps.values())
		.map((entry) => ({
			operation: entry.operation,
			turns: entry.turns,
			completed_turns: entry.completed_turns,
			failed_turns: entry.failed_turns,
			tool_calls: entry.tool_calls,
			validation_failures: entry.validation_failures,
			avg_duration_ms: Math.round(
				average(entry.total_duration_ms, entry.duration_values.length)
			),
			p95_duration_ms: Math.round(percentile(entry.duration_values, 95)),
			success_rate: percent(entry.completed_turns, entry.turns)
		}))
		.sort((a, b) => b.turns - a.turns);

	const topTools = Array.from(toolStats.values())
		.map((entry) => ({
			tool: entry.tool,
			calls: entry.calls,
			successful_calls: entry.successful_calls,
			failed_calls: entry.failed_calls,
			success_rate: percent(entry.successful_calls, entry.calls),
			tokens_consumed: entry.tokens_consumed,
			avg_duration_ms: Math.round(average(entry.duration.total, entry.duration.count)),
			p95_duration_ms: Math.round(percentile(entry.duration.values, 95))
		}))
		.sort((a, b) => b.calls - a.calls)
		.slice(0, 20);

	const userIds = Array.from(users.keys()).filter(Boolean);
	const { data: userRows, error: userError } =
		userIds.length > 0
			? await supabase.from('users').select('id, email, name').in('id', userIds)
			: { data: [] as UserRow[], error: null };
	if (userError) throw userError;
	const userMap = new Map((userRows ?? []).map((user) => [user.id, user]));

	const topUsers = Array.from(users.values())
		.map((entry) => {
			const user = userMap.get(entry.user_id);
			return {
				user_id: entry.user_id,
				email: user?.email || 'Unknown',
				name: user?.name || null,
				requests: entry.requests,
				turns: entry.turns,
				tool_calls: entry.tool_calls,
				total_cost: entry.total_cost,
				total_tokens: entry.total_tokens,
				last_usage: entry.last_usage
			};
		})
		.sort((a, b) => b.total_cost - a.total_cost || b.turns - a.turns)
		.slice(0, 20);

	const recentLogs = usageRows.slice(0, 50).map((log) => ({
		...log,
		users: userMap.get(log.user_id)
			? {
					email: userMap.get(log.user_id)?.email,
					name: userMap.get(log.user_id)?.name
				}
			: null
	}));

	const recentAgenticTurns = turnRuns.slice(0, 30).map((turn) => ({
		...turn,
		user: userMap.get(turn.user_id)
			? {
					email: userMap.get(turn.user_id)?.email,
					name: userMap.get(turn.user_id)?.name
				}
			: null,
		duration_ms:
			turn.started_at && turn.finished_at
				? Math.max(
						0,
						new Date(turn.finished_at).getTime() - new Date(turn.started_at).getTime()
					)
				: null,
		models: llmPasses
			.filter((pass) => pass.turnRunId === turn.id)
			.map((pass) => pass.model)
			.filter((model, index, list) => list.indexOf(model) === index)
	}));

	return {
		overview: {
			totalCost,
			totalRequests: usageRows.length,
			totalTokens,
			promptTokens,
			completionTokens,
			inputCost,
			outputCost,
			avgCostPerRequest: average(totalCost, usageRows.length),
			costPer1MTokens: totalTokens > 0 ? (totalCost / totalTokens) * 1_000_000 : 0,
			successRate: percent(successCount, usageRows.length),
			failureCount,
			timeoutCount,
			avgResponseTime: average(responseTimes.total, responseTimes.count),
			p95ResponseTime: percentile(responseTimes.values, 95),
			streamingRequests,
			cacheHitRate: percent(cacheHits, usageRows.length),
			activeModels: modelBreakdown.filter(
				(model) => model.requests > 0 || model.agentic_passes > 0
			).length,
			costTrend: computeTrend(totalCost, previousTotalCost),
			tokenTrend: computeTrend(totalTokens, previousTotalTokens)
		},
		agenticOverview: {
			totalTurns: turnRuns.length,
			completedTurns,
			failedTurns,
			cancelledTurns,
			successRate: percent(completedTurns, turnRuns.length),
			turnTrend: computeTrend(turnRuns.length, previousTurnRuns.length),
			gatewayEnabledRate: percent(gatewayTurns, turnRuns.length),
			historyCompressionRate: percent(compressedTurns, turnRuns.length),
			prewarmedContextRate: percent(prewarmedTurns, turnRuns.length),
			totalToolCalls: Math.max(turnToolCalls, toolExecutions.length),
			toolSuccessRate: percent(successfulTools, toolExecutions.length),
			avgToolsPerTurn: average(turnToolCalls, turnRuns.length),
			validationFailureCount: validationFailures,
			llmPasses: Math.max(llmPasses.length, llmPassCountFromTurns),
			avgLlmPassesPerTurn: average(
				Math.max(llmPasses.length, llmPassCountFromTurns),
				turnRuns.length
			),
			totalTokens: agenticTotalTokens,
			promptTokens: agenticPromptTokens,
			completionTokens: agenticCompletionTokens,
			reasoningTokens: agenticReasoningTokens,
			estimatedCost: agenticEstimatedCost,
			cacheHitRate: percent(agenticCacheHits, llmPasses.length),
			avgTurnDurationMs: average(turnDurations.total, turnDurations.count),
			p95TurnDurationMs: percentile(turnDurations.values, 95)
		},
		dailyData,
		modelBreakdown,
		agenticModelBreakdown,
		operationBreakdown,
		agenticOperationBreakdown,
		turnDistributions: {
			status: Array.from(statusMap.entries()).map(([label, count]) => ({ label, count })),
			context: Array.from(contextMap.entries())
				.map(([label, count]) => ({ label, count }))
				.sort((a, b) => b.count - a.count),
			lane: Array.from(laneMap.entries())
				.map(([label, count]) => ({ label, count }))
				.sort((a, b) => b.count - a.count),
			cacheSource: Array.from(cacheSourceMap.entries())
				.map(([label, count]) => ({ label, count }))
				.sort((a, b) => b.count - a.count)
		},
		topTools,
		topUsers,
		recentLogs,
		recentAgenticTurns,
		dateRange: {
			start: startIso,
			end: endIso,
			days: lookbackDays
		},
		dataHealth: {
			rows: {
				llmUsageLogs: usageRows.length,
				chatTurnRuns: turnRuns.length,
				chatTurnEvents: llmPasses.length,
				chatToolExecutions: toolExecutions.length
			},
			truncated: truncation,
			hasBillableUsage: usageRows.length > 0,
			hasAgenticTelemetry: turnRuns.length > 0 || llmPasses.length > 0
		}
	};
}
