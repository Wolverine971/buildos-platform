// apps/web/src/routes/api/onto/projects/[id]/card/+server.ts
//
// GET: everything the Projects desktop shows when a project card opens, in one
// request. The doc tree, docs and tasks come from the Organize snapshot (the
// same baseline a cross-project move is planned and versioned against), and
// goals are read beside it. Read access is checked by the snapshot.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	loadOrganizeSnapshot,
	OrganizeSnapshotError
} from '$lib/server/organize/organize-snapshot';

const GOAL_LIMIT = 50;

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');

	try {
		const [snapshot, goals] = await Promise.all([
			loadOrganizeSnapshot(locals.supabase, projectId),
			locals.supabase
				.from('onto_goals')
				.select('id, name, state_key, target_date')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.order('updated_at', { ascending: false })
				.limit(GOAL_LIMIT)
		]);
		if (goals.error) return ApiResponse.internalError(goals.error, 'Could not load goals.');
		return ApiResponse.success({ project: snapshot.project, goals: goals.data ?? [] });
	} catch (error) {
		if (error instanceof OrganizeSnapshotError)
			return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not load this project.');
	}
};
