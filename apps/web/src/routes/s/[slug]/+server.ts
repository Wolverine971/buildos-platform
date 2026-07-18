// apps/web/src/routes/s/[slug]/+server.ts

import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { createLogger } from '@buildos/shared-utils';
import { resolveShortLink } from '$lib/config/short-links';

/**
 * Short Link Redirect Endpoint
 *
 * Serves curated campaign short links (see $lib/config/short-links):
 * https://build-os.com/s/welcome-back → /welcome-back?utm_source=...
 *
 * Unknown slugs fall through to the homepage rather than a 404 — these URLs
 * arrive from emails and printed copy, so a soft landing beats an error page.
 */
export const GET: RequestHandler = async ({ params, url, locals: { supabase } }) => {
	const logger = createLogger('web:api:short-links', supabase);
	const destination = resolveShortLink(params.slug, url.searchParams);

	if (!destination) {
		logger.warn('Unknown short link slug', { slug: params.slug });
		throw redirect(302, '/');
	}

	logger.info('Short link redirect', { slug: params.slug, destination });
	throw redirect(302, destination);
};
