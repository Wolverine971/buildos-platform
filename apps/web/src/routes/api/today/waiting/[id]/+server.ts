// apps/web/src/routes/api/today/waiting/[id]/+server.ts
// Mark a Today "waiting" row handled, dismiss it, or bring it back (Undo).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const STATUSES = new Set(['open', 'resolved', 'dismissed']);

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized('Unauthorized');

	const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
	const status = typeof body?.status === 'string' ? body.status : '';
	if (!STATUSES.has(status))
		return ApiResponse.badRequest('status must be open, resolved or dismissed');

	const now = new Date().toISOString();
	// RLS limits this to the person's own rows; the column grant limits it to these fields.
	const { data, error } = await supabase
		.from('today_waiting_items')
		.update({ status, resolved_at: status === 'open' ? null : now, updated_at: now })
		.eq('id', params.id)
		.select('id, status')
		.maybeSingle();
	if (error) return ApiResponse.internalError(error, 'Could not update that item');
	if (!data) return ApiResponse.notFound('Waiting item');
	return ApiResponse.success({ item: data });
};
