// apps/worker/src/workers/agent-run/agentRunWorker.ts
//
// Phase 1b — the durable Agent Run worker. Executes an Agent Run headlessly:
// runs a JSON action-loop where the LLM either calls a BuildOS op or submits a
// result, executing ops in-process via @buildos/shared-agent-ops (no SvelteKit,
// no chat session). Supports read ops and (for read_write runs) the carved
// gateway write ops; calendar write ops are excluded until the CalendarPort is
// wired in the worker.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AgentRunJobMetadata,
	AgentRunMutationMode,
	ChangeSet,
	Database,
	ProposedChange
} from '@buildos/shared-types';
import {
	AGENT_OP_READ_CATALOG,
	AGENT_OP_WRITE_CATALOG,
	type AgentOpScope,
	defaultAllowedOpsForMode,
	executeAgentOp,
	isWriteOp
} from '@buildos/shared-agent-ops';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';

type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'];
type AgentRunProcessorResult = {
	success: boolean;
	run_id: string;
	status: AgentRunRow['status'];
	message?: string;
};

interface AgentTurn {
	thought?: string;
	action: 'call_op' | 'submit_result';
	// call_op
	op?: string;
	args?: Record<string, unknown>;
	// submit_result
	status?: 'completed' | 'partial' | 'failed' | 'needs_input';
	summary?: string;
	answer?: string;
	open_questions?: string[];
	confidence?: number;
}

interface RunBudgets {
	wall_clock_ms?: number;
	max_tokens?: number;
	max_tool_calls?: number;
}

const DEFAULT_MAX_TOOL_CALLS = 20;
const DEFAULT_WALL_CLOCK_MS = 5 * 60 * 1000;
const TRANSCRIPT_RESULT_CHARS = 4000;

function isContinuationFrom(
	value: unknown
): value is NonNullable<AgentRunJobMetadata['continuation_from']> {
	return value === 'paused' || value === 'needs_input';
}

function isClaimableStatus(
	status: AgentRunRow['status'],
	continuationFrom?: NonNullable<AgentRunJobMetadata['continuation_from']>
): boolean {
	if (continuationFrom === 'paused') return status === 'queued' || status === 'paused';
	if (continuationFrom === 'needs_input') return status === 'queued' || status === 'needs_input';
	return status === 'queued';
}

