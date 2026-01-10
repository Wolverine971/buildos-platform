// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/+server.ts
/**
 * Update member role/access (admin only).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../shared/error-logging';

const ROLE_ACCESS_MAP = {
	editor: 'write',
	viewer: 'read'
} as const;

type MemberRole = keyof typeof ROLE_ACCESS_MAP;

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		const memberId = params.memberId;
		if (!projectId || !memberId) {
			return ApiResponse.badRequest('Project ID and member ID required');
		}

		const body = await request.json().catch(() => null);
		const roleKey = (body?.role_key as MemberRole | undefined) ?? null;

		if (!roleKey || !(roleKey in ROLE_ACCESS_MAP)) {
			return ApiResponse.badRequest('Role must be editor or viewer');
		}

		const supabase = locals.supabase;
		const actorId = await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'admin'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'PATCH',
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

		const { data: member, error: memberError } = await supabase
			.from('onto_project_members')
			.select('id, actor_id, role_key, access, removed_at')
			.eq('id', memberId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (memberError) {
			await logOntologyApiError({
				supabase,
				error: memberError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(memberError);
		}

		if (!member) {
			return ApiResponse.notFound('Member');
		}

		if (member.removed_at) {
			return ApiResponse.badRequest('Member has already been removed');
		}

		if (member.role_key === 'owner') {
			return ApiResponse.badRequest('Owner role cannot be changed');
		}

		const access = ROLE_ACCESS_MAP[roleKey];

		if (member.role_key === roleKey && member.access === access) {
			return ApiResponse.success({ memberId });
		}

		const { error: updateError } = await supabase
			.from('onto_project_members')
			.update({ role_key: roleKey, access })
			.eq('id', memberId);

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_update',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(updateError);
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
				event: 'member_role_updated',
				member_id: memberId,
				actor_id: member.actor_id,
				role_key: roleKey,
				access
			}
		});

		return ApiResponse.success({ memberId, role_key: roleKey, access });
	} catch (error) {
		console.error('[Project Members API] Failed to update member:', error);
		return ApiResponse.internalError(error, 'Failed to update member');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		const memberId = params.memberId;
		if (!projectId || !memberId) {
			return ApiResponse.badRequest('Project ID and member ID required');
		}

		const supabase = locals.supabase;
		const actorId = await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'admin'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'DELETE',
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

		const { data: member, error: memberError } = await supabase
			.from('onto_project_members')
			.select('id, actor_id, role_key, access, removed_at')
			.eq('id', memberId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (memberError) {
			await logOntologyApiError({
				supabase,
				error: memberError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'DELETE',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(memberError);
		}

		if (!member) {
			return ApiResponse.notFound('Member');
		}

		if (member.removed_at) {
			return ApiResponse.badRequest('Member has already been removed');
		}

		if (member.role_key === 'owner') {
			return ApiResponse.badRequest('Owner role cannot be removed');
		}

		const removedAt = new Date().toISOString();
		const { error: updateError } = await supabase
			.from('onto_project_members')
			.update({ removed_at: removedAt, removed_by_actor_id: actorId })
			.eq('id', memberId);

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}`,
				method: 'DELETE',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_members_remove',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(updateError);
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
				event: 'member_removed',
				member_id: memberId,
				actor_id: member.actor_id,
				role_key: member.role_key,
				access: member.access
			}
		});

		return ApiResponse.success({ memberId });
	} catch (error) {
		console.error('[Project Members API] Failed to remove member:', error);
		return ApiResponse.internalError(error, 'Failed to remove member');
	}
};
