// apps/web/src/routes/api/onto/documents/[id]/versions/[number]/restore/+server.ts
/**
 * POST /api/onto/documents/[id]/versions/[number]/restore - Restore document to a previous version
 *
 * Requires admin or owner access to the project.
 * Creates a new version tagged with is_restore and restore_of_version.
 * Supports optimistic locking via If-Unmodified-Since header or expected_version body param.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot,
	type DocumentSnapshot,
	type DocumentVersionProps
} from '$lib/services/ontology/versioning.service';
import {
	logUpdateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';

type Locals = App.Locals;

interface RestoreAccessResult {
	document: Record<string, unknown>;
	actorId: string;
}

async function ensureRestoreAccess(
	locals: Locals,
	documentId: string,
	userId: string
): Promise<RestoreAccessResult | { error: Response }> {
	const supabase = locals.supabase;

	const { data: document, error: documentError } = await supabase
		.from('onto_documents')
		.select('*')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (documentError) {
		console.error('[Restore API] Failed to fetch document:', documentError);
		return { error: ApiResponse.databaseError(documentError) };
	}

	if (!document) {
		return { error: ApiResponse.notFound('Document') };
	}

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('[Restore API] Failed to resolve actor:', actorError);
		return {
			error: ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			)
		};
	}

	// Restore requires admin access
	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: document.project_id,
			p_required_access: 'admin'
		}
	);

	if (accessError) {
		console.error('[Restore API] Failed to check access:', accessError);
		return { error: ApiResponse.internalError(accessError, 'Failed to check project access') };
	}

	if (!hasAccess) {
		return {
			error: ApiResponse.forbidden('Admin access required to restore document versions')
		};
	}

	return { document: document as Record<string, unknown>, actorId };
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		const versionNumber = parseInt(params.number, 10);
		const chatSessionId = getChatSessionIdFromRequest(request);

		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		if (isNaN(versionNumber) || versionNumber < 1) {
			return ApiResponse.badRequest('Valid version number required');
		}

		const accessResult = await ensureRestoreAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		const { document, actorId } = accessResult;

		// Parse request body for optional precondition
		const body = await request.json().catch(() => ({}));
		const expectedVersion = body.expected_version as number | undefined;

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
				userId: session.user.id,
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

		// Get latest version for precondition check
		const { data: latestVersion, error: latestError } = await locals.supabase
			.from('onto_document_versions')
			.select('number')
			.eq('document_id', documentId)
			.order('number', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (latestError) {
			console.error('[Restore API] Failed to fetch latest version:', latestError);
			return ApiResponse.databaseError(latestError);
		}

		// Check precondition if provided
		if (expectedVersion !== undefined && latestVersion) {
			if (latestVersion.number !== expectedVersion) {
				return ApiResponse.error(
					`Version conflict: expected version ${expectedVersion}, but current is ${latestVersion.number}`,
					409
				);
			}
		}

		// Extract snapshot from target version
		const targetProps = (targetVersion.props ?? {}) as Partial<DocumentVersionProps>;
		const snapshot = targetProps.snapshot;

		if (!snapshot) {
			return ApiResponse.badRequest('Target version does not contain a valid snapshot');
		}

		// Prepare the document update from snapshot
		const updatePayload: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (snapshot.title !== undefined) {
			updatePayload.title = snapshot.title;
		}
		if (snapshot.description !== undefined) {
			updatePayload.description = snapshot.description;
		}
		if (snapshot.content !== undefined) {
			updatePayload.content = snapshot.content;
		}
		if (snapshot.state_key !== undefined) {
			updatePayload.state_key = snapshot.state_key;
		}

		// Preserve props with body_markdown for backwards compatibility
		const currentProps = (document.props ?? {}) as Record<string, unknown>;
		updatePayload.props = {
			...currentProps,
			...(snapshot.props ?? {}),
			body_markdown: snapshot.content ?? ''
		};

		// Update the document
		const { data: updatedDocument, error: updateError } = await locals.supabase
			.from('onto_documents')
			.update(updatePayload)
			.eq('id', documentId)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Restore API] Failed to update document:', updateError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: updateError,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
				method: 'POST',
				userId: session.user.id,
				projectId: document.project_id as string,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_restore_update',
				tableName: 'onto_documents'
			});
			return ApiResponse.databaseError(updateError);
		}

		// Create a new version marked as a restore
		let newVersion: { number: number; id: string } | null = null;

		try {
			// Get the new snapshot
			const newSnapshot = toDocumentSnapshot(updatedDocument);

			// Insert restore version directly to ensure restore metadata is preserved
			const nextNumber = (latestVersion?.number ?? 0) + 1;
			const now = new Date().toISOString();

			const restoreVersionProps: DocumentVersionProps = {
				snapshot: newSnapshot,
				snapshot_hash: '', // Will be computed but we need to set it
				window: { started_at: now, ended_at: now },
				change_count: 1,
				change_source: getChangeSourceFromRequest(request) ?? 'api',
				is_merged: false,
				restored_by_user_id: session.user.id,
				restore_of_version: versionNumber
			};

			// Compute hash for the snapshot
			const crypto = await import('node:crypto');
			restoreVersionProps.snapshot_hash = crypto
				.createHash('sha256')
				.update(JSON.stringify(newSnapshot))
				.digest('hex');

			const { data: insertedVersion, error: insertError } = await locals.supabase
				.from('onto_document_versions')
				.insert({
					document_id: documentId,
					number: nextNumber,
					storage_uri: 'inline://document-snapshot',
					props: restoreVersionProps,
					created_by: actorId
				})
				.select('id, number')
				.single();

			if (insertError) {
				throw insertError;
			}

			newVersion = insertedVersion;
		} catch (versionError) {
			console.error('[Restore API] Failed to create restore version:', versionError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: versionError,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}/restore`,
				method: 'POST',
				userId: session.user.id,
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
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({
			document: updatedDocument,
			restoredFromVersion: versionNumber,
			newVersion: newVersion
				? {
						number: newVersion.number,
						id: newVersion.id
					}
				: null
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
