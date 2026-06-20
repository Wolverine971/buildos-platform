// apps/web/src/routes/api/agent-operatives/[id]/run/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	AGENT_OPERATIVE_ACTIVE_RUN_STATUSES,
	assertAgentOperativeProjectAccess,
	dispatchOperativeRun
} from '$lib/server/agent-operatives';
import type { AgentOperativeRowShape } from '@buildos/shared-types';

const MAX_CONCURRENT_RUNS = 3;

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const admin = createAdminSupabaseClient();
	const { data: operative, error: operativeError } = await (admin as any)
		.from('agent_operatives')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();

	if (operativeError) {
		return ApiResponse.error(
			'Failed to fetch operative',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			operativeError.message
		);
	}
	if (!operative) return ApiResponse.notFound('Operative');

	const access = await assertAgentOperativeProjectAccess({
		admin,
		userId: user.id,
		projectId: operative.project_id
	});
	if (!access.ok) {
		return ApiResponse.error(access.message, access.status, 'ACCESS_ERROR', access.detail);
	}

	const { count: activeCount, error: countError } = await admin
		.from('agent_runs')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.in('status', AGENT_OPERATIVE_ACTIVE_RUN_STATUSES);
	if (countError) {
		return ApiResponse.error(
			'Failed to check active runs',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			countError.message
		);
	}
	if ((activeCount ?? 0) >= MAX_CONCURRENT_RUNS) {
		return ApiResponse.error(
			`You already have ${MAX_CONCURRENT_RUNS} active agent runs.`,
			HttpStatus.TOO_MANY_REQUESTS,
			'RATE_LIMITED'
		);
	}

	const dispatched = await dispatchOperativeRun({
		admin,
		userId: user.id,
		operative: operative as AgentOperativeRowShape,
		trigger: 'manual'
	});
	if (!dispatched.ok) {
		return ApiResponse.error(
			dispatched.message,
			dispatched.status,
			dispatched.code,
			dispatched.detail
		);
	}

	await (admin as any)
		.from('agent_operatives')
		.update({ last_run_at: new Date().toISOString(), last_run_id: (dispatched.run as any).id })
		.eq('id', operative.id);

	return ApiResponse.success({ run: dispatched.run });
};
