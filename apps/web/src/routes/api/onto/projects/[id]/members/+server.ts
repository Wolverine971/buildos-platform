// apps/web/src/routes/api/onto/projects/[id]/members/+server.ts
/**
 * Project members endpoint
 * - GET: list active members (read access)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

type MemberWithRole = {
	role_key: string | null;
	created_at: string | null;
};

function sortMembersByRoleAndCreatedAt<T extends MemberWithRole>(rows: T[]): T[] {
	const roleOrder: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };
	return [...rows].sort((a, b) => {
		const roleDelta = (roleOrder[a.role_key ?? ''] ?? 99) - (roleOrder[b.role_key ?? ''] ?? 99);
		if (roleDelta !== 0) return roleDelta;

		const aTime = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
		const bTime = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
		return aTime - bTime;
	});
}

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
		if (!isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const supabase = locals.supabase;

		// Run actor resolution + access check in parallel — neither depends on the other's result.
		const [actorId, accessResult] = await Promise.all([
			ensureActorId(supabase, user.id),
			supabase.rpc('current_actor_has_project_access', {
				p_project_id: projectId,
				p_required_access: 'read'
			})
		]);

		const { data: hasAccess, error: accessError } = accessResult;

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
				'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, added_by_actor_id, removed_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)'
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

		const sortedMembers = sortMembersByRoleAndCreatedAt((members ?? []) as MemberWithRole[]);

		return ApiResponse.success({ members: sortedMembers, actorId });
	} catch (error) {
		console.error('[Project Members API] Failed to load members:', error);
		return ApiResponse.internalError(error, 'Failed to load members');
	}
};
