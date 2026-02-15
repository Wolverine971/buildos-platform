// apps/web/src/routes/api/projects/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePagination } from '$lib/utils/api-helpers';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';

function toLegacyStatus(stateKey: string): 'active' | 'paused' | 'completed' | 'archived' {
	switch (stateKey) {
		case 'planning':
			return 'paused';
		case 'completed':
			return 'completed';
		case 'cancelled':
			return 'archived';
		case 'active':
		default:
			return 'active';
	}
}

function toProjectState(
	status: string | null | undefined
): 'planning' | 'active' | 'completed' | 'cancelled' {
	switch ((status || '').toLowerCase()) {
		case 'paused':
			return 'planning';
		case 'completed':
			return 'completed';
		case 'archived':
			return 'cancelled';
		case 'planning':
			return 'planning';
		case 'cancelled':
			return 'cancelled';
		case 'active':
		default:
			return 'active';
	}
}

function mapStatusFilters(statuses: string[]): Set<string> {
	const mapped = new Set<string>();
	for (const status of statuses) {
		mapped.add(toProjectState(status));
	}
	return mapped;
}

function toLegacyProject(summary: OntologyProjectSummary, includeCounts: boolean) {
	const status = toLegacyStatus(summary.state_key);
	const response: Record<string, unknown> = {
		id: summary.id,
		name: summary.name,
		description: summary.description,
		status,
		state_key: summary.state_key,
		slug: null,
		created_at: summary.created_at,
		updated_at: summary.updated_at,
		next_step_short: summary.next_step_short,
		next_step_long: summary.next_step_long,
		next_step_source: summary.next_step_source,
		next_step_updated_at: summary.next_step_updated_at
	};

	if (includeCounts) {
		response.task_count = summary.task_count;
	}

	return response;
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const actorId = await ensureActorId(supabase, user.id);
		const mode = url.searchParams.get('mode');
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

		const allowedStates = mapStatusFilters(statuses);
		const summaries = await fetchProjectSummaries(supabase, actorId);
		const filtered = summaries.filter((project) => allowedStates.has(project.state_key));
		const paginated = filtered.slice(offset, offset + limit);
		const projects = paginated.map((project) => toLegacyProject(project, includeCounts));

		return ApiResponse.success({
			projects,
			total: filtered.length,
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
		const payload = await request.json();
		const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
		if (!name) {
			return ApiResponse.badRequest('Project name is required');
		}

		const actorId = await ensureActorId(supabase, user.id);
		const status = typeof payload?.status === 'string' ? payload.status : 'active';
		const stateKey = toProjectState(status);

		const incomingProps =
			payload?.props && typeof payload.props === 'object' && !Array.isArray(payload.props)
				? payload.props
				: {};

		const projectInsert = {
			name,
			description: typeof payload?.description === 'string' ? payload.description : null,
			created_by: actorId,
			state_key: stateKey,
			type_key: typeof payload?.type_key === 'string' ? payload.type_key : 'project.default',
			start_at: typeof payload?.start_date === 'string' ? payload.start_date : null,
			end_at: typeof payload?.end_date === 'string' ? payload.end_date : null,
			props: {
				...incomingProps,
				...(payload?.calendar_color_id
					? { calendar_color_id: payload.calendar_color_id }
					: {})
			}
		};

		const { data: project, error } = await supabase
			.from('onto_projects')
			.insert(projectInsert)
			.select('*')
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.created(
			{
				...project,
				status: toLegacyStatus(project.state_key),
				slug: null
			},
			'Project created successfully'
		);
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
