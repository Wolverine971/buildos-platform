// apps/web/src/routes/api/admin/chat/evals/replay/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { replayAndEvaluatePromptScenario } from '$lib/services/agentic-chat-v2/prompt-replay-runner';
import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

type PromptEvalReplayRequest = {
	scenario_slug?: string;
	message?: string;
	context_type?: ChatContextType;
	entity_id?: string | null;
	project_focus?: ProjectFocus | null;
	runner_type?: string;
};

export const POST: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	fetch
}) => {
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

	const body = (await request.json().catch(() => null)) as PromptEvalReplayRequest | null;
	const scenarioSlug =
		typeof body?.scenario_slug === 'string' && body.scenario_slug.trim().length > 0
			? body.scenario_slug.trim()
			: null;
	if (!scenarioSlug) {
		return ApiResponse.badRequest('scenario_slug is required');
	}

	try {
		const replay = await replayAndEvaluatePromptScenario({
			fetch,
			supabase,
			userId: user.id,
			scenarioSlug,
			runnerType: body?.runner_type,
			source: 'admin_replay',
			messageOverride: body?.message,
			contextTypeOverride: body?.context_type,
			entityIdOverride:
				typeof body?.entity_id === 'string' && body.entity_id.trim().length > 0
					? body.entity_id.trim()
					: null,
			projectFocusOverride: body?.project_focus ?? null
		});

		return ApiResponse.success({
			scenario: replay.scenario,
			replay_request: replay.replayRequest,
			stream_run_id: replay.streamRunId,
			client_turn_id: replay.clientTurnId,
			session_id: replay.sessionId,
			turn_run: replay.turnRun,
			stream_summary: replay.streamSummary,
			eval_run: replay.eval.evalRun,
			assertions: replay.eval.assertions,
			summary: replay.eval.result.summary
		});
	} catch (error) {
		console.error('Prompt replay failed', error);
		return ApiResponse.internalError(error, 'Failed to replay prompt scenario');
	}
};
