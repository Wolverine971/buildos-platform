// apps/web/src/routes/ontology/+page.server.ts
/**
 * Ontology Dashboard - Server Load
 * Fetches all projects for the dashboard view
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

type ProjectSummary = {
	id: string;
	name: string;
	description: string | null;
	type_key: string;
	state_key: string;
	props: Record<string, unknown>;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
	task_count: number;
	output_count: number;
};

export const load: PageServerLoad = async ({ fetch, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const response = await fetch('/api/onto/projects');

	if (!response.ok) {
		console.error(
			'[Ontology Dashboard] Failed to fetch project summaries',
			response.statusText
		);
		return {
			projects: [],
			error: 'Failed to load projects'
		};
	}

	const payload = await response.json();

	return {
		// ✅ Extract from ApiResponse.data wrapper
		projects: payload.data?.projects ?? []
	};
};
