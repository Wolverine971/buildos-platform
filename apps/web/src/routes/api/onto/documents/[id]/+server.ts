// apps/web/src/routes/api/onto/documents/[id]/+server.ts
/**
 * GET /api/onto/documents/[id]    - Fetch a document (with auth checks)
 * PATCH /api/onto/documents/[id]  - Update document metadata/content
 * DELETE /api/onto/documents/[id] - Remove a document
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { DOCUMENT_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

type Locals = App.Locals;

type AccessResult =
	| {
			document: Record<string, any>;
			actorId: string;
	  }
	| { error: Response };

async function ensureDocumentAccess(
	locals: Locals,
	documentId: string,
	userId: string
): Promise<AccessResult> {
	const supabase = locals.supabase;

	const { data: document, error: documentError } = await supabase
		.from('onto_documents')
		.select('*')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (documentError) {
		console.error('[Document API] Failed to fetch document:', documentError);
		return { error: ApiResponse.databaseError(documentError) };
	}

	if (!document) {
		return { error: ApiResponse.notFound('Document') };
	}

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, created_by')
		.eq('id', document.project_id)
		.maybeSingle();

	if (projectError) {
		console.error('[Document API] Failed to fetch project:', projectError);
		return { error: ApiResponse.databaseError(projectError) };
	}

	if (!project) {
		return { error: ApiResponse.notFound('Project') };
	}

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('[Document API] Failed to resolve actor:', actorError);
		return {
			error: ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			)
		};
	}

	if (project.created_by !== actorId) {
		return {
			error: ApiResponse.forbidden('You do not have permission to access this document')
		};
	}

	return { document, actorId };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const accessResult = await ensureDocumentAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		return ApiResponse.success({ document: accessResult.document });
	} catch (error) {
		console.error('[Document API] Unexpected GET error:', error);
		return ApiResponse.internalError(error, 'Failed to load document');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const accessResult = await ensureDocumentAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		const { document } = accessResult;

		const { title, state_key, type_key, body_markdown, content, description, props } =
			body as Record<string, unknown>;

		if (state_key !== undefined && !DOCUMENT_STATES.includes(String(state_key))) {
			return ApiResponse.badRequest(
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}

		let hasUpdates = false;
		const updatePayload: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (typeof title === 'string') {
			updatePayload.title = title.trim();
			hasUpdates = true;
		}

		if (typeof state_key === 'string' && state_key.trim()) {
			updatePayload.state_key = state_key.trim();
			hasUpdates = true;
		}

		if (typeof type_key === 'string' && type_key.trim()) {
			updatePayload.type_key = type_key.trim();
			hasUpdates = true;
		}

		// Handle description column
		if (description !== undefined) {
			updatePayload.description = typeof description === 'string' ? description : null;
			hasUpdates = true;
		}

		// Handle content column - prefer content param, fall back to body_markdown for backwards compatibility
		const newContent = content !== undefined ? content : body_markdown;
		if (newContent !== undefined) {
			const contentValue = typeof newContent === 'string' ? newContent : null;
			updatePayload.content = contentValue;
			hasUpdates = true;
		}

		const propsPayload =
			typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {};

		let shouldUpdateProps = Object.keys(propsPayload).length > 0;
		let mergedProps = shouldUpdateProps
			? { ...(document.props ?? {}), ...propsPayload }
			: (document.props ?? {});

		// Keep body_markdown in props for backwards compatibility during migration
		if (newContent !== undefined) {
			const markdownContent = typeof newContent === 'string' ? newContent : '';
			mergedProps = { ...mergedProps, body_markdown: markdownContent };
			shouldUpdateProps = true;
		}

		if (shouldUpdateProps) {
			updatePayload.props = mergedProps;
			hasUpdates = true;
		}

		if (!hasUpdates) {
			return ApiResponse.badRequest('No update fields provided');
		}

		const { data: updatedDocument, error: updateError } = await locals.supabase
			.from('onto_documents')
			.update(updatePayload)
			.eq('id', documentId)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Document API] Failed to update document:', updateError);
			return ApiResponse.databaseError(updateError);
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			locals.supabase,
			document.project_id,
			'document',
			documentId,
			{ title: document.title, state_key: document.state_key, type_key: document.type_key },
			{
				title: updatedDocument.title,
				state_key: updatedDocument.state_key,
				type_key: updatedDocument.type_key
			},
			accessResult.actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ document: updatedDocument });
	} catch (error) {
		console.error('[Document API] Unexpected PATCH error:', error);
		return ApiResponse.internalError(error, 'Failed to update document');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const accessResult = await ensureDocumentAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		const { document, actorId } = accessResult;
		const projectId = document.project_id;
		const documentDataForLog = {
			title: document.title,
			type_key: document.type_key,
			state_key: document.state_key
		};

		// Soft delete: set deleted_at timestamp instead of hard delete
		// Edge relationships are preserved for potential restoration
		const { error: deleteError } = await locals.supabase
			.from('onto_documents')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', documentId);

		if (deleteError) {
			console.error('[Document API] Failed to soft-delete document:', deleteError);
			return ApiResponse.databaseError(deleteError);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			locals.supabase,
			projectId,
			'document',
			documentId,
			documentDataForLog,
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ deleted: true });
	} catch (error) {
		console.error('[Document API] Unexpected DELETE error:', error);
		return ApiResponse.internalError(error, 'Failed to delete document');
	}
};
