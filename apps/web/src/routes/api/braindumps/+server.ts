// apps/web/src/routes/api/braindumps/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { BrainDumpTableType } from '$lib/types/brain-dump';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const searchQuery = url.searchParams.get('search');
		const year = url.searchParams.get('year');
		const day = url.searchParams.get('day'); // Format: YYYY-MM-DD
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100); // Cap at 100
		const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

		// Optimized query with better indexing hints
		let baseQuery = supabase
			.from('brain_dumps')
			.select('*')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		// Apply filters with proper indexing
		if (year) {
			const startOfYear = `${year}-01-01T00:00:00.000Z`;
			const endOfYear = `${year}-12-31T23:59:59.999Z`;
			baseQuery = baseQuery.gte('created_at', startOfYear).lte('created_at', endOfYear);
		}

		if (day) {
			const startOfDay = `${day}T00:00:00.000Z`;
			const endOfDay = `${day}T23:59:59.999Z`;
			baseQuery = baseQuery.gte('created_at', startOfDay).lte('created_at', endOfDay);
		}

		if (searchQuery) {
			baseQuery = baseQuery.or(`
				title.ilike.%${searchQuery}%,
				content.ilike.%${searchQuery}%,
				ai_summary.ilike.%${searchQuery}%
			`);
		}

		const { data: braindumps, error: braindumpsError } = await baseQuery.range(
			offset,
			offset + limit - 1
		);

		if (braindumpsError) {
			return ApiResponse.databaseError(braindumpsError);
		}

		// Batch fetch all related data to avoid N+1 queries
		if (!braindumps || braindumps.length === 0) {
			return ApiResponse.success({ braindumps: [], total: 0, hasMore: false });
		}

		// Extract all unique braindump IDs and project IDs
		const braindumpIds = braindumps.map((bd) => bd.id);
		const projectIds = braindumps
			.filter((bd) => bd.project_id)
			.map((bd) => bd.project_id)
			.filter((id, index, self) => self.indexOf(id) === index); // unique project IDs

		// Batch fetch all brain_dump_links for all braindumps
		const { data: allLinks, error: linksError } = await supabase
			.from('brain_dump_links')
			.select(
				`
				*,
				projects(id, name, slug, created_at),
				tasks(id, title, status),
				notes(id, title)
			`
			)
			.in('brain_dump_id', braindumpIds);

		if (linksError) {
			console.error('Error fetching links:', linksError);
		}

		// Batch fetch all projects if needed
		let projectsMap = new Map();
		if (projectIds?.length) {
			const { data: projects, error: projectsError } = await supabase
				.from('projects')
				.select('id, name, slug, description, created_at')
				.in('id', projectIds as string[]);

			if (!projectsError && projects) {
				projects.forEach((project) => {
					projectsMap.set(project.id, project);
				});
			}
		}

		// Group links by braindump ID for efficient lookup
		const linksByBraindumpId = new Map();
		(allLinks || []).forEach((link) => {
			const bdId = link.brain_dump_id;
			if (!linksByBraindumpId.has(bdId)) {
				linksByBraindumpId.set(bdId, []);
			}
			linksByBraindumpId.get(bdId).push(link);
		});

		// Enrich braindumps with the batch-fetched data
		const enrichedBraindumps = braindumps.map((braindump) => {
			const brain_dump_links = linksByBraindumpId.get(braindump.id) || [];
			const isUnlinked = !braindump.project_id;
			let linkedProject = null;
			let isNewProject = false;

			let linkedTypes: BrainDumpTableType[] = [];

			// Get project information from pre-fetched data
			if (!isUnlinked && braindump.project_id) {
				linkedProject = projectsMap.get(braindump.project_id) || null;

				if (linkedProject) {
					// Check if this is a new project
					const projectLink = brain_dump_links.find(
						(link) => link.project_id === braindump.project_id
					);

					if (projectLink) {
						const braindumpTime = new Date(braindump.created_at as string).getTime();
						const projectTime = new Date(linkedProject.created_at).getTime();
						const timeDiff = Math.abs(projectTime - braindumpTime);

						// Consider it a new project if created within 5 minutes
						isNewProject = timeDiff <= 5 * 60 * 1000;
					}
				}
			}

			// Efficiently determine linked types
			if (brain_dump_links.length > 0) {
				const typeSet = new Set();
				brain_dump_links.forEach((link) => {
					if (link.project_id) typeSet.add('project');
					if (link.task_id) typeSet.add('task');
					if (link.note_id) typeSet.add('note');
				});
				linkedTypes = Array.from(typeSet) as BrainDumpTableType[];
			}

			return {
				...braindump,
				brain_dump_links,
				isNote: isUnlinked,
				isNewProject,
				linkedProject,
				linkedTypes
			};
		});

		return ApiResponse.success({
			braindumps: enrichedBraindumps,
			total: enrichedBraindumps.length,
			hasMore: enrichedBraindumps.length === limit // Hint if there are more results
		});
	} catch (error) {
		console.error('Error in braindumps API:', error);
		return ApiResponse.internalError(error);
	}
};
