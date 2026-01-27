// apps/web/src/routes/api/tree-agent/runs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const DEFAULT_MAX_WALL_CLOCK_MS = 60 * 60 * 1000; // 60 minutes
const MAX_CONCURRENT_RUNS = 3;
const DEFAULT_PROJECT_STATE = 'active';
const TREE_AGENT_PROJECT_TYPE = 'project.tree_agent.workspace';
const TREE_AGENT_SCRATCHPAD_TYPE = 'document.tree_agent.scratchpad';
const DEFAULT_DOC_STATE = 'draft';

function normalizeBudgets(input: Record<string, unknown> | undefined) {
	const maxWallClockMs =
		typeof input?.max_wall_clock_ms === 'number'
			? (input?.max_wall_clock_ms as number)
			: DEFAULT_MAX_WALL_CLOCK_MS;
	return { max_wall_clock_ms: maxWallClockMs };
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
	const status = url.searchParams.get('status');
	const sb = supabase as any;

	let query = sb
		.from('tree_agent_runs')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (status) query = query.eq('status', status);

	const { data, error } = await query;
	if (error) {
		return ApiResponse.error(
			'Failed to fetch Tree Agent runs',
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
	if (!payload || typeof payload.objective !== 'string') {
		return ApiResponse.badRequest('Missing objective');
	}

	const objective = payload.objective.trim();
	if (!objective) return ApiResponse.badRequest('Objective cannot be empty');

	const budgets = normalizeBudgets(payload.budgets);
	const admin = createAdminSupabaseClient();
	const adminSb = admin as any;

	// Enforce per-user concurrency
	const { count: activeCount, error: countError } = await adminSb
		.from('tree_agent_runs')
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
			`You already have ${MAX_CONCURRENT_RUNS} active Tree Agent runs.`,
			HttpStatus.TOO_MANY_REQUESTS,
			'RATE_LIMITED'
		);
	}

	// Ensure actor for onto_* creation
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

	// Resolve context scope (global vs project)
	const requestedContextType = payload.context_type === 'project' ? 'project' : 'global';
	const requestedContextProjectId =
		typeof payload.context_project_id === 'string' ? payload.context_project_id.trim() : '';
	let contextType: 'global' | 'project' = requestedContextType;
	let contextProjectId: string | null = null;

	if (contextType === 'project') {
		if (!requestedContextProjectId) {
			return ApiResponse.badRequest('context_project_id is required for project context');
		}

		const { data: membership, error: membershipError } = await adminSb
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actorId)
			.eq('project_id', requestedContextProjectId)
			.is('removed_at', null)
			.maybeSingle();

		if (membershipError) {
			return ApiResponse.error(
				'Failed to validate project context',
				HttpStatus.INTERNAL_SERVER_ERROR,
				'DATABASE_ERROR',
				membershipError.message
			);
		}

		if (!membership?.project_id) {
			return ApiResponse.forbidden('You do not have access to that context_project_id');
		}

		contextProjectId = membership.project_id;
	}

	// Create workspace project for run-local documents
	const { data: workspaceProject, error: workspaceProjectError } = await adminSb
		.from('onto_projects')
		.insert({
			created_by: actorId,
			name: `Tree Agent: ${objective.slice(0, 80)}`,
			type_key: TREE_AGENT_PROJECT_TYPE,
			state_key: DEFAULT_PROJECT_STATE,
			props: { tree_agent: true }
		})
		.select('id')
		.single();

	if (workspaceProjectError || !workspaceProject?.id) {
		return ApiResponse.error(
			'Failed to create Tree Agent workspace project',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			workspaceProjectError?.message
		);
	}

	// Ensure membership so documents/edges are visible via RLS
	const { error: memberError } = await adminSb.from('onto_project_members').insert({
		project_id: workspaceProject.id,
		actor_id: actorId,
		role_key: 'owner',
		access: 'admin',
		added_by_actor_id: actorId
	});
	if (memberError) {
		return ApiResponse.error(
			'Failed to create Tree Agent project membership',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			memberError.message
		);
	}

	// Create run with context in both durable columns and metrics (for observability)
	const nowIso = new Date().toISOString();
	const scope = contextType === 'project' ? 'project' : 'global';
	const projectIds = contextType === 'project' && contextProjectId ? [contextProjectId] : null;

	const { data: run, error: runError } = await adminSb
		.from('tree_agent_runs')
		.insert({
			user_id: user.id,
			objective,
			status: 'running',
			workspace_project_id: workspaceProject.id,
			budgets,
			// Durable context storage (Phase 2)
			scope,
			project_ids: projectIds,
			// Metrics for observability
			metrics: {
				tokens_total: 0,
				cost_total_usd: 0,
				context: { type: contextType, project_id: contextProjectId }
			},
			started_at: nowIso,
			updated_at: nowIso
		})
		.select('*')
		.single();

	if (runError || !run) {
		return ApiResponse.error(
			'Failed to create Tree Agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError?.message
		);
	}

	// Seed root node
	const { data: rootNode, error: rootNodeError } = await adminSb
		.from('tree_agent_nodes')
		.insert({
			run_id: run.id,
			parent_node_id: null,
			title: objective.slice(0, 120),
			reason: 'Root objective',
			success_criteria: payload.success_criteria ?? [],
			band_index: 0,
			step_index: 0,
			depth: 0,
			status: 'planning',
			role_state: 'planner',
			context: {
				objective,
				created_by: user.id,
				context_type: contextType,
				context_project_id: contextProjectId
			}
		})
		.select('*')
		.single();

	if (rootNodeError || !rootNode?.id) {
		return ApiResponse.error(
			'Failed to create root node',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			rootNodeError?.message
		);
	}

	// Create root scratchpad document
	const { data: scratchpadDoc, error: scratchpadError } = await adminSb
		.from('onto_documents')
		.insert({
			project_id: workspaceProject.id,
			title: 'Tree Agent Scratchpad (root)',
			type_key: TREE_AGENT_SCRATCHPAD_TYPE,
			state_key: DEFAULT_DOC_STATE,
			created_by: actorId,
			content: `# Tree Agent Scratchpad\n\nRun: ${run.id}\nNode: ${rootNode.id}\n\n## Objective\n\n${objective}\n`,
			props: {
				doc_role: 'tree_agent_scratchpad',
				tree_agent_run_id: run.id,
				tree_agent_node_id: rootNode.id,
				parent_node_id: null,
				depth: 0
			}
		})
		.select('id')
		.single();

	if (scratchpadError || !scratchpadDoc?.id) {
		return ApiResponse.error(
			'Failed to create root scratchpad',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			scratchpadError?.message
		);
	}

	// Update root node and run pointers
	await adminSb
		.from('tree_agent_nodes')
		.update({ scratchpad_doc_id: scratchpadDoc.id })
		.eq('id', rootNode.id);

	await adminSb.from('tree_agent_runs').update({ root_node_id: rootNode.id }).eq('id', run.id);

	// Seed initial events for live UI projection
	await adminSb.from('tree_agent_events').insert([
		{
			run_id: run.id,
			node_id: rootNode.id,
			event_type: 'tree.run_started',
			payload: {
				objective,
				contextType,
				contextProjectId
			}
		},
		{
			run_id: run.id,
			node_id: rootNode.id,
			event_type: 'tree.node_created',
			payload: {
				parentNodeId: null,
				title: rootNode.title,
				reason: rootNode.reason,
				successCriteria: rootNode.success_criteria ?? [],
				depth: 0,
				bandIndex: 0,
				stepIndex: 0
			}
		},
		{
			run_id: run.id,
			node_id: rootNode.id,
			event_type: 'tree.scratchpad_linked',
			payload: { scratchpadDocId: scratchpadDoc.id }
		},
		{
			run_id: run.id,
			node_id: rootNode.id,
			event_type: 'tree.node_status',
			payload: { status: 'planning', role: 'planner', message: 'root_initialized' }
		}
	]);

	// Queue orchestration job with durable context fields
	const metadata = {
		run_id: run.id,
		root_node_id: rootNode.id,
		workspace_project_id: workspaceProject.id,
		budgets,
		// Context fields (priority over metrics)
		context_type: contextType,
		context_project_id: contextProjectId,
		// Durable scope fields (Phase 2)
		scope,
		project_ids: projectIds
	};

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'buildos_tree_agent',
		p_metadata: metadata,
		p_priority: 7,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `tree-agent:${run.id}:1`
	});

	if (jobError) {
		await adminSb
			.from('tree_agent_runs')
			.update({
				status: 'failed',
				metrics: {
					...(run.metrics ?? {}),
					stop_reason: { type: 'queue_error', detail: jobError.message }
				}
			})
			.eq('id', run.id);

		return ApiResponse.error(
			'Failed to queue Tree Agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			jobError.message
		);
	}

	return ApiResponse.success({
		run: {
			...run,
			root_node_id: rootNode.id,
			workspace_project_id: workspaceProject.id
		},
		rootNode,
		scratchpadDocId: scratchpadDoc.id
	});
};
