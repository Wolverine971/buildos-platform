// apps/web/src/lib/server/chat-share-view.ts
import type { RequestEvent } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { validShareToken } from './chat-share.service';

export async function recordChatShareView(event: RequestEvent): Promise<Response> {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const token = event.params.token ?? '';
	if (!validShareToken(token)) return ApiResponse.notFound('Shared chat');
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
	const admin = createAdminSupabaseClient();
	// Compare-and-swap avoids lost increments without adding a publicly callable RPC.
	for (let attempt = 0; attempt < 4; attempt++) {
		const { data, error } = await admin
			.from('chat_session_shares')
			.select('id,user_id,view_count')
			.eq('token', token)
			.is('revoked_at', null)
			.maybeSingle();
		if (error) return ApiResponse.databaseError(error);
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
		if (written.error) return ApiResponse.databaseError(written.error);
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
	return ApiResponse.error('View count is busy. Try again later.', 503);
}
