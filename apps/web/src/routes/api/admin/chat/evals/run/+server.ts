// apps/web/src/routes/api/admin/chat/evals/run/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { evaluateAndPersistPromptEval } from '$lib/services/agentic-chat-v2/prompt-eval-runner';

type PromptEvalRunRequest = {
	turn_run_id?: string;
	scenario_slug?: string;
	runner_type?: string;
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
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

	const body = (await request.json().catch(() => null)) as PromptEvalRunRequest | null;
	const turnRunId =
		typeof body?.turn_run_id === 'string' && body.turn_run_id.trim().length > 0
			? body.turn_run_id.trim()
			: null;
	const scenarioSlug =
		typeof body?.scenario_slug === 'string' && body.scenario_slug.trim().length > 0
			? body.scenario_slug.trim()
			: null;

	if (!turnRunId || !scenarioSlug) {
		return ApiResponse.badRequest('turn_run_id and scenario_slug are required');
	}

	try {
		const persisted = await evaluateAndPersistPromptEval({
			supabase,
			turnRunId,
			scenarioSlug,
			createdByUserId: user.id,
			runnerType: body?.runner_type
		});

		return ApiResponse.success({
			scenario: persisted.scenario,
			eval_run: persisted.evalRun,
			assertions: persisted.assertions,
			summary: persisted.result.summary
		});
	} catch (error) {
		console.error('Prompt eval run failed', error);
		return ApiResponse.internalError(error, 'Failed to run prompt evaluation');
	}
};
