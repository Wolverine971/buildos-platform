// apps/web/src/routes/api/onto/documents/[id]/versions/+server.ts
/**
 * GET /api/onto/documents/[id]/versions - List document versions with optional filtering
 *
 * Query params:
 * - limit: number (default 50)
 * - cursor: string (version number to paginate from)
 * - user_id: string (filter by creator)
 * - from: ISO timestamp (filter versions created after)
 * - to: ISO timestamp (filter versions created before)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { requireProjectEntityAccess } from '$lib/server/ontology-api-access';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { isVersionWindowOpen } from '$lib/services/ontology/versioning.service';

type Locals = App.Locals;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface VersionListItem {
	id: string;
	number: number;
	created_by: string;
	created_by_name: string | null;
	created_at: string;
	snapshot_hash: string | null;
	window: { started_at: string; ended_at: string } | null;
	change_count: number;
	change_source: string | null;
	is_merged: boolean;
	/**
	 * True while this version's coalescing window is still open, meaning further
	 * edits from the same actor will be absorbed into it and its snapshot is not
	 * final. Only the newest version can be open. History surfaces present an open
	 * version as work in progress rather than as a sealed revision — roadmap §5.3.
	 */
	is_open: boolean;
	is_restore: boolean;
	restored_by_user_id: string | null;
	restore_of_version: number | null;
}

interface VersionListResponse {
	versions: VersionListItem[];
	total: number;
	hasMore: boolean;
	nextCursor: number | null;
}

