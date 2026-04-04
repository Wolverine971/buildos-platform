// apps/web/src/routes/api/admin/chat/evals/scenarios/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { listAvailablePromptEvalScenarios } from '$lib/services/agentic-chat-v2/prompt-eval-runner';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	return ApiResponse.success({
		scenarios: listAvailablePromptEvalScenarios()
	});
};
