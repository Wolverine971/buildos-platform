// apps/web/src/routes/projects/[id]/+page.server.ts
/**
 * Project Detail - Deliverables-Centric View
 * Server load function - fetches project with all entities
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Project API: /apps/web/src/routes/api/onto/projects/[id]/+server.ts
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}

	// Fetch project data from API endpoint
	const projectResponse = await fetch(`/api/onto/projects/${id}`);

	if (!projectResponse.ok) {
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	const projectData = await projectResponse.json();

	// Extract from ApiResponse.data wrapper
	return {
		...projectData.data,
		projectId: id
	};
};
