// apps/web/src/routes/api/public/pages/[slug]/view/+server.ts
//
// Anonymous endpoint: records a view of a public page.
// - No auth required (anonymous readers are the primary case).
// - Known crawler user-agents are filtered and never logged.
// - Same `viewer_hash` in last 24h on same page = no-op (dedup).
// - Viewer is flagged `is_author=true` if the authenticated session owns the
//   page; that view is still logged (for the author's own analytics) but
//   does not bump the public counter.

import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getPublicPageBySlug, getPublicPageRedirectSlug } from '$lib/server/public-page.service';

const CRAWLER_UA_PATTERNS = [
	'bot',
	'spider',
	'crawl',
	'slurp',
	'facebookexternalhit',
	'embedly',
	'linkedinbot',
	'twitterbot',
	'whatsapp',
	'telegrambot',
	'discordbot',
	'slackbot',
	'claudebot',
	'gptbot',
	'oai-searchbot',
	'perplexitybot',
	'chatgpt-user'
];

function isCrawler(userAgent: string | null): boolean {
	if (!userAgent) return true; // no UA → treat as bot-ish; cheap to err on the side of not counting
	const lowered = userAgent.toLowerCase();
	return CRAWLER_UA_PATTERNS.some((pattern) => lowered.includes(pattern));
}

function hashViewer(ip: string | null, userAgent: string | null): string | null {
	if (!ip && !userAgent) return null;
	// Keep this stable so 24h dedup remains correct across UTC midnight.
	// We only compare the hash within a 24h window before inserting.
	const salt = 'public-page-view-dedup-v1';
	return createHash('sha256')
		.update(`${salt}|${ip ?? ''}|${userAgent ?? ''}`)
		.digest('hex');
}

export const POST: RequestHandler = async ({ params, request, getClientAddress, locals }) => {
	const slug = (params.slug ?? '').trim().toLowerCase();
	if (!slug) {
		return ApiResponse.badRequest('Slug required');
	}

	const dnt = request.headers.get('dnt');
	if (dnt === '1') {
		return ApiResponse.success({ counted: false, reason: 'dnt' });
	}

	const userAgent = request.headers.get('user-agent');
	if (isCrawler(userAgent)) {
		return ApiResponse.success({ counted: false, reason: 'crawler' });
	}

	const supabase = locals.supabase;
	const admin = createAdminSupabaseClient();

	const page = await getPublicPageBySlug(supabase, slug);
	if (!page) {
		const redirectSlug = await getPublicPageRedirectSlug(supabase, slug);
		if (redirectSlug) {
			return ApiResponse.error('Page moved', 404, 'PAGE_MOVED', {
				redirect_slug: redirectSlug
			});
		}
		return ApiResponse.notFound('Public page');
	}

	// Author detection — if there's a session and its actor owns this page's
	// created_by, flag this view so it's excluded from the public counter.
	let isAuthor = false;
	const session = await locals.safeGetSession();
	if (session?.user) {
		const { data: actorId } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});
		if (actorId && typeof actorId === 'string') {
			const ownerActor = page.published_by ?? page.created_by ?? null;
			isAuthor = ownerActor === actorId;
		}
	}

	let ip: string | null = null;
	try {
		ip = getClientAddress();
	} catch {
		ip = null;
	}
	const viewerHash = hashViewer(ip, userAgent);

	// Dedup: same viewer_hash on same page within the last 24h → skip insert.
	if (viewerHash) {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const { data: existing } = await (admin as any)
			.from('onto_public_page_views')
			.select('id')
			.eq('public_page_id', page.id)
			.eq('viewer_hash', viewerHash)
			.gte('viewed_at', since)
			.limit(1)
			.maybeSingle();
		if (existing) {
			return ApiResponse.success({ counted: false, reason: 'dedup' });
		}
	}

	const referrer = request.headers.get('referer');

	const { error: insertError } = await (admin as any).from('onto_public_page_views').insert({
		public_page_id: page.id,
		viewer_hash: viewerHash,
		referrer: referrer ? referrer.slice(0, 2048) : null,
		is_author: isAuthor
	});
	if (insertError) {
		return ApiResponse.internalError(insertError, 'Failed to log page view');
	}

	if (!isAuthor) {
		const { error: rpcError } = await (admin as any).rpc(
			'increment_onto_public_page_view_count',
			{ p_public_page_id: page.id, p_is_author: false }
		);
		if (rpcError) {
			// Not fatal — the nightly rollup will reconcile from the detail
			// table. Log and continue.
			return ApiResponse.success({
				counted: true,
				reconciled_async: true,
				rpc_error: rpcError.message
			});
		}
	}

	return ApiResponse.success({ counted: !isAuthor, is_author: isAuthor });
};
