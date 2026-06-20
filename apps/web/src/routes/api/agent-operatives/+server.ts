// apps/web/src/routes/api/agent-operatives/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	assertAgentOperativeProjectAccess,
	normalizeOperativePayload
} from '$lib/server/agent-operatives';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const limit = Math.min(Number(url.searchParams.get('limit') || 100), 200);
	const scheduled = url.searchParams.get('scheduled');

	let query = (supabase as any)
		.from('agent_operatives')
		.select('*')
		.eq('user_id', user.id)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (scheduled === 'true') query = query.eq('schedule_enabled', true);
	else if (scheduled === 'false') query = query.eq('schedule_enabled', false);

	const { data, error } = await query;
	if (error) {
		return ApiResponse.error(
			'Failed to fetch operatives',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error.message
		);
	}

	return ApiResponse.success({ operatives: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);
	const normalized = normalizeOperativePayload(payload);
	if (normalized.error || !normalized.value) return ApiResponse.badRequest(normalized.error);

	const admin = createAdminSupabaseClient();
	const access = await assertAgentOperativeProjectAccess({
		admin,
		userId: user.id,
		projectId: normalized.value.project_id
	});
	if (!access.ok) {
		return ApiResponse.error(access.message, access.status, 'ACCESS_ERROR', access.detail);
	}

	const { data: operative, error } = await (admin as any)
		.from('agent_operatives')
		.insert({
			user_id: user.id,
			...normalized.value
		})
		.select('*')
		.single();

	if (error || !operative) {
		return ApiResponse.error(
			'Failed to create operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error?.message
		);
	}

	return ApiResponse.created({ operative });
};
