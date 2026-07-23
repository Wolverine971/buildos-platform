// apps/web/src/lib/server/agent-runs/dispatch.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { HttpStatus } from '$lib/utils/api-response';
import { validateAgentRunMetadata, type AgentRunStatus, type Json } from '@buildos/shared-types';

export const MAX_CONCURRENT_AGENT_RUNS = 3;
export const DEFAULT_DEEP_AGENT_RUN_COST_USD = 0.5;
export const MAX_DEEP_AGENT_RUN_COST_USD = 1;
export const MIN_DEEP_RESEARCH_COST_USD = 0.25;
export const DEFAULT_DEEP_RESEARCH_TOOL_CALLS = 10;
export const MIN_DEEP_RESEARCH_TOOL_CALLS = 4;
export const MAX_DEEP_RESEARCH_TOOL_CALLS = 40;
export const DEFAULT_DEEP_RESEARCH_TOKENS = 60_000;
export const MIN_DEEP_RESEARCH_TOKENS = 12_000;
export const MAX_DEEP_RESEARCH_TOKENS = 100_000;
export const MAX_DEEP_RESEARCH_WALL_CLOCK_MS = 20 * 60 * 1000;
export const MAX_AGENT_RUN_COST_USD = 10;

// Global budget ceilings applied to every run, so the raw dispatch API cannot
// create a run that loops for days or spends without a ledger-enforced cap.
export const MAX_AGENT_RUN_WALL_CLOCK_MS = 20 * 60 * 1000;
export const MAX_AGENT_RUN_TOOL_CALLS = 40;
export const MAX_AGENT_RUN_TOKENS = 100_000;
// Standard-effort runs get a default cost budget so the cost ledger engages for
// every run (deep runs already default via resolveAgentRunEffortBudgets).
export const DEFAULT_STANDARD_AGENT_RUN_COST_USD = 0.5;

export const ACTIVE_AGENT_RUN_STATUSES: AgentRunStatus[] = [
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready'
];

export type DispatchAgentRunParams = {
	userId: string;
	goal: string;
	label?: string | null;
	instructions?: string | null;
	expectedOutput?: string | null;
	contextType?: 'project' | 'global';
	projectId?: string | null;
	scopeMode?: 'read_only' | 'read_write';
	effort?: 'standard' | 'deep';
	runTemplate?: 'agent' | 'deep_research';
	reviewRequired?: boolean;
	allowedOps?: string[] | null;
	budgets?: Record<string, number>;
	trigger?: 'manual' | 'chat' | 'scheduled' | 'event';
	parentRunId?: string | null;
	parentSessionId?: string | null;
	parentMessageId?: string | null;
	depth?: number;
	sourceSuggestionId?: string | null;
	sourceDecision?: 'approve' | 'dismiss' | null;
	validateProjectAccess?: boolean;
	admin?: ReturnType<typeof createAdminSupabaseClient>;
};

export type DispatchAgentRunOutcome =
	| {
			ok: true;
			run: Record<string, unknown>;
	  }
	| {
			ok: false;
			status: number;
			code: string;
			message: string;
	  };

export type CountActiveAgentRunsOutcome =
	| {
			ok: true;
			count: number;
	  }
	| Extract<DispatchAgentRunOutcome, { ok: false }>;

