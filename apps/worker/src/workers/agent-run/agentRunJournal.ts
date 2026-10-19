// apps/worker/src/workers/agent-run/agentRunJournal.ts
import type {
	AgentRunMutationMode,
	Database,
	EntityAction,
	EntityTouch
} from '@buildos/shared-types';
import {
	AGENT_OP_WEB_READ_CATALOG,
	isWriteOp,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops';
import {
	buildGatewayEntityUrl,
	buildGatewayProjectUrl
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { supabase } from '../../lib/supabase';
import { checkpointAgentRun } from './agentRunLifecycle';
import {
	formatAgentRunTranscriptArgs,
	formatAgentRunTranscriptResult
} from './transcript-security';
import { sanitizeAgentRunTelemetryJson } from './agentRunRuntimePolicy';
import { summarizeAgentRunRetryLedger } from './agentRunCostPolicy';
import {
	type WebResearchObservations,
	mergeWebResearchObservations,
	observeWebResearchToolResult
} from './webResearchEvidence';
type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'];
const TRANSCRIPT_RESULT_CHARS = 4000;
const WEB_TRANSCRIPT_RESULT_CHARS = 12_500;

export function transcriptResultCharsForOp(op: string): number {
	return AGENT_OP_WEB_READ_CATALOG.some((webOp) => webOp === op)
		? WEB_TRANSCRIPT_RESULT_CHARS
		: TRANSCRIPT_RESULT_CHARS;
}

function isEntityAction(value: unknown): value is EntityAction {
	return value === 'created' || value === 'updated' || value === 'deleted';
}

export function normalizeEntityTouches(value: unknown): EntityTouch[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((touch): EntityTouch[] => {
		if (!touch || typeof touch !== 'object' || Array.isArray(touch)) return [];
		const record = touch as Record<string, unknown>;
		if (typeof record.type !== 'string' || typeof record.id !== 'string') return [];
		return [
			{
				type: record.type,
				id: record.id,
				action: isEntityAction(record.action) ? record.action : 'updated',
				description: typeof record.description === 'string' ? record.description : '',
				project_id: typeof record.project_id === 'string' ? record.project_id : null,
				title: typeof record.title === 'string' ? record.title : null,
				url: typeof record.url === 'string' ? record.url : null,
				project_url: typeof record.project_url === 'string' ? record.project_url : null
			}
		];
	});
}

export function mergeEntityTouches(...groups: EntityTouch[][]): EntityTouch[] {
	const byKey = new Map<string, EntityTouch>();
	for (const touch of groups.flat()) {
		byKey.set(`${touch.type}:${touch.id}:${touch.action}`, touch);
	}
	return Array.from(byKey.values());
}

export async function emitEvent(
	runId: string,
	eventType: string,
	payload: Record<string, unknown>
): Promise<void> {
	// seq is assigned by the agent_run_assign_event_seq DB trigger.
	const { error } = await supabase
		.from('agent_run_events')
		.insert({ run_id: runId, event_type: eventType, payload: payload as never });
	if (error) {
		console.error('[agentRunWorker] failed to emit event', eventType, error.message);
	}
}

/**
 * When a run was spawned from a chat session
 * (`parent_session_id` set), inject an assistant-authored summary message into
 * that thread on terminal status, so the supervising conversation shows the
 * result even though the original SSE turn has long since ended (01 §7). Keyed
 * by `agent_run_id` in metadata so the chat UI can dedupe / link back.
 */
export function buildCompletionMessageContent(
	run: AgentRunRow,
	status: AgentRunRow['status'],
	result: Record<string, unknown>
): string {
	const label = run.label?.trim() || 'Agent';
	const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
	const answer = typeof result.answer === 'string' ? result.answer.trim() : '';
	const error = typeof result.error === 'string' ? result.error.trim() : '';
	const openQuestions = Array.isArray(result.open_questions)
		? (result.open_questions.filter((q) => typeof q === 'string' && q.trim()) as string[])
		: [];
	const entitiesTouched = normalizeEntityTouches(result.entities_touched);
	const projectId =
		run.project_id ??
		entitiesTouched.find((entity) => typeof entity.project_id === 'string')?.project_id ??
		null;
	const projectUrl = buildGatewayProjectUrl(projectId);
	const body = answer || summary;

	const header =
		status === 'completed'
			? `🤖 Agent **${label}** finished.`
			: status === 'partial'
				? `🤖 Agent **${label}** finished partially.`
				: status === 'needs_input'
					? `🤖 Agent **${label}** needs your input.`
					: status === 'failed'
						? `🤖 Agent **${label}** failed.`
						: status === 'cancelled'
							? `🤖 Agent **${label}** was cancelled.`
							: `🤖 Agent **${label}** — ${status}.`;

	const parts = [header];
	if (projectUrl) {
		parts.push(`**Project:** [Open project](${projectUrl})`);
	}
	if (entitiesTouched.length) {
		parts.push(
			[
				'**Changes:**',
				...entitiesTouched.map((entity) => {
					const label = entity.title?.trim() || `${entity.type} ${entity.id.slice(0, 8)}`;
					const url =
						entity.url ??
						buildGatewayEntityUrl(
							entity.type,
							entity.id,
							entity.project_id ?? projectId
						);
					const linkedLabel = url ? `[${label}](${url})` : label;
					return `- ${entity.action} ${linkedLabel}`;
				})
			].join('\n')
		);
	}
	if (body) parts.push(body);
	if (openQuestions.length) {
		parts.push(['**Open questions:**', ...openQuestions.map((q) => `- ${q}`)].join('\n'));
	}
	if (status === 'failed' && error && error !== body) parts.push(error);
	return parts.join('\n\n');
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		: [];
}

function buildSourceSuggestionResult(params: {
	run: AgentRunRow;
	finalStatus: AgentRunRow['status'];
	sourceDecision: 'approve' | 'dismiss';
	result: Record<string, unknown>;
}): Record<string, unknown> {
	const entitiesTouched = normalizeEntityTouches(params.result.entities_touched);
	const summary = readNonEmptyString(params.result.summary);
	const answer = readNonEmptyString(params.result.answer);
	const openQuestions = readStringArray(params.result.open_questions);
	const error =
		readNonEmptyString(params.result.error) ??
		(params.finalStatus === 'cancelled'
			? 'Clarified decision run was cancelled.'
			: params.finalStatus === 'needs_input'
				? 'Clarified decision run needs input.'
				: params.finalStatus === 'partial'
					? 'Clarified decision run finished partially.'
					: params.finalStatus === 'failed'
						? 'Clarified decision run failed.'
						: null);
	const ok = params.finalStatus === 'completed';

	return {
		ok,
		applied_operations: ok ? entitiesTouched.length : 0,
		agent_run_id: params.run.id,
		agent_run_status: params.finalStatus,
		source_decision: params.sourceDecision,
		...(summary ? { summary } : {}),
		...(answer ? { answer } : {}),
		...(openQuestions.length ? { open_questions: openQuestions } : {}),
		...(entitiesTouched.length ? { entities_touched: entitiesTouched } : {}),
		...(!ok && error ? { errors: [{ tool: 'agent_run', error }] } : {})
	};
}

export async function reconcileSourceProjectSuggestion(params: {
	run: AgentRunRow;
	finalStatus: AgentRunRow['status'];
	result: Record<string, unknown>;
	completedAt: string;
}): Promise<void> {
	const suggestionId = readNonEmptyString(params.run.source_suggestion_id);
	const sourceDecision = params.run.source_decision;
	if (!suggestionId || (sourceDecision !== 'approve' && sourceDecision !== 'dismiss')) return;

	const suggestionResult = buildSourceSuggestionResult({
		run: params.run,
		finalStatus: params.finalStatus,
		sourceDecision,
		result: params.result
	});
	const succeeded = params.finalStatus === 'completed';
	const nextStatus = succeeded
		? sourceDecision === 'approve'
			? 'applied'
			: 'rejected'
		: 'failed';
	const patch: Record<string, unknown> = {
		status: nextStatus,
		result: suggestionResult as never,
		agent_run_id: params.run.id,
		updated_at: params.completedAt
	};
	if (succeeded && sourceDecision === 'approve') {
		patch.applied_at = params.completedAt;
	}

	const { data: updated, error } = await supabase
		.from('project_suggestions')
		.update(patch as never)
		.eq('id', suggestionId)
		.eq('status', 'delegated')
		.select('*')
		.maybeSingle();

	if (error) {
		console.warn(
			`⚠️ Failed to reconcile project suggestion ${suggestionId} from agent run ${params.run.id}:`,
			error.message
		);
		return;
	}

	try {
		await syncInboxItemForProjectSuggestion({
			supabase,
			suggestion: (updated as unknown as Record<string, unknown> | null) ?? undefined,
			suggestionId
		});
	} catch (syncError) {
		console.warn(
			`⚠️ Failed to sync AI Inbox item for project suggestion ${suggestionId}:`,
			syncError instanceof Error ? syncError.message : syncError
		);
	}
}

export async function recordToolExecution(params: {
	runId: string;
	generation: number;
	checkpoint: Record<string, unknown>;
	op: string;
	args: Record<string, unknown>;
	ok: boolean;
	result: unknown;
	errorMessage?: string;
	durationMs: number;
	entityKind?: string | null;
	entityId?: string | null;
	mutationMode?: AgentRunMutationMode;
	proposedChangeId?: string;
}): Promise<{
	persistedResult: ReturnType<typeof sanitizeAgentRunTelemetryJson>;
}> {
	const isWrite = isWriteOp(params.op);
	// Reads are never staged; a staged write records mutation_mode='stage' + its
	// proposed_change_id. mutation_mode is null for reads (semantically n/a).
	const mutationMode = isWrite ? (params.mutationMode ?? 'commit') : null;
	const persistedArgs = sanitizeAgentRunTelemetryJson(params.args);
	const persistedResult = sanitizeAgentRunTelemetryJson(params.result);
	await checkpointAgentRun({
		runId: params.runId,
		generation: params.generation,
		patch: params.checkpoint,
		execution: {
			op: params.op,
			tool_category: isWrite ? 'write' : 'read',
			arguments: persistedArgs,
			result: params.ok ? persistedResult : null,
			success: params.ok,
			error_message: params.errorMessage ?? null,
			mutation_mode: mutationMode,
			proposed_change_id: params.proposedChangeId ?? null,
			entity_kind: params.entityKind ?? null,
			entity_id: params.entityId ?? null,
			execution_time_ms: params.durationMs
		}
	});
	return { persistedResult };
}

/**
 * Rebuild the in-memory transcript + accumulated budget for a RESUMED run from
 * persisted ground truth. Tool calls come from `agent_tool_executions`
 * and supervisor steers from `run.steer` events; both carry `created_at` so they
 * interleave in the order they happened.
 */
export async function reconstructPriorState(
	runId: string,
	priorMetrics: unknown,
	priorResult?: unknown,
	priorStatus?: AgentRunRow['status'],
	priorCompletedAt?: string | null
): Promise<{
	transcript: string[];
	toolCalls: number;
	tokens: number;
	cost: number;
	llmCost: number;
	paidToolCost: number;
	tavilyCredits: number;
	uncertainTokenExposure: number;
	researchObservations: WebResearchObservations;
}> {
	type RetryLedgerClient = {
		from(table: 'agent_run_cost_entries'): {
			select(columns: string): {
				eq(
					column: 'leaf_run_id',
					value: string
				): PromiseLike<{
					data: Array<Record<string, unknown>> | null;
					error: { message: string } | null;
				}>;
			};
		};
	};
	const [executionResult, steerResult, ledgerResult] = await Promise.all([
		supabase
			.from('agent_tool_executions')
			.select('gateway_op, tool_name, arguments, result, success, error_message, created_at')
			.eq('agent_run_id', runId)
			.order('created_at', { ascending: true }),
		supabase
			.from('agent_run_events')
			.select('payload, created_at')
			.eq('run_id', runId)
			.eq('event_type', 'run.steer')
			.order('created_at', { ascending: true }),
		(supabase as unknown as RetryLedgerClient)
			.from('agent_run_cost_entries')
			.select(
				'provider, status, reserved_units, actual_units, unit_type, reserved_cost_usd, actual_cost_usd'
			)
			.eq('leaf_run_id', runId)
	]);
	if (executionResult.error || steerResult.error) {
		throw new Error(
			`Failed to reconstruct Agent Run history: ${(executionResult.error ?? steerResult.error)!.message}`
		);
	}
	const execs = executionResult.data;
	const steers = steerResult.data;
	if (ledgerResult.error) {
		throw new Error(
			`Failed to reconstruct Agent Run ${runId} cost ledger: ${ledgerResult.error.message}`
		);
	}
	const ledger = summarizeAgentRunRetryLedger(ledgerResult.data ?? []);

	const items: Array<{ at: string; line: string }> = [];
	let researchObservations: WebResearchObservations = {
		searchQueries: [],
		searchResults: [],
		visitedSources: []
	};
	let toolCalls = 0;
	for (const e of execs ?? []) {
		toolCalls += 1;
		const op = e.gateway_op ?? e.tool_name ?? 'op';
		const resultText = e.success
			? formatAgentRunTranscriptResult({
					op,
					result: e.result,
					maxChars: transcriptResultCharsForOp(op)
				})
			: `ERROR: ${e.error_message ?? 'failed'}`;
		items.push({
			at: e.created_at,
			line: `OP ${op} ${formatAgentRunTranscriptArgs({
				op,
				args: (e.arguments ?? {}) as Record<string, unknown>
			})} -> ${resultText}`
		});
		if (e.success) {
			researchObservations = mergeWebResearchObservations(
				researchObservations,
				observeWebResearchToolResult({
					op,
					args: (e.arguments ?? {}) as Record<string, unknown>,
					result: e.result,
					observedAt: e.created_at
				})
			);
		}
	}
	for (const s of steers ?? []) {
		const message = (s.payload as { message?: string } | null)?.message;
		if (message) items.push({ at: s.created_at, line: `SUPERVISOR (steer): ${message}` });
	}

	if (
		(priorStatus === 'partial' || priorStatus === 'needs_input') &&
		priorResult &&
		typeof priorResult === 'object' &&
		!Array.isArray(priorResult)
	) {
		const result = priorResult as {
			summary?: unknown;
			answer?: unknown;
			open_questions?: unknown;
		};
		const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
		const answer = typeof result.answer === 'string' ? result.answer.trim() : '';
		const openQuestions = Array.isArray(result.open_questions)
			? result.open_questions.filter(
					(q): q is string => typeof q === 'string' && q.trim().length > 0
				)
			: [];
		if (summary || answer || openQuestions.length) {
			items.push({
				at: priorCompletedAt ?? new Date().toISOString(),
				line: `PREVIOUS RESULT (${priorStatus}): ${JSON.stringify({
					summary,
					answer,
					open_questions: openQuestions
				}).slice(0, TRANSCRIPT_RESULT_CHARS)}`
			});
		}
	}

	items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

	const m =
		priorMetrics && typeof priorMetrics === 'object' && !Array.isArray(priorMetrics)
			? (priorMetrics as { tokens?: number; cost_usd?: number })
			: null;
	return {
		transcript: items.map((i) => i.line),
		toolCalls,
		tokens: Math.max(typeof m?.tokens === 'number' ? m.tokens : 0, ledger.observedTokens),
		cost: Math.max(typeof m?.cost_usd === 'number' ? m.cost_usd : 0, ledger.costUsd),
		llmCost: ledger.llmCostUsd,
		paidToolCost: ledger.paidToolCostUsd,
		tavilyCredits: ledger.tavilyCredits,
		uncertainTokenExposure: ledger.uncertainTokenExposure,
		researchObservations
	};
}
