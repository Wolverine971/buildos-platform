// apps/web/src/routes/api/admin/knowledge-spend/+server.ts
/**
 * GET /api/admin/knowledge-spend
 * Today's knowledge spend per person against the caps (chat wrap-up, "Find more" research).
 * Admin only; users never see caps (DJ, 2026-11-18). Free: database reads.
 */
import type { RequestHandler } from './$types';
import { knowledgeSpendToday } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();

	const { data: adminCheck, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.maybeSingle();
	if (adminError) return ApiResponse.databaseError(adminError);
	if (!adminCheck) return ApiResponse.forbidden('Admin access required');

	try {
		// Everyone's usage rows: read with the service role after the admin check above.
		const admin = createAdminSupabaseClient();
		const day = await knowledgeSpendToday(admin as never);
		const ids = day.users.map((u) => u.userId);
		const { data: people } = ids.length
			? await admin.from('users').select('id, name, email').in('id', ids)
			: { data: [] };
		const byId = new Map((people ?? []).map((p) => [p.id, p]));
		return ApiResponse.success({
			...day,
			users: day.users.map((u) => ({
				...u,
				name: byId.get(u.userId)?.name ?? null,
				email: byId.get(u.userId)?.email ?? null
			}))
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load knowledge spend');
	}
};
