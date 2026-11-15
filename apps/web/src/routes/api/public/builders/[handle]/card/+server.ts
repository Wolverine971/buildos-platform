// apps/web/src/routes/api/public/builders/[handle]/card/+server.ts
//
// GET → the link preview image (1200×630 PNG) for a published builder page, as anyone sees
// it. Drawn from code (builder-share-card.ts). The page's og:image adds ?v=<version>, which
// changes when what the card shows changes, so this can be cached for a long time. Drafts
// and unknown handles are 404; a render failure falls back to the default BuildOS card.

import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadBuilderProfileAs } from '$lib/server/builder-profile/builder-profile.service';
import { renderBuilderShareCard } from '$lib/server/builder-profile/builder-share-card';
import { DEFAULT_SOCIAL_IMAGE_URL } from '$lib/constants/seo';

export const GET: RequestHandler = async ({ params, url }) => {
	const handle = params.handle.replace(/^@/, '').toLowerCase();
	if (!/^[a-z0-9-]{3,24}$/.test(handle)) throw error(404, 'No page here');

	let result;
	try {
		// Anonymous view: only what anyone can see on the published page.
		result = await loadBuilderProfileAs(createAdminSupabaseClient() as any, handle, null);
	} catch (err) {
		console.error('[BuilderProfile] share card load failed', err);
		throw redirect(302, DEFAULT_SOCIAL_IMAGE_URL);
	}
	if (!result.found || result.status !== 'published') throw error(404, 'No page here');

	try {
		const png = await renderBuilderShareCard(result, url.host);
		return new Response(new Uint8Array(png), {
			headers: {
				'content-type': 'image/png',
				'cache-control':
					'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
			}
		});
	} catch (err) {
		console.error('[BuilderProfile] share card render failed', err);
		throw redirect(302, DEFAULT_SOCIAL_IMAGE_URL);
	}
};
