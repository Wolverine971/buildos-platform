// apps/web/src/routes/api/onto/projects/[id]/public-pages/+server.ts
//
// Lists public pages for a project. Backs the project-page "Published" panel.
// Authenticated; requires project read access.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { buildPublicPageUrlPath } from '$lib/server/public-page.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) {
		return ApiResponse.badRequest('Valid project ID required');
	}

	const supabase = locals.supabase;

	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_access',
		{ p_project_id: projectId, p_required_access: 'read' }
	);
	if (accessError) {
		return ApiResponse.internalError(accessError, 'Failed to check project access');
	}
	if (!hasAccess) {
		return ApiResponse.forbidden('You do not have access to this project');
	}

	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.select(
			'id, document_id, slug, slug_prefix, slug_base, title, summary, visibility, public_status, status, published_at, last_live_sync_at, view_count_all, view_count_30d, live_sync_enabled'
		)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('published_at', { ascending: false, nullsFirst: false });

	if (error) {
		return ApiResponse.databaseError(error);
	}

	const rows = Array.isArray(data) ? data : [];
	const pages = rows.map((row: Record<string, any>) => ({
		id: String(row.id),
		document_id: String(row.document_id),
		slug: String(row.slug ?? ''),
		slug_prefix:
			typeof row.slug_prefix === 'string' && row.slug_prefix.trim() ? row.slug_prefix : null,
		slug_base:
			typeof row.slug_base === 'string' && row.slug_base.trim()
				? row.slug_base
				: String(row.slug ?? ''),
		url_path: buildPublicPageUrlPath(
			String(row.slug ?? ''),
			typeof row.slug_prefix === 'string' ? row.slug_prefix : null,
			typeof row.slug_base === 'string' ? row.slug_base : null
		),
		title: String(row.title ?? 'Untitled'),
		summary: typeof row.summary === 'string' ? row.summary : null,
		visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
		public_status: row.public_status ?? 'not_public',
		status: row.status ?? 'draft',
		published_at: row.published_at ?? null,
		last_updated_at: row.last_live_sync_at ?? row.published_at ?? null,
		view_count_all: typeof row.view_count_all === 'number' ? row.view_count_all : 0,
		view_count_30d: typeof row.view_count_30d === 'number' ? row.view_count_30d : 0,
		live_sync_enabled: row.live_sync_enabled !== false
	}));

	return ApiResponse.success({
		pages,
		total: pages.length,
		live_count: pages.filter((p) => p.public_status === 'live').length
	});
};
