// apps/web/src/routes/api/public/pages/[slug]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildPublicPageUrlPath,
	getPublicPageBySlug,
	getPublicPageRedirectSlug
} from '$lib/server/public-page.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const slug = (params.slug ?? '').trim().toLowerCase();
	if (!slug) {
		return ApiResponse.badRequest('Slug required');
	}

	try {
		const page = await getPublicPageBySlug(locals.supabase, slug);
		if (!page) {
			const redirectSlug = await getPublicPageRedirectSlug(locals.supabase, slug);
			if (redirectSlug) {
				return ApiResponse.error('Page moved', 404, 'PAGE_MOVED', {
					redirect_slug: redirectSlug
				});
			}
			return ApiResponse.notFound('Public page');
		}

		const actorId = page.published_by ?? page.created_by ?? null;
		const [{ data: actor }, { data: project }] = await Promise.all([
			actorId
				? (locals.supabase as any)
						.from('onto_actors')
						.select('id, name')
						.eq('id', actorId)
						.maybeSingle()
				: Promise.resolve({ data: null }),
			(locals.supabase as any)
				.from('onto_projects')
				.select('id, name')
				.eq('id', page.project_id)
				.maybeSingle()
		]);

		const publishedProps =
			page.published_props && typeof page.published_props === 'object'
				? (page.published_props as Record<string, unknown>)
				: {};
		const citations = Array.isArray(publishedProps.citations)
			? (publishedProps.citations as Array<Record<string, unknown>>)
			: [];

		return ApiResponse.cached(
			{
				page: {
					id: page.id,
					slug: page.slug,
					slug_prefix:
						typeof page.slug_prefix === 'string' && page.slug_prefix.trim()
							? page.slug_prefix
							: null,
					slug_base:
						typeof page.slug_base === 'string' && page.slug_base.trim()
							? page.slug_base
							: page.slug,
					url_path: buildPublicPageUrlPath(page.slug, page.slug_prefix, page.slug_base),
					title: page.title,
					summary: page.summary,
					content: page.published_content ?? '',
					description: page.published_description ?? null,
					published_at: page.published_at ?? null,
					last_updated_at:
						page.last_live_sync_at ?? page.updated_at ?? page.published_at ?? null,
					noindex: page.noindex === true,
					visibility: page.visibility,
					project_id: page.project_id,
					document_id: page.document_id,
					project_name: project?.name ?? null,
					author_name: actor?.name ?? null,
					citations
				}
			},
			undefined,
			300,
			{ staleWhileRevalidate: 86400, public: true }
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load public page');
	}
};
