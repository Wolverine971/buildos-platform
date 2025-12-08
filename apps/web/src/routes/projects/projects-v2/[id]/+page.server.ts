// apps/web/src/routes/ontology/projects-v2/[id]/+page.server.ts
/**
 * Project Detail - Server Load
 * Fetches complete project data with all related entities
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { GraphSourceData, GraphStats } from '$lib/components/ontology/graph/lib/graph.types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}

	// Fetch project data from API endpoint
	const [projectResponse, graphResponse] = await Promise.all([
		fetch(`/api/onto/projects/${id}`),
		fetch(`/api/onto/projects/${id}/graph?viewMode=full`)
	]);

	if (!projectResponse.ok) {
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	const projectData = await projectResponse.json();

	let graphSource: GraphSourceData | null = null;
	let graphStats: GraphStats | null = null;
	let graphError: string | null = null;
	let graphMetadata: Record<string, unknown> | null = null;

	if (graphResponse.ok) {
		const payload = await graphResponse.json().catch(() => ({ data: null }));
		graphSource = (payload?.data?.source ?? null) as GraphSourceData | null;
		graphStats = (payload?.data?.stats ?? null) as GraphStats | null;
		graphMetadata = (payload?.data?.metadata ?? null) as Record<string, unknown> | null;
	} else {
		const payload = await graphResponse.json().catch(() => null);
		graphError =
			payload?.error ??
			(graphResponse.status === 404
				? 'Project graph not found'
				: 'Unable to load project graph');
	}

	// ✅ Extract from ApiResponse.data wrapper
	return {
		...projectData.data,
		projectId: id,
		graphSource,
		graphStats,
		graphError,
		graphMetadata
	};
};
