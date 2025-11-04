// apps/web/src/routes/api/onto/projects/instantiate/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { ProjectSpec } from '$lib/types/onto';
import {
	instantiateProject,
	validateProjectSpec,
	OntologyInstantiationError
} from '$lib/services/ontology/instantiation.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = (await request.json()) as unknown;

		const validation = validateProjectSpec(body);
		if (!validation.valid) {
			return ApiResponse.badRequest('Invalid ProjectSpec', {
				errors: validation.errors
			});
		}

		const spec = body as ProjectSpec;

		const supabase = locals.supabase;
		const result = await instantiateProject(supabase, spec, user.id);

		return ApiResponse.success({
			project_id: result.project_id,
			counts: result.counts
		});
	} catch (err) {
		if (err instanceof OntologyInstantiationError) {
			return ApiResponse.badRequest(err.message);
		}

		console.error('[Ontology] Project instantiation failed:', err);
		return ApiResponse.error(
			'Project instantiation failed',
			500,
			undefined,
			err instanceof Error ? err.message : 'Unknown error'
		);
	}
};
