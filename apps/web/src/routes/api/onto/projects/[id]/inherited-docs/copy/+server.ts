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
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import { logCreateAsync, getChangeSourceFromRequest } from '$lib/services/async-activity-logger';
import { START_HERE_DOCUMENT_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/start-here';
import { THINKING_LOG_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/thinking-log';

const SINGLETON_CONTEXT_TYPE_KEYS = new Set<string>([
	START_HERE_DOCUMENT_TYPE_KEY,
	THINKING_LOG_TYPE_KEY
]);

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

	const { data: source, error: sourceError } = await locals.supabase
		.from('onto_documents')
		.select('title, description, content, type_key, state_key')
		.eq('id', documentId)
		.eq('project_id', parentId)
		.is('deleted_at', null)
		.maybeSingle();
	if (sourceError) return ApiResponse.databaseError(sourceError);
	if (!source) return ApiResponse.notFound('Shared document');

	const content = source.content ?? null;
	const { data: document, error: insertError } = await locals.supabase
		.from('onto_documents')
		.insert({
			project_id: projectId,
			title: source.title,
			// A project has one START HERE and one thinking log; copies of the
			// parent's become ordinary documents here.
			type_key: SINGLETON_CONTEXT_TYPE_KEYS.has(source.type_key)
				? 'document.default'
				: source.type_key,
			state_key: 'draft',
			content,
			description: source.description,
			props: {
				...(content ? { body_markdown: content } : {}),
				copied_from: {
					document_id: documentId,
					project_id: parentId,
					copied_at: new Date().toISOString()
				}
			},
			created_by: actorId
		})
		.select('*')
		.single();
	if (insertError || !document) return ApiResponse.databaseError(insertError);

	const warnings: string[] = [];
	try {
		await createOrMergeDocumentVersion({
			supabase: locals.supabase,
			documentId: document.id,
			actorId,
			snapshot: toDocumentSnapshot(document),
			changeSource: getChangeSourceFromRequest(request)
		});
	} catch {
		warnings.push(
			'The copy was created, but its first version could not be recorded in history.'
		);
	}
	try {
		await addDocumentToTree(
			locals.supabase,
			projectId,
			document.id,
			{
				parentId: null,
				title: document.title ?? null,
				description: document.description ?? null
			},
			actorId
		);
	} catch {
		warnings.push('The copy was created but could not be placed in the document tree.');
	}

	logCreateAsync(
		locals.supabase,
		projectId,
		'document',
		document.id,
		{ title: document.title, type_key: document.type_key, state_key: document.state_key },
		user.id,
		getChangeSourceFromRequest(request)
	);

	return ApiResponse.success(
		{ document: { id: document.id, title: document.title } },
		warnings.length ? warnings.join(' ') : 'Copied into this project'
	);
};
