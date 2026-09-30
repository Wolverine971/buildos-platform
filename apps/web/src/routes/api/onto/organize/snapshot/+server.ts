// apps/web/src/routes/api/onto/organize/snapshot/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	loadOrganizeSnapshot,
	OrganizeSnapshotError
} from '$lib/server/organize/organize-snapshot';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const id = url.searchParams.get('project_id');
	if (!id || !isValidUUID(id)) return ApiResponse.badRequest('Invalid project ID');
	try {
		return ApiResponse.success(await loadOrganizeSnapshot(locals.supabase, id));
	} catch (error) {
		if (error instanceof OrganizeSnapshotError)
			return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not load Organize.');
	}
};
