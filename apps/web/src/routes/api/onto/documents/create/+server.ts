// apps/web/src/routes/api/onto/documents/create/+server.ts
/**
 * POST /api/onto/documents/create
 * Creates a new ontology document that is linked to a project
 */

import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import { DOCUMENT_STATES } from '$lib/types/onto';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import { normalizeDocumentStateInput } from '../../shared/document-state';
import { normalizeMarkdownInput } from '../../shared/markdown-normalization';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';

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
			state_key = 'draft',
			body_markdown,
			content,
			description,
			parent,
			parents,
			connections
		} = body as Record<string, unknown>;
		const classificationSource =
			(body as Record<string, unknown>)?.classification_source ??
			(body as Record<string, unknown>)?.classificationSource;

		if (!project_id || typeof project_id !== 'string') {
			return ApiResponse.badRequest('project_id is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('title is required');
		}

		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeDocumentStateInput(state_key);

		if (hasStateInput && !normalizedState) {
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
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			console.error('[Document API] Failed to fetch project:', projectError);
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: '/api/onto/documents/create',
				method: 'POST',
				userId: session.user.id,
				projectId: project_id as string,
				entityType: 'project',
				operation: 'document_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Document API] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/documents/create',
				method: 'POST',
				userId: session.user.id,
				projectId: project_id as string,
				entityType: 'document',
				operation: 'document_actor_resolve'
			});
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

		const explicitParents = toParentRefs({ parent, parents });
		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : explicitParents;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: project_id as string,
				refs: connectionList,
				allowProject: true
			});
		}

		// Resolve content: prefer content param, fall back to body_markdown
		const rawContent =
			typeof content === 'string'
				? content
				: typeof body_markdown === 'string'
					? body_markdown
					: null;
		const normalizedContent = normalizeMarkdownInput(rawContent);

		const normalizedDescription = typeof description === 'string' ? description : null;

		// Store body_markdown in props for backwards compatibility during migration
		const documentProps = {
			...(normalizedContent ? { body_markdown: normalizedContent } : {})
		};

		const { data: document, error: insertError } = await supabase
			.from('onto_documents')
			.insert({
				project_id,
				title: title.trim(),
				type_key: 'document.default',
				state_key: normalizedState ?? 'draft',
				content: normalizedContent,
				description: normalizedDescription,
				props: documentProps,
				created_by: actorId
			})
			.select('*')
			.single();

		if (insertError) {
			console.error('[Document API] Failed to create document:', insertError);
			await logOntologyApiError({
				supabase,
				error: insertError,
				endpoint: '/api/onto/documents/create',
				method: 'POST',
				userId: session.user.id,
				projectId: project_id as string,
				entityType: 'document',
				entityId: document?.id,
				operation: 'document_create',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(insertError);
		}

		const hasDocumentConnection = connectionList.some(
			(connection) => connection.kind === 'document'
		);

		await autoOrganizeConnections({
			supabase,
			projectId: project_id as string,
			entity: { kind: 'document', id: document.id },
			connections: connectionList,
			options: {
				mode: 'replace',
				skipContainment: !hasDocumentConnection
			}
		});

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

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'document',
				entityId: document.id,
				userId: session.user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Document Create] Classification failed:', err);
			});
		}

		return ApiResponse.success({ document });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Document API] Unexpected create error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/documents/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			operation: 'document_create'
		});
		return ApiResponse.internalError(error, 'Failed to create document');
	}
};
