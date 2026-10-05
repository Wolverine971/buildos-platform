// apps/web/src/routes/api/onto/projects/[id]/ownership/+server.ts
/**
 * Hand a project to another active member.
 * - POST: owner only. Body { member_id, leave? }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { notifyOwnershipReceived } from '$lib/server/project-sharing-notifications';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const projectId = params.id;
		if (!projectId || !isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const body = await request.json().catch(() => null);
		const memberId = typeof body?.member_id === 'string' ? body.member_id : '';
		if (!isValidUUID(memberId)) {
			return ApiResponse.badRequest('member_id must be a valid id');
		}
		if (body?.leave !== undefined && typeof body.leave !== 'boolean') {
			return ApiResponse.badRequest('leave must be true or false');
		}
		const leave = body?.leave === true;

		const { data, error } = await locals.supabase.rpc('transfer_onto_project_ownership', {
			p_project_id: projectId,
			p_new_owner_member_id: memberId,
			p_leave: leave
		});

		if (error) {
			if (error.code === '42501') {
				return ApiResponse.forbidden('Only the project owner can hand it off');
			}
			if (error.code === 'P0002') {
				return ApiResponse.error(
					"That person can't take over this project",
					404,
					'handoff_member_not_found'
				);
			}
			console.error('[Project Ownership API] Handoff failed:', error);
			return ApiResponse.error('Failed to hand off project', 500);
		}

		const result = (data ?? {}) as {
			project_name?: string;
			new_owner_actor_id?: string;
			new_owner_user_id?: string;
			previous_owner_left?: boolean;
		};

		if (result.new_owner_user_id) {
			await notifyOwnershipReceived({
				projectId,
				projectName: result.project_name ?? 'your project',
				newOwnerUserId: result.new_owner_user_id,
				fromName: user.name || user.email || 'A teammate',
				senderUserId: user.id
			});
		}

		return ApiResponse.success({
			project_id: projectId,
			new_owner_actor_id: result.new_owner_actor_id,
			previous_owner_left: result.previous_owner_left ?? false
		});
	} catch (error) {
		console.error('[Project Ownership API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to hand off project');
	}
};
