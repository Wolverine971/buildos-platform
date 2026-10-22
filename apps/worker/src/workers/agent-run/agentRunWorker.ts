// apps/worker/src/workers/agent-run/agentRunWorker.ts
//
// Durable Agent Run worker. Executes an Agent Run headlessly:
// runs a JSON action-loop where the LLM either calls a BuildOS op or submits a
// result, executing ops in-process via @buildos/shared-agent-ops (no SvelteKit,
// no chat session). Supports read ops and (for read_write runs) the shared
// gateway write ops; calendar ops are capability-gated on worker OAuth/token
// encryption env before they are offered to the LLM. Worker-only web visit is
// SSRF-safe, while web search is additionally gated on a Tavily key.

import { createAgentRunAccounting } from './agentRunAccounting';
import { persistAgentRunPageEvidence } from './agentRunPageEvidence';
import {
	buildCompletionMessageContent,
	emitEvent,
	mergeEntityTouches,
	normalizeEntityTouches,
	reconcileSourceProjectSuggestion,
	reconstructPriorState,
	recordToolExecution,
	transcriptResultCharsForOp
} from './agentRunJournal';
import {
	buildForcedFinalSystemPrompt,
	buildSystemPrompt,
	buildUserPrompt,
	shouldUseDurableResearchContext
} from './agentRunPrompt';
export { buildForcedFinalSystemPrompt, shouldUseDurableResearchContext } from './agentRunPrompt';
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
	AGENT_OP_WEB_SEARCH,
	AGENT_OP_WEB_VISIT,
	type AgentOpScope,
	buildAgentRunOpCatalog,
	createAgentRunCalendarPort,
	executeAgentOp,
	isWriteOp,
	syncInboxItemForAgentRun
} from '@buildos/shared-agent-ops';
import {
	buildGatewayEntityUrl,
	buildGatewayProjectUrl,
	entityActionForGatewayOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	type NativeSearchCacheRpcClient,
	createSupabaseNativeSearchDiscoveryCacheStore
} from '@buildos/shared-agent-ops/web/native-search';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import {
	DEEPSEEK_V4_FLASH_MODEL,
	OpenRouterEmptyContentError,
	hasOpenRouterGenerationId,
	shouldFailoverToNextOpenRouterModel
} from '@buildos/smart-llm';
import { LLMSpendLimitError, SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	AgentRunSupersededError,
	assertAgentRunNotAborted,
	assertAgentRunOwnership,
	checkpointAgentRun
} from './agentRunLifecycle';
import { RETIRED_RESEARCH_MESSAGE, isRetiredResearchRun } from './agentRunRetirement';
import {
	formatAgentRunTranscriptArgs,
	formatAgentRunTranscriptResult
} from './transcript-security';
import {
	type WebResearchObservations,
	mergeWebResearchObservations,
	observeWebResearchToolResult
} from './webResearchEvidence';
import { createAgentRunWebUrlCapabilityLedger } from './webUrlCapabilityLedger';
import {
	isAgentRunWebSearch,
	pinAgentRunWebSearchArgs,
	resolveSegregatedAgentRunAllowedOps
} from './webSecurityPolicy';
import {
	renderWebResearchFinalizationContext,
	renderWebResearchInterruptedAnswer,
	renderWebResearchWorkingContext,
	resolveAgentRunHardTokenLimit,
	resolveAgentRunTokenPlan
} from './agentRunRuntimePolicy';
import { canReservePaidToolCost, resolveAgentRunLlmSpendLimit } from './agentRunCostPolicy';
import { AgentRunCostLedgerError } from './agentRunCostLedger';
import {
	enforceReviewStageCompletion,
	findReplaceableStagedCreateIndex,
	resolveAgentRunCancellationSource,
	resolveAgentRunModelPolicy,
	shouldRepairReviewStageSubmission
} from './agentRunPolicy';
import {
	createAgentRunWebResearchPort,
	estimateTavilySearchCharge,
	resolveTavilyCreditCostUsd
} from './webResearchPort';

type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'];
type AgentRunProcessorResult = {
	success: boolean;
	run_id: string;
	// 'superseded': this executor was fenced out by a newer claim generation
	// and intentionally wrote nothing — the queue job result records why.
	status: AgentRunRow['status'] | 'superseded';
	message?: string;
};

export interface AgentTurn {
	thought?: string;
	action: 'call_op' | 'call_ops' | 'submit_result';
	// call_op
	op?: string;
	args?: Record<string, unknown>;
	// call_ops — bounded batch of independent operations, executed in order.
	ops?: Array<{ op?: string; args?: Record<string, unknown> }>;
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
	max_cost_usd?: number;
}

const DEFAULT_MAX_TOOL_CALLS = 20;
const MAX_OPS_PER_TURN = 8;

export function resolveAgentTurnOperationCalls(turn: AgentTurn): Array<{
	op: string;
	args: Record<string, unknown>;
}> {
	const candidates =
		turn.action === 'call_ops' && Array.isArray(turn.ops)
			? turn.ops
			: turn.action === 'call_op'
				? [{ op: turn.op, args: turn.args }]
				: [];
	return candidates
		.filter((candidate) => candidate && typeof candidate === 'object')
		.map((candidate) => ({
			op: typeof candidate.op === 'string' ? candidate.op.trim() : '',
			args:
				candidate.args &&
				typeof candidate.args === 'object' &&
				!Array.isArray(candidate.args)
					? candidate.args
					: {}
		}))
		.filter((candidate) => candidate.op.length > 0)
		.slice(0, MAX_OPS_PER_TURN);
}