async function emitEvent(
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
 * Phase 3 (chat integration): when a run was spawned from a chat session
 * (`parent_session_id` set), inject an assistant-authored summary message into
 * that thread on terminal status, so the supervising conversation shows the
 * result even though the original SSE turn has long since ended (01 §7). Keyed
 * by `agent_run_id` in metadata so the chat UI can dedupe / link back.
 */
function buildCompletionMessageContent(
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
	if (body) parts.push(body);
	if (openQuestions.length) {
		parts.push(['**Open questions:**', ...openQuestions.map((q) => `- ${q}`)].join('\n'));
	}
	if (status === 'failed' && error && error !== body) parts.push(error);
	return parts.join('\n\n');
}

async function injectChatCompletionMessage(
	run: AgentRunRow,
	status: AgentRunRow['status'],
	result: Record<string, unknown>
): Promise<void> {
	if (!run.parent_session_id) return;
	const { error } = await supabase.from('chat_messages').insert({
		session_id: run.parent_session_id,
		user_id: run.user_id,
		role: 'assistant',
		content: buildCompletionMessageContent(run, status, result),
		message_type: 'agent_run_summary',
		metadata: {
			agent_run_id: run.id,
			source: 'agent_run',
			run_status: status,
			parent_message_id: run.parent_message_id ?? null
		} as never
	});
	if (error) {
		console.error('[agentRunWorker] failed to inject chat completion message', error.message);
	}
}

async function recordToolExecution(params: {
	runId: string;
	userId: string;
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
}): Promise<void> {
	const isWrite = isWriteOp(params.op);
	// Reads are never staged; a staged write records mutation_mode='stage' + its
	// proposed_change_id. mutation_mode is null for reads (semantically n/a).
	const mutationMode = isWrite ? (params.mutationMode ?? 'commit') : null;
	const { error } = await supabase.from('agent_tool_executions').insert({
		agent_run_id: params.runId,
		user_id: params.userId,
		tool_name: params.op,
		gateway_op: params.op,
		tool_category: isWrite ? 'write' : 'read',
		arguments: params.args as never,
		result: (params.ok ? params.result : null) as never,
		success: params.ok,
		error_message: params.errorMessage ?? null,
		mutation_mode: mutationMode,
		proposed_change_id: params.proposedChangeId ?? null,
		entity_kind: params.entityKind ?? null,
		entity_id: params.entityId ?? null,
		execution_time_ms: params.durationMs
	});
	if (error) {
		console.error('[agentRunWorker] failed to record tool execution', error.message);
	}
}

/**
 * Rebuild the in-memory transcript + accumulated budget for a RESUMED run from
 * persisted ground truth (Phase 3.5). Tool calls come from `agent_tool_executions`
 * and supervisor steers from `run.steer` events; both carry `created_at` so they
 * interleave in the order they happened.
 */
async function reconstructPriorState(
	runId: string,
	priorMetrics: unknown
): Promise<{
	transcript: string[];
	toolCalls: number;
	tokens: number;
	cost: number;
}> {
	const [{ data: execs }, { data: steers }] = await Promise.all([
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
			.order('created_at', { ascending: true })
	]);

	const items: Array<{ at: string; line: string }> = [];
	let toolCalls = 0;
	for (const e of execs ?? []) {
		toolCalls += 1;
		const op = e.gateway_op ?? e.tool_name ?? 'op';
		const resultText = e.success
			? JSON.stringify(e.result ?? {}).slice(0, TRANSCRIPT_RESULT_CHARS)
			: `ERROR: ${e.error_message ?? 'failed'}`;
		items.push({
			at: e.created_at,
			line: `OP ${op} ${JSON.stringify(e.arguments ?? {})} -> ${resultText}`
		});
	}
	for (const s of steers ?? []) {
		const message = (s.payload as { message?: string } | null)?.message;
		if (message) items.push({ at: s.created_at, line: `SUPERVISOR (steer): ${message}` });
	}
	items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

	const m =
		priorMetrics && typeof priorMetrics === 'object' && !Array.isArray(priorMetrics)
			? (priorMetrics as { tokens?: number; cost_usd?: number })
			: null;
	return {
		transcript: items.map((i) => i.line),
		toolCalls,
		tokens: typeof m?.tokens === 'number' ? m.tokens : 0,
		cost: typeof m?.cost_usd === 'number' ? m.cost_usd : 0
	};
}

function parseBudgets(value: unknown): RunBudgets {
	if (!value || typeof value !== 'object') return {};
	const b = value as Record<string, unknown>;
	const numberBudget = (budget: unknown) =>
		typeof budget === 'number' && Number.isFinite(budget) && budget >= 0 ? budget : undefined;
	return {
		wall_clock_ms: numberBudget(b.wall_clock_ms),
		max_tokens: numberBudget(b.max_tokens),
		max_tool_calls: numberBudget(b.max_tool_calls)
	};
}

function buildSystemPrompt(runnableOps: string[]): string {
	const hasWriteOps = runnableOps.some((op) => AGENT_OP_WRITE_CATALOG.includes(op));
	const surfaceLabel = hasWriteOps ? 'read + write' : 'read-only';
	return [
		'You are a focused background agent (an "Agent Run") inside BuildOS.',
		'You work autonomously to accomplish a single goal, then report back. You cannot delegate to other agents.',
		'',
		'Each turn you MUST respond with JSON only, in exactly one of these two shapes:',
		'1) Call an operation:',
		'   { "thought": "<short reasoning>", "action": "call_op", "op": "<op name>", "args": { ... } }',
		'2) Finish and report:',
		'   { "thought": "<short reasoning>", "action": "submit_result", "status": "completed" | "partial" | "needs_input", "summary": "<what you did>", "answer": "<the finding/response>", "open_questions": ["..."] }',
		'',
		`Available operations (${surfaceLabel}): ${runnableOps.length ? runnableOps.join(', ') : '(none in scope)'}`,
		'Most ops accept { "project_id": "<uuid>" }. Use onto.project.list first to discover projects.',
		hasWriteOps
			? '- When the goal calls for creating or updating entities, use the write ops directly; just do the work.'
			: '',
		'',
		'Rules:',
		'- Respond with JSON only. No prose outside the JSON.',
		'- Call ops to gather what you need, then submit_result.',
		'- Use status "completed" only when no user input is required; keep open_questions empty for completed results.',
		'- If you need the user to answer before you can continue, submit_result with status "needs_input" and put the questions in open_questions.',
		'- If you cannot make progress or an op is unavailable, submit_result with status "partial" or "needs_input" and explain in open_questions.'
	]
		.filter(Boolean)
		.join('\n');
}

function buildUserPrompt(
	run: AgentRunRow,
	transcript: string[],
	options: { forceSubmitResult?: boolean } = {}
): string {
	const parts = [
		`GOAL: ${run.goal}`,
		run.instructions ? `INSTRUCTIONS: ${run.instructions}` : '',
		run.expected_output ? `EXPECTED OUTPUT: ${run.expected_output}` : '',
		`CONTEXT: ${run.context_type}${run.project_id ? ` (project_id: ${run.project_id})` : ''}`,
		'',
		transcript.length
			? `Operation history so far:\n${transcript.join('\n\n')}`
			: 'No operations run yet.',
		'',
		options.forceSubmitResult
			? 'TOOL CALL BUDGET EXHAUSTED: Do not call another operation. Submit your final result now using the operation history above.'
			: '',
		'Respond with your next action as JSON.'
	];
	return parts.filter(Boolean).join('\n');
}

export async function processAgentRunJob(job: ProcessingJob<AgentRunJobMetadata>) {
	const runId = job.data.run_id;
	const startedAtMs = Date.now();
	await job.log?.(`Agent Run ${runId} started`);

	const { data: runData, error: runError } = await supabase
		.from('agent_runs')
		.select('*')
		.eq('id', runId)
		.single();
	if (runError || !runData) {
		await job.log?.(`Agent Run not found: ${runError?.message ?? 'missing'}`);
		return {
			success: false,
			run_id: runId,
			status: 'failed' as const,
			message: 'Run not found'
		};
	}
	const initialRun = runData as AgentRunRow;
	// Resume/answer jobs are continuations (Phase 3.5 / UI-P3): rebuild transcript
	// + budget below instead of starting fresh. The input arrives as a pending
	// signal. Stale jobs without this marker may only claim freshly queued runs.
	const continuationFrom = isContinuationFrom(job.data.continuation_from)
		? job.data.continuation_from
		: undefined;
	const isResume = Boolean(continuationFrom);

	if (!isClaimableStatus(initialRun.status, continuationFrom)) {
		await job.log?.(`Agent Run ${runId} skipped; status is ${initialRun.status}`);
		return {
			success: true,
			run_id: runId,
			status: 'skipped' as const,
			message: `Run is ${initialRun.status}; no work claimed`
		};
	}

	const { data: claimedRun, error: claimError } = await supabase
		.from('agent_runs')
		.update({
			status: 'running',
			started_at: initialRun.started_at ?? new Date().toISOString(),
			completed_at: null
		})
		.eq('id', runId)
		.eq('status', initialRun.status)
		.select('*')
		.maybeSingle();

	if (claimError) {
		await job.log?.(`Agent Run claim failed: ${claimError.message}`);
		return {
			success: false,
			run_id: runId,
			status: 'failed' as const,
			message: `Failed to claim run: ${claimError.message}`
		};
	}
	if (!claimedRun) {
		await job.log?.(`Agent Run ${runId} skipped; another job claimed it`);
		return {
			success: true,
			run_id: runId,
			status: 'skipped' as const,
			message: 'Run was already claimed by another job'
		};
	}

	const run = claimedRun as AgentRunRow;
	await emitEvent(runId, 'run.status', { status: 'running' });

	const scope: AgentOpScope = {
		mode: run.scope_mode === 'read_write' ? 'read_write' : 'read_only',
		allowed_ops: run.allowed_ops
	};
	const grantedOps = scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode);
	const runnableOps = grantedOps.filter(
		(op) =>
			AGENT_OP_READ_CATALOG.includes(op) ||
			(scope.mode === 'read_write' && AGENT_OP_WRITE_CATALOG.includes(op))
	);

	// Phase 4: review_required runs STAGE writes into a Change Set instead of
	// committing. Read-only runs never stage (dispatch rejects review+read_only).
	const mutationMode: AgentRunMutationMode =
		run.review_required && scope.mode === 'read_write' ? 'stage' : 'commit';
	const proposedChanges: ProposedChange[] = [];

	const budgets = parseBudgets(run.budgets);
	const maxToolCalls = budgets.max_tool_calls ?? DEFAULT_MAX_TOOL_CALLS;
	const maxTokens = budgets.max_tokens;
	const deadlineMs = startedAtMs + (budgets.wall_clock_ms ?? DEFAULT_WALL_CLOCK_MS);

	const llm = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Agent Run'
	});

	const systemPrompt = buildSystemPrompt(runnableOps);
	const transcript: string[] = [];
	let tokensTotal = 0;
	let costTotal = 0;
	let toolCalls = 0;

	if (isResume) {
		const prior = await reconstructPriorState(runId, run.metrics);
		transcript.push(...prior.transcript);
		toolCalls = prior.toolCalls;
		tokensTotal = prior.tokens;
		costTotal = prior.cost;
		await emitEvent(runId, 'run.narration', { note: 'resumed' });
	}

	const onUsage = (usage: { totalTokens?: number; costUsd?: number } | undefined) => {
		if (usage?.totalTokens) tokensTotal += usage.totalTokens;
		if (usage?.costUsd) costTotal += usage.costUsd;
	};

	const finalize = async (
		status: AgentRunRow['status'],
		result: Record<string, unknown>
	): Promise<AgentRunProcessorResult> => {
		const metrics = {
			tokens: tokensTotal,
			cost_usd: costTotal,
			tool_calls: toolCalls,
			duration_ms: Date.now() - startedAtMs
		};

		// Phase 4: a review run that staged at least one write ends as
		// 'proposal_ready' with a pending Change Set, regardless of the LLM's
		// requested terminal status (it doesn't know writes were staged). A review
		// run that staged nothing finalizes normally (no proposal).
		let finalStatus = status;
		let changeSet: ChangeSet | null = null;
		const isTerminalSuccess =
			status === 'completed' || status === 'partial' || status === 'failed';
		if (mutationMode === 'stage' && proposedChanges.length > 0 && isTerminalSuccess) {
			finalStatus = 'proposal_ready';
			changeSet = {
				run_id: runId,
				status: 'pending',
				changes: proposedChanges,
				created_at: new Date().toISOString()
			};
		}

		const resultWithProposal = changeSet
			? { ...result, metrics, proposed_changes: changeSet }
			: { ...result, metrics };

		// Chat integration: surface the outcome back into the originating thread
		// BEFORE flipping status — the chat UI reloads its thread when it sees a
		// session run go terminal, so the injected message must already exist.
		await injectChatCompletionMessage(run, finalStatus, resultWithProposal);
		await supabase
			.from('agent_runs')
			.update({
				status: finalStatus,
				result: resultWithProposal as never,
				metrics: metrics as never,
				change_set: (changeSet ?? null) as never,
				completed_at: new Date().toISOString()
			})
			.eq('id', runId);
		if (changeSet) {
			await emitEvent(runId, 'run.proposal', {
				change_count: changeSet.changes.length
			});
		}
		await emitEvent(runId, 'run.status', { status: finalStatus });
		return { success: finalStatus === 'completed', run_id: runId, status: finalStatus };
	};

	const hardBudgetExhaustionReason = (): string | null => {
		if (Date.now() > deadlineMs) return 'wall-clock budget exhausted';
		if (maxTokens !== undefined && tokensTotal >= maxTokens) return 'token budget exhausted';
		return null;
	};
	const toolCallBudgetReached = () => toolCalls >= maxToolCalls;

	const finalizeBudgetExhausted = async (reason: string) => {
		await emitEvent(runId, 'run.narration', {
			note: 'budget exhausted',
			reason,
			toolCalls,
			maxToolCalls,
			tokens: tokensTotal,
			maxTokens
		});
		return finalize('partial', {
			summary: `Stopped: ${reason} before submitting a result.`,
			answer: transcript.slice(-1)[0] ?? '',
			open_questions: ['Run did not finish within budget.']
		});
	};

	const drainControlSignals = async (): Promise<
		{ kind: 'none' | 'steered' } | { kind: 'return'; result: AgentRunProcessorResult }
	> => {
		// Drain control signals at loop boundaries (steering, 01 §9/§10):
		// cancel → finalize; steer → inject into the transcript; pause → checkpoint
		// and release the worker (resume re-enqueues + reconstructs state).
		const { data: pendingSignals } = await supabase
			.from('agent_run_signals')
			.select('id, kind, payload, created_at')
			.eq('run_id', runId)
			.is('consumed_at', null)
			.order('created_at', { ascending: true });

		const consumeAllSignals = () =>
			supabase
				.from('agent_run_signals')
				.update({ consumed_at: new Date().toISOString() })
				.eq('run_id', runId)
				.is('consumed_at', null);

		if (pendingSignals?.some((s) => s.kind === 'cancel')) {
			await consumeAllSignals();
			await emitEvent(runId, 'run.narration', { note: 'cancelled by user' });
			return {
				kind: 'return',
				result: await finalize('cancelled', {
					summary: 'Run cancelled by user.',
					answer: transcript.slice(-1)[0] ?? ''
				})
			};
		}

		// Steer: inject each supervisor message into the transcript (persisted as a
		// run.steer event so it survives pause/resume), and emit run.steer so the
		// UI flips the pending chip to applied.
		let appliedSteer = false;
		for (const s of pendingSignals ?? []) {
			if (s.kind !== 'steer') continue;
			const message = (s.payload as { message?: string } | null)?.message?.trim();
			if (!message) continue;
			transcript.push(`SUPERVISOR (steer): ${message}`);
			await emitEvent(runId, 'run.steer', { message });
			appliedSteer = true;
		}

		if (pendingSignals?.some((s) => s.kind === 'pause')) {
			await consumeAllSignals();
			await supabase
				.from('agent_runs')
				.update({
					status: 'paused',
					metrics: {
						tokens: tokensTotal,
						cost_usd: costTotal,
						tool_calls: toolCalls,
						duration_ms: Date.now() - startedAtMs
					} as never
				})
				.eq('id', runId);
			await emitEvent(runId, 'run.status', { status: 'paused' });
			return {
				kind: 'return',
				result: { success: false, run_id: runId, status: 'paused' as const }
			};
		}

		// Steers + any resume markers handled — mark them consumed.
		if (pendingSignals?.length) {
			await consumeAllSignals();
		}

		return { kind: appliedSteer ? 'steered' : 'none' };
	};

	// Main JSON action-loop.
	for (let iteration = 0; ; iteration++) {
		const signalDrain = await drainControlSignals();
		if (signalDrain.kind === 'return') {
			return signalDrain.result;
		}

		const exhaustedBeforeTurn = hardBudgetExhaustionReason();
		if (exhaustedBeforeTurn) {
			return finalizeBudgetExhausted(exhaustedBeforeTurn);
		}

		let turn: AgentTurn;
		try {
			turn = await llm.getJSONResponse<AgentTurn>({
				systemPrompt,
				userPrompt: buildUserPrompt(run, transcript, {
					forceSubmitResult: toolCallBudgetReached()
				}),
				userId: run.user_id,
				profile: 'balanced',
				validation: { retryOnParseError: true, maxRetries: 2 },
				operationType: 'other',
				metadata: { agent_run_id: runId },
				onUsage
			});
		} catch (error) {
			await emitEvent(runId, 'run.narration', {
				error: error instanceof Error ? error.message : String(error)
			});
			return finalize('failed', {
				summary: 'The agent loop failed while requesting the next action.',
				answer: '',
				error: error instanceof Error ? error.message : String(error)
			});
		}

		const postTurnSignalDrain = await drainControlSignals();
		if (postTurnSignalDrain.kind === 'return') {
			return postTurnSignalDrain.result;
		}
		if (postTurnSignalDrain.kind === 'steered') {
			continue;
		}

		if (turn.thought) {
			await emitEvent(runId, 'run.narration', { thought: turn.thought });
		}

		if (turn.action === 'submit_result') {
			const openQuestions = (turn.open_questions ?? [])
				.filter((q) => typeof q === 'string' && q.trim())
				.map((q) => q.trim());
			const status: AgentRunRow['status'] =
				turn.status === 'needs_input' ||
				((turn.status === undefined || turn.status === 'completed') &&
					openQuestions.length > 0)
					? 'needs_input'
					: turn.status === 'partial'
						? 'partial'
						: turn.status === 'failed'
							? 'failed'
							: 'completed';
			return finalize(status, {
				summary: turn.summary ?? '',
				answer: turn.answer ?? turn.summary ?? '',
				open_questions: openQuestions,
				confidence: turn.confidence
			});
		}

		if (toolCallBudgetReached()) {
			return finalizeBudgetExhausted('tool-call budget exhausted');
		}

		const exhaustedAfterTurn = hardBudgetExhaustionReason();
		if (exhaustedAfterTurn) {
			return finalizeBudgetExhausted(exhaustedAfterTurn);
		}

		// action === 'call_op'
		const op = (turn.op ?? '').trim();
		const args = (turn.args && typeof turn.args === 'object' ? turn.args : {}) as Record<
			string,
			unknown
		>;
		toolCalls += 1;
		await emitEvent(runId, 'run.tool_call', { op, args });

		const opStart = Date.now();
		const result = await executeAgentOp(
			{
				admin: supabase as SupabaseClient<Database>,
				userId: run.user_id,
				scope,
				runContext: {
					context_type: run.context_type === 'project' ? 'project' : 'global',
					project_id: run.project_id
				},
				mutationMode
			},
			op,
			args
		);
		const durationMs = Date.now() - opStart;

		// Phase 4: a staged write returns a ProposedChange (no mutation). Assign a
		// stable id, accumulate it into the run's Change Set, and key telemetry to
		// it so `proposed_changes` and `agent_tool_executions` stay consistent.
		let proposedChangeId: string | undefined;
		if (result.ok && result.proposedChange) {
			proposedChangeId = randomUUID();
			proposedChanges.push({ id: proposedChangeId, ...result.proposedChange });
		}

		await recordToolExecution({
			runId,
			userId: run.user_id,
			op,
			args,
			ok: result.ok,
			result: result.data,
			errorMessage: result.error?.message,
			durationMs,
			entityKind: result.entityKind,
			entityId: result.entityId,
			mutationMode,
			proposedChangeId
		});
		await emitEvent(runId, 'run.tool_result', {
			op,
			ok: result.ok,
			error: result.error ?? null
		});

		const resultText = result.ok
			? JSON.stringify(result.data).slice(0, TRANSCRIPT_RESULT_CHARS)
			: `ERROR ${result.error?.code}: ${result.error?.message}`;
		transcript.push(`OP ${op} ${JSON.stringify(args)} -> ${resultText}`);
	}
}