export function normalizeAgentRunBudgets(input: unknown): {
	budgets: Record<string, number>;
	error?: string;
} {
	const out: Record<string, number> = {};
	if (input === undefined || input === null) return { budgets: out };
	if (typeof input !== 'object' || Array.isArray(input)) {
		return { budgets: out, error: '`budgets` must be an object' };
	}

	const source = input as Record<string, unknown>;
	for (const field of [
		'wall_clock_ms',
		'max_tokens',
		'max_tool_calls',
		'max_cost_usd'
	] as const) {
		const value = source[field];
		if (value === undefined) continue;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
			return { budgets: out, error: `budgets.${field} must be a non-negative number` };
		}
		if ((field === 'max_tokens' || field === 'max_tool_calls') && !Number.isInteger(value)) {
			return { budgets: out, error: `budgets.${field} must be an integer` };
		}
		if (field === 'max_cost_usd' && value > MAX_AGENT_RUN_COST_USD) {
			return {
				budgets: out,
				error: `budgets.max_cost_usd cannot exceed $${MAX_AGENT_RUN_COST_USD}`
			};
		}
		if (field === 'wall_clock_ms' && value > MAX_AGENT_RUN_WALL_CLOCK_MS) {
			return {
				budgets: out,
				error: `budgets.wall_clock_ms cannot exceed ${MAX_AGENT_RUN_WALL_CLOCK_MS}ms`
			};
		}
		if (field === 'max_tool_calls' && value > MAX_AGENT_RUN_TOOL_CALLS) {
			return {
				budgets: out,
				error: `budgets.max_tool_calls cannot exceed ${MAX_AGENT_RUN_TOOL_CALLS}`
			};
		}
		if (field === 'max_tokens' && value > MAX_AGENT_RUN_TOKENS) {
			return {
				budgets: out,
				error: `budgets.max_tokens cannot exceed ${MAX_AGENT_RUN_TOKENS}`
			};
		}
		out[field] = value;
	}
	return { budgets: out };
}

export function resolveAgentRunEffortBudgets(
	effort: 'standard' | 'deep',
	input: Record<string, number> | undefined,
	runTemplate: 'agent' | 'deep_research' = 'agent'
): { budgets: Record<string, number>; error?: string } {
	const budgets = { ...(input ?? {}) };
	if (effort !== 'deep') {
		// Every run must carry a cost ceiling so the worker's ledger engages;
		// an unbudgeted standard run would otherwise make unreserved LLM calls.
		if (budgets.max_cost_usd === undefined) {
			budgets.max_cost_usd = DEFAULT_STANDARD_AGENT_RUN_COST_USD;
		}
		return { budgets };
	}

	if (budgets.max_cost_usd === undefined) {
		budgets.max_cost_usd = DEFAULT_DEEP_AGENT_RUN_COST_USD;
	}
	if (budgets.max_cost_usd > MAX_DEEP_AGENT_RUN_COST_USD) {
		return {
			budgets,
			error: `Deep agent runs cannot exceed a $${MAX_DEEP_AGENT_RUN_COST_USD} cost budget`
		};
	}
	if (
		runTemplate === 'deep_research' &&
		(budgets.max_cost_usd ?? 0) < MIN_DEEP_RESEARCH_COST_USD
	) {
		return {
			budgets,
			error: `Deep research requires at least a $${MIN_DEEP_RESEARCH_COST_USD} cost budget`
		};
	}
	if (runTemplate === 'deep_research') {
		budgets.wall_clock_ms ??= 10 * 60 * 1000;
		budgets.max_tokens ??= DEFAULT_DEEP_RESEARCH_TOKENS;
		budgets.max_tool_calls ??= DEFAULT_DEEP_RESEARCH_TOOL_CALLS;
		if (budgets.max_tool_calls < MIN_DEEP_RESEARCH_TOOL_CALLS) {
			return {
				budgets,
				error: `Deep research requires at least ${MIN_DEEP_RESEARCH_TOOL_CALLS} tool calls`
			};
		}
		if (budgets.max_tool_calls > MAX_DEEP_RESEARCH_TOOL_CALLS) {
			return {
				budgets,
				error: `Deep research cannot exceed ${MAX_DEEP_RESEARCH_TOOL_CALLS} tool calls`
			};
		}
		if (budgets.max_tokens < MIN_DEEP_RESEARCH_TOKENS) {
			return {
				budgets,
				error: `Deep research requires at least ${MIN_DEEP_RESEARCH_TOKENS} tokens`
			};
		}
		if (budgets.max_tokens > MAX_DEEP_RESEARCH_TOKENS) {
			return {
				budgets,
				error: `Deep research cannot exceed ${MAX_DEEP_RESEARCH_TOKENS} tokens`
			};
		}
		if (budgets.wall_clock_ms < 1) {
			return {
				budgets,
				error: 'Deep research requires a positive wall-clock budget'
			};
		}
		if (budgets.wall_clock_ms > MAX_DEEP_RESEARCH_WALL_CLOCK_MS) {
			return {
				budgets,
				error: `Deep research cannot exceed ${MAX_DEEP_RESEARCH_WALL_CLOCK_MS}ms`
			};
		}
	}
	return { budgets };
}

