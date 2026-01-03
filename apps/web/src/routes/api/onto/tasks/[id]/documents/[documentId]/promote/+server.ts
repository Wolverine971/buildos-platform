// apps/web/src/routes/api/onto/tasks/[id]/documents/[documentId]/promote/+server.ts
/**
 * POST /api/onto/tasks/[taskId]/documents/[documentId]/promote
 *
 * Promotes a task-linked document by transitioning its FSM state (default -> ready)
 * and marking the task_has_document edge as handed off.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	ensureTaskAccess,
	ensureTaskDocumentLink,
	mergeEdgeProps
} from '../../../../task-document-helpers';
import { DOCUMENT_STATES } from '$lib/types/onto';
import { normalizeDocumentStateInput } from '../../../../../shared/document-state';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const taskId = params.id;
		const documentId = params.documentId;

		if (!taskId || !documentId) {
			return ApiResponse.badRequest('Task ID and Document ID are required');
		}

		const access = await ensureTaskAccess(locals, taskId, session.user.id);

		if ('error' in access) {
			return access.error;
		}

		const { task, project, actorId } = access;

		const supabase = locals.supabase;

		const body = await request.json().catch(() => ({}));
		const hasTargetState = Object.prototype.hasOwnProperty.call(body ?? {}, 'target_state');
		const normalizedTargetState = normalizeDocumentStateInput(body?.target_state);

		if (hasTargetState && !normalizedTargetState) {
			return ApiResponse.badRequest(
				`target_state must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}

		const targetState = normalizedTargetState ?? 'ready';

		const linkResult = await ensureTaskDocumentLink(locals, taskId, documentId);
		if ('error' in linkResult) {
			return linkResult.error;
		}
		const { edge } = linkResult;

		const { data: document, error: documentError } = await supabase
			.from('onto_documents')
			.select('*')
			.eq('id', documentId)
			.single();

		if (documentError || !document) {
			console.error('[TaskDoc Promote] Failed to fetch document:', documentError);
			return documentError
				? ApiResponse.databaseError(documentError)
				: ApiResponse.notFound('Document');
		}

		if (document.project_id !== project.id) {
			return ApiResponse.forbidden('Document does not belong to this project');
		}

		const now = new Date().toISOString();

		// Update document state if needed
		let updatedDocument = document;

		if (document.state_key !== targetState) {
			const { data: patchedDoc, error: patchError } = await supabase
				.from('onto_documents')
				.update({
					state_key: targetState,
					updated_at: now
				})
				.eq('id', documentId)
				.select('*')
				.single();

			if (patchError || !patchedDoc) {
				console.error('[TaskDoc Promote] Failed to update document state:', patchError);
				return ApiResponse.databaseError(patchError);
			}

			updatedDocument = patchedDoc;
		}

		const mergedProps = mergeEdgeProps(edge.props ?? {}, {
			handed_off: true,
			handed_off_at: now,
			handed_off_by: actorId,
			target_state: targetState
		});

		const { error: edgeUpdateError } = await supabase
			.from('onto_edges')
			.update({
				props: mergedProps
			})
			.eq('id', edge.id);

		if (edgeUpdateError) {
			console.error('[TaskDoc Promote] Failed to update edge props:', edgeUpdateError);
			return ApiResponse.databaseError(edgeUpdateError);
		}

		return ApiResponse.success({
			document: updatedDocument,
			edge: {
				id: edge.id,
				props: mergedProps
			},
			task,
			project
		});
	} catch (error) {
		console.error('[TaskDoc Promote] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to promote document');
	}
};
