// apps/web/src/routes/projects/[id]/+page.server.ts
/**
 * Project Detail - Deliverables-Centric View
 * Server load function - fetches project with all entities
 *
 * Performance Optimizations Applied (Dec 2024):
 * 1. API endpoint parallelizes all entity queries (14+ queries run concurrently)
 * 2. Project + actor resolution run in parallel (saves ~50ms)
 * 3. Context document fetched via JOIN instead of 2 sequential queries
 * 4. Task-plan edges fetched in parallel batch (not after task load)
 * 5. FSM transitions passed to component to prevent duplicate client-side fetch
 *
 * For ultra-optimized single-query loading, use /api/onto/projects/[id]/full
 * which uses the get_project_full() RPC function.
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
