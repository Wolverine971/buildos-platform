// apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/+server.ts
/**
 * POST /api/onto/projects/[id]/doc-tree/move
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { moveDocument } from '$lib/services/ontology/doc-structure.service';
import { logOntologyApiError } from '../../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const documentId = typeof (body as any).document_id === 'string' ? body.document_id : '';
		const newParentIdRaw = (body as any).new_parent_id;
		const newPositionRaw = (body as any).new_position;

		if (!documentId) {
			return ApiResponse.badRequest('document_id is required');
		}

		const newParentId =
			newParentIdRaw === null || newParentIdRaw === undefined || newParentIdRaw === ''
				? null
				: typeof newParentIdRaw === 'string'
					? newParentIdRaw
					: undefined;

		if (newParentId === undefined) {
			return ApiResponse.badRequest('new_parent_id must be a string or null');
		}

		if (
			typeof newPositionRaw !== 'number' ||
			!Number.isInteger(newPositionRaw) ||
			newPositionRaw < 0
		) {
			return ApiResponse.badRequest('new_position must be a non-negative integer');
		}

		const supabase = locals.supabase;

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Doc Tree Move API] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/projects/${id}/doc-tree/move`,
				method: 'POST',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'doc_tree_move_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Doc Tree Move API] Failed to check access', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}/doc-tree/move`,
				method: 'POST',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'doc_tree_move_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to modify this project');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/projects/${id}/doc-tree/move`,
					method: 'POST',
					userId: session.user.id,
					projectId: id,
					entityType: 'project',
					operation: 'doc_tree_move_project_fetch',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project');
		}

		const { data: document, error: documentError } = await supabase
			.from('onto_documents')
			.select('id')
			.eq('id', documentId)
			.eq('project_id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (documentError) {
			await logOntologyApiError({
				supabase,
				error: documentError,
				endpoint: `/api/onto/projects/${id}/doc-tree/move`,
				method: 'POST',
				userId: session.user.id,
				projectId: id,
				entityType: 'document',
				entityId: documentId,
				operation: 'doc_tree_move_document_fetch',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(documentError);
		}

		if (!document) {
			return ApiResponse.notFound('Document');
		}

		let updated;
		try {
			updated = await moveDocument(
				supabase,
				id,
				documentId,
				{ newParentId, newPosition: newPositionRaw },
				actorId
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.startsWith('Structure version conflict')) {
				return ApiResponse.error(message, 409);
			}
			throw err;
		}

		return ApiResponse.success({ structure: updated });
	} catch (error) {
		console.error('[Doc Tree Move API] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${params.id ?? ''}/doc-tree/move`,
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'doc_tree_move'
		});
		return ApiResponse.internalError(error, 'Failed to move document');
	}
};
