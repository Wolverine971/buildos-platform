// apps/web/src/routes/ontology/projects/[id]/+page.server.ts
/**
 * Project Detail - Server Load
 * Fetches complete project data with all related entities
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}

	// Fetch project data from API endpoint
	const response = await fetch(`/api/onto/projects/${id}`);

	if (!response.ok) {
		if (response.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	const projectData = await response.json();

	// ✅ Extract from ApiResponse.data wrapper
	return {
		...projectData.data,
		projectId: id
	};
};
