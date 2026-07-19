// apps/web/src/routes/api/agent-runs/+server.ts
//
// Agent Run dispatch + list. Two-phase create (insert agent_runs row → enqueue
// the `agent_run` job) so the worker runner (Phase 1b) picks it up.
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import {
	ACTIVE_AGENT_RUN_STATUSES,
	dispatchAgentRun,
	normalizeAgentRunAllowedOps,
	normalizeAgentRunBudgets
} from '$lib/server/agent-runs/dispatch';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
	const status = url.searchParams.get('status');

	let query = supabase
		.from('agent_runs')
		.select('*, project:onto_projects!agent_runs_project_id_fkey(id, name)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (status === 'active') query = query.in('status', ACTIVE_AGENT_RUN_STATUSES);
	else if (status) query = query.eq('status', status as any);

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
	const effort = payload.effort === 'deep' ? 'deep' : 'standard';
	const runTemplate = payload.run_template === 'deep_research' ? 'deep_research' : 'agent';
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

	const { budgets, error: budgetError } = normalizeAgentRunBudgets(payload.budgets);
	if (budgetError) return ApiResponse.badRequest(budgetError);

	const { allowedOps, error: allowedOpsError } = normalizeAgentRunAllowedOps(payload.allowed_ops);
	if (allowedOpsError) return ApiResponse.badRequest(allowedOpsError);

	const outcome = await dispatchAgentRun({
		userId: user.id,
		goal,
		label: typeof payload.label === 'string' ? payload.label : null,
		instructions: typeof payload.instructions === 'string' ? payload.instructions : null,
		expectedOutput:
			typeof payload.expected_output === 'string' ? payload.expected_output : null,
		contextType,
		projectId,
		scopeMode,
		effort,
		runTemplate,
		reviewRequired,
		allowedOps,
		budgets,
		trigger: 'manual'
	});

	if (!outcome.ok) {
		return ApiResponse.error(outcome.message, outcome.status, outcome.code, outcome.message);
	}

	return ApiResponse.success({ run: outcome.run });
};
