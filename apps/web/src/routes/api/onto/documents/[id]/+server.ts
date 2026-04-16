// apps/web/src/routes/api/onto/documents/[id]/+server.ts
/**
 * GET /api/onto/documents/[id]    - Fetch a document (with auth checks)
 * PATCH /api/onto/documents/[id]  - Update document metadata/content
 * DELETE /api/onto/documents/[id] - Remove a document
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { DOCUMENT_STATES, isValidTypeKey } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '$lib/server/entity-mention-notification.service';
import { normalizeDocumentStateInput } from '../../shared/document-state';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import {
	getDocTree,
	findNodeById,
	collectDocIds,
	removeDocumentFromTree,
	updateDocNodeMetadata
} from '$lib/services/ontology/doc-structure.service';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import type { ParentRef } from '$lib/services/ontology/containment-organizer';
import { normalizeMarkdownInput } from '../../shared/markdown-normalization';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import type { DocStructure } from '$lib/types/onto';
import { logOntologyApiError } from '../../shared/error-logging';
import { syncLivePublicPageForDocument } from '$lib/server/public-page.service';

type Locals = App.Locals;
type ArchiveChildrenMode = 'archive_children' | 'promote_children' | 'unlink_children';

type AccessResult =
	| {
			document: Record<string, any>;
			actorId: string;
			project: Record<string, any>;
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

	// Parallelize actor resolution, access check, and project fetch —
	// all three depend only on document.project_id / userId, not on each other.
	const [actorResult, accessResult, projectResult] = await Promise.all([
		supabase.rpc('ensure_actor_for_user', { p_user_id: userId }),
		supabase.rpc('current_actor_has_project_access', {
			p_project_id: document.project_id,
			p_required_access: requiredAccess
		}),
		supabase
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', document.project_id)
			.is('deleted_at', null)
			.maybeSingle()
	]);

	const { data: actorId, error: actorError } = actorResult;
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

	const { data: hasAccess, error: accessError } = accessResult;
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

	const { data: project, error: projectError } = projectResult;
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

	return { document, actorId, project };
}

function parseArchiveChildrenMode(value: unknown): ArchiveChildrenMode {
	if (typeof value !== 'string') return 'archive_children';
	const normalized = value.trim().toLowerCase();
	if (
		normalized === 'archive_children' ||
		normalized === 'promote_children' ||
		normalized === 'unlink_children'
	) {
		return normalized;
	}
	return 'archive_children';
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

		const { document, actorId, project } = accessResult;

		// Optimistic concurrency: if client sends expected_updated_at, reject if stale
		const expectedUpdatedAt = (body as Record<string, unknown>).expected_updated_at;
		if (typeof expectedUpdatedAt === 'string' && document.updated_at) {
			const clientTime = new Date(expectedUpdatedAt).getTime();
			const serverTime = new Date(document.updated_at as string).getTime();
			if (!isNaN(clientTime) && !isNaN(serverTime) && clientTime !== serverTime) {
				return ApiResponse.conflict(
					'Document was modified by another user. Reload to see the latest version.'
				);
			}
		}

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
			connections,
			force_version
		} = body as Record<string, unknown>;
		const forceVersion = force_version === true;

		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeDocumentStateInput(state_key);

		if (hasStateInput && !normalizedState) {
			return ApiResponse.badRequest(
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}

		const actionInput =
			typeof (body as Record<string, unknown>).action === 'string'
				? String((body as Record<string, unknown>).action)
						.trim()
						.toLowerCase()
				: '';
		const currentState = normalizeDocumentStateInput(document.state_key) ?? 'draft';
		const archiveRequested =
			actionInput === 'archive' ||
			(hasStateInput && normalizedState === 'archived' && currentState !== 'archived');
		const restoreRequested = actionInput === 'restore';

		if (archiveRequested) {
			const archiveMode = parseArchiveChildrenMode(
				(body as Record<string, unknown>).archive_children_mode
			);
			const treeMode = archiveMode === 'promote_children' ? 'promote' : 'cascade';

			let archivedDocumentIds: string[] = [documentId];
			const { structure: currentStructure } = await getDocTree(
				locals.supabase,
				document.project_id,
				{
					includeDocuments: false
				}
			);
			const treeNodeResult = findNodeById(currentStructure.root, documentId);
			if (archiveMode === 'archive_children' && treeNodeResult?.node.children?.length) {
				const descendantIds = [...collectDocIds(treeNodeResult.node.children)];
				archivedDocumentIds = Array.from(new Set([documentId, ...descendantIds]));
			}

			let structure: DocStructure | null = null;
			if (treeNodeResult) {
				structure = await removeDocumentFromTree(
					locals.supabase,
					document.project_id,
					documentId,
					{ mode: treeMode },
					actorId
				);
			}

			const archiveUpdatePayload: { state_key: 'archived'; updated_at: string } = {
				state_key: 'archived',
				updated_at: new Date().toISOString()
			};
			const { error: archiveError } =
				archivedDocumentIds.length === 1
					? await locals.supabase
							.from('onto_documents')
							.update(archiveUpdatePayload)
							.eq('id', documentId)
							.eq('project_id', document.project_id)
							.is('deleted_at', null)
					: await locals.supabase
							.from('onto_documents')
							.update(archiveUpdatePayload)
							.in('id', archivedDocumentIds)
							.eq('project_id', document.project_id)
							.is('deleted_at', null);

			if (archiveError) {
				await logOntologyApiError({
					supabase: locals.supabase,
					error: archiveError,
					endpoint: `/api/onto/documents/${documentId}`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: document.project_id,
					entityType: 'document',
					entityId: documentId,
					operation: 'document_archive',
					tableName: 'onto_documents'
				});
				return ApiResponse.databaseError(archiveError);
			}

			const { data: archivedDocument, error: archivedDocumentError } = await locals.supabase
				.from('onto_documents')
				.select('*')
				.eq('id', documentId)
				.is('deleted_at', null)
				.single();

			if (archivedDocumentError || !archivedDocument) {
				return ApiResponse.internalError(
					archivedDocumentError || new Error('Archived document not found'),
					'Failed to load archived document'
				);
			}

			logUpdateAsync(
				locals.supabase,
				document.project_id,
				'document',
				documentId,
				{
					title: document.title,
					state_key: document.state_key,
					type_key: document.type_key
				},
				{
					title: archivedDocument.title,
					state_key: archivedDocument.state_key,
					type_key: archivedDocument.type_key
				},
				session.user.id,
				getChangeSourceFromRequest(request),
				chatSessionId
			);

			return ApiResponse.success({
				document: archivedDocument,
				structure,
				archived_document_ids: archivedDocumentIds,
				archive_mode: archiveMode
			});
		}

		if (restoreRequested) {
			if (currentState !== 'archived') {
				return ApiResponse.badRequest('Only archived documents can be restored');
			}

			const restoreStateInput = normalizeDocumentStateInput(
				(body as Record<string, unknown>).restore_state_key ?? 'draft'
			);
			if (!restoreStateInput || restoreStateInput === 'archived') {
				return ApiResponse.badRequest(
					`restore_state_key must be one of: ${DOCUMENT_STATES.filter((state) => state !== 'archived').join(', ')}`
				);
			}

			let structure: DocStructure | null = null;
			try {
				structure = await removeDocumentFromTree(
					locals.supabase,
					document.project_id,
					documentId,
					{ mode: 'promote' },
					actorId
				);
			} catch (treeError) {
				await logOntologyApiError({
					supabase: locals.supabase,
					error: treeError,
					endpoint: `/api/onto/documents/${documentId}`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: document.project_id,
					entityType: 'project',
					entityId: documentId,
					operation: 'doc_tree_restore_remove'
				});
				throw treeError;
			}

			const { data: restoredDocument, error: restoreError } = await locals.supabase
				.from('onto_documents')
				.update({
					state_key: restoreStateInput,
					updated_at: new Date().toISOString()
				})
				.eq('id', documentId)
				.eq('project_id', document.project_id)
				.is('deleted_at', null)
				.select('*')
				.single();

			if (restoreError || !restoredDocument) {
				await logOntologyApiError({
					supabase: locals.supabase,
					error: restoreError || new Error('Failed to restore document'),
					endpoint: `/api/onto/documents/${documentId}`,
					method: 'PATCH',
					userId: session.user.id,
					projectId: document.project_id,
					entityType: 'document',
					entityId: documentId,
					operation: 'document_restore',
					tableName: 'onto_documents'
				});
				return ApiResponse.databaseError(
					restoreError || new Error('Failed to restore document')
				);
			}

			logUpdateAsync(
				locals.supabase,
				document.project_id,
				'document',
				documentId,
				{
					title: document.title,
					state_key: document.state_key,
					type_key: document.type_key
				},
				{
					title: restoredDocument.title,
					state_key: restoredDocument.state_key,
					type_key: restoredDocument.type_key
				},
				session.user.id,
				getChangeSourceFromRequest(request),
				chatSessionId
			);

			return ApiResponse.success({
				document: restoredDocument,
				structure,
				restored: true
			});
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
			// Forgiving validation: apply the type if it matches the document
			// taxonomy, otherwise skip the type change and leave the existing
			// value untouched. Do not reject the whole update over a bad type.
			const trimmedTypeKey = type_key.trim();
			if (isValidTypeKey(trimmedTypeKey, 'document')) {
				updatePayload.type_key = trimmedTypeKey;
				hasUpdates = true;
			}
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

		// Connection/parent organization — must stay blocking because
		// autoOrganizeConnections can throw AutoOrganizeError for user feedback.
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

		// ── Fire-and-forget post-save operations ──
		// These run in the background after the response is sent.
		// Each operation has its own error handling — failures are logged but non-fatal.
		const shouldSyncDocStructure =
			Object.prototype.hasOwnProperty.call(updatePayload, 'title') ||
			Object.prototype.hasOwnProperty.call(updatePayload, 'description');

		const changeSource = getChangeSourceFromRequest(request);
		// Capture session values before the async closure (TypeScript narrowing doesn't persist)
		const userId = session.user.id;
		const userName = session.user.name;
		const userEmail = session.user.email;

		const postSaveWork = async () => {
			await Promise.all([
				// Versioning
				createOrMergeDocumentVersion({
					supabase: locals.supabase,
					documentId,
					actorId,
					snapshot: toDocumentSnapshot(updatedDocument),
					previousSnapshot: toDocumentSnapshot(document),
					changeSource,
					forceCreateVersion: forceVersion
				}).catch((versionError) => {
					console.error(
						'[Document API] Failed to create/merge document version:',
						versionError
					);
					void logOntologyApiError({
						supabase: locals.supabase,
						error: versionError,
						endpoint: `/api/onto/documents/${documentId}`,
						method: 'PATCH',
						userId,
						projectId: document.project_id,
						entityType: 'document',
						entityId: documentId,
						operation: 'document_version_create',
						tableName: 'onto_document_versions',
						metadata: { nonFatal: true }
					});
				}),

				// Doc tree metadata sync
				shouldSyncDocStructure
					? updateDocNodeMetadata(
							locals.supabase,
							document.project_id,
							documentId,
							{
								title: updatedDocument.title ?? null,
								description: updatedDocument.description ?? null
							},
							actorId
						).catch((syncError) => {
							console.error(
								'[Document API] Failed to sync doc_structure metadata:',
								syncError
							);
							void logOntologyApiError({
								supabase: locals.supabase,
								error: syncError,
								endpoint: `/api/onto/documents/${documentId}`,
								method: 'PATCH',
								userId,
								projectId: document.project_id,
								entityType: 'project',
								entityId: documentId,
								operation: 'doc_structure_metadata_sync',
								metadata: { nonFatal: true }
							});
						})
					: Promise.resolve(),

				// Mention resolution + notification
				(async () => {
					const actorDisplayName =
						(typeof userName === 'string' && userName) ||
						userEmail?.split('@')[0] ||
						'A teammate';
					const mentionUserIds = await resolveEntityMentionUserIds({
						supabase: locals.supabase,
						projectId: document.project_id,
						projectOwnerActorId: project.created_by,
						actorUserId: userId,
						nextTextValues: [
							updatedDocument.title,
							updatedDocument.description,
							updatedDocument.content
						],
						previousTextValues: [document.title, document.description, document.content]
					});
					await notifyEntityMentionsAdded({
						supabase: locals.supabase,
						projectId: document.project_id,
						projectName: project.name,
						entityType: 'document',
						entityId: documentId,
						entityTitle: updatedDocument.title,
						actorUserId: userId,
						actorDisplayName,
						mentionedUserIds: mentionUserIds
					});
				})().catch((mentionError) => {
					console.error(
						'[Document API] Failed to process mention notifications:',
						mentionError
					);
				}),

				// Public page live sync
				syncLivePublicPageForDocument(
					locals.supabase,
					{
						id: String(updatedDocument.id),
						project_id: String(updatedDocument.project_id),
						title:
							typeof updatedDocument.title === 'string'
								? updatedDocument.title
								: null,
						description:
							typeof updatedDocument.description === 'string'
								? updatedDocument.description
								: null,
						content:
							typeof updatedDocument.content === 'string'
								? updatedDocument.content
								: null,
						props:
							updatedDocument.props &&
							typeof updatedDocument.props === 'object' &&
							!Array.isArray(updatedDocument.props)
								? (updatedDocument.props as Record<string, unknown>)
								: null,
						state_key:
							typeof updatedDocument.state_key === 'string'
								? updatedDocument.state_key
								: null,
						updated_at:
							typeof updatedDocument.updated_at === 'string'
								? updatedDocument.updated_at
								: null
					},
					actorId,
					userId
				).catch((syncError) => {
					console.error('[Document API] Failed to sync live public page:', syncError);
					void logOntologyApiError({
						supabase: locals.supabase,
						error: syncError,
						endpoint: `/api/onto/documents/${documentId}`,
						method: 'PATCH',
						userId,
						projectId: document.project_id,
						entityType: 'document',
						entityId: documentId,
						operation: 'public_page_live_sync',
						metadata: { nonFatal: true }
					});
				})
			]);
		};

		// Launch background work — do not await
		postSaveWork().catch((err) => {
			console.error('[Document API] Post-save background ops failed:', err);
		});

		// Log activity async (already non-blocking)
		logUpdateAsync(
			locals.supabase,
			document.project_id,
			'document',
			documentId,
			{
				title: document.title,
				description: document.description,
				state_key: document.state_key,
				type_key: document.type_key,
				content_changed: false
			},
			{
				title: updatedDocument.title,
				description: updatedDocument.description,
				state_key: updatedDocument.state_key,
				type_key: updatedDocument.type_key,
				content_changed: document.content !== updatedDocument.content
			},
			userId,
			changeSource,
			chatSessionId
		);

		return ApiResponse.success({ document: updatedDocument });
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

		const body = await request.json().catch(() => null);
		const modeInput =
			body && typeof body === 'object' && typeof (body as any).mode === 'string'
				? String((body as any).mode).trim()
				: url.searchParams.get('mode');
		const mode = modeInput === 'promote' || modeInput === 'cascade' ? modeInput : 'cascade';
		const permanentRequested =
			(body &&
				typeof body === 'object' &&
				((body as any).permanent === true || (body as any).force_permanent === true)) ||
			url.searchParams.get('permanent') === 'true' ||
			url.searchParams.get('force_permanent') === 'true';

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
		const isArchivedDocument = normalizeDocumentStateInput(document.state_key) === 'archived';
		if (permanentRequested && !isArchivedDocument) {
			return ApiResponse.badRequest('Only archived documents can be permanently deleted');
		}
		const shouldPermanentDelete = isArchivedDocument || permanentRequested;

		let structure: DocStructure | null = null;
		let structureError: string | null = null;
		try {
			structure = await removeDocumentFromTree(
				locals.supabase,
				projectId,
				documentId,
				{ mode: shouldPermanentDelete ? 'cascade' : mode },
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

		if (shouldPermanentDelete) {
			const { error: deleteError } = await locals.supabase
				.from('onto_documents')
				.delete()
				.eq('id', documentId)
				.eq('project_id', projectId);

			if (deleteError) {
				console.error('[Document API] Failed to permanently delete document:', deleteError);
				await logOntologyApiError({
					supabase: locals.supabase,
					error: deleteError,
					endpoint: `/api/onto/documents/${documentId}`,
					method: 'DELETE',
					userId: session.user.id,
					projectId,
					entityType: 'document',
					entityId: documentId,
					operation: 'document_delete_permanent',
					tableName: 'onto_documents'
				});
				return ApiResponse.databaseError(deleteError);
			}
		} else {
			// Legacy soft delete path for non-archived docs.
			const { error: deleteError } = await locals.supabase
				.from('onto_documents')
				.update({ deleted_at: new Date().toISOString() })
				.eq('id', documentId)
				.eq('project_id', projectId);

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

		return ApiResponse.success({
			deleted: true,
			permanent: shouldPermanentDelete,
			structure,
			structure_error: structureError
		});
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
