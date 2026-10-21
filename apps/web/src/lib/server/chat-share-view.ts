// apps/web/src/lib/server/chat-share-view.ts
import type { RequestEvent } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { rateLimiter } from '$lib/utils/rate-limiter';
import { validShareToken } from './chat-share.service';

/** A view counts only from the share page itself: same-origin fetch metadata, never a cross-site post. */
function isSameOriginRequest(event: RequestEvent): boolean {
	const site = event.request.headers.get('sec-fetch-site');
	const origin = event.request.headers.get('origin');
	if (site && site !== 'same-origin') return false;
	if (origin && origin !== event.url.origin) return false;
	return site === 'same-origin' || origin === event.url.origin;
}

function clientAddress(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

/** Counting is best effort; a lost race or a busy row is silently not counted. */
const notCounted = () => new Response(null, { status: 204 });

export async function recordChatShareView(event: RequestEvent): Promise<Response> {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const token = event.params.token ?? '';
	if (!validShareToken(token)) return ApiResponse.notFound('Shared chat');
	if (!isSameOriginRequest(event)) return ApiResponse.forbidden();
	const ua = event.request.headers.get('user-agent') ?? '';
	// User-Agent is a structured protocol identifier, not user-authored prose.
	if (
		event.request.headers.get('dnt') === '1' ||
		!ua ||
		/bot|spider|crawl|slurp|facebookexternalhit|preview|embedly/i.test(ua)
	)
		return ApiResponse.success({ counted: false });
	const cookie = `chat_share_view_${token}`;
	if (event.cookies.get(cookie)) return ApiResponse.success({ counted: false });
	// Each counted view costs an admin read and write; cap it per client address.
	if (
		!rateLimiter.check(`chat-share-view:${clientAddress(event)}`, {
			requests: 30,
			windowMs: 10 * 60 * 1000
		}).allowed
	)
		return notCounted();
	const admin = createAdminSupabaseClient();
	// Compare-and-swap avoids lost increments without adding a publicly callable RPC
	// (an atomic SQL increment would need a migration).
	for (let attempt = 0; attempt < 3; attempt++) {
		const { data, error } = await admin
			.from('chat_session_shares')
			.select('id,user_id,view_count')
			.eq('token', token)
			.is('revoked_at', null)
			.maybeSingle();
		if (error) return notCounted();
		if (!data) return ApiResponse.notFound('Shared chat');
		if (event.locals.user?.id === data.user_id)
			return ApiResponse.success({ counted: false, is_author: true });
		const written = await admin
			.from('chat_session_shares')
			.update({ view_count: data.view_count + 1, last_viewed_at: new Date().toISOString() })
			.eq('id', data.id)
			.eq('view_count', data.view_count)
			.is('revoked_at', null)
			.select('id')
			.maybeSingle();
		if (written.error) return notCounted();
		if (written.data) {
			event.cookies.set(cookie, '1', {
				path: `/api/share/${token}/view`,
				maxAge: 24 * 60 * 60,
				httpOnly: true,
				secure: event.url.protocol === 'https:',
				sameSite: 'lax'
			});
			return ApiResponse.success({ counted: true });
		}
	}
	return notCounted();
}
