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
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeDocumentStateInput } from '../../shared/document-state';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import { removeDocumentFromTree } from '$lib/services/ontology/doc-structure.service';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import type { ParentRef } from '$lib/services/ontology/containment-organizer';
import { normalizeMarkdownInput } from '../../shared/markdown-normalization';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import type { DocStructure } from '$lib/types/onto';
import { logOntologyApiError } from '../../shared/error-logging';

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
	userId: string,
	method: string,
	requiredAccess: 'read' | 'write' | 'admin'
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
		await logOntologyApiError({
			supabase,
			error: documentError,
			endpoint: `/api/onto/documents/${documentId}`,
			method,
			userId,
			entityType: 'document',
			entityId: documentId,
			operation: 'document_fetch',
			tableName: 'onto_documents'
		});
		return { error: ApiResponse.databaseError(documentError) };
	}

	if (!document) {
		return { error: ApiResponse.notFound('Document') };
	}

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('[Document API] Failed to resolve actor:', actorError);
		await logOntologyApiError({
			supabase,
			error: actorError || new Error('Failed to resolve user actor'),
			endpoint: `/api/onto/documents/${documentId}`,
			method,
			userId,
			projectId: document.project_id,
			entityType: 'document',
			entityId: documentId,
			operation: 'document_actor_resolve'
		});
		return {
			error: ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			)
		};
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: document.project_id,
			p_required_access: requiredAccess
		}
	);

	if (accessError) {
		console.error('[Document API] Failed to check access:', accessError);
		await logOntologyApiError({
			supabase,
			error: accessError,
			endpoint: `/api/onto/documents/${documentId}`,
			method,
			userId,
			projectId: document.project_id,
			entityType: 'document',
			entityId: documentId,
			operation: 'document_access_check'
		});
		return { error: ApiResponse.internalError(accessError, 'Failed to check project access') };
	}

	if (!hasAccess) {
		return {
			error: ApiResponse.forbidden('You do not have permission to access this document')
		};
	}

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id')
		.eq('id', document.project_id)
		.is('deleted_at', null)
		.maybeSingle();

	if (projectError) {
		console.error('[Document API] Failed to fetch project:', projectError);
		await logOntologyApiError({
			supabase,
			error: projectError,
			endpoint: `/api/onto/documents/${documentId}`,
			method,
			userId,
			projectId: document.project_id,
			entityType: 'project',
			operation: 'document_project_fetch',
			tableName: 'onto_projects'
		});
		return { error: ApiResponse.databaseError(projectError) };
	}

	if (!project) {
		return { error: ApiResponse.notFound('Project') };
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

		const accessResult = await ensureDocumentAccess(
			locals,
			documentId,
			session.user.id,
			'GET',
			'read'
		);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		return ApiResponse.success({ document: accessResult.document });
	} catch (error) {
		console.error('[Document API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'document_get'
		});
		return ApiResponse.internalError(error, 'Failed to load document');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}
		const chatSessionId = getChatSessionIdFromRequest(request);

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const accessResult = await ensureDocumentAccess(
			locals,
			documentId,
			session.user.id,
			'PATCH',
			'write'
		);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		const { document, actorId } = accessResult;

		const {
			title,
			state_key,
			type_key,
			body_markdown,
			content,
			description,
			props,
			parent,
			parents,
			connections
		} = body as Record<string, unknown>;

		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeDocumentStateInput(state_key);

		if (hasStateInput && !normalizedState) {
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

		if (hasStateInput && normalizedState) {
			updatePayload.state_key = normalizedState;
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
			const contentValue = normalizeMarkdownInput(newContent);
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
			const markdownContent =
				typeof updatePayload.content === 'string' ? updatePayload.content : '';
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
			await logOntologyApiError({
				supabase: locals.supabase,
				error: updateError,
				endpoint: `/api/onto/documents/${documentId}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: document.project_id,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_update',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(updateError);
		}

		let version: { number: number; status: 'created' | 'merged' } | null = null;

		try {
			const versionResult = await createOrMergeDocumentVersion({
				supabase: locals.supabase,
				documentId,
				actorId,
				snapshot: toDocumentSnapshot(updatedDocument),
				previousSnapshot: toDocumentSnapshot(document),
				changeSource: getChangeSourceFromRequest(request)
			});

			if (versionResult.status !== 'skipped') {
				version = {
					number: versionResult.versionNumber,
					status: versionResult.status
				};
			}
		} catch (versionError) {
			console.error('[Document API] Failed to create/merge document version:', versionError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: versionError,
				endpoint: `/api/onto/documents/${documentId}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: document.project_id,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_version_create',
				tableName: 'onto_document_versions',
				metadata: { nonFatal: true }
			});
		}

		const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
		const hasParentsField = Object.prototype.hasOwnProperty.call(body, 'parents');
		const hasConnectionsInput = Array.isArray(connections);
		const explicitParents = toParentRefs({
			parent: parent as ParentRef | null,
			parents: parents as ParentRef[] | null
		});

		const connectionInput: ConnectionRef[] = Array.isArray(connections)
			? (connections as ConnectionRef[])
			: [];
		const connectionList: ConnectionRef[] =
			hasConnectionsInput && connectionInput.length > 0 ? connectionInput : explicitParents;

		if (hasParentField || hasParentsField || hasConnectionsInput) {
			if (connectionList.length > 0) {
				await assertEntityRefsInProject({
					supabase: locals.supabase,
					projectId: document.project_id,
					refs: connectionList,
					allowProject: true
				});
			}

			const hasDocumentConnection = connectionList.some(
				(connection) => connection.kind === 'document'
			);

			await autoOrganizeConnections({
				supabase: locals.supabase,
				projectId: document.project_id,
				entity: { kind: 'document', id: documentId },
				connections: connectionList,
				options: {
					mode: 'replace',
					skipContainment: !hasDocumentConnection
				}
			});
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
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ document: updatedDocument, version });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Document API] Unexpected PATCH error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'document_update'
		});
		return ApiResponse.internalError(error, 'Failed to update document');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals, url }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const chatSessionId = getChatSessionIdFromRequest(request);

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const accessResult = await ensureDocumentAccess(
			locals,
			documentId,
			session.user.id,
			'DELETE',
			'write'
		);

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
			await logOntologyApiError({
				supabase: locals.supabase,
				error: deleteError,
				endpoint: `/api/onto/documents/${documentId}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_delete',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(deleteError);
		}

		let structure: DocStructure | null = null;
		let structureError: string | null = null;
		try {
			const body = await request.json().catch(() => null);
			const modeInput =
				body && typeof body === 'object' && typeof (body as any).mode === 'string'
					? String((body as any).mode).trim()
					: url.searchParams.get('mode');
			const mode = modeInput === 'promote' || modeInput === 'cascade' ? modeInput : 'cascade';

			structure = await removeDocumentFromTree(
				locals.supabase,
				projectId,
				documentId,
				{ mode },
				actorId
			);
		} catch (treeError) {
			structureError = treeError instanceof Error ? treeError.message : String(treeError);
			console.error('[Document API] Failed to remove document from tree:', treeError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: treeError,
				endpoint: `/api/onto/documents/${documentId}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'project',
				entityId: documentId,
				operation: 'doc_tree_remove',
				metadata: { nonFatal: true }
			});
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			locals.supabase,
			projectId,
			'document',
			documentId,
			documentDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ deleted: true, structure, structure_error: structureError });
	} catch (error) {
		console.error('[Document API] Unexpected DELETE error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'document_delete'
		});
		return ApiResponse.internalError(error, 'Failed to delete document');
	}
};
