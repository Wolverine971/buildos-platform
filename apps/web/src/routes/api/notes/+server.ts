// apps/web/src/routes/api/notes/+server.ts
import type { RequestHandler } from './$types';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const data = await request.json();
		const actorId = await ensureActorId(supabase, user.id);

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
				.from('onto_projects')
				.select('id')
				.eq('id', cleanedData.project_id)
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.single();

			if (projectError || !project) {
				return ApiResponse.badRequest('Invalid project ID');
			}
		}

		const { data: note, error } = await supabase
			.from('notes')
			.insert(cleanedData as any)
			.select('*')
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		let projectMeta: { id: string; name: string; slug: null } | null = null;
		if (note?.project_id) {
			const { data: project } = await supabase
				.from('onto_projects')
				.select('id, name')
				.eq('id', note.project_id)
				.is('deleted_at', null)
				.maybeSingle();
			if (project) {
				projectMeta = { id: project.id, name: project.name, slug: null };
			}
		}

		return ApiResponse.success({
			note: {
				...note,
				projects: projectMeta
			}
		});
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
		const actorId = await ensureActorId(supabase, user.id);
		// Parse query parameters
		const projectId = url.searchParams.get('project_id');
		const limit = Number(url.searchParams.get('limit')) || 50;
		const search = url.searchParams.get('search')?.trim();
		const offset = Number(url.searchParams.get('offset')) || 0;

		let query = supabase.from('notes').select('*', { count: 'exact' }).eq('user_id', user.id);

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

		const projectIds = Array.from(
			new Set(
				(notes || [])
					.map((note: any) => note.project_id)
					.filter((id: string | null): id is string => Boolean(id))
			)
		);

		const projectMap = new Map<string, { id: string; name: string; slug: null }>();
		if (projectIds.length > 0) {
			const { data: projects } = await supabase
				.from('onto_projects')
				.select('id, name')
				.in('id', projectIds)
				.eq('created_by', actorId)
				.is('deleted_at', null);
			for (const project of projects || []) {
				projectMap.set(project.id, { id: project.id, name: project.name, slug: null });
			}
		}

		const normalizedNotes = (notes || []).map((note: any) => ({
			...note,
			projects: note.project_id ? (projectMap.get(note.project_id) ?? null) : null
		}));

		return ApiResponse.success({
			notes: normalizedNotes,
			total: count,
			offset,
			limit
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
