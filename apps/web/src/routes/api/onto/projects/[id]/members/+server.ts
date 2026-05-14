// apps/web/src/routes/api/onto/projects/[id]/members/+server.ts
/**
 * Project members endpoint
 * - GET: list active members (read access)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

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
		const supabase = locals.supabase;

		const access = await requireProjectMemberAccess({
			locals,
			projectId: params.id,
			requiredAccess: 'read',
			forbiddenMessage: 'Access denied'
		});
		if (!access.ok) return access.response;

		const projectId = access.projectId;

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
				userId: access.userId,
				projectId,
				entityType: 'project',
				operation: 'project_members_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(error);
		}

		const sortedMembers = sortMembersByRoleAndCreatedAt((members ?? []) as MemberWithRole[]);

		return ApiResponse.success({ members: sortedMembers, actorId: access.actorId });
	} catch (error) {
		console.error('[Project Members API] Failed to load members:', error);
		return ApiResponse.internalError(error, 'Failed to load members');
	}
};
