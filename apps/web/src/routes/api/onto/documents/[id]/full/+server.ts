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

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
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
						id,
						created_by
					)
				`
				)
				.eq('id', documentId)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: document, error: documentError } = documentResult;

		if (actorError || !actorId) {
			console.error('[Document Full GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (documentError || !document) {
			return ApiResponse.error('Document not found', 404);
		}

		// Authorization check
		if (document.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, documentId, 'document');

		// Remove nested project data from response
		const { project, ...documentData } = document;

		return ApiResponse.success({
			document: documentData,
			linkedEntities
		});
	} catch (error) {
		console.error('[Document Full GET] Error fetching document data:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
