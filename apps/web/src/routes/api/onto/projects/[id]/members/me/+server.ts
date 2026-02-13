// apps/web/src/routes/api/onto/projects/[id]/members/me/+server.ts
/**
 * Current member endpoint
 * - DELETE: leave a shared project (non-owners only)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../shared/error-logging';

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: `/api/onto/projects/${projectId}/members/me`,
				method: 'DELETE',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_member_leave_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by === actorId) {
			return ApiResponse.badRequest(
				'Project owners cannot leave their own project. Delete it instead.'
			);
		}

		const { data: member, error: memberError } = await supabase
			.from('onto_project_members')
			.select('id, actor_id, role_key, access, removed_at')
			.eq('project_id', projectId)
			.eq('actor_id', actorId)
			.is('removed_at', null)
			.maybeSingle();

		if (memberError) {
			await logOntologyApiError({
				supabase,
				error: memberError,
				endpoint: `/api/onto/projects/${projectId}/members/me`,
				method: 'DELETE',
				userId: user.id,
				projectId,
				entityType: 'project_member',
				operation: 'project_member_leave_member_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(memberError);
		}

		if (!member) {
			return ApiResponse.forbidden('You are not an active member of this project');
		}

		if (member.role_key === 'owner') {
			return ApiResponse.badRequest(
				'Project owners cannot leave their own project. Delete it instead.'
			);
		}

		const removedAt = new Date().toISOString();
		const { data: removedMember, error: updateError } = await supabase
			.from('onto_project_members')
			.update({ removed_at: removedAt, removed_by_actor_id: actorId })
			.eq('id', member.id)
			.eq('project_id', projectId)
			.eq('actor_id', actorId)
			.is('removed_at', null)
			.select('id, actor_id, role_key, access')
			.maybeSingle();

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/members/me`,
				method: 'DELETE',
				userId: user.id,
				projectId,
				entityType: 'project_member',
				operation: 'project_member_leave_update',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(updateError);
		}

		if (!removedMember) {
			return ApiResponse.error(
				'Membership was updated by another request. Please retry.',
				409
			);
		}

		await supabase.from('onto_project_logs').insert({
			project_id: projectId,
			entity_type: 'project',
			entity_id: projectId,
			action: 'updated',
			changed_by: user.id,
			changed_by_actor_id: actorId,
			change_source: 'api',
			after_data: {
				event: 'member_left',
				member_id: removedMember.id,
				actor_id: removedMember.actor_id,
				role_key: removedMember.role_key,
				access: removedMember.access
			}
		});

		return ApiResponse.success({ memberId: removedMember.id, projectId });
	} catch (error) {
		console.error('[Project Members API] Failed to leave project:', error);
		return ApiResponse.internalError(error, 'Failed to leave project');
	}
};
