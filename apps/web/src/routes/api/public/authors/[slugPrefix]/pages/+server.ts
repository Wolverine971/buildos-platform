// apps/web/src/routes/api/public/authors/[slugPrefix]/pages/+server.ts
//
// Anonymous endpoint. Returns all live public pages authored under a given
// slug_prefix. Backs the stub author index at /p/{user_name} — viewers
// discover a creator's other work in one place.
//
// Visibility rules: only `status='published'` + `public_status='live'` +
// `visibility='public'` rows are returned. Unlisted pages are never indexed
// here.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { buildPublicPageUrlPath } from '$lib/server/public-page.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const slugPrefix = (params.slugPrefix ?? '').trim().toLowerCase();
	if (!slugPrefix) {
		return ApiResponse.badRequest('slugPrefix required');
	}

	const { data, error } = await (locals.supabase as any)
		.from('onto_public_pages')
		.select(
			'id, slug, slug_prefix, slug_base, title, summary, published_at, last_live_sync_at, view_count_all, published_by, created_by, project_id'
		)
		.eq('slug_prefix', slugPrefix)
		.eq('status', 'published')
		.eq('public_status', 'live')
		.eq('visibility', 'public')
		.is('deleted_at', null)
		.eq('noindex', false)
		.order('published_at', { ascending: false, nullsFirst: false })
		.limit(100);

	if (error) {
		return ApiResponse.databaseError(error);
	}

	const rows = Array.isArray(data) ? data : [];
	if (rows.length === 0) {
		return ApiResponse.success(
			{
				author: { slug_prefix: slugPrefix, name: null, page_count: 0 },
				pages: []
			},
			undefined
		);
	}

	// Resolve the author's display name from the first page's owning actor.
	const anyActorId = rows[0].published_by ?? rows[0].created_by ?? null;
	let authorName: string | null = null;
	if (anyActorId) {
		const { data: actor } = await (locals.supabase as any)
			.from('onto_actors')
			.select('name')
			.eq('id', anyActorId)
			.maybeSingle();
		authorName =
			actor && typeof actor.name === 'string' && actor.name.trim() ? actor.name : null;
	}

	// Project names for display on each row.
	const projectIds = Array.from(new Set(rows.map((r) => String(r.project_id))));
	const { data: projects } = await (locals.supabase as any)
		.from('onto_projects')
		.select('id, name')
		.in('id', projectIds);
	const projectNameById = new Map<string, string>();
	if (Array.isArray(projects)) {
		for (const p of projects as Array<Record<string, any>>) {
			if (p?.id) projectNameById.set(String(p.id), String(p.name ?? ''));
		}
	}

	const pages = rows.map((row: Record<string, any>) => ({
		id: String(row.id),
		slug: String(row.slug ?? ''),
		slug_prefix:
			typeof row.slug_prefix === 'string' && row.slug_prefix.trim() ? row.slug_prefix : null,
		slug_base: String(row.slug_base ?? row.slug ?? ''),
		url_path: buildPublicPageUrlPath(
			String(row.slug ?? ''),
			typeof row.slug_prefix === 'string' ? row.slug_prefix : null,
			typeof row.slug_base === 'string' ? row.slug_base : null
		),
		title: String(row.title ?? 'Untitled'),
		summary: typeof row.summary === 'string' ? row.summary : null,
		published_at: row.published_at ?? null,
		last_updated_at: row.last_live_sync_at ?? row.published_at ?? null,
		view_count_all: typeof row.view_count_all === 'number' ? row.view_count_all : 0,
		project_name: projectNameById.get(String(row.project_id)) ?? null
	}));

	return ApiResponse.cached(
		{
			author: {
				slug_prefix: slugPrefix,
				name: authorName,
				page_count: pages.length
			},
			pages
		},
		undefined,
		300,
		{ staleWhileRevalidate: 3600, public: true }
	);
};