export function normalizeAgentRunAllowedOps(input: unknown): {
	allowedOps: string[] | null;
	error?: string;
} {
	if (input === undefined || input === null) return { allowedOps: null };
	if (!Array.isArray(input)) {
		return { allowedOps: null, error: '`allowed_ops` must be an array of strings' };
	}
	const allowedOps: string[] = [];
	for (const op of input) {
		if (typeof op !== 'string' || !op.trim()) {
			return { allowedOps: null, error: '`allowed_ops` must contain only non-empty strings' };
		}
		allowedOps.push(op.trim());
	}
	return { allowedOps };
}

export async function countActiveAgentRuns(params: {
	admin?: ReturnType<typeof createAdminSupabaseClient>;
	userId: string;
}): Promise<CountActiveAgentRunsOutcome> {
	const admin = params.admin ?? createAdminSupabaseClient();
	const { count, error } = await admin
		.from('agent_runs')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', params.userId)
		.in('status', ACTIVE_AGENT_RUN_STATUSES);
	if (error) {
		return {
			ok: false,
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			code: 'DATABASE_ERROR',
			message: `Failed to check active runs: ${error.message}`
		};
	}
	return { ok: true, count: count ?? 0 };
}

async function validateProjectMembership(params: {
	admin: ReturnType<typeof createAdminSupabaseClient>;
	userId: string;
	projectId: string;
}): Promise<DispatchAgentRunOutcome | { ok: true }> {
	const { data: actorId, error: actorError } = await params.admin.rpc('ensure_actor_for_user', {
		p_user_id: params.userId
	});
	if (actorError || !actorId) {
		return {
			ok: false,
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			code: 'DATABASE_ERROR',
			message: `Failed to resolve actor id${actorError?.message ? `: ${actorError.message}` : ''}`
		};
	}
	const { data: membership, error: membershipError } = await params.admin
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.eq('project_id', params.projectId)
		.is('removed_at', null)
		.maybeSingle();
	if (membershipError) {
		return {
			ok: false,
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			code: 'DATABASE_ERROR',
			message: `Failed to validate project access: ${membershipError.message}`
		};
	}
	if (!membership?.project_id) {
		return {
			ok: false,
			status: HttpStatus.FORBIDDEN,
			code: 'FORBIDDEN',
			message: 'You do not have access to that project_id'
		};
	}
	return { ok: true };
}