async function ensureDocumentReadAccess(
	locals: Locals,
	documentId: string,
	userId: string
): Promise<{ projectId: string } | { error: Response }> {
	const supabase = locals.supabase;
	const accessResult = await requireProjectEntityAccess({
		supabase,
		user: { id: userId },
		loadEntity: () =>
			supabase
				.from('onto_documents')
				.select('id, project_id')
				.eq('id', documentId)
				.is('deleted_at', null)
				.maybeSingle(),
		requiredAccess: 'read',
		audit: {
			endpoint: `/api/onto/documents/${documentId}/versions`,
			method: 'GET',
			entityType: 'document',
			entityId: documentId,
			consoleLabel: 'Versions API'
		},
		actorOperation: 'document_actor_resolve',
		entityOperation: 'document_fetch',
		accessOperation: 'document_access_check',
		tableName: 'onto_documents',
		notFoundResource: 'Document',
		forbiddenMessage: 'You do not have permission to access this document'
	});

	return accessResult.ok
		? { projectId: accessResult.projectId }
		: { error: accessResult.response };
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const documentId = params.id;
		if (!documentId) {
			return ApiResponse.badRequest('Document ID required');
		}

		const accessResult = await ensureDocumentReadAccess(locals, documentId, session.user.id);

		if ('error' in accessResult) {
			return accessResult.error;
		}

		// Parse query parameters
		const limit = Math.min(
			Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10), 1),
			100
		);
		const cursor = url.searchParams.get('cursor');
		const userIdFilter = url.searchParams.get('user_id');
		const fromDate = url.searchParams.get('from');
		const toDate = url.searchParams.get('to');

		// Build query
		let query = locals.supabase
			.from('onto_document_versions')
			.select('id, number, created_by, created_at, props', { count: 'exact' })
			.eq('document_id', documentId)
			.order('number', { ascending: false });

		// Apply filters
		if (cursor) {
			const cursorNum = parseInt(cursor, 10);
			if (!isNaN(cursorNum)) {
				query = query.lt('number', cursorNum);
			}
		}

		if (userIdFilter) {
			// Filtering must never provision an actor for an arbitrary user. Resolve
			// only an actor row visible to this project member; no match yields an
			// empty result rather than silently dropping the requested filter.
			let actorId = NIL_UUID;
			if (isValidUUID(userIdFilter)) {
				const { data: actor, error: actorFilterError } = await locals.supabase
					.from('onto_actors')
					.select('id')
					.eq('user_id', userIdFilter)
					.maybeSingle();

				if (actorFilterError) {
					await logOntologyApiError({
						supabase: locals.supabase,
						error: actorFilterError,
						endpoint: `/api/onto/documents/${documentId}/versions`,
						method: 'GET',
						userId: session.user.id,
						projectId: accessResult.projectId,
						entityType: 'document',
						entityId: documentId,
						operation: 'versions_actor_filter',
						tableName: 'onto_actors'
					});
					return ApiResponse.databaseError(actorFilterError);
				}

				actorId = actor?.id ?? NIL_UUID;
			}
			query = query.eq('created_by', actorId);
		}

		if (fromDate) {
			query = query.gte('created_at', fromDate);
		}

		if (toDate) {
			query = query.lte('created_at', toDate);
		}

		query = query.limit(limit + 1); // Fetch one extra to check hasMore

		const { data: versions, error: versionsError, count } = await query;

		if (versionsError) {
			console.error('[Versions API] Failed to fetch versions:', versionsError);
			await logOntologyApiError({
				supabase: locals.supabase,
				error: versionsError,
				endpoint: `/api/onto/documents/${documentId}/versions`,
				method: 'GET',
				userId: session.user.id,
				projectId: accessResult.projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'versions_list',
				tableName: 'onto_document_versions'
			});
			return ApiResponse.databaseError(versionsError);
		}

		const hasMore = versions && versions.length > limit;
		const versionList = versions?.slice(0, limit) ?? [];

		// Collect unique actor IDs to fetch names
		const actorIds = [...new Set(versionList.map((v) => v.created_by).filter(Boolean))];

		// Fetch actor names in one batch
		let actorNames: Record<string, string> = {};
		if (actorIds.length > 0) {
			const { data: actors } = await locals.supabase
				.from('onto_actors')
				.select('id, name')
				.in('id', actorIds);

			if (actors) {
				actorNames = actors.reduce(
					(acc, actor) => {
						acc[actor.id] = actor.name ?? 'Unknown';
						return acc;
					},
					{} as Record<string, string>
				);
			}
		}

		// Transform to response format. Only the newest version of a document can
		// still be absorbing edits, and only when the listing starts at the head
		// (no cursor) — a paginated page never contains it.
		const now = new Date();
		const transformedVersions: VersionListItem[] = versionList.map((v, index) => {
			const props = (v.props ?? {}) as Record<string, unknown>;
			const window = props.window as { started_at: string; ended_at: string } | undefined;
			const isNewest = !cursor && index === 0;

			return {
				id: v.id,
				number: v.number,
				created_by: v.created_by,
				created_by_name: actorNames[v.created_by] ?? null,
				created_at: v.created_at,
				snapshot_hash: (props.snapshot_hash as string) ?? null,
				window: window ?? null,
				change_count: (props.change_count as number) ?? 1,
				change_source: (props.change_source as string) ?? null,
				is_merged: (props.is_merged as boolean) ?? false,
				is_open:
					isNewest && isVersionWindowOpen({ window, createdAt: v.created_at }, { now }),
				is_restore: Boolean(props.restore_of_version),
				restored_by_user_id: (props.restored_by_user_id as string) ?? null,
				restore_of_version: (props.restore_of_version as number) ?? null
			};
		});

		const response: VersionListResponse = {
			versions: transformedVersions,
			total: count ?? transformedVersions.length,
			hasMore,
			nextCursor:
				hasMore && versionList.length > 0
					? (versionList[versionList.length - 1]?.number ?? null)
					: null
		};

		return ApiResponse.success(response);
	} catch (error) {
		console.error('[Versions API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/documents/${params.id ?? ''}/versions`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'document',
			entityId: params.id,
			operation: 'versions_list'
		});
		return ApiResponse.internalError(error, 'Failed to load document versions');
	}
};
