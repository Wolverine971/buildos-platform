// apps/web/src/routes/api/agent-runs/+server.ts
//
// Agent Run dispatch + list. Two-phase create (insert agent_runs row → enqueue
// the `agent_run` job) so the worker runner (Phase 1b) picks it up.
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { validateAgentRunMetadata, type AgentRunStatus } from '@buildos/shared-types';

const MAX_CONCURRENT_RUNS = 3;
const ACTIVE_STATUSES: AgentRunStatus[] = [
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready'
];

function normalizeBudgets(input: unknown): { budgets: Record<string, number>; error?: string } {
	const out: Record<string, number> = {};
	if (input === undefined || input === null) return { budgets: out };
	if (typeof input !== 'object' || Array.isArray(input)) {
		return { budgets: out, error: '`budgets` must be an object' };
	}

	const source = input as Record<string, unknown>;
	for (const field of ['wall_clock_ms', 'max_tokens', 'max_tool_calls'] as const) {
		const value = source[field];
		if (value === undefined) continue;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
			return { budgets: out, error: `budgets.${field} must be a non-negative number` };
		}
		if ((field === 'max_tokens' || field === 'max_tool_calls') && !Number.isInteger(value)) {
			return { budgets: out, error: `budgets.${field} must be an integer` };
		}
		out[field] = value;
	}
	return { budgets: out };
}

function normalizeAllowedOps(input: unknown): { allowedOps: string[] | null; error?: string } {
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

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
	const status = url.searchParams.get('status');

	let query = supabase
		.from('agent_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (status === 'active') query = query.in('status', ACTIVE_STATUSES);
	else if (status) query = query.eq('status', status as AgentRunStatus);

	const { data, error } = await query;
	if (error) {
		return ApiResponse.error(
			'Failed to fetch agent runs',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error.message
		);
	}
	return ApiResponse.success({ runs: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload.goal !== 'string' || !payload.goal.trim()) {
		return ApiResponse.badRequest('A non-empty `goal` is required');
	}

	const goal = payload.goal.trim();
	const contextType = payload.context_type === 'project' ? 'project' : 'global';
	const scopeMode = payload.scope_mode === 'read_write' ? 'read_write' : 'read_only';
	const reviewRequired = payload.review === true;
	const projectId =
		typeof payload.project_id === 'string' && payload.project_id.trim()
			? payload.project_id.trim()
			: null;

	if (contextType === 'project' && !projectId) {
		return ApiResponse.badRequest('`project_id` is required for project context');
	}
	if (reviewRequired && scopeMode === 'read_only') {
		return ApiResponse.badRequest(
			'`review` requires scope_mode "read_write" (nothing to stage)'
		);
	}

	const admin = createAdminSupabaseClient();

	// Per-user concurrency cap.
	const { count: activeCount, error: countError } = await admin
		.from('agent_runs')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.in('status', ACTIVE_STATUSES);
	if (countError) {
		return ApiResponse.error(
			'Failed to check active runs',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			countError.message
		);
	}
	if ((activeCount ?? 0) >= MAX_CONCURRENT_RUNS) {
		return ApiResponse.error(
			`You already have ${MAX_CONCURRENT_RUNS} active agent runs.`,
			HttpStatus.TOO_MANY_REQUESTS,
			'RATE_LIMITED'
		);
	}

	// Validate project access for project-context runs.
	if (contextType === 'project' && projectId) {
		const { data: actorId, error: actorError } = await admin.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});
		if (actorError || !actorId) {
			return ApiResponse.error(
				'Failed to resolve actor id',
				HttpStatus.INTERNAL_SERVER_ERROR,
				'DATABASE_ERROR',
				actorError?.message
			);
		}
		const { data: membership, error: membershipError } = await admin
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actorId)
			.eq('project_id', projectId)
			.is('removed_at', null)
			.maybeSingle();
		if (membershipError) {
			return ApiResponse.error(
				'Failed to validate project access',
				HttpStatus.INTERNAL_SERVER_ERROR,
				'DATABASE_ERROR',
				membershipError.message
			);
		}
		if (!membership?.project_id) {
			return ApiResponse.forbidden('You do not have access to that project_id');
		}
	}

	const { budgets, error: budgetError } = normalizeBudgets(payload.budgets);
	if (budgetError) return ApiResponse.badRequest(budgetError);

	const { allowedOps, error: allowedOpsError } = normalizeAllowedOps(payload.allowed_ops);
	if (allowedOpsError) return ApiResponse.badRequest(allowedOpsError);

	// Phase 1: insert the run row.
	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.insert({
			user_id: user.id,
			trigger: 'manual',
			label:
				typeof payload.label === 'string' && payload.label.trim()
					? payload.label.trim()
					: goal.slice(0, 80),
			goal,
			instructions: typeof payload.instructions === 'string' ? payload.instructions : null,
			expected_output:
				typeof payload.expected_output === 'string' ? payload.expected_output : null,
			context_type: contextType,
			project_id: projectId,
			scope_mode: scopeMode,
			allowed_ops: allowedOps,
			review_required: reviewRequired,
			status: 'queued',
			budgets
		})
		.select('*')
		.single();

	if (runError || !run) {
		return ApiResponse.error(
			'Failed to create agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError?.message
		);
	}

	// Phase 2: enqueue the job (validate metadata up front).
	const metadata = {
		run_id: run.id,
		trigger: 'manual' as const,
		context_type: contextType,
		project_id: projectId,
		scope_mode: scopeMode,
		allowed_ops: allowedOps,
		review_required: reviewRequired,
		budgets
	};
	try {
		validateAgentRunMetadata(metadata);
	} catch (e) {
		await admin
			.from('agent_runs')
			.update({ status: 'failed', error: 'Invalid job metadata' })
			.eq('id', run.id);
		return ApiResponse.badRequest(e instanceof Error ? e.message : 'Invalid job metadata');
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'agent_run',
		p_metadata: metadata,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `agent-run:${run.id}`
	});

	if (jobError) {
		await admin
			.from('agent_runs')
			.update({ status: 'failed', error: `queue_error: ${jobError.message}` })
			.eq('id', run.id);
		return ApiResponse.error(
			'Failed to queue agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({ run });
};
