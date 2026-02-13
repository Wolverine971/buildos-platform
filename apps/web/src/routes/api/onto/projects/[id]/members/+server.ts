// apps/web/src/routes/api/onto/projects/[id]/members/+server.ts
/**
 * Project members endpoint
 * - GET: list active members (read access)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;
		const actorId = await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/members`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_access'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const { data: members, error } = await supabase
			.from('onto_project_members')
			.select(
				'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, added_by_actor_id, removed_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, name, email)'
			)
			.eq('project_id', projectId)
			.is('removed_at', null)
			.order('created_at', { ascending: true });

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/members`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ members: members ?? [], actorId });
	} catch (error) {
		console.error('[Project Members API] Failed to load members:', error);
		return ApiResponse.internalError(error, 'Failed to load members');
	}
};
