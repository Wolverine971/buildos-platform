// apps/web/src/routes/api/notes/+server.ts
import type { RequestHandler } from './$types';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const data = await request.json();

		// Clean the note data
		const cleanedData = cleanDataForTable('notes', {
			...data,
			user_id: user.id,
			// Ensure we have timestamps
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});

		// Validate required fields
		const validation = validateRequiredFields('notes', cleanedData, 'create');
		if (!validation.isValid) {
			return ApiResponse.badRequest('Validation failed', {
				missingFields: validation.missingFields
			});
		}

		// If linking to a project, verify the project exists and belongs to user
		if (cleanedData.project_id) {
			const { data: project, error: projectError } = await supabase
				.from('projects')
				.select('id')
				.eq('id', cleanedData.project_id)
				.eq('user_id', user.id)
				.single();

			if (projectError || !project) {
				return ApiResponse.badRequest('Invalid project ID');
			}
		}

		const { data: note, error } = await supabase
			.from('notes')
			.insert(cleanedData as any)
			.select(
				`
                *,
                projects:project_id(id, name, slug)
            `
			)
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ note });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Parse query parameters
		const projectId = url.searchParams.get('project_id');
		const limit = Number(url.searchParams.get('limit')) || 50;
		const search = url.searchParams.get('search')?.trim();
		const offset = Number(url.searchParams.get('offset')) || 0;

		let query = supabase
			.from('notes')
			.select(
				`
                *,
                projects:project_id(id, name, slug)
            `
			)
			.eq('user_id', user.id);

		// Apply filters
		if (projectId) {
			query = query.eq('project_id', projectId);
		}

		if (search) {
			query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
		}

		// Apply pagination and ordering
		const {
			data: notes,
			error,
			count
		} = await query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			notes: notes || [],
			total: count,
			offset,
			limit
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
