// apps/web/src/routes/api/public/builders/[handle]/event/+server.ts
//
// POST { kind: 'view' | 'link_tap' } from the page itself (so prefetchers and most
// crawlers, which don't run scripts, aren't counted). One view per visitor per page per
// day, kept with a short-lived cookie. The owner's own visits don't count.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { recordEvent } from '$lib/server/builder-profile/builder-profile.service';

// User agents of crawlers and link unfurlers (a structured header, not user text).
const BOT_AGENT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse/i;

export const POST: RequestHandler = async ({ params, request, cookies, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
	const kind = body.kind === 'link_tap' ? 'link_tap' : body.kind === 'view' ? 'view' : null;
	if (!kind) return ApiResponse.badRequest('Unknown event');
	if (BOT_AGENT.test(request.headers.get('user-agent') ?? '')) {
		return ApiResponse.success({ counted: false });
	}
	const handle = params.handle.replace(/^@/, '').toLowerCase();
	const cookieName = `bp_seen_${handle.replace(/[^a-z0-9]/g, '')}`;
	if (kind === 'view' && cookies.get(cookieName)) return ApiResponse.success({ counted: false });

	// /api/public skips session loading in hooks; read it here so owners aren't counted.
	const session = await locals.safeGetSession().catch(() => null);
	try {
		const counted = await recordEvent({
			admin: createAdminSupabaseClient() as any,
			handle,
			kind,
			viewerId: session?.user?.id ?? null
		});
		if (kind === 'view' && counted) {
			cookies.set(cookieName, '1', {
				path: '/',
				maxAge: 60 * 60 * 20,
				httpOnly: true,
				sameSite: 'lax',
				secure: true
			});
		}
		return ApiResponse.success({ counted });
	} catch (error) {
		console.error('[BuilderProfile] event failed', error);
		return ApiResponse.success({ counted: false });
	}
};
