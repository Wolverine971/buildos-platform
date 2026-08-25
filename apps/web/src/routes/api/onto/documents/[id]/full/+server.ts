// apps/web/src/routes/api/onto/documents/[id]/full/+server.ts
/**
 * GET /api/onto/documents/[id]/full - Get document with all related data in a single request
 *
 * Returns document data and linked entities in one response,
 * reducing the number of API calls needed to load the DocumentModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Document data with project verification
 * - Linked entities (tasks, plans, goals)
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
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';
import type { Database } from '@buildos/shared-types';

type DocumentWithProject = Database['public']['Tables']['onto_documents']['Row'] & {
	project: { id: string };
};

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const documentId = params.id;
	const includeLinkedEntities = url.searchParams.get('include_linked') !== 'false';

	try {
		const accessResult = await requireProjectEntityAccess<DocumentWithProject>({
			supabase,
			user: session.user,
			loadEntity: () =>
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
					.single(),
			requiredAccess: 'read',
			audit: {
				endpoint: `/api/onto/documents/${documentId}/full`,
				method: 'GET',
				entityType: 'document',
				entityId: documentId,
				consoleLabel: 'Document Full GET'
			},
			actorOperation: 'document_actor_resolve',
			entityOperation: 'document_full_fetch',
			accessOperation: 'document_access_check',
			tableName: 'onto_documents',
			notFoundResource: 'Document',
			forbiddenMessage: 'Access denied',
			actorFailureMessage: 'Failed to get user actor',
			accessErrorResponse: () => ApiResponse.error('Failed to check project access', 500)
		});
		if (!accessResult.ok) return accessResult.response;

		const document = accessResult.entity;

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = includeLinkedEntities
			? await resolveLinkedEntitiesGeneric(supabase, documentId, 'document')
			: null;

		// Remove nested project data from response
		const { project: _project, ...documentData } = document;

		return ApiResponse.success({
			document: documentData,
			...(linkedEntities ? { linkedEntities } : {})
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
