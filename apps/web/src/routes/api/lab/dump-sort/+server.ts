// apps/web/src/routes/api/lab/dump-sort/+server.ts
// POST { text, mode }: streams the "watch it sort" plan as JSON lines (one event per line,
// see DumpSortEvent). mode "replay" is free and uses a fixed dump; "live" makes one paid
// fast-model call. Admin only. Plan only: nothing is saved.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isDumpSortAdmin } from '$lib/server/dump-sort/dump-sort-access';
import { DUMP_SORT_MAX_CHARS } from '$lib/server/dump-sort/dump-sort-core';
import { streamDumpSort } from '$lib/server/dump-sort/dump-sort.service';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!(await isDumpSortAdmin(locals.supabase, user.id))) return ApiResponse.notFound('Page');

	let body: { text?: unknown; mode?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Send JSON with text and mode.');
	}
	const mode = body.mode === 'live' ? 'live' : 'replay';
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (mode === 'live' && !text) return ApiResponse.badRequest('Write something to sort first.');
	if (text.length > DUMP_SORT_MAX_CHARS) {
		return ApiResponse.badRequest(`Keep it under ${DUMP_SORT_MAX_CHARS} characters for now.`);
	}

	const stream = streamDumpSort({
		session: locals.supabase,
		admin: createAdminSupabaseClient(),
		userId: user.id,
		text,
		mode,
		signal: request.signal
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no'
		}
	});
};
