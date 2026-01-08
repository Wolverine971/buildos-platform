// apps/web/src/routes/api/onto/outputs/create/+server.ts
/**
 * POST /api/onto/outputs/create
 * Create a new output
 */

import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { OUTPUT_STATES } from '$lib/types/onto';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json();
		const { project_id, name, state_key, description, parent, parents, connections } = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		if (!project_id) {
			return ApiResponse.badRequest('project_id is required');
		}

		if (!name) {
			return ApiResponse.badRequest('name is required');
		}

		if (state_key !== undefined && !OUTPUT_STATES.includes(String(state_key))) {
			return ApiResponse.badRequest(`state_key must be one of: ${OUTPUT_STATES.join(', ')}`);
		}

		const supabase = locals.supabase;
		const chatSessionId = getChatSessionIdFromRequest(request);

		// ✅ SECURITY: Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			console.error('[Output API] Failed to fetch project:', projectError);
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
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
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to create outputs for this project'
			);
		}

		const explicitParents = toParentRefs({ parent, parents });
		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : explicitParents;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		// Build props with default values
		const mergedProps = {
			content: '',
			content_type: 'html',
			word_count: 0
		};

		// Create the output
		const { data: output, error: createError } = await supabase
			.from('onto_outputs')
			.insert({
				project_id,
				name,
				type_key: 'output.default',
				state_key: state_key || 'draft',
				description: description?.trim() || null,
				props: mergedProps,
				created_by: actorId
			})
			.select('*')
			.single();

		if (createError) {
			console.error('[Output API] Failed to create output:', createError);
			return ApiResponse.databaseError(createError);
		}

		await autoOrganizeConnections({
			supabase,
			projectId: project_id,
			entity: { kind: 'output', id: output.id },
			connections: connectionList,
			options: {
				mode: 'replace',
				skipContainment: true
			}
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'output',
			output.id,
			{ name: output.name, type_key: output.type_key, state_key: output.state_key },
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'output',
				entityId: output.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Output Create] Classification failed:', err);
			});
		}

		return ApiResponse.success({ output });
	} catch (err) {
		if (err instanceof AutoOrganizeError) {
			return ApiResponse.error(err.message, err.status);
		}
		console.error('[Output API] Unexpected error in POST:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
