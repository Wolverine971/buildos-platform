// apps/web/src/routes/api/projects/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePagination } from '$lib/utils/api-helpers';
import {
	ensureActorId,
	fetchProjectSummaries
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

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const rawQuery = (url.searchParams.get('q') || '').trim();
		const { page, limit, offset } = validatePagination(url, { defaultLimit: 20, maxLimit: 50 });

		if (rawQuery.length < 2) {
			return ApiResponse.success({
				projects: [],
				total: 0,
				page,
				limit
			});
		}

		const actorId = await ensureActorId(supabase, user.id);
		const query = rawQuery.toLowerCase();

		const summaries = await fetchProjectSummaries(supabase, actorId);
		const matches = summaries.filter((project) => {
			if (project.state_key !== 'active') return false;
			return (
				project.name.toLowerCase().includes(query) ||
				(project.description || '').toLowerCase().includes(query)
			);
		});

		const projects = matches.slice(offset, offset + limit).map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			status: toLegacyStatus(project.state_key),
			state_key: project.state_key,
			slug: null,
			updated_at: project.updated_at,
			created_at: project.created_at
		}));

		return ApiResponse.success({
			projects,
			total: matches.length,
			page,
			limit,
			query: rawQuery
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
