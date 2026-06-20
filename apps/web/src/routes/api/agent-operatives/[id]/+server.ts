// apps/web/src/routes/api/agent-operatives/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	assertAgentOperativeProjectAccess,
	normalizeOperativePayload
} from '$lib/server/agent-operatives';
import type { AgentOperativeRowShape } from '@buildos/shared-types';

async function loadOwnedOperative(admin: any, userId: string, id: string) {
	return (admin as any)
		.from('agent_operatives')
		.select('*')
		.eq('id', id)
		.eq('user_id', userId)
		.maybeSingle();
}

export const GET: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const admin = createAdminSupabaseClient();
	const { data: operative, error } = await loadOwnedOperative(admin, user.id, params.id);
	if (error) {
		return ApiResponse.error(
			'Failed to fetch operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error.message
		);
	}
	if (!operative) return ApiResponse.notFound('Operative');

	return ApiResponse.success({ operative });
};

export const PATCH: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const admin = createAdminSupabaseClient();
	const { data: existing, error: loadError } = await loadOwnedOperative(
		admin,
		user.id,
		params.id
	);
	if (loadError) {
		return ApiResponse.error(
			'Failed to fetch operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			loadError.message
		);
	}
	if (!existing) return ApiResponse.notFound('Operative');

	const payload = await request.json().catch(() => null);
	const normalized = normalizeOperativePayload(payload, existing as AgentOperativeRowShape);
	if (normalized.error || !normalized.value) return ApiResponse.badRequest(normalized.error);

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
		.update({
			...normalized.value,
			schedule_locked_at: null
		})
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select('*')
		.single();

	if (error || !operative) {
		return ApiResponse.error(
			'Failed to update operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error?.message
		);
	}

	return ApiResponse.success({ operative });
};

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const admin = createAdminSupabaseClient();
	const { error } = await (admin as any)
		.from('agent_operatives')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (error) {
		return ApiResponse.error(
			'Failed to delete operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			error.message
		);
	}

	return ApiResponse.success({ deleted: true });
};
