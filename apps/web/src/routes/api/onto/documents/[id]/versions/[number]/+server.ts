// apps/web/src/routes/api/onto/documents/[id]/versions/[number]/+server.ts
/**
 * GET /api/onto/documents/[id]/versions/[number] - Get specific version with snapshot data
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../../shared/error-logging';
import type {
	DocumentSnapshot,
	DocumentVersionProps
} from '$lib/services/ontology/versioning.service';

type Locals = App.Locals;

interface VersionDetailResponse {
	id: string;
	number: number;
	created_by: string;
	created_by_name: string | null;
	created_at: string;
	snapshot: DocumentSnapshot | null;
	snapshot_hash: string | null;
	previous_snapshot_hash: string | null;
	window: { started_at: string; ended_at: string } | null;
	change_count: number;
	change_source: string | null;
	is_merged: boolean;
	is_restore: boolean;
	restored_by_user_id: string | null;
	restore_of_version: number | null;
	pii_redacted: boolean;
}

async function ensureDocumentReadAccess(
	locals: Locals,
	documentId: string,
	userId: string
): Promise<{ projectId: string } | { error: Response }> {
	const supabase = locals.supabase;

	const { data: document, error: documentError } = await supabase
		.from('onto_documents')
		.select('id, project_id')
		.eq('id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (documentError) {
		console.error('[Version Detail API] Failed to fetch document:', documentError);
		return { error: ApiResponse.databaseError(documentError) };
	}

	if (!document) {
		return { error: ApiResponse.notFound('Document') };
	}

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: document.project_id,
			p_required_access: 'read'
		}
	);

	if (accessError) {
		console.error('[Version Detail API] Failed to check access:', accessError);
		return { error: ApiResponse.internalError(accessError, 'Failed to check project access') };
	}

	if (!hasAccess) {
		return {
			error: ApiResponse.forbidden('You do not have permission to access this document')
		};
	}

	return { projectId: document.project_id };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		const versionNumber = parseInt(params.number, 10);

		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		if (isNaN(versionNumber) || versionNumber < 1) {
			return ApiResponse.badRequest('Valid version number required');
		}

		const accessResult = await ensureDocumentReadAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		// Fetch the specific version
		const { data: version, error: versionError } = await locals.supabase
			.from('onto_document_versions')
			.select('id, number, created_by, created_at, props')
			.eq('document_id', documentId)
			.eq('number', versionNumber)
			.maybeSingle();

		if (versionError) {
			console.error('[Version Detail API] Failed to fetch version:', versionError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: versionError,
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}`,
				method: 'GET',
				userId: session.user.id,
				projectId: accessResult.projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_detail',
				tableName: 'onto_document_versions'
			});
			return ApiResponse.databaseError(versionError);
		}

		if (!version) {
			return ApiResponse.notFound('Version');
		}

		// Fetch actor name
		let actorName: string | null = null;
		if (version.created_by) {
			const { data: actor } = await locals.supabase
				.from('onto_actors')
				.select('name')
				.eq('id', version.created_by)
				.maybeSingle();

			actorName = actor?.name ?? null;
		}

		const props = (version.props ?? {}) as Partial<DocumentVersionProps>;
		const window = props.window;

		const response: VersionDetailResponse = {
			id: version.id,
			number: version.number,
			created_by: version.created_by,
			created_by_name: actorName,
			created_at: version.created_at,
			snapshot: props.snapshot ?? null,
			snapshot_hash: props.snapshot_hash ?? null,
			previous_snapshot_hash: props.previous_snapshot_hash ?? null,
			window: window ?? null,
			change_count: props.change_count ?? 1,
			change_source: props.change_source ?? null,
			is_merged: props.is_merged ?? false,
			is_restore: Boolean(props.restore_of_version),
			restored_by_user_id: props.restored_by_user_id ?? null,
			restore_of_version: props.restore_of_version ?? null,
			pii_redacted: props.pii_redacted ?? false
		};

		return ApiResponse.success(response);
	} catch (error) {
		console.error('[Version Detail API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}/versions/${params.number ?? ''}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'version_detail'
		});
		return ApiResponse.internalError(error, 'Failed to load version details');
	}
};
