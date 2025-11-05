// apps/web/src/routes/api/onto/outputs/create/+server.ts
/**
 * POST /api/onto/outputs/create
 * Create a new output
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	resolveTemplateWithClient,
	validateTemplateForInstantiation
} from '$lib/services/ontology/template-resolver.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json();
		const { project_id, type_key, name, state_key, props } = body;

		if (!project_id) {
			return ApiResponse.badRequest('project_id is required');
		}

		if (!type_key) {
			return ApiResponse.badRequest('type_key is required');
		}

		if (!name) {
			return ApiResponse.badRequest('name is required');
		}

		const supabase = locals.supabase;

		// ✅ SECURITY: Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.maybeSingle();

		if (projectError) {
			console.error('[Output API] Failed to fetch project:', projectError);
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project not found');
		}

		// Get user's actor ID for ownership check
		const { data: actorId, error: actorCheckError } = await supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: user.id
			}
		);

		if (actorCheckError || !actorId) {
			console.error('[Output API] Failed to get actor:', actorCheckError);
			return ApiResponse.internalError(actorCheckError || new Error('Failed to resolve user actor'));
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to create outputs for this project'
			);
		}

		// Validate template exists and is instantiable
		const validation = await validateTemplateForInstantiation(supabase, type_key, 'output');
		if (!validation.valid) {
			return ApiResponse.badRequest(validation.error || 'Invalid template');
		}

		// Resolve template to get defaults
		const resolved = await resolveTemplateWithClient(supabase, type_key, 'output');

		// Note: actorId already obtained and validated in security check above

		// Merge props with template defaults
		const mergedProps = {
			...resolved.default_props,
			...props,
			content: props?.content || '',
			content_type: 'html',
			word_count: 0
		};

		// Create the output
		const { data: output, error: createError } = await supabase
			.from('onto_outputs')
			.insert({
				project_id,
				name,
				type_key,
				state_key: state_key || 'draft',
				props: mergedProps,
				created_by: actorId
			})
			.select('*')
			.single();

		if (createError) {
			console.error('[Output API] Failed to create output:', createError);
			return ApiResponse.databaseError(`Failed to create output: ${createError.message}`);
		}

		// Create edge from project to output
		const { error: edgeError } = await supabase.from('onto_edges').insert({
			src_kind: 'project',
			src_id: project_id,
			rel: 'has_output',
			dst_kind: 'output',
			dst_id: output.id,
			props: {}
		});

		if (edgeError) {
			console.error('[Output API] Failed to create edge:', edgeError);
			// Don't fail the whole operation, just log the error
			// The output was created successfully
		}

		return ApiResponse.success({ output });
	} catch (err) {
		console.error('[Output API] Unexpected error in POST:', err);
		return ApiResponse.internalError('An unexpected error occurred');
	}
};
