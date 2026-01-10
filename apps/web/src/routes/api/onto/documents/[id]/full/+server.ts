// apps/web/src/routes/api/onto/documents/[id]/full/+server.ts
/**
 * GET /api/onto/documents/[id]/full - Get document with all related data in a single request
 *
 * Returns document data and linked entities in one response,
 * reducing the number of API calls needed to load the DocumentModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Document data with project verification
 * - Linked entities (tasks, plans, goals, outputs)
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Performance: Modal optimization pattern
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/DocumentModal.svelte
 * - Document Endpoint: /apps/web/src/routes/api/onto/documents/[id]/+server.ts
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveLinkedEntitiesGeneric } from '../../../shared/entity-linked-helpers';
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const documentId = params.id;

	try {
		// Phase 1: Parallelize initial queries
		const [actorResult, documentResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_documents')
				.select(
					`
					*,
					project:onto_projects!inner(
						id
					)
				`
				)
				.eq('id', documentId)
				.is('deleted_at', null)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: document, error: documentError } = documentResult;
		const projectId = document?.project?.id;

		if (actorError || !actorId) {
			console.error('[Document Full GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/documents/${documentId}/full`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (documentError || !document) {
			if (documentError) {
				console.error('[Document Full GET] Failed to fetch document:', documentError);
				await logOntologyApiError({
					supabase,
					error: documentError,
					endpoint: `/api/onto/documents/${documentId}/full`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'document',
					entityId: documentId,
					operation: 'document_full_fetch',
					tableName: 'onto_documents'
				});
				return ApiResponse.databaseError(documentError);
			}
			return ApiResponse.notFound('Document');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: document.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Document Full GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/documents/${documentId}/full`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, documentId, 'document');

		// Remove nested project data from response
		const { project: _project, ...documentData } = document;

		return ApiResponse.success({
			document: documentData,
			linkedEntities
		});
	} catch (error) {
		console.error('[Document Full GET] Error fetching document data:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'document_full_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
