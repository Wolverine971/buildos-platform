// apps/web/src/routes/api/onto/fsm/transitions/+server.ts
/**
 * GET /api/onto/fsm/transitions
 * Fetch allowed transitions for an ontology entity by delegating to the database helper.
 *
 * Query params:
 * - kind: entity kind (project, plan, task, output, document)
 * - id: entity UUID
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type RawTransitionRow = {
	event: string;
	to_state: string;
	guards: unknown[] | null;
	actions: unknown[] | null;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const kind = url.searchParams.get('kind');
		const id = url.searchParams.get('id');

		if (!kind || !id) {
			return ApiResponse.badRequest('Missing kind or id query parameter');
		}

		const supabase = locals.supabase;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[FSM Transitions] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Security check: Verify user owns this entity
		// For projects, check created_by directly
		// For other entities, check via their project
		let ownerActorId: string | null = null;

		if (kind === 'project') {
			const { data: project } = await supabase
				.from('onto_projects')
				.select('created_by')
				.eq('id', id)
				.maybeSingle();
			ownerActorId = project?.created_by ?? null;
		} else {
			// For other entities, get the project_id and verify ownership
			let projectId: string | null = null;

			switch (kind) {
				case 'output':
					const { data: output } = await supabase
						.from('onto_outputs')
						.select('project_id')
						.eq('id', id)
						.maybeSingle();
					projectId = output?.project_id ?? null;
					break;
				case 'task':
					const { data: task } = await supabase
						.from('onto_tasks')
						.select('project_id')
						.eq('id', id)
						.maybeSingle();
					projectId = task?.project_id ?? null;
					break;
				case 'document':
					const { data: doc } = await supabase
						.from('onto_documents')
						.select('project_id')
						.eq('id', id)
						.maybeSingle();
					projectId = doc?.project_id ?? null;
					break;
				case 'plan':
					const { data: plan } = await supabase
						.from('onto_plans')
						.select('project_id')
						.eq('id', id)
						.maybeSingle();
					projectId = plan?.project_id ?? null;
					break;
				default:
					return ApiResponse.badRequest(`Unsupported entity kind: ${kind}`);
			}

			if (projectId) {
				const { data: project } = await supabase
					.from('onto_projects')
					.select('created_by')
					.eq('id', projectId)
					.maybeSingle();
				ownerActorId = project?.created_by ?? null;
			}
		}

		if (!ownerActorId || ownerActorId !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this entity');
		}

		const { data, error: rpcError } = await supabase.rpc('get_allowed_transitions', {
			p_object_kind: kind,
			p_object_id: id
		});

		if (rpcError) {
			console.error('[Ontology] get_allowed_transitions RPC failed:', rpcError);
			return ApiResponse.error(`Failed to fetch transitions: ${rpcError.message}`, 500);
		}

		const transitions =
			(data as RawTransitionRow[] | null | undefined)?.map((row) => ({
				event: row.event,
				to: row.to_state,
				guards: (row.guards ?? []) as unknown[],
				actions: (row.actions ?? []) as unknown[]
			})) ?? [];

		return ApiResponse.success({
			transitions,
			count: transitions.length
		});
	} catch (err) {
		console.error('[FSM Transitions] Unexpected error:', err);
		return ApiResponse.internalError('An unexpected error occurred');
	}
};
