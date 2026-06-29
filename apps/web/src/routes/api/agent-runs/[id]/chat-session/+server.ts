// apps/web/src/routes/api/agent-runs/[id]/chat-session/+server.ts
//
// Prepare a chat session for discussing an Agent Run from the status modal /
// Work Panel. The route reuses the originating parent chat when possible,
// otherwise falls back to an existing inbox/bridge chat or creates one.
import type { RequestHandler } from './$types';
import { createAgentRunChatSession } from '$lib/server/agent-run-chat-session.service';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const runId = readString(params.id);
	if (!runId) return ApiResponse.badRequest('Agent run id is required');

	const { data: run, error: runError } = await locals.supabase
		.from('agent_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (runError) {
		return ApiResponse.error(
			'Failed to load agent run',
			HttpStatus.INTERNAL_SERVER_ERROR,
			'DATABASE_ERROR',
			runError.message
		);
	}
	if (!run) return ApiResponse.notFound('Agent run');

	try {
		const result = await createAgentRunChatSession({
			supabase: locals.supabase as any,
			run: run as Record<string, unknown>,
			userId: user.id,
			origin: 'agent_run_context'
		});
		return result.created ? ApiResponse.created(result) : ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
};
