// apps/web/src/routes/api/projects/[id]/history/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}
		const projectId = params.id;

		if (!projectId) {
			return ApiResponse.badRequest('Project ID is required');
		}

		// Verify user has access to this project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', projectId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user?.id) {
			return ApiResponse.forbidden('Unauthorized');
		}

		// Get all project history versions
		const { data: historyVersions, error: historyError } = await supabase
			.from('projects_history')
			.select('*')
			.eq('project_id', projectId)
			.order('version_number', { ascending: true });

		if (historyError) {
			console.error('Error fetching project history:', historyError);
			return ApiResponse.error('Failed to fetch project history', 500);
		}

		if (!historyVersions || historyVersions.length === 0) {
			return ApiResponse.success({
				versions: [],
				message: 'No history available for this project'
			});
		}

		// Get braindumps for each version by matching timestamps within 5 seconds
		const versionsWithBraindumps = await Promise.all(
			historyVersions.map(async (version) => {
				let braindump = null;

				if (version.created_at) {
					// Find brain_dump_links created within 5 seconds of this version
					const versionTime = new Date(version.created_at);
					const startTime = new Date(versionTime.getTime() - 5000); // 5 seconds before
					const endTime = new Date(versionTime.getTime() + 10000); // 5 seconds after

					const { data: braindumpLinks, error: linksError } = await supabase
						.from('brain_dump_links')
						.select(
							`
							brain_dump_id,
							created_at,
							brain_dumps (
								id,
								title,
								content,
								created_at,
								updated_at
							)
						`
						)
						.eq('project_id', projectId)
						.lte('created_at', endTime.toISOString())
						.order('created_at', { ascending: false })
						.limit(1);

					if (!linksError && braindumpLinks && braindumpLinks.length > 0) {
						const link = braindumpLinks[0]!;
						if (link.brain_dumps) {
							braindump = {
								id: link.brain_dumps.id,
								title: link.brain_dumps.title,
								content: link.brain_dumps.content,
								created_at: link.brain_dumps.created_at,
								updated_at: link.brain_dumps.updated_at,
								preview: link.brain_dumps.content
									? link.brain_dumps.content.substring(0, 100) +
										(link.brain_dumps.content.length > 100 ? '...' : '')
									: null
							};
						}
					}
				}

				return {
					version_number: version.version_number,
					is_first_version: version.is_first_version,
					created_at: version.created_at,
					created_by: version.created_by,
					project_data: version.project_data,
					braindump
				};
			})
		);

		return ApiResponse.success({
			versions: versionsWithBraindumps,
			total_versions: versionsWithBraindumps.length
		});
	} catch (error) {
		console.error('Unexpected error in project history endpoint:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
