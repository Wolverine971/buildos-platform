// apps/web/src/routes/api/onto/projects/[id]/restore/+server.ts
/**
 * Restore a deleted project from Trash (owner only).
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { notifyMembersProjectRestored } from '$lib/server/project-sharing-notifications';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const projectId = params.id;
		if (!projectId || !isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const { data, error } = await locals.supabase.rpc('restore_onto_project', {
			p_project_id: projectId
		});

		if (error) {
			if (error.code === '42501') {
				return ApiResponse.forbidden('Only the project owner can restore it');
			}
			console.error('[Project Restore API] Restore failed:', error);
			return ApiResponse.error('Failed to restore project', 500);
		}

		const result = (data ?? {}) as {
			project_name?: string;
			restored?: boolean;
			items_restored?: number;
		};

		if (result.restored) {
			await notifyMembersProjectRestored({
				projectId,
				projectName: result.project_name ?? 'a project',
				ownerName: user.name || user.email || 'The owner',
				excludeUserId: user.id,
				senderUserId: user.id
			});
		}

		return ApiResponse.success({
			project_id: projectId,
			restored: result.restored ?? false,
			items_restored: result.items_restored ?? 0
		});
	} catch (error) {
		console.error('[Project Restore API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to restore project');
	}
};
