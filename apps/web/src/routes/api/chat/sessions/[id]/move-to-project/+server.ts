// apps/web/src/routes/api/chat/sessions/[id]/move-to-project/+server.ts
//
// "Continue in Wayne Strategies" (tasker 153, C1): moves a global chat into one project's chat,
// keeping its messages. The next turn then runs as a project chat, with that project's prompt,
// tools and context finder. The same session fields the worker's handoff sets, from a click
// instead of mid-turn.
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const moveSchema = z.object({ project_id: z.string().uuid() }).strict();

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();

	const sessionId = params.id;
	if (!sessionId || !z.string().uuid().safeParse(sessionId).success) {
		return ApiResponse.notFound('Session');
	}

	const parsed = await parseJsonRequest(request, moveSchema);
	if (!parsed.ok) return parsed.response;
	const projectId = parsed.data.project_id;

	const access = await requireProjectMemberAccess({ locals, projectId, user });
	if (!access.ok) return access.response;

	const { supabase } = locals;
	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, context_type, entity_id')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (sessionError) return ApiResponse.databaseError(sessionError);
	if (!session) return ApiResponse.notFound('Session');
	if (session.context_type === 'project' && session.entity_id === projectId) {
		return ApiResponse.success({ session_id: sessionId, project_id: projectId });
	}
	// Only a workspace-wide chat moves. Project, brief and project-create chats keep their scope.
	if (session.context_type !== 'global') {
		return ApiResponse.conflict('Only a workspace chat can move into a project');
	}

	// A running turn's next steps were admitted as a global turn; wait until it ends. Turn runs
	// are read server-side (as the session GET probe does), scoped by user and session.
	const { data: activeRuns, error: runsError } = await createAdminSupabaseClient()
		.from('chat_turn_runs')
		.select('id')
		.eq('session_id', sessionId)
		.eq('user_id', user.id)
		.in('status', ['queued', 'running'])
		.limit(1);
	if (runsError) return ApiResponse.databaseError(runsError);
	if ((activeRuns ?? []).length > 0) {
		return ApiResponse.conflict('Wait for the current reply to finish');
	}

	const { error: updateError } = await supabase
		.from('chat_sessions')
		.update({
			context_type: 'project',
			entity_id: projectId,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.eq('context_type', 'global');
	if (updateError) return ApiResponse.databaseError(updateError);

	return ApiResponse.success({ session_id: sessionId, project_id: projectId });
};
