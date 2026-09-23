// apps/web/src/routes/api/onto/documents/[id]/revert-change/+server.ts
//
// One-click Undo for an agent document edit (the chat change card).
// Body: { revert_patch | revert_patches (newest edit first), before_hash?, expected_after_hash? }
// 200 → { document, document_change, strategy, version_warning, already_undone }
// 409 → the edited text changed since (code = DocumentPatch conflict reason).

import type { RequestHandler } from './$types';
import type { DocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';
import { ApiResponse, HttpStatus, parseRequestBody } from '$lib/utils/api-response';
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';
import { captureServerEvent } from '$lib/server/posthog';
import {
	DOCUMENT_CHANGE_REVERT_MAX_PATCHES,
	revertDocumentChange
} from '$lib/server/document-change-revert.service';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Structural check only; integrity (patch hash) is verified while resolving. */
function isDocumentPatch(value: unknown): value is DocumentPatchV1 {
	return (
		isRecord(value) &&
		value.schema_version === 1 &&
		typeof value.document_id === 'string' &&
		typeof value.project_id === 'string' &&
		typeof value.base_content_hash === 'string' &&
		typeof value.patch_hash === 'string' &&
		Array.isArray(value.operations) &&
		value.operations.length > 0
	);
}

function readRevertPatches(body: Record<string, unknown>): unknown[] | null {
	if (Array.isArray(body.revert_patches)) return body.revert_patches;
	if (body.revert_patch !== undefined && body.revert_patch !== null) return [body.revert_patch];
	return null;
}

function optionalHash(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id) return ApiResponse.badRequest('Document ID is required');

	const body = await parseRequestBody<unknown>(request);
	if (!isRecord(body)) return ApiResponse.badRequest('Invalid request body');

	const rawPatches = readRevertPatches(body);
	if (!rawPatches || rawPatches.length === 0) {
		return ApiResponse.badRequest('revert_patch or revert_patches is required');
	}
	if (rawPatches.length > DOCUMENT_CHANGE_REVERT_MAX_PATCHES) {
		return ApiResponse.badRequest('Too many revert patches');
	}
	if (!rawPatches.every(isDocumentPatch)) {
		return ApiResponse.badRequest('Invalid revert patch');
	}
	const patches = rawPatches as DocumentPatchV1[];
	if (patches.some((patch) => patch.document_id !== params.id)) {
		return ApiResponse.badRequest('The revert patch belongs to a different document');
	}
	// The first patch undoes the newest edit, so it is based on the body that edit left.
	const expectedAfterHash = optionalHash(body.expected_after_hash);
	if (expectedAfterHash && patches[0]!.base_content_hash !== expectedAfterHash) {
		return ApiResponse.badRequest('Revert patches must start with the newest edit');
	}

	const access = await requireProjectEntityAccess({
		supabase: locals.supabase,
		user,
		loadEntity: () =>
			locals.supabase
				.from('onto_documents')
				.select('id, project_id')
				.eq('id', params.id)
				.is('deleted_at', null)
				.maybeSingle(),
		requiredAccess: 'write',
		audit: {
			endpoint: `/api/onto/documents/${params.id}/revert-change`,
			method: 'POST',
			entityType: 'document',
			entityId: params.id,
			consoleLabel: 'Document Revert Change API'
		},
		actorOperation: 'document_revert_change_actor_resolve',
		entityOperation: 'document_revert_change_document_fetch',
		accessOperation: 'document_revert_change_access_check',
		tableName: 'onto_documents',
		notFoundResource: 'Document',
		forbiddenMessage: 'You do not have permission to edit this document'
	});
	if (!access.ok) return access.response;

	try {
		const result = await revertDocumentChange({
			supabase: locals.supabase,
			documentId: params.id,
			patches,
			beforeHash: optionalHash(body.before_hash),
			actorId: access.actorId
		});

		if (result.status === 'not_found') return ApiResponse.notFound('Document');
		if (result.status === 'invalid_patch') return ApiResponse.badRequest(result.message);
		if (result.status === 'already_reverted') {
			return ApiResponse.success({
				document: result.document,
				document_change: null,
				already_undone: true
			});
		}

		const analytics = {
			project_id: access.entity.project_id,
			document_id: params.id,
			patch_count: patches.length
		};
		if (result.status === 'conflict') {
			await captureServerEvent(user.id, 'document_agent_edit_undo_conflicted', {
				...analytics,
				reason: result.reason
			});
			return ApiResponse.error(
				'The edited text has changed since, so this edit can’t be undone automatically.',
				HttpStatus.CONFLICT,
				result.reason
			);
		}

		await captureServerEvent(user.id, 'document_agent_edit_undone', {
			...analytics,
			resolution_strategy: result.strategy,
			version_warning: Boolean(result.versionWarning)
		});
		return ApiResponse.success({
			document: result.document,
			document_change: result.change,
			strategy: result.strategy,
			version_warning: result.versionWarning,
			already_undone: false
		});
	} catch (error) {
		console.error('[Document Revert Change API] POST failed:', error);
		return ApiResponse.internalError(error, 'Failed to undo the document change');
	}
};
