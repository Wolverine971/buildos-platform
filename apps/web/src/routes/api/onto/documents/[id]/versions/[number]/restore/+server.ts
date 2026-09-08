// apps/web/src/routes/api/onto/documents/[id]/versions/[number]/restore/+server.ts
/**
 * POST /api/onto/documents/[id]/versions/[number]/restore - Restore document to a previous version
 *
 * Requires admin or owner access to the project.
 * Creates a new version tagged with is_restore and restore_of_version.
 * Guards the head write with expected_updated_at (or If-Unmodified-Since), and supports
 * legacy expected_version checks. Version writes use the shared retry/warning contract.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import { normalizeDocumentStateInput } from '../../../../../shared/document-state';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot,
	type DocumentVersionProps
} from '$lib/services/ontology/versioning.service';
import {
	writeDocumentHeadAndVersion,
	type OntoDocumentUpdate
} from '$lib/services/ontology/document-write.service';
import {
	logUpdateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';

type Locals = App.Locals;

interface RestoreAccessResult {
	document: Record<string, unknown>;
	actorId: string;
}

async function ensureRestoreAccess(
	locals: Locals,
	documentId: string,
	versionNumber: number,
	userId: string
): Promise<RestoreAccessResult | { error: Response }> {
	const supabase = locals.supabase;
	const accessResult = await requireProjectEntityAccess({
		supabase,
		user: { id: userId },
		loadEntity: () =>
			supabase
				.from('onto_documents')
				.select('*')
				.eq('id', documentId)
				.is('deleted_at', null)
				.maybeSingle(),
		requiredAccess: 'admin',
		audit: {
			endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
			method: 'POST',
			entityType: 'document',
			entityId: documentId,
			consoleLabel: 'Restore API'
		},
		actorOperation: 'document_actor_resolve',
		entityOperation: 'document_fetch',
		accessOperation: 'document_access_check',
		tableName: 'onto_documents',
		notFoundResource: 'Document',
		forbiddenMessage: 'Admin access required to restore document versions'
	});

	return accessResult.ok
		? {
				document: accessResult.entity as Record<string, unknown>,
				actorId: accessResult.actorId
			}
		: { error: accessResult.response };
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const userId = session.user.id;
		const documentId = params.id;
		const versionNumber = Number(params.number);
		const chatSessionId = getChatSessionIdFromRequest(request);

		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
			return ApiResponse.badRequest('Valid version number required');
		}

		const accessResult = await ensureRestoreAccess(locals, documentId, versionNumber, userId);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		const { document, actorId } = accessResult;

		// Parse request body for optional precondition
		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return ApiResponse.badRequest('A restore request body is required');
		}
		const expectedVersion = body.expected_version;
		if (
			expectedVersion !== undefined &&
			(!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
		) {
			return ApiResponse.badRequest('expected_version must be a positive integer');
		}
		const expectedUpdatedAt =
			body.expected_updated_at ?? request.headers.get('If-Unmodified-Since');
		if (
			expectedUpdatedAt !== null &&
			expectedUpdatedAt !== undefined &&
			(typeof expectedUpdatedAt !== 'string' ||
				!expectedUpdatedAt.trim() ||
				Number.isNaN(Date.parse(expectedUpdatedAt)))
		) {
			return ApiResponse.badRequest('expected_updated_at must be a valid timestamp');
		}
		const expectedWriteVersion = expectedUpdatedAt ?? document.updated_at;
		if (typeof expectedWriteVersion !== 'string' || !expectedWriteVersion) {
			return ApiResponse.conflict('Reload the document before restoring a version.');
		}
		const expectedSnapshotHash = body.expected_snapshot_hash;
		if (expectedSnapshotHash !== undefined && typeof expectedSnapshotHash !== 'string') {
			return ApiResponse.badRequest('expected_snapshot_hash must be a string');
		}

		// Fetch the version to restore
		const { data: targetVersion, error: versionError } = await locals.supabase
			.from('onto_document_versions')
			.select('id, number, props')
			.eq('document_id', documentId)
			.eq('number', versionNumber)
			.maybeSingle();

		if (versionError) {
			console.error('[Restore API] Failed to fetch target version:', versionError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: versionError,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
				method: 'POST',
				userId: userId,
				projectId: document.project_id as string,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_restore_fetch',
				tableName: 'onto_document_versions'
			});
			return ApiResponse.databaseError(versionError);
		}

		if (!targetVersion) {
			return ApiResponse.notFound('Version');
		}

		// Timestamp-based clients do not need another history read. Keep the
		// version-number precondition for older clients, then guard the actual head write.
		if (expectedVersion !== undefined) {
			const { data: latestVersion, error: latestError } = await locals.supabase
				.from('onto_document_versions')
				.select('number')
				.eq('document_id', documentId)
				.order('number', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (latestError) return ApiResponse.databaseError(latestError);
			if (latestVersion?.number !== expectedVersion) {
				return ApiResponse.conflict(
					'Version history changed. Review the latest document before restoring.'
				);
			}
		}

		// Extract snapshot from target version
		const targetProps = (targetVersion.props ?? {}) as Partial<DocumentVersionProps>;
		const snapshot = targetProps.snapshot;

		if (
			!snapshot ||
			typeof snapshot !== 'object' ||
			Array.isArray(snapshot) ||
			(snapshot.content !== null && typeof snapshot.content !== 'string')
		) {
			return ApiResponse.badRequest('Target version does not contain a valid snapshot');
		}

		if (
			expectedSnapshotHash !== undefined &&
			expectedSnapshotHash !== targetProps.snapshot_hash
		) {
			return ApiResponse.conflict(
				'This version changed since you reviewed it. Review it again before restoring.'
			);
		}

		// Archive/tree membership has its own atomic command; version restoration
		// must not bypass it by restoring an archived state through an ordinary write.
		const targetState = normalizeDocumentStateInput(snapshot.state_key);
		if (snapshot.state_key !== undefined && !targetState) {
			return ApiResponse.badRequest('Target version has an invalid state');
		}
		if (
			normalizeDocumentStateInput(document.state_key) === 'archived' ||
			targetState === 'archived'
		) {
			return ApiResponse.badRequest(
				'Restore the document from Archive first, then choose a version from before it was archived.'
			);
		}

		// Prepare the document update from snapshot
		const updatePayload: OntoDocumentUpdate = {
			updated_at: new Date().toISOString()
		};

		if (snapshot.title !== undefined) {
			if (typeof snapshot.title !== 'string') {
				return ApiResponse.badRequest('Target version has an invalid title');
			}
			updatePayload.title = snapshot.title;
		}
		if (snapshot.description !== undefined) {
			updatePayload.description = snapshot.description;
		}
		if (snapshot.content !== undefined) {
			updatePayload.content = snapshot.content;
		}
		if (targetState) updatePayload.state_key = targetState;

		// Preserve props with body_markdown for backwards compatibility
		const currentProps = (document.props ?? {}) as Record<string, unknown>;
		updatePayload.props = {
			...currentProps,
			...(snapshot.props ?? {}),
			body_markdown: snapshot.content ?? '',
			// Routing state is server-owned and is not restored from historical props.
			agent_workspace: currentProps.agent_workspace
		} as OntoDocumentUpdate['props'];

		let newVersion: { number: number; id: string } | null = null;
		const writeResult = await writeDocumentHeadAndVersion({
			supabase: locals.supabase,
			documentId,
			projectId: document.project_id as string,
			update: updatePayload,
			expectedUpdatedAt: expectedWriteVersion,
			actorId,
			previousSnapshot: toDocumentSnapshot(document),
			changeSource: getChangeSourceFromRequest(request),
			forceCreateVersion: true,
			versionWriter: async (params) => {
				const result = await createOrMergeDocumentVersion({
					...params,
					restore: { versionNumber, userId: userId }
				});
				if (result.status !== 'skipped') {
					newVersion = { number: result.versionNumber, id: result.versionId };
				}
				return result;
			}
		});
		if (writeResult.status === 'conflict') {
			return ApiResponse.conflict(
				'The document changed before the restore completed. Reload and review it before trying again.'
			);
		}
		if (writeResult.status === 'error') {
			await logOntologyApiError({
				supabase: locals.supabase,
				error: writeResult.error,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
				method: 'POST',
				userId: userId,
				projectId: document.project_id as string,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_restore_update',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(writeResult.error);
		}
		const updatedDocument = writeResult.document;
		if (writeResult.versionError) {
			await logOntologyApiError({
				supabase: locals.supabase,
				error: writeResult.versionError,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
				method: 'POST',
				userId: userId,
				projectId: document.project_id as string,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_restore_create',
				tableName: 'onto_document_versions',
				metadata: { nonFatal: true }
			});
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			locals.supabase,
			document.project_id as string,
			'document',
			documentId,
			{
				title: document.title,
				state_key: document.state_key,
				type_key: document.type_key
			},
			{
				title: updatedDocument.title,
				state_key: updatedDocument.state_key,
				type_key: updatedDocument.type_key,
				_restore_from_version: versionNumber
			},
			userId,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({
			document: updatedDocument,
			restoredFromVersion: versionNumber,
			newVersion,
			version_warning: writeResult.versionWarning
		});
	} catch (error) {
		console.error('[Restore API] Unexpected POST error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}/versions/${params.number ?? ''}/restore`,
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'version_restore'
		});
		return ApiResponse.internalError(error, 'Failed to restore document version');
	}
};
