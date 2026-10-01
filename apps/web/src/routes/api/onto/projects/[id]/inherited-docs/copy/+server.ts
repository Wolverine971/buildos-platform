// apps/web/src/routes/api/onto/projects/[id]/inherited-docs/copy/+server.ts
//
// POST { document_id } — copy a document from the parent's "Shared with
// sub-projects" shelf into this project's tree (root). The copy is this
// project's own document; the shared original is unchanged.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor
} from '$lib/server/ontology-api-access';
import {
	getProjectFamily,
	hierarchyErrorApiCode,
	toProjectHierarchyError
} from '$lib/services/ontology/project-hierarchy.service';
import { getChangeSourceFromRequest } from '$lib/services/async-activity-logger';
import { copyInheritedDocument } from '$lib/server/inherited-doc-copy';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}
	const documentId = (body as { document_id?: unknown } | null)?.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		return ApiResponse.badRequest('document_id is required');
	}

	const audit = {
		endpoint: `/api/onto/projects/${projectId}/inherited-docs/copy`,
		method: 'POST',
		entityType: 'document',
		projectId,
		consoleLabel: 'Inherited Docs API'
	};
	const actorResult = await requireOntologyActor({
		supabase: locals.supabase,
		user,
		audit,
		operation: 'inherited_doc_copy_actor_resolve'
	});
	if (!actorResult.ok) return actorResult.response;
	const actorId = actorResult.actor.actorId;

	const accessResult = await requireCurrentActorProjectAccess({
		supabase: locals.supabase,
		actor: actorResult.actor,
		projectId,
		requiredAccess: 'write',
		audit,
		operation: 'inherited_doc_copy_access_check',
		forbiddenMessage: 'You do not have permission to add documents to this project'
	});
	if (!accessResult.ok) return accessResult.response;

	// Only documents on this project's shelf (as this viewer sees it) can be copied.
	let parentId: string;
	try {
		const family = await getProjectFamily(locals.supabase, projectId);
		if (!family.parent || !family.shelf.some((doc) => doc.id === documentId)) {
			return ApiResponse.notFound('Shared document');
		}
		parentId = family.parent.id;
	} catch (error) {
		const mapped = toProjectHierarchyError(error);
		return ApiResponse.error(mapped.message, mapped.status, hierarchyErrorApiCode(mapped));
	}

	const copied = await copyInheritedDocument({
		supabase: locals.supabase,
		userId: user.id,
		actorId,
		projectId,
		parentId,
		documentId,
		changeSource: getChangeSourceFromRequest(request)
	});
	if (copied.status === 'not_found' || copied.status === 'changed')
		return ApiResponse.notFound('Shared document');
	if (copied.status === 'error') return ApiResponse.databaseError(copied.error);

	return ApiResponse.success(
		{ document: copied.document },
		copied.warnings.length ? copied.warnings.join(' ') : 'Copied into this project'
	);
};
