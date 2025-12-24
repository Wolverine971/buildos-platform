// apps/web/src/routes/api/onto/documents/create/+server.ts
/**
 * POST /api/onto/documents/create
 * Creates a new ontology document that is linked to a project
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { DOCUMENT_STATES } from '$lib/types/onto';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const {
			project_id,
			title,
			type_key,
			state_key = 'draft',
			body_markdown,
			content,
			description,
			props
		} = body as Record<string, unknown>;

		if (!project_id || typeof project_id !== 'string') {
			return ApiResponse.badRequest('project_id is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('title is required');
		}

		if (!type_key || typeof type_key !== 'string') {
			return ApiResponse.badRequest('type_key is required');
		}

		if (state_key !== undefined && !DOCUMENT_STATES.includes(String(state_key))) {
			return ApiResponse.badRequest(
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}

		const supabase = locals.supabase;
		const chatSessionId = getChatSessionIdFromRequest(request);

		// Ensure project exists and belongs to current actor
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.maybeSingle();

		if (projectError) {
			console.error('[Document API] Failed to fetch project:', projectError);
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project not found');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Document API] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			);
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to add documents to this project'
			);
		}

		// Resolve content: prefer content param, fall back to body_markdown, then props.body_markdown
		const normalizedContent =
			typeof content === 'string'
				? content
				: typeof body_markdown === 'string'
					? body_markdown
					: typeof props === 'object' &&
						  props !== null &&
						  typeof (props as Record<string, unknown>).body_markdown === 'string'
						? ((props as Record<string, unknown>).body_markdown as string)
						: null;

		const normalizedDescription = typeof description === 'string' ? description : null;

		const propsObject =
			typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {};

		// Store body_markdown in props for backwards compatibility during migration
		const documentProps = {
			...propsObject,
			...(normalizedContent ? { body_markdown: normalizedContent } : {})
		};

		const { data: document, error: insertError } = await supabase
			.from('onto_documents')
			.insert({
				project_id,
				title: title.trim(),
				type_key,
				state_key: typeof state_key === 'string' && state_key.trim() ? state_key : 'draft',
				content: normalizedContent,
				description: normalizedDescription,
				props: documentProps,
				created_by: actorId
			})
			.select('*')
			.single();

		if (insertError) {
			console.error('[Document API] Failed to create document:', insertError);
			return ApiResponse.databaseError(insertError);
		}

		const { error: edgeError } = await supabase.from('onto_edges').insert({
			project_id: project_id as string,
			src_kind: 'project',
			src_id: project_id,
			rel: 'has_document',
			dst_kind: 'document',
			dst_id: document.id,
			props: {}
		});

		if (edgeError) {
			console.error('[Document API] Failed to create has_document edge:', edgeError);
			// Do not fail the overall request; log for observability
		}

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'document',
			document.id,
			{ title: document.title, type_key: document.type_key, state_key: document.state_key },
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ document });
	} catch (error) {
		console.error('[Document API] Unexpected create error:', error);
		return ApiResponse.internalError(error, 'Failed to create document');
	}
};