export async function dispatchAgentRun(
	params: DispatchAgentRunParams
): Promise<DispatchAgentRunOutcome> {
	const goal = params.goal.trim();
	if (!goal) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: 'A non-empty `goal` is required'
		};
	}

	const contextType = params.contextType === 'project' ? 'project' : 'global';
	const scopeMode = params.scopeMode === 'read_write' ? 'read_write' : 'read_only';
	const runTemplate = params.runTemplate === 'deep_research' ? 'deep_research' : 'agent';
	const effort =
		runTemplate === 'deep_research' || params.effort === 'deep' ? 'deep' : 'standard';
	const reviewRequired = params.reviewRequired === true;
	const projectId = params.projectId?.trim() || null;
	const trigger = params.trigger ?? 'manual';
	const admin = params.admin ?? createAdminSupabaseClient();
	const effortBudgets = resolveAgentRunEffortBudgets(effort, params.budgets, runTemplate);
	if (effortBudgets.error) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: effortBudgets.error
		};
	}
	const budgets = effortBudgets.budgets;

	if (runTemplate === 'deep_research' && scopeMode !== 'read_only') {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: 'Deep research runs must use read-only scope'
		};
	}
	if (runTemplate === 'deep_research' && (params.depth ?? 0) !== 0) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: 'Deep research can only be dispatched as a top-level run'
		};
	}
	if (contextType === 'project' && !projectId) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: '`project_id` is required for project context'
		};
	}
	if (reviewRequired && scopeMode === 'read_only') {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: '`review` requires scope_mode "read_write" (nothing to stage)'
		};
	}
	if (
		params.sourceDecision &&
		params.sourceDecision !== 'approve' &&
		params.sourceDecision !== 'dismiss'
	) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: '`sourceDecision` must be approve or dismiss'
		};
	}

	const active = await countActiveAgentRuns({ admin, userId: params.userId });
	if (!active.ok) return active;
	if (runTemplate === 'deep_research' && active.count > 0) {
		return {
			ok: false,
			status: HttpStatus.TOO_MANY_REQUESTS,
			code: 'RATE_LIMITED',
			message:
				'Deep research needs the three Agent Run slots free for its coordinator and researchers.'
		};
	}
	if (active.count >= MAX_CONCURRENT_AGENT_RUNS) {
		return {
			ok: false,
			status: HttpStatus.TOO_MANY_REQUESTS,
			code: 'RATE_LIMITED',
			message: `You already have ${MAX_CONCURRENT_AGENT_RUNS} active agent runs.`
		};
	}

	if (contextType === 'project' && projectId && params.validateProjectAccess !== false) {
		const access = await validateProjectMembership({
			admin,
			userId: params.userId,
			projectId
		});
		if (!access.ok) return access;
	}

	const metadata = {
		run_id: '',
		trigger,
		context_type: contextType,
		project_id: projectId,
		parent_run_id: params.parentRunId ?? null,
		depth: params.depth ?? 0,
		scope_mode: scopeMode,
		effort,
		run_template: runTemplate,
		allowed_ops: params.allowedOps ?? null,
		review_required: reviewRequired,
		budgets
	};

	// Validate metadata shape BEFORE any write. The RPC fills in the real
	// run_id server-side; a placeholder UUID stands in for shape validation.
	try {
		validateAgentRunMetadata({
			...metadata,
			run_id: '00000000-0000-4000-8000-000000000000'
		});
	} catch (error) {
		return {
			ok: false,
			status: HttpStatus.BAD_REQUEST,
			code: 'INVALID_REQUEST',
			message: error instanceof Error ? error.message : 'Invalid job metadata'
		};
	}

	// Atomic admission (2026-07-23 audit): the run row and its queue job are
	// created in ONE transaction, so a process death here can no longer strand
	// a queued run with no job. The capacity trigger enforces the max-3 cap
	// under a per-user advisory lock inside the same transaction — the
	// countActiveAgentRuns pre-check above is just the friendly fast path.
	const { data: created, error: createError } = await (admin as any).rpc(
		'create_agent_run_with_job',
		{
			p_run: {
				user_id: params.userId,
				trigger,
				label: params.label?.trim() || goal.slice(0, 80),
				goal,
				instructions: params.instructions?.trim() || null,
				expected_output: params.expectedOutput?.trim() || null,
				context_type: contextType,
				project_id: projectId,
				scope_mode: scopeMode,
				effort,
				run_template: runTemplate,
				allowed_ops: params.allowedOps ?? null,
				review_required: reviewRequired,
				budgets: budgets as Json,
				parent_run_id: params.parentRunId ?? null,
				parent_session_id: params.parentSessionId ?? null,
				parent_message_id: params.parentMessageId ?? null,
				depth: params.depth ?? 0,
				source_suggestion_id: params.sourceSuggestionId ?? null,
				source_decision: params.sourceDecision ?? null
			},
			p_job_metadata: metadata,
			p_priority: 7
		}
	);

	if (createError || !created?.run) {
		const message = createError?.message ?? 'Unknown error';
		// Capacity raises from the trigger surface as generic Postgres errors —
		// map them to the same 429s the fast-path pre-check produces.
		if (
			message.includes('agent_run_limit_exceeded') ||
			message.includes('Deep research requires') ||
			message.includes('Agent Run slots are reserved')
		) {
			return {
				ok: false,
				status: HttpStatus.TOO_MANY_REQUESTS,
				code: 'RATE_LIMITED',
				message: message.includes('agent_run_limit_exceeded')
					? `You already have ${MAX_CONCURRENT_AGENT_RUNS} active agent runs.`
					: message
			};
		}
		return {
			ok: false,
			status: HttpStatus.INTERNAL_SERVER_ERROR,
			code: 'DATABASE_ERROR',
			message: `Failed to create agent run: ${message}`
		};
	}

	return { ok: true, run: created.run };
}
