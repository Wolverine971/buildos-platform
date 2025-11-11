// apps/web/src/routes/api/projects/[id]/onto-events/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;
	const timeMin = url.searchParams.get('timeMin');
	const timeMax = url.searchParams.get('timeMax');
	const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 0, 1000) : null;

	// Verify project ownership
	const { data: project, error: projectError } = await supabase
		.from('projects')
		.select('id, user_id')
		.eq('id', projectId)
		.single();

	if (projectError || !project) {
		return ApiResponse.notFound('Project');
	}

	if (project.user_id !== user.id) {
		return ApiResponse.forbidden();
	}

	// Resolve ontology project ID from legacy mapping
	const { data: mapping, error: mappingError } = await supabase
		.from('legacy_entity_mappings')
		.select('onto_id')
		.eq('legacy_table', 'projects')
		.eq('legacy_id', projectId)
		.maybeSingle();

	if (mappingError && mappingError.code !== 'PGRST116') {
		return ApiResponse.databaseError(mappingError);
	}

	if (!mapping?.onto_id) {
		return ApiResponse.success({
			ontoProjectId: null,
			events: []
		});
	}

	let query = supabase
		.from('onto_events')
		.select(
			`*,
			onto_event_sync (
				id,
				calendar_id,
				provider,
				external_event_id,
				sync_status,
				sync_error,
				last_synced_at
			)`
		)
		.eq('project_id', mapping.onto_id)
		.order('start_at', { ascending: true });

	if (!includeDeleted) {
		query = query.is('deleted_at', null);
	}

	if (timeMin) {
		query = query.gte('start_at', timeMin);
	}

	if (timeMax) {
		query = query.lte('start_at', timeMax);
	}

	if (limit) {
		query = query.limit(limit);
	}

	const { data: events, error: eventsError } = await query;

	if (eventsError) {
		return ApiResponse.databaseError(eventsError);
	}

	return ApiResponse.success({
		ontoProjectId: mapping.onto_id,
		events: events ?? []
	});
};
