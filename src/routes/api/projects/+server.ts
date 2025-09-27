// src/routes/api/projects/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get pagination parameters
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = (page - 1) * limit;

		// Get total count
		const { count, error: countError } = await supabase
			.from('projects')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', user.id)
			.eq('status', 'active');

		if (countError) {
			return ApiResponse.databaseError(countError);
		}

		// Get paginated projects
		const { data: projects, error: projectsError } = await supabase
			.from('projects')
			.select('*')
			.eq('user_id', user.id)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (projectsError) {
			return ApiResponse.databaseError(projectsError);
		}

		return ApiResponse.success({
			projects: projects || [],
			total: count || 0,
			page,
			limit
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
			.insert(cleanedData)
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
