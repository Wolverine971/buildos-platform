// apps/web/src/routes/api/projects/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';
import { validatePagination } from '$lib/utils/api-helpers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const mode = url.searchParams.get('mode');
		// Use mode-specific defaults but enforce max limits (security fix: 2026-01-03)
		const defaultLimit = mode === 'context-selection' ? 100 : 20;
		const { page, limit, offset } = validatePagination(url, {
			defaultLimit,
			maxLimit: 100
		});
		const statusParam = url.searchParams.get('status');
		const statuses = statusParam
			? statusParam
					.split(',')
					.map((status) => status.trim())
					.filter(Boolean)
			: mode === 'context-selection'
				? ['active', 'paused']
				: ['active'];
		const includeCounts =
			(mode === 'context-selection' && url.searchParams.get('include_counts') !== 'false') ||
			url.searchParams.get('include_counts') === 'true';

		const selectFields = includeCounts
			? `id, name, description, status, slug, updated_at, tasks:tasks(count)`
			: '*';

		const {
			data: projects,
			error,
			count
		} = await supabase
			.from('projects')
			.select(selectFields, { count: 'exact' })
			.eq('user_id', user.id)
			.in('status', statuses as any)
			.order('updated_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		const normalizedProjects = (projects || []).map((project: any) => {
			if (!includeCounts) return project;
			const taskCount = project.tasks?.[0]?.count ?? 0;
			const { tasks, ...rest } = project;
			return {
				...rest,
				task_count: taskCount
			};
		});

		return ApiResponse.success({
			projects: normalizedProjects,
			total: count ?? normalizedProjects.length,
			page,
			limit,
			statuses
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const data = await request.json();

		// Clean and validate project data
		const cleanedData = cleanDataForTable('projects', {
			...data,
			user_id: user.id,
			status: data.status || 'active',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});

		// Validate required fields
		const validation = validateRequiredFields('projects', cleanedData, 'create');
		if (!validation.isValid) {
			return ApiResponse.badRequest('Validation failed', {
				missingFields: validation.missingFields
			});
		}

		// Create the project
		const { data: project, error } = await supabase
			.from('projects')
			.insert(cleanedData as any)
			.select()
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.created(project, 'Project created successfully');
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
