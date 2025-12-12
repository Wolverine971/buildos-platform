// apps/web/src/routes/projects/[id]/outputs/[outputId]/edit/+page.server.ts
/**
 * Output Edit Page - Server Load
 * Loads output and project data for editing
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { id, outputId } = params;

	if (!id || !outputId) {
		throw error(400, 'Project ID and Output ID required');
	}

	// Load output via API endpoint
	const outputResponse = await fetch(`/api/onto/outputs/${outputId}`);
	if (!outputResponse.ok) {
		if (outputResponse.status === 404) {
			throw error(404, 'Output not found');
		}
		throw error(500, 'Failed to load output');
	}

	const responseData = await outputResponse.json();
	const { output } = responseData.data;

	// Verify output belongs to this project (security check)
	if (output.project_id !== id) {
		throw error(403, 'Output does not belong to this project');
	}

	// Load project via API endpoint
	const projectResponse = await fetch(`/api/onto/projects/${id}`);
	if (!projectResponse.ok) {
		if (projectResponse.status === 404) {
			throw error(404, 'Project not found');
		}
		throw error(500, 'Failed to load project');
	}

	const projectData = await projectResponse.json();

	return {
		output,
		project: projectData.data.project
	};
};
