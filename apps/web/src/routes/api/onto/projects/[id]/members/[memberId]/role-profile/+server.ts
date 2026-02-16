// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/role-profile/+server.ts
/**
 * Admin role-profile update endpoint for any active project member.
 * - PATCH: manually update target member role_name / role_description
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';

const ROLE_NAME_MIN = 2;
const ROLE_NAME_MAX = 80;
const ROLE_DESCRIPTION_MIN = 8;
const ROLE_DESCRIPTION_MAX = 600;

function normalizeNullableString(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function validateRoleName(value: string | null): string | null {
	if (value === null) return null;
	if (value.length < ROLE_NAME_MIN || value.length > ROLE_NAME_MAX) return null;
	return value;
}

function validateRoleDescription(value: string | null): string | null {
	if (value === null) return null;
	if (value.length < ROLE_DESCRIPTION_MIN || value.length > ROLE_DESCRIPTION_MAX) return null;
	return value;
}

type TargetMemberRow = {
	id: string;
	actor_id: string;
	role_name: string | null;
	role_description: string | null;
	removed_at: string | null;
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const endpoint = '/api/onto/projects/:id/members/:memberId/role-profile';

	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const projectId = params.id?.trim();
		const memberId = params.memberId?.trim();
		if (!projectId || !memberId) {
			return ApiResponse.badRequest('Project ID and member ID required');
		}

		const body = await request.json().catch(() => null);
		const hasRoleName = body && Object.prototype.hasOwnProperty.call(body, 'role_name');
		const hasRoleDescription =
			body && Object.prototype.hasOwnProperty.call(body, 'role_description');
		if (!hasRoleName && !hasRoleDescription) {
			return ApiResponse.badRequest('Provide role_name and/or role_description');
		}

		const payload = (body ?? {}) as Record<string, unknown>;
		if (hasRoleName) {
			const roleNameValue = payload.role_name;
			if (roleNameValue !== null && typeof roleNameValue !== 'string') {
				return ApiResponse.badRequest('role_name must be a string or null');
			}
		}
		if (hasRoleDescription) {
			const roleDescriptionValue = payload.role_description;
			if (roleDescriptionValue !== null && typeof roleDescriptionValue !== 'string') {
				return ApiResponse.badRequest('role_description must be a string or null');
			}
		}

		const roleNameRaw = hasRoleName ? normalizeNullableString(payload.role_name) : undefined;
		const roleDescriptionRaw = hasRoleDescription
			? normalizeNullableString(payload.role_description)
			: undefined;

		const roleName = hasRoleName ? validateRoleName(roleNameRaw ?? null) : undefined;
		const roleDescription = hasRoleDescription
			? validateRoleDescription(roleDescriptionRaw ?? null)
			: undefined;

		if (hasRoleName && roleNameRaw !== null && roleName === null) {
			return ApiResponse.badRequest(
				`role_name must be between ${ROLE_NAME_MIN} and ${ROLE_NAME_MAX} characters`
			);
		}

		if (hasRoleDescription && roleDescriptionRaw !== null && roleDescription === null) {
			return ApiResponse.badRequest(
				`role_description must be between ${ROLE_DESCRIPTION_MIN} and ${ROLE_DESCRIPTION_MAX} characters`
			);
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
				endpoint,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_member_role_profile_admin_access'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}
		if (!hasAccess) return ApiResponse.forbidden('Access denied');

		const { data: member, error: memberError } = await supabase
			.from('onto_project_members')
			.select('id, actor_id, role_name, role_description, removed_at')
			.eq('id', memberId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (memberError) {
			await logOntologyApiError({
				supabase,
				error: memberError,
				endpoint,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_admin_member_fetch',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(memberError);
		}

		if (!member) return ApiResponse.notFound('Member');
		if (member.removed_at) return ApiResponse.badRequest('Member has already been removed');

		const target = member as TargetMemberRow;
		const nextRoleName =
			roleName === undefined ? normalizeNullableString(target.role_name) : roleName;
		const nextRoleDescription =
			roleDescription === undefined
				? normalizeNullableString(target.role_description)
				: roleDescription;

		if (
			normalizeNullableString(target.role_name) === nextRoleName &&
			normalizeNullableString(target.role_description) === nextRoleDescription
		) {
			return ApiResponse.success({
				member_id: target.id,
				role_name: nextRoleName,
				role_description: nextRoleDescription
			});
		}

		const { data: updatedMember, error: updateError } = await supabase
			.from('onto_project_members')
			.update({
				role_name: nextRoleName,
				role_description: nextRoleDescription
			})
			.eq('id', memberId)
			.eq('project_id', projectId)
			.is('removed_at', null)
			.select('id, actor_id, role_name, role_description, removed_at')
			.maybeSingle();

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_admin_update',
				tableName: 'onto_project_members'
			});
			return ApiResponse.databaseError(updateError);
		}

		if (!updatedMember) {
			const { data: latestMember } = await supabase
				.from('onto_project_members')
				.select('id, removed_at')
				.eq('id', memberId)
				.eq('project_id', projectId)
				.maybeSingle();

			if (!latestMember) return ApiResponse.notFound('Member');
			if (latestMember.removed_at)
				return ApiResponse.badRequest('Member has already been removed');

			return ApiResponse.error(
				'Member was updated by another collaborator. Please retry.',
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
				event: 'member_role_profile_admin_updated',
				member_id: updatedMember.id,
				actor_id: updatedMember.actor_id,
				role_name: updatedMember.role_name,
				role_description: updatedMember.role_description
			}
		});

		return ApiResponse.success({
			member_id: updatedMember.id,
			role_name: updatedMember.role_name,
			role_description: updatedMember.role_description
		});
	} catch (error) {
		console.error('[Project Members Role Profile API] PATCH failed:', error);
		return ApiResponse.internalError(error, 'Failed to update member role profile');
	}
};
