// apps/web/src/routes/api/homework/runs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const DEFAULT_MAX_WALL_CLOCK_MS = 60 * 60 * 1000; // 60 minutes
const DEFAULT_MAX_ITERATIONS = 20;
const MAX_CONCURRENT_RUNS = 3;

function normalizeBudgets(input: Record<string, unknown> | undefined) {
	const maxWallClockMs =
		typeof input?.max_wall_clock_ms === 'number'
			? (input?.max_wall_clock_ms as number)
			: DEFAULT_MAX_WALL_CLOCK_MS;
	const maxIterations =
		typeof input?.max_iterations === 'number'
			? (input?.max_iterations as number)
			: DEFAULT_MAX_ITERATIONS;
	const maxCostUsd = typeof input?.max_cost_usd === 'number' ? input.max_cost_usd : undefined;
	const maxTotalTokens =
		typeof input?.max_total_tokens === 'number' ? input.max_total_tokens : undefined;

	return {
		max_wall_clock_ms: maxWallClockMs,
		max_iterations: maxIterations,
		...(maxCostUsd !== undefined ? { max_cost_usd: maxCostUsd } : {}),
		...(maxTotalTokens !== undefined ? { max_total_tokens: maxTotalTokens } : {})
	};
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
	const status = url.searchParams.get('status');

	let query = supabase
		.from('homework_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (status) {
		query = query.eq('status', status);
	}

	const { data, error } = await query;
	if (error) {
		return ApiResponse.error(
			'Failed to fetch homework runs',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error.message
		);
	}

	return ApiResponse.success({ runs: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload.objective !== 'string') {
		return ApiResponse.badRequest('Missing objective');
	}

	const objective = payload.objective.trim();
	if (!objective) {
		return ApiResponse.badRequest('Objective cannot be empty');
	}

	const contextType = typeof payload.context_type === 'string' ? payload.context_type : 'global';
	const entityId = typeof payload.entity_id === 'string' ? payload.entity_id : undefined;
	const rawScope = typeof payload.scope === 'string' ? payload.scope : 'global';
	const projectIds = Array.isArray(payload.project_ids)
		? payload.project_ids.filter((p: unknown) => typeof p === 'string')
		: entityId
			? [entityId]
			: [];

	let scope: string = rawScope;
	if (rawScope === 'project' && projectIds.length === 0) {
		return ApiResponse.badRequest('Project scope requires a project_id');
	}
	if (rawScope === 'multi_project' && projectIds.length < 2) {
		return ApiResponse.badRequest('Multiple Projects scope requires at least two project_ids');
	}
	if (rawScope === 'global' && entityId) {
		scope = 'project';
	}
	if (rawScope === 'multi_project' && projectIds.length === 1) {
		scope = 'project';
	}

	const budgets = normalizeBudgets(payload.budgets);
	const permissions =
		payload.permissions && typeof payload.permissions === 'object'
			? payload.permissions
			: { write_mode: 'autopilot' };

	const admin = createAdminSupabaseClient();

	// Enforce per-user concurrency
	const { count: activeCount, error: countError } = await admin
		.from('homework_runs')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.in('status', ['queued', 'running', 'waiting_on_user']);

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
			`You already have ${MAX_CONCURRENT_RUNS} active homework runs.`,
			HttpStatus.TOO_MANY_REQUESTS,
			'RATE_LIMITED'
		);
	}

	// Create dedicated chat session for cost tracking
	const { data: chatSession, error: chatError } = await admin
		.from('chat_sessions')
		.insert({
			user_id: user.id,
			context_type: contextType,
			entity_id: entityId ?? null,
			status: 'active',
			chat_type: 'homework'
		})
		.select('id')
		.single();

	if (chatError) {
		return ApiResponse.error(
			'Failed to create chat session',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			chatError.message
		);
	}

	const runInsert = {
		user_id: user.id,
		objective,
		status: 'queued',
		iteration: 0,
		max_iterations: budgets.max_iterations ?? DEFAULT_MAX_ITERATIONS,
		budgets,
		metrics: { tokens_total: 0, cost_total_usd: 0 },
		scope,
		project_ids: projectIds.length ? projectIds : null,
		chat_session_id: chatSession?.id ?? null
	};

	const { data: run, error: runError } = await admin
		.from('homework_runs')
		.insert(runInsert)
		.select('*')
		.single();

	if (runError || !run) {
		return ApiResponse.error(
			'Failed to create homework run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError?.message
		);
	}

	const metadata = {
		run_id: run.id,
		iteration: 1,
		chat_session_id: run.chat_session_id,
		context_type: contextType,
		entity_id: entityId,
		scope,
		project_ids: projectIds ?? undefined,
		budgets,
		permissions
	};

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'buildos_homework',
		p_metadata: metadata,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `homework:${run.id}:1`
	});

	if (jobError) {
		await admin
			.from('homework_runs')
			.update({
				status: 'failed',
				stop_reason: { type: 'queue_error', detail: jobError.message }
			})
			.eq('id', run.id);

		return ApiResponse.error(
			'Failed to queue homework run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({
		run_id: run.id,
		status: run.status,
		url: `/homework/runs/${run.id}`
	});
};