// Budgeted-reservation attempt keys MUST include the job's retry ordinal. A queue
// retry re-runs the SAME job (same queue_job_id) with an incremented `attempts`
// count. Without the ordinal, a retry reuses the prior attempt's key and the cost
// ledger rejects it as a duplicate attempt, which kills the run. Including the
// ordinal makes a retry reserve FRESH budget (the prior attempt's exposure stays
// counted in the ledger and is settled by the reconciler); the retry either gets
// fresh budget or fails closed on budget_exceeded. The iteration/stage/toolCalls
// components keep keys stable WITHIN a single job run.
export function turnAttemptKey(
	jobId: string,
	jobAttempts: number,
	iteration: number,
	providerAttempt = 0
): string {
	const base = `llm:${jobId}:a${jobAttempts}:turn:${iteration}`;
	return providerAttempt > 0 ? `${base}:fallback:${providerAttempt}` : base;
}

export function shouldRetryAgentRunLlmTurn(error: unknown): boolean {
	const chain: unknown[] = [];
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (current && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		current =
			typeof current === 'object' && current !== null && 'cause' in current
				? (current as { cause?: unknown }).cause
				: undefined;
	}
	// A generation id proves OpenRouter accepted the request. Retrying that
	// uncertain request could pay for duplicate work even when the response was
	// merely lost after acceptance.
	if (chain.some((item) => hasOpenRouterGenerationId(item))) return false;
	return chain.some(
		(item) =>
			item instanceof OpenRouterEmptyContentError ||
			(item instanceof Error &&
				item.message.toLowerCase().includes('openrouter returned empty content')) ||
			shouldFailoverToNextOpenRouterModel(item)
	);
}

export function toolAttemptKey(
	jobId: string,
	jobAttempts: number,
	toolCalls: number,
	op: string
): string {
	return `tool:${jobId}:a${jobAttempts}:${toolCalls}:${op}`;
}

function isContinuationFrom(value: unknown): value is 'paused' | 'needs_input' | 'partial' {
	return value === 'paused' || value === 'needs_input' || value === 'partial';
}

function isClaimableStatus(
	run: AgentRunRow,
	continuationFrom?: NonNullable<AgentRunJobMetadata['continuation_from']>,
	jobAttempts = 0
): boolean {
	if (continuationFrom === 'paused') return run.status === 'queued' || run.status === 'paused';
	if (continuationFrom === 'needs_input')
		return run.status === 'queued' || run.status === 'needs_input';
	if (continuationFrom === 'partial') return run.status === 'queued' || run.status === 'partial';
	if (isAgentRunQueueRetryResume(jobAttempts, run.status)) return true;
	return run.status === 'queued';
}

export function isAgentRunQueueRetryResume(jobAttempts: number, runStatus: string): boolean {
	return Number.isInteger(jobAttempts) && jobAttempts > 0 && runStatus === 'running';
}

export function parseBudgets(value: unknown): RunBudgets {
	if (!value || typeof value !== 'object') return {};
	const b = value as Record<string, unknown>;
	// Budgets are read back from a JSONB column. A finite, non-negative budget
	// must be honored whether the row stores it as a JSON number OR a numeric
	// string. The previous `typeof === 'number'` check silently dropped a
	// stringified `max_cost_usd` (e.g. "0.156"), which made
	// resolveAgentRunLlmSpendLimit() return `undefined`; the turn loop then made
	// an UNRESERVED, unbudgeted paid LLM call while still recording spend through
	// the onUsage fallback (zero `agent_run_cost_entries` rows despite the run
	// carrying a budget). Mirrors finiteNumber() in agentRunCostLedger.ts.
	const numberBudget = (budget: unknown): number | undefined => {
		const numeric =
			typeof budget === 'number'
				? budget
				: typeof budget === 'string' && budget.trim() !== ''
					? Number(budget)
					: Number.NaN;
		return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
	};
	return {
		wall_clock_ms: numberBudget(b.wall_clock_ms),
		max_tokens: numberBudget(b.max_tokens),
		max_tool_calls: numberBudget(b.max_tool_calls),
		max_cost_usd: numberBudget(b.max_cost_usd)
	};
}

function trimmedEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function positiveIntegerEnv(name: string): number | undefined {
	const raw = trimmedEnv(name);
	if (!raw) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function booleanEnv(name: string): boolean {
	return ['1', 'true', 'yes'].includes((trimmedEnv(name) ?? '').toLowerCase());
}

function resolveExecutorRelease(): string {
	return (
		trimmedEnv('RAILWAY_GIT_COMMIT_SHA') ??
		trimmedEnv('SOURCE_REVISION') ??
		trimmedEnv('VERCEL_GIT_COMMIT_SHA') ??
		'unknown'
	);
}

async function createCalendarPortForRun(userId: string) {
	const clientId = trimmedEnv('PRIVATE_GOOGLE_CLIENT_ID') ?? trimmedEnv('GOOGLE_CLIENT_ID');
	const clientSecret =
		trimmedEnv('PRIVATE_GOOGLE_CLIENT_SECRET') ?? trimmedEnv('GOOGLE_CLIENT_SECRET');
	const tokenEncryptionKey = trimmedEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY');

	if (!clientId || !clientSecret || !tokenEncryptionKey) {
		return null;
	}

	// Agent Run still uses the legacy single-account token port. Once a user has
	// an active source-aware connection, silently falling back to that row could
	// read or mutate the wrong Google account. Fail closed until this worker port
	// accepts an explicit calendar source identity.
	const { data: sourceAwareConnections, error: sourceAwareConnectionError } = await supabase
		.from('user_calendar_connections')
		.select('id')
		.eq('user_id', userId)
		.eq('provider', 'google_calendar')
		.eq('status', 'active')
		.is('deleted_at', null)
		.limit(1);

	if (sourceAwareConnectionError) {
		console.error('[agentRunWorker] failed to check source-aware calendar availability', {
			error: sourceAwareConnectionError.message
		});
		return null;
	}

	if ((sourceAwareConnections?.length ?? 0) > 0) {
		return null;
	}

	const { data: tokenRow, error: tokenError } = await supabase
		.from('user_calendar_tokens')
		.select('access_token, refresh_token')
		.eq('user_id', userId)
		.maybeSingle();

	if (tokenError) {
		console.error('[agentRunWorker] failed to check calendar token availability', {
			error: tokenError.message
		});
		return null;
	}

	if (!tokenRow?.access_token || !tokenRow.refresh_token) {
		return null;
	}

	return createAgentRunCalendarPort({
		admin: supabase as SupabaseClient<Database>,
		userId,
		credentials: { clientId, clientSecret }
	});
}

export async function processAgentRunJob(job: ProcessingJob<AgentRunJobMetadata>) {
	try {
		return await executeAgentRunJob(job);
	} catch (error) {
		if (error instanceof AgentRunSupersededError)
			return {
				success: false,
				run_id: job.data.run_id,
				status: 'superseded' as const,
				message: error.message
			};
		throw error;
	}
}

async function executeAgentRunJob(job: ProcessingJob<AgentRunJobMetadata>) {
	assertAgentRunNotAborted(job.signal);
	const runId = job.data.run_id;
	// The queue exposes this job's retry ordinal (0 on first execution, then
	// incremented by fail_queue_job/reset_stalled_jobs). Every paid-attempt key
	// includes it so a retry reserves fresh budget instead of hitting duplicate_attempt.
	const jobAttempts = job.attempts ?? 0;
	const startedAtMs = Date.now();
	await job.log?.(`Agent Run ${runId} started`);

	const { data: runData, error: runError } = await supabase
		.from('agent_runs')
		.select('*')
		.eq('id', runId)
		.maybeSingle();
	// The queue retries thrown failures; a returned failure is a completed job.
	// Never turn a transient database outage into a stranded run with no retry.
	if (runError) throw new Error(`Failed to load Agent Run: ${runError.message}`);
	if (!runData) {
		await job.log?.('Agent Run not found');
		return {
			success: false,
			run_id: runId,
			status: 'failed' as const,
			message: 'Run not found'
		};
	}
	const initialRun = runData as AgentRunRow;
	// Retired trees are cancelled before any model client or cost reservation.
	const retired = isRetiredResearchRun(initialRun);
	// Resume/answer jobs are continuations: rebuild transcript
	// + budget below instead of starting fresh. The input arrives as a pending
	// signal. Stale jobs without this marker may only claim freshly queued runs.
	const continuationFrom = isContinuationFrom(job.data.continuation_from)
		? job.data.continuation_from
		: undefined;
	const isResume =
		Boolean(continuationFrom) || isAgentRunQueueRetryResume(jobAttempts, initialRun.status);

	if (
		!isClaimableStatus(initialRun, continuationFrom, jobAttempts) &&
		!(
			retired &&
			['running', 'paused', 'needs_input', 'proposal_ready'].includes(initialRun.status)
		)
	) {
		await job.log?.(`Agent Run ${runId} skipped; status is ${initialRun.status}`);
		return {
			success: true,
			run_id: runId,
			status: 'skipped' as const,
			message: `Run is ${initialRun.status}; no work claimed`
		};
	}

	// Execution fencing (2026-07-23 audit): claim by compare-and-swap on
	// (status, execution_generation). Concurrent claimers read the same
	// generation; only one CAS wins. Every critical run update below is
	// predicated on OUR generation so a zombie executor (timed-out but still
	// running) can no longer finalize or pause a run a newer executor owns.
	const previousGeneration = initialRun.execution_generation;
	const executionGeneration = previousGeneration + 1;

	const { data: claimedRun, error: claimError } = await supabase
		.from('agent_runs')
		.update({
			status: 'running',
			started_at: initialRun.started_at ?? new Date().toISOString(),
			completed_at: null,
			execution_generation: executionGeneration
		})
		.eq('id', runId)
		.eq('status', initialRun.status)
		.eq('execution_generation', previousGeneration)
		.is('commit_started_at', null)
		.select('*')
		.maybeSingle();

	if (claimError) {
		throw new Error(`Failed to claim Agent Run: ${claimError.message}`);
	}
	if (!claimedRun) {
		await job.log?.(`Agent Run ${runId} skipped; another executor claimed it`);
		return {
			success: true,
			run_id: runId,
			status: 'skipped' as const,
			message: 'Run was already claimed by another executor'
		};
	}

	const run = claimedRun as AgentRunRow;

	const checkpoint = (
		patch: Record<string, unknown>,
		signalIds: string[] = [],
		completionContent?: string
	) =>
		checkpointAgentRun({
			runId,
			generation: executionGeneration,
			patch,
			signalIds,
			completionContent,
			signal: job.signal
		});
	if (retired) {
		const result = {
			summary: RETIRED_RESEARCH_MESSAGE,
			answer: '',
			error: 'deep_research_retired'
		};
		await checkpoint(
			{ status: 'cancelled', result, completed_at: new Date().toISOString() },
			[],
			buildCompletionMessageContent(run, 'cancelled', result)
		);
		return { success: false, run_id: runId, status: 'cancelled' as const };
	}
	await emitEvent(runId, 'run.status', { status: 'running' });

	const segregatedScope = resolveSegregatedAgentRunAllowedOps({
		mode: run.scope_mode === 'read_write' ? 'read_write' : 'read_only',
		allowedOps: run.allowed_ops
	});
	const scope: AgentOpScope = {
		mode: run.scope_mode === 'read_write' ? 'read_write' : 'read_only',
		allowed_ops: segregatedScope.allowedOps
	};
	const usesDurableResearchContext = shouldUseDurableResearchContext({
		effort: run.effort === 'deep' ? 'deep' : 'standard',
		scopeMode: run.scope_mode === 'read_write' ? 'read_write' : 'read_only',
		allowedOps: run.allowed_ops
	});

	// review_required runs STAGE writes into a Change Set instead of
	// committing. Read-only runs never stage (dispatch rejects review+read_only).
	const mutationMode: AgentRunMutationMode =
		run.review_required && scope.mode === 'read_write' ? 'stage' : 'commit';

	const budgets = parseBudgets(run.budgets);
	const modelPolicy = resolveAgentRunModelPolicy(run.effort);
	const maxToolCalls = budgets.max_tool_calls ?? DEFAULT_MAX_TOOL_CALLS;
	const maxTokens = budgets.max_tokens;
	const hardTokenLimit = resolveAgentRunHardTokenLimit(maxTokens, run.effort === 'deep');
	const maxCostUsd = budgets.max_cost_usd;
	const deadlineMs = startedAtMs + (budgets.wall_clock_ms ?? modelPolicy.defaultWallClockMs);

	const transcript: string[] = [];
	const accounting = createAgentRunAccounting({
		run,
		jobId: job.id,
		maxCostUsd,
		assertOwnership: () => assertAgentRunOwnership(runId, executionGeneration, job.signal)
	});
	const { totals } = accounting;
	let toolCalls = 0;
	let reviewStageSubmissionRepairAttempts = 0;
	let researchObservations: WebResearchObservations = {
		searchQueries: [],
		searchResults: [],
		visitedSources: []
	};

	const calendar = await createCalendarPortForRun(run.user_id);
	const tavilyCreditCostUsd = resolveTavilyCreditCostUsd();
	const searchCacheStore = booleanEnv('NATIVE_SEARCH_DURABLE_CACHE_ENABLED')
		? createSupabaseNativeSearchDiscoveryCacheStore(
				supabase as unknown as NativeSearchCacheRpcClient
			)
		: undefined;
	const web = createAgentRunWebResearchPort({
		searchTimeoutMs: positiveIntegerEnv('AGENT_RUN_WEB_SEARCH_TIMEOUT_MS'),
		visitTimeoutMs: positiveIntegerEnv('AGENT_RUN_WEB_VISIT_TIMEOUT_MS'),
		visitMaxBytes: positiveIntegerEnv('AGENT_RUN_WEB_VISIT_MAX_BYTES'),
		tavilyCreditCostUsd,
		searchCacheStore,
		pageEvidenceSink: (page, signal) => persistAgentRunPageEvidence(page, run.user_id, signal),
		onSearchDispatched: accounting.onSearchDispatched
	});
	const runnableOps = buildAgentRunOpCatalog({
		scope,
		mutationMode,
		calendar,
		web
	});
	const savedChangeSet = run.change_set as unknown as ChangeSet | null;
	const proposedChanges: ProposedChange[] =
		savedChangeSet?.status === 'pending' && Array.isArray(savedChangeSet.changes)
			? [...savedChangeSet.changes]
			: [];
	const executorRelease = resolveExecutorRelease();
	await emitEvent(runId, 'run.policy', {
		review_required: run.review_required,
		scope_mode: scope.mode,
		mutation_mode: mutationMode,
		has_write_ops: runnableOps.some((op) => isWriteOp(op)),
		web_scope_removed: segregatedScope.webScopeRemoved,
		executor_release: executorRelease
	});

	const llm = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Agent Run'
	});

	const systemPrompt = buildSystemPrompt(
		runnableOps,
		run.effort === 'deep' ? 'deep' : 'standard',
		mutationMode
	);
	const finalSystemPrompt = buildForcedFinalSystemPrompt(
		systemPrompt,
		usesDurableResearchContext
	);
	const committedEntityTouches = normalizeEntityTouches(
		(run.result as Record<string, unknown> | null)?.entities_touched
	);
	const webUrlCapabilities = createAgentRunWebUrlCapabilityLedger([
		run.goal,
		run.instructions,
		run.expected_output
	]);

	if (isResume) {
		const prior = await reconstructPriorState(
			runId,
			run.metrics,
			run.result,
			continuationFrom ?? initialRun.status,
			initialRun.completed_at
		);
		transcript.push(...prior.transcript);
		toolCalls = prior.toolCalls;
		totals.tokens = prior.tokens;
		totals.cost = prior.cost;
		researchObservations = prior.researchObservations;
		webUrlCapabilities.observeSearchResult({ results: researchObservations.searchResults });
		for (const source of researchObservations.visitedSources) {
			webUrlCapabilities.observeVisitResult({
				url: source.requestedUrl,
				final_url: source.finalUrl
			});
		}
		const priorMetrics =
			run.metrics && typeof run.metrics === 'object' && !Array.isArray(run.metrics)
				? (run.metrics as Record<string, unknown>)
				: {};
		totals.llmCost = Math.max(
			typeof priorMetrics.llm_cost_usd === 'number' ? priorMetrics.llm_cost_usd : 0,
			prior.llmCost
		);
		totals.paidToolCost = Math.max(
			typeof priorMetrics.paid_tool_cost_usd === 'number'
				? priorMetrics.paid_tool_cost_usd
				: 0,
			prior.paidToolCost
		);
		totals.tavilyCredits = Math.max(
			typeof priorMetrics.tavily_credits === 'number' ? priorMetrics.tavily_credits : 0,
			prior.tavilyCredits
		);
		totals.uncertainTokenExposure = Math.max(
			typeof priorMetrics.uncertain_token_exposure === 'number'
				? priorMetrics.uncertain_token_exposure
				: 0,
			prior.uncertainTokenExposure
		);
		await emitEvent(runId, 'run.narration', { note: 'resumed' });
	}

	const finalize = async (
		status: AgentRunRow['status'],
		result: Record<string, unknown>,
		signalIds: string[] = []
	): Promise<AgentRunProcessorResult> => {
		const metrics = {
			tokens: totals.tokens,
			uncertain_token_exposure: totals.uncertainTokenExposure,
			token_target: maxTokens ?? null,
			token_hard_limit: hardTokenLimit ?? null,
			token_target_exceeded: maxTokens !== undefined && totals.tokens > maxTokens,
			cost_usd: totals.cost,
			llm_cost_usd: totals.llmCost,
			paid_tool_cost_usd: totals.paidToolCost,
			tavily_credits: totals.tavilyCredits,
			tool_calls: toolCalls,
			review_stage_submission_repair_attempts: reviewStageSubmissionRepairAttempts,
			executor_release: executorRelease,
			duration_ms: Date.now() - startedAtMs
		};

		// A review run that staged at least one write ends as
		// 'proposal_ready' with a pending Change Set, regardless of the LLM's
		// requested terminal status (it doesn't know writes were staged). A
		// completed review run that staged nothing fails closed as partial; the
		// database completion guard independently enforces the same invariant.
		const reviewStageCompletion = enforceReviewStageCompletion({
			mutationMode,
			proposedChangeCount: proposedChanges.length,
			status,
			result
		});
		let finalStatus = reviewStageCompletion.status;
		const finalResult = reviewStageCompletion.result;
		let changeSet: ChangeSet | null = null;
		const isTerminalSuccess =
			finalStatus === 'completed' || finalStatus === 'partial' || finalStatus === 'failed';
		if (mutationMode === 'stage' && proposedChanges.length > 0) {
			if (isTerminalSuccess) finalStatus = 'proposal_ready';
			changeSet = {
				run_id: runId,
				status: 'pending',
				changes: proposedChanges,
				created_at: new Date().toISOString()
			};
		}

		const priorResult =
			run.result && typeof run.result === 'object' && !Array.isArray(run.result)
				? (run.result as Record<string, unknown>)
				: {};
		const entitiesTouched = mergeEntityTouches(
			normalizeEntityTouches(priorResult.entities_touched),
			normalizeEntityTouches(finalResult.entities_touched),
			committedEntityTouches
		);
		const resultWithProposal = changeSet
			? {
					...finalResult,
					entities_touched: entitiesTouched,
					metrics,
					proposed_changes: changeSet
				}
			: { ...finalResult, entities_touched: entitiesTouched, metrics };

		const completedAt = new Date().toISOString();
		await checkpoint(
			{
				status: finalStatus,
				result: resultWithProposal,
				metrics,
				change_set: changeSet,
				completed_at: completedAt
			},
			signalIds,
			buildCompletionMessageContent(run, finalStatus, resultWithProposal)
		);
		await reconcileSourceProjectSuggestion({
			run,
			finalStatus,
			result: resultWithProposal,
			completedAt
		});
		if (changeSet) {
			try {
				await syncInboxItemForAgentRun({
					supabase,
					run: {
						...(run as unknown as Record<string, unknown>),
						status: finalStatus,
						result: resultWithProposal,
						metrics,
						change_set: changeSet,
						completed_at: completedAt
					}
				});
			} catch (error) {
				console.warn(
					`⚠️ Failed to sync AI Inbox item for agent run ${runId}:`,
					error instanceof Error ? error.message : error
				);
			}
			await emitEvent(runId, 'run.proposal', {
				change_count: changeSet.changes.length
			});
		}
		await emitEvent(runId, 'run.status', { status: finalStatus });
		return { success: finalStatus === 'completed', run_id: runId, status: finalStatus };
	};

	const hardBudgetExhaustionReason = (): string | null => {
		if (Date.now() > deadlineMs) return 'wall-clock budget exhausted';
		if (hardTokenLimit !== undefined && totals.tokens >= hardTokenLimit) {
			return 'token hard ceiling exhausted';
		}
		if (maxCostUsd !== undefined && totals.cost >= maxCostUsd) {
			return 'cost budget exhausted';
		}
		return null;
	};
	const toolCallBudgetReached = () => toolCalls >= maxToolCalls;

	const finalizeBudgetExhausted = async (reason: string) => {
		await emitEvent(runId, 'run.narration', {
			note: 'budget exhausted',
			reason,
			toolCalls,
			maxToolCalls,
			tokens: totals.tokens,
			maxTokens,
			hardTokenLimit,
			costUsd: totals.cost,
			maxCostUsd
		});
		return finalize('partial', {
			summary: `Stopped: ${reason} before submitting a result.`,
			answer: usesDurableResearchContext
				? renderWebResearchInterruptedAnswer(researchObservations)
				: '',
			open_questions: ['Run did not finish within budget.']
		});
	};

	const drainControlSignals = async (): Promise<
		{ kind: 'none' | 'steered' } | { kind: 'return'; result: AgentRunProcessorResult }
	> => {
		// Drain control signals at loop boundaries (steering, 01 §9/§10):
		// cancel → finalize; steer → inject into the transcript; pause → checkpoint
		// and release the worker (resume re-enqueues + reconstructs state).
		const { data: pendingSignals, error: signalError } = await supabase
			.from('agent_run_signals')
			.select('id, kind, payload, created_at')
			.eq('run_id', runId)
			.is('consumed_at', null)
			.order('created_at', { ascending: true });
		if (signalError)
			throw new Error(`Failed to read Agent Run signals: ${signalError.message}`);
		const { data: parentCancelSignals, error: parentSignalError } = run.parent_run_id
			? await supabase
					.from('agent_run_signals')
					.select('id')
					.eq('run_id', run.parent_run_id)
					.eq('kind', 'cancel')
					.is('consumed_at', null)
					.limit(1)
			: { data: null, error: null };
		const { data: parentRunState, error: parentRunError } = run.parent_run_id
			? await supabase
					.from('agent_runs')
					.select('status')
					.eq('id', run.parent_run_id)
					.maybeSingle()
			: { data: null, error: null };

		if (parentSignalError || parentRunError)
			throw new Error(
				`Failed to read parent control state: ${(parentSignalError ?? parentRunError)!.message}`
			);
		// Consume only the signals this drain read. A signal inserted after the
		// SELECT (e.g. Stop pressed right after a steer) must survive to the next
		// boundary instead of being marked consumed unseen.
		const pendingSignalIds = (pendingSignals ?? []).map((signal) => signal.id);

		const cancellationSource = resolveAgentRunCancellationSource({
			pendingSignalKinds: (pendingSignals ?? []).map((signal) => signal.kind),
			parentRunId: run.parent_run_id,
			parentCancelSignalCount: parentCancelSignals?.length ?? 0,
			parentStatus: parentRunState?.status
		});
		if (cancellationSource) {
			await emitEvent(runId, 'run.narration', {
				note:
					cancellationSource === 'parent'
						? 'stopped with parent run'
						: 'cancelled by user'
			});
			return {
				kind: 'return',
				result: await finalize(
					'cancelled',
					{
						summary:
							cancellationSource === 'parent'
								? 'Run stopped because its parent became terminal.'
								: 'Run cancelled by user.',
						answer: usesDurableResearchContext
							? renderWebResearchInterruptedAnswer(researchObservations)
							: ''
					},
					pendingSignalIds
				)
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
			appliedSteer = true;
		}

		if (pendingSignals?.some((s) => s.kind === 'pause')) {
			await checkpoint(
				{
					status: 'paused',
					metrics: {
						tokens: totals.tokens,
						cost_usd: totals.cost,
						llm_cost_usd: totals.llmCost,
						paid_tool_cost_usd: totals.paidToolCost,
						tavily_credits: totals.tavilyCredits,
						uncertain_token_exposure: totals.uncertainTokenExposure,
						tool_calls: toolCalls,
						duration_ms: Date.now() - startedAtMs
					}
				},
				pendingSignalIds
			);
			await emitEvent(runId, 'run.status', { status: 'paused' });
			return {
				kind: 'return',
				result: { success: false, run_id: runId, status: 'paused' as const }
			};
		}

		// Steers + any resume markers handled — mark them consumed.
		if (pendingSignals?.length) {
			await checkpoint({}, pendingSignalIds);
		}

		return { kind: appliedSteer ? 'steered' : 'none' };
	};

	// Main JSON action-loop.
	for (let iteration = 0; ; iteration++) {
		// Infrastructure cancellation (queue timeout/shutdown): stop dead. The
		// queue row is being retried or reclaimed — another executor may already
		// own this run, so no further LLM calls or domain writes from here.
		await assertAgentRunOwnership(runId, executionGeneration, job.signal);
		const signalDrain = await drainControlSignals();
		if (signalDrain.kind === 'return') {
			return signalDrain.result;
		}

		const exhaustedBeforeTurn = hardBudgetExhaustionReason();
		if (exhaustedBeforeTurn) {
			return finalizeBudgetExhausted(exhaustedBeforeTurn);
		}

		let turn!: AgentTurn;
		let turnTokenPlan: ReturnType<typeof resolveAgentRunTokenPlan> | null = null;
		try {
			const researchWorkingContext = usesDurableResearchContext
				? renderWebResearchWorkingContext(researchObservations)
				: undefined;
			const normalUserPrompt = buildUserPrompt(run, transcript, {
				researchContext: researchWorkingContext
			});
			const researchFinalizationContext = usesDurableResearchContext
				? renderWebResearchFinalizationContext(researchObservations)
				: undefined;
			const finalUserPrompt = buildUserPrompt(run, transcript, {
				forceSubmitResult: true,
				finalizationReason: toolCallBudgetReached() ? 'tool_budget' : 'token_headroom',
				researchContext: researchFinalizationContext
			});
			let providerAttempt = 0;
			for (;;) {
				const spendLimit = resolveAgentRunLlmSpendLimit(maxCostUsd, totals.cost);
				if (spendLimit === null) {
					return finalizeBudgetExhausted('cost budget exhausted');
				}
				if (spendLimit === undefined) {
					// Dispatch always assigns a cost budget. Never make an unreserved
					// paid call when a malformed/out-of-band run omits it.
					await emitEvent(runId, 'run.narration', {
						note: 'missing cost budget',
						maxCostUsd: maxCostUsd ?? null
					});
					return finalize('failed', {
						summary:
							'The run has no cost budget, so no paid model call could be safely authorized.',
						answer: '',
						error: 'cost_budget_required'
					});
				}

				turnTokenPlan = resolveAgentRunTokenPlan({
					maxTokens,
					tokensUsed: totals.tokens,
					isDeepRun: run.effort === 'deep',
					toolCallBudgetReached: toolCallBudgetReached(),
					systemPrompt,
					finalSystemPrompt,
					normalUserPrompt,
					finalUserPrompt
				});
				if (turnTokenPlan.cannotFitFinalTurn) {
					return finalizeBudgetExhausted(
						'token hard ceiling cannot safely fit the final evidence turn'
					);
				}
				if (turnTokenPlan.reason === 'token_headroom') {
					await emitEvent(runId, 'run.narration', {
						note: 'finalizing before token hard ceiling',
						tokens: totals.tokens,
						tokenTarget: turnTokenPlan.softTarget,
						tokenHardLimit: turnTokenPlan.hardLimit,
						estimatedFinalPromptTokens: turnTokenPlan.estimatedPromptTokens,
						maxOutputTokens: turnTokenPlan.maxOutputTokens,
						providerAttempt
					});
				}

				const hooks = accounting.createLlmAccountingHooks(
					turnAttemptKey(job.id, jobAttempts, iteration, providerAttempt),
					run.effort === 'deep' ? 'agent_run.deep_turn' : 'agent_run.turn'
				);
				try {
					assertAgentRunNotAborted(job.signal);
					turn = await llm.getJSONResponse<AgentTurn>({
						systemPrompt: turnTokenPlan.forceSubmitResult
							? finalSystemPrompt
							: systemPrompt,
						userPrompt: turnTokenPlan.forceSubmitResult
							? finalUserPrompt
							: normalUserPrompt,
						userId: run.user_id,
						profile: modelPolicy.profile,
						model: providerAttempt > 0 ? DEEPSEEK_V4_FLASH_MODEL : undefined,
						reasoning: modelPolicy.reasoning,
						maxTokens: turnTokenPlan.maxOutputTokens,
						signal: job.signal,
						spendLimit,
						onSpendReservation: hooks.onSpendReservation,
						validation: { retryOnParseError: true, maxRetries: 2 },
						operationType: run.effort === 'deep' ? 'agent_run_deep' : 'other',
						metadata: {
							agent_run_id: runId,
							effort: run.effort,
							provider_fallback_attempt: providerAttempt
						},
						onUsage: hooks.onUsage
					});
					break;
				} catch (error) {
					const exhaustedAfterProviderFailure = hardBudgetExhaustionReason();
					if (exhaustedAfterProviderFailure) {
						return finalizeBudgetExhausted(exhaustedAfterProviderFailure);
					}
					const fallbackAllowed = run.effort === 'deep';
					if (
						providerAttempt === 0 &&
						fallbackAllowed &&
						shouldRetryAgentRunLlmTurn(error)
					) {
						providerAttempt = 1;
						await emitEvent(runId, 'run.narration', {
							note: 'retrying model turn with bounded fallback',
							fallbackModel: DEEPSEEK_V4_FLASH_MODEL,
							error: error instanceof Error ? error.message : String(error)
						});
						continue;
					}
					throw error;
				}
			}
		} catch (error) {
			assertAgentRunNotAborted(job.signal);
			if (error instanceof AgentRunSupersededError) throw error;
			if (error instanceof AgentRunCostLedgerError) {
				if (error.code === 'budget_exceeded') {
					return finalizeBudgetExhausted(
						'durable cost reservation exceeds remaining budget'
					);
				}
				return finalize('partial', {
					summary:
						'The agent stopped before another paid call could be safely authorized.',
					answer: '',
					error: `cost_ledger_${error.code}`
				});
			}
			if (error instanceof LLMSpendLimitError) {
				return finalizeBudgetExhausted(
					'remaining cost budget cannot fund another bounded model response'
				);
			}
			await emitEvent(runId, 'run.narration', {
				error: error instanceof Error ? error.message : String(error)
			});
			return finalize('failed', {
				summary: 'The agent loop failed while requesting the next action.',
				answer: '',
				error: error instanceof Error ? error.message : String(error)
			});
		}

		assertAgentRunNotAborted(job.signal);
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
			let status: AgentRunRow['status'] =
				run.depth === 1 && (turn.status === 'needs_input' || openQuestions.length > 0)
					? 'partial'
					: turn.status === 'needs_input' ||
						  ((turn.status === undefined || turn.status === 'completed') &&
								openQuestions.length > 0)
						? 'needs_input'
						: turn.status === 'partial'
							? 'partial'
							: turn.status === 'failed'
								? 'failed'
								: 'completed';
			const terminalResult: Record<string, unknown> = {
				summary: turn.summary ?? '',
				answer: turn.answer ?? turn.summary ?? '',
				open_questions: openQuestions,
				confidence: turn.confidence
			};
			if (
				shouldRepairReviewStageSubmission({
					mutationMode,
					proposedChangeCount: proposedChanges.length,
					status,
					repairAttempts: reviewStageSubmissionRepairAttempts,
					forceSubmitResult: Boolean(turnTokenPlan?.forceSubmitResult)
				})
			) {
				reviewStageSubmissionRepairAttempts += 1;
				transcript.push(
					'SUBMIT_RESULT REJECTED: This review-required run has zero durable ProposedChanges. Do not describe the proposal in prose. Call the relevant write operation now for every entity change; those calls stage the reviewable change set without mutating live data.'
				);
				await emitEvent(runId, 'run.narration', {
					note: 'review staging repair required',
					repair_attempt: reviewStageSubmissionRepairAttempts,
					proposed_change_count: proposedChanges.length
				});
				continue;
			}
			return finalize(status, terminalResult);
		}

		if (turnTokenPlan?.forceSubmitResult) {
			return finalizeBudgetExhausted(
				turnTokenPlan.reason === 'token_headroom'
					? 'model requested another operation during token-headroom finalization'
					: 'model requested another operation after the tool-call budget was exhausted'
			);
		}

		if (toolCallBudgetReached()) {
			return finalizeBudgetExhausted('tool-call budget exhausted');
		}

		const exhaustedAfterTurn = hardBudgetExhaustionReason();
		if (exhaustedAfterTurn) {
			return finalizeBudgetExhausted(exhaustedAfterTurn);
		}

		// action === 'call_op' | 'call_ops'. A batch saves LLM round trips but
		// preserves the exact per-operation policy, execution, staging, telemetry,
		// and budget boundaries below.
		const requestedCalls = resolveAgentTurnOperationCalls(turn);
		if (requestedCalls.length === 0) {
			transcript.push(
				'OP REQUEST REJECTED: call_op requires op/args; call_ops requires a non-empty ops array. Submit a valid operation request.'
			);
			continue;
		}

		for (const call of requestedCalls) {
			await assertAgentRunOwnership(runId, executionGeneration, job.signal);
			const control = await drainControlSignals();
			if (control.kind === 'return') return control.result;
			if (control.kind === 'steered') break;
			if (toolCallBudgetReached()) {
				return finalizeBudgetExhausted('tool-call budget exhausted during operation batch');
			}
			const exhaustedBeforeOp = hardBudgetExhaustionReason();
			if (exhaustedBeforeOp) return finalizeBudgetExhausted(exhaustedBeforeOp);

			const op = call.op;
			const args = isAgentRunWebSearch(op) ? pinAgentRunWebSearchArgs(call.args) : call.args;
			const searchIsPermitted =
				!scope.allowed_ops || scope.allowed_ops.includes(AGENT_OP_WEB_SEARCH);
			const searchRequiresDispatch =
				op === AGENT_OP_WEB_SEARCH && searchIsPermitted && typeof web.search === 'function'
					? await Promise.resolve(web.searchRequiresDispatch?.(args) ?? true)
					: false;
			const reservedPaidToolCharge =
				op === AGENT_OP_WEB_SEARCH &&
				searchIsPermitted &&
				typeof web.search === 'function' &&
				searchRequiresDispatch
					? estimateTavilySearchCharge(args, tavilyCreditCostUsd)
					: null;
			if (
				reservedPaidToolCharge &&
				!canReservePaidToolCost({
					maxCostUsd,
					currentCostUsd: totals.cost,
					reservationCostUsd: reservedPaidToolCharge.cost_usd
				})
			) {
				return finalizeBudgetExhausted(
					'paid-tool cost reservation exceeds remaining budget'
				);
			}
			toolCalls += 1;
			await emitEvent(runId, 'run.tool_call', { op, args });

			const opStart = Date.now();
			accounting.beginTool(
				op === AGENT_OP_WEB_SEARCH
					? toolAttemptKey(job.id, jobAttempts, toolCalls, op)
					: null
			);
			let result: Awaited<ReturnType<typeof executeAgentOp>>;
			try {
				if (op === AGENT_OP_WEB_VISIT && !webUrlCapabilities.allowsVisit(args.url)) {
					result = {
						ok: false,
						op,
						error: {
							code: 'FORBIDDEN',
							message:
								"Web visit URL is not authorized by the user or this run's search results"
						}
					};
				} else {
					assertAgentRunNotAborted(job.signal);
					result = await executeAgentOp(
						{
							admin: supabase as SupabaseClient<Database>,
							userId: run.user_id,
							scope,
							runContext: {
								context_type: run.context_type === 'project' ? 'project' : 'global',
								project_id: run.project_id
							},
							mutationMode,
							calendar: calendar ?? undefined,
							web
						},
						op,
						args
					);
				}
			} finally {
				accounting.endToolDispatch();
			}
			if (result.ok && op === AGENT_OP_WEB_SEARCH) {
				webUrlCapabilities.observeSearchResult(result.data);
			}
			if (result.ok && op === AGENT_OP_WEB_VISIT) {
				webUrlCapabilities.observeVisitResult(result.data);
			}
			const durationMs = Date.now() - opStart;
			await accounting.finishTool(opStart, result);

			// A staged write returns a ProposedChange (no mutation). Assign a
			// stable id, accumulate it into the run's Change Set, and key telemetry to
			// it so `proposed_changes` and `agent_tool_executions` stay consistent.
			let proposedChangeId: string | undefined;
			if (result.ok && result.proposedChange) {
				const replaceIndex = findReplaceableStagedCreateIndex(
					proposedChanges,
					result.proposedChange
				);
				const replaced = replaceIndex >= 0;
				proposedChangeId = replaced ? proposedChanges[replaceIndex]!.id : randomUUID();
				const proposedChange = { id: proposedChangeId, ...result.proposedChange };
				if (replaced) proposedChanges[replaceIndex] = proposedChange;
				else proposedChanges.push(proposedChange);
				result.data = {
					...(result.data &&
					typeof result.data === 'object' &&
					!Array.isArray(result.data)
						? result.data
						: {}),
					proposed_change_id: proposedChangeId,
					proposed_change_replaced: replaced
				};
			}
			if (
				result.ok &&
				mutationMode === 'commit' &&
				isWriteOp(op) &&
				result.entityKind &&
				result.entityId
			) {
				const projectId =
					result.entityProjectId ??
					(result.entityKind === 'project' ? result.entityId : run.project_id);
				const action = entityActionForGatewayOp(op);
				committedEntityTouches.push({
					type: result.entityKind,
					id: result.entityId,
					action,
					description: `Agent run ${action} ${result.entityKind}.`,
					project_id: projectId,
					title: result.entityTitle ?? null,
					url: buildGatewayEntityUrl(result.entityKind, result.entityId, projectId),
					project_url: buildGatewayProjectUrl(projectId)
				});
			}

			const execution = await recordToolExecution({
				runId,
				generation: executionGeneration,
				checkpoint: {
					...(mutationMode === 'stage'
						? {
								change_set: {
									run_id: runId,
									status: 'pending',
									changes: proposedChanges,
									created_at:
										savedChangeSet?.created_at ?? new Date().toISOString()
								}
							}
						: {}),
					result: {
						...((run.result as Record<string, unknown> | null) ?? {}),
						entities_touched: committedEntityTouches
					}
				},
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
			if (result.ok) {
				researchObservations = mergeWebResearchObservations(
					researchObservations,
					observeWebResearchToolResult({
						op,
						args,
						result: execution.persistedResult,
						observedAt: new Date(opStart + durationMs).toISOString()
					})
				);
			}
			await emitEvent(runId, 'run.tool_result', {
				op,
				ok: result.ok,
				error: result.error ?? null
			});

			const resultText = result.ok
				? formatAgentRunTranscriptResult({
						op,
						result: execution.persistedResult,
						maxChars: transcriptResultCharsForOp(op)
					})
				: `ERROR ${result.error?.code}: ${result.error?.message}`;
			transcript.push(
				`OP ${op} ${formatAgentRunTranscriptArgs({ op, args })} -> ${resultText}`
			);
			if (accounting.failure) {
				if (accounting.failure.code === 'budget_exceeded') {
					return finalizeBudgetExhausted(
						'durable paid-tool reservation exceeds remaining budget'
					);
				}
				return finalize('partial', {
					summary:
						'The agent stopped because paid-tool accounting requires reconciliation.',
					answer: '',
					error: `cost_ledger_${accounting.failure.code}`
				});
			}
		}
	}
}
